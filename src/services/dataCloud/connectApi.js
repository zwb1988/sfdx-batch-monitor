const constants = require('../../../config/constants')
const { requestHttp1, parseJsonBody, formatRemoteError } = require('./http1')

const API_VERSION = constants.DATA_CLOUD_CONNECT_API_VERSION

function restUrl (sfInstanceUrl, pathnameWithQuery) {
  return sfInstanceUrl.replace(/\/+$/, '') + '/services/data/v' + API_VERSION + pathnameWithQuery
}

async function sfGetJson (session, pathnameWithQuery) {
  const res = await requestHttp1({
    url: restUrl(session.sfInstanceUrl, pathnameWithQuery),
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + session.sfAccessToken,
      Accept: 'application/json'
    },
    timeoutMs: constants.DATA_CLOUD_HTTP_TIMEOUT_MS
  })
  const parsed = parseJsonBody(res.body)
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(formatRemoteError(res.status, parsed, 'Salesforce Connect API request failed'))
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502
    throw err
  }
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function connectionName (row) {
  if (!row || typeof row !== 'object') return ''
  const name = row.sourceName || row.name || row.developerName || row.devName
  return typeof name === 'string' ? name.trim() : ''
}

/** Connect API developer names often append a UUID; Ingestion API sourceName does not. */
function ingestApiName (raw) {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (!name) return ''
  return name.replace(/_[0-9a-f]{8}(?:_[0-9a-f]{4}){3}_[0-9a-f]{12}$/i, '')
}

function namesMatch (a, b) {
  const left = ingestApiName(a)
  const right = ingestApiName(b)
  return !!left && !!right && left === right
}

function connectionLabel (row, name) {
  if (!row || typeof row !== 'object') return name
  const label = row.label || row.masterLabel
  return typeof label === 'string' && label.trim() ? label.trim() : name
}

async function listIngestConnectionsFromConnectApi (session) {
  const connectors = []
  const seen = new Set()
  let offset = 0
  const limit = 200
  for (;;) {
    const path = '/ssot/connections?connectorType=IngestApi&limit=' + limit + '&offset=' + offset
    const data = await sfGetJson(session, path)
    const rows = Array.isArray(data.connections) ? data.connections : []
    for (const row of rows) {
      const connectionDevName = connectionName(row)
      const name = ingestApiName(connectionDevName)
      if (!name || seen.has(name)) continue
      seen.add(name)
      connectors.push({
        id: row.id != null ? String(row.id) : name,
        name,
        connectionName: connectionDevName,
        label: connectionLabel(row, name)
      })
    }
    if (rows.length < limit) break
    offset += rows.length
    if (offset > 5000) break
  }
  connectors.sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name))
  return connectors
}

async function listIngestConnectors (session) {
  return listIngestConnectionsFromConnectApi(session)
}

function objectNameFromStream (row, sourceName) {
  if (!row || typeof row !== 'object') return ''
  const details = row.connectorInfo && row.connectorInfo.connectorDetails
    ? row.connectorInfo.connectorDetails
    : {}
  const explicit = details.sourceObject || details.object || details.objectName
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()
  const label = typeof row.label === 'string' ? row.label.trim() : ''
  const prefix = sourceName ? sourceName + '-' : ''
  if (prefix && label.startsWith(prefix)) return label.slice(prefix.length)
  const dash = label.lastIndexOf('-')
  if (dash > 0 && dash < label.length - 1) return label.slice(dash + 1)
  return label
}

function streamConnectorName (row) {
  if (!row || typeof row !== 'object') return ''
  const details = row.connectorInfo && row.connectorInfo.connectorDetails
    ? row.connectorInfo.connectorDetails
    : {}
  const name = details.name || details.sourceName || details.connectionName
  return typeof name === 'string' ? name.trim() : ''
}

function streamConnectorType (row) {
  if (!row || typeof row !== 'object') return ''
  const type = row.connectorInfo && row.connectorInfo.connectorType
  return typeof type === 'string' ? type.trim() : ''
}

async function listObjectsFromDataStreams (session, sourceName, connectionNameFilter) {
  const objects = []
  const seen = new Set()
  let offset = 0
  const limit = 200
  const queryName = connectionNameFilter || sourceName
  for (;;) {
    const path = '/ssot/data-streams?connectionName=' + encodeURIComponent(queryName) +
      '&limit=' + limit + '&offset=' + offset
    const data = await sfGetJson(session, path)
    const rows = Array.isArray(data.dataStreams) ? data.dataStreams : []
    for (const row of rows) {
      const type = streamConnectorType(row)
      if (type && type !== 'IngestApi') continue
      const connector = streamConnectorName(row)
      if (connector && !namesMatch(connector, sourceName) && connector !== connectionNameFilter) continue
      const objectName = objectNameFromStream(row, sourceName)
      if (!objectName || seen.has(objectName)) continue
      seen.add(objectName)
      objects.push({
        name: objectName,
        label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : objectName
      })
    }
    if (rows.length < limit) break
    offset += rows.length
    if (offset > 5000) break
  }
  objects.sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name))
  return objects
}

function objectNamesFromSchema (schema) {
  const names = new Set()
  if (!schema || typeof schema !== 'object') return []
  if (schema.paths && typeof schema.paths === 'object') {
    for (const key of Object.keys(schema.paths)) {
      const cleaned = key.replace(/^\/+/, '').split('/')[0]
      if (cleaned) names.add(cleaned)
    }
  }
  const schemas = schema.components && schema.components.schemas
  if (schemas && typeof schemas === 'object') {
    for (const key of Object.keys(schemas)) names.add(key)
  }
  if (Array.isArray(schema.objects)) {
    for (const row of schema.objects) {
      const name = row && (row.name || row.object || row.objectName)
      if (typeof name === 'string' && name.trim()) names.add(name.trim())
    }
  }
  return [...names]
}

async function listObjectsFromConnectionSchema (session, connectorId) {
  if (!connectorId) return []
  const data = await sfGetJson(session, '/ssot/connections/' + encodeURIComponent(connectorId) + '/schema')
  return objectNamesFromSchema(data).sort().map((name) => ({ name, label: name }))
}

async function listIngestObjects (session, sourceName, connectorId, connectionName) {
  const seen = new Set()
  const objects = []
  const addAll = (rows) => {
    for (const row of rows) {
      if (!row || !row.name || seen.has(row.name)) continue
      seen.add(row.name)
      objects.push(row)
    }
  }
  try {
    addAll(await listObjectsFromDataStreams(session, sourceName, connectionName))
  } catch (_) {
    /* schema fallback below */
  }
  if (!objects.length && connectorId) {
    try {
      addAll(await listObjectsFromConnectionSchema(session, connectorId))
    } catch (_) {
      /* empty list is handled by the UI */
    }
  }
  objects.sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name))
  return objects
}

module.exports = {
  listIngestConnectors,
  listIngestObjects
}
