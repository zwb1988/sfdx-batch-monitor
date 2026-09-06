const fs = require('fs')
const constants = require('../../../config/constants')
const { requestHttp1, parseJsonBody, collectJsonErrorText, formatRemoteError } = require('./http1')

function dcUrl (session, pathname) {
  return session.dcInstanceUrl.replace(/\/+$/, '') + pathname
}

async function dcRequest (session, options) {
  const res = await requestHttp1({
    url: dcUrl(session, options.pathname),
    method: options.method,
    headers: {
      Authorization: 'Bearer ' + session.dcAccessToken,
      ...options.headers
    },
    body: options.body,
    timeoutMs: options.timeoutMs != null ? options.timeoutMs : constants.DATA_CLOUD_HTTP_TIMEOUT_MS
  })
  const parsed = options.parseJson === false ? null : parseJsonBody(res.body)
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(formatRemoteError(res.status, parsed, options.fallbackError || 'Data Cloud Ingestion API request failed'))
    err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502
    throw err
  }
  const jsonError = collectJsonErrorText(parsed)
  if (jsonError && !(parsed && parsed.id)) {
    const err = new Error(jsonError)
    err.statusCode = 502
    throw err
  }
  return parsed
}

function normalizeJob (row) {
  if (!row || typeof row !== 'object') return null
  const id = row.id != null ? String(row.id) : ''
  if (!id) return null
  return {
    id,
    operation: row.operation != null ? String(row.operation) : '',
    sourceName: row.sourceName != null ? String(row.sourceName) : '',
    object: row.object != null ? String(row.object) : '',
    state: row.state != null ? String(row.state) : '',
    createdById: row.createdById != null ? String(row.createdById) : null,
    createdDate: row.createdDate != null ? String(row.createdDate) : null,
    systemModstamp: row.systemModstamp != null ? String(row.systemModstamp) : null,
    contentType: row.contentType != null ? String(row.contentType) : null,
    apiVersion: row.apiVersion != null ? String(row.apiVersion) : null,
    contentUrl: row.contentUrl != null ? String(row.contentUrl) : null,
    retries: row.retries == null ? null : row.retries,
    totalProcessingTime: row.totalProcessingTime == null ? null : row.totalProcessingTime,
    errorMessage: collectJsonErrorText(row)
  }
}

async function createIngestJob (session, { sourceName, objectName, operation }) {
  const parsed = await dcRequest(session, {
    method: 'POST',
    pathname: '/api/v1/ingest/jobs',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object: objectName,
      sourceName,
      operation
    }),
    fallbackError: 'Failed to create ingest job'
  })
  const job = normalizeJob(parsed)
  if (!job) throw new Error('Create job response did not include a job id')
  return job
}

async function uploadCsvBatch (session, jobId, filePath) {
  const stat = fs.statSync(filePath)
  const stream = fs.createReadStream(filePath)
  await dcRequest(session, {
    method: 'PUT',
    pathname: '/api/v1/ingest/jobs/' + encodeURIComponent(jobId) + '/batches',
    headers: {
      'Content-Type': 'text/csv',
      'Content-Length': String(stat.size)
    },
    body: stream,
    timeoutMs: constants.DATA_CLOUD_UPLOAD_TIMEOUT_MS,
    fallbackError: 'Failed to upload CSV batch'
  })
  return { accepted: true, fileName: null, bytes: stat.size }
}

async function completeIngestJob (session, jobId) {
  const parsed = await dcRequest(session, {
    method: 'PATCH',
    pathname: '/api/v1/ingest/jobs/' + encodeURIComponent(jobId),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'UploadComplete' }),
    fallbackError: 'Failed to complete ingest job'
  })
  return normalizeJob(parsed) || { id: jobId, state: 'UploadComplete' }
}

async function getIngestJob (session, jobId) {
  const parsed = await dcRequest(session, {
    method: 'GET',
    pathname: '/api/v1/ingest/jobs/' + encodeURIComponent(jobId),
    fallbackError: 'Failed to load ingest job'
  })
  const job = normalizeJob(parsed)
  if (!job) throw new Error('Job info response did not include a job id')
  return job
}

async function listIngestJobs (session) {
  const parsed = await dcRequest(session, {
    method: 'GET',
    pathname: '/api/v1/ingest/jobs',
    fallbackError: 'Failed to list ingest jobs'
  })
  const rows = Array.isArray(parsed)
    ? parsed
    : (parsed && (parsed.data || parsed.jobs || parsed.items)) || []
  return rows.map(normalizeJob).filter(Boolean)
}

module.exports = {
  createIngestJob,
  uploadCsvBatch,
  completeIngestJob,
  getIngestJob,
  listIngestJobs
}
