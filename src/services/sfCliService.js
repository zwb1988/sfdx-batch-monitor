const fs = require('fs')
const os = require('os')
const path = require('path')
const { parse: parseCsv } = require('csv-parse/sync')
const { execFile } = require('child_process')
const { promisify } = require('util')
const constants = require('../../config/constants')
const { DEFAULT_SOQL_LIMIT, MAX_SOQL_LIMIT } = constants

const execFileAsync = promisify(execFile)

const BASE_SELECT = 'SELECT Id, ApexClassId, ApexClass.Name, CreatedDate, CreatedById, CompletedDate, JobType, Status, ExtendedStatus, MethodName, JobItemsProcessed, TotalJobItems, NumberOfErrors, LastProcessed, LastProcessedOffset, ParentJobId FROM AsyncApexJob'
/** Full batch history for Bulk API 2.0 export (no row limit; ordering supported for query jobs). */
const BATCH_HISTORY_BULK_SOQL =
  BASE_SELECT + " WHERE JobType = 'BatchApex' ORDER BY CreatedDate DESC"
const CRON_SELECT = 'SELECT Id, CronExpression, NextFireTime, PreviousFireTime, State, TimesTriggered, TimeZoneSidKey, CronJobDetailId, CronJobDetail.Name, CronJobDetail.JobType FROM CronTrigger'
const ASYNC_APEX_BY_CRON_SELECT = 'SELECT CronTriggerId, ApexClassId, ApexClass.Name, CreatedDate FROM AsyncApexJob'
/** Max CronTrigger Ids per SOQL IN clause (stay under binding limits). */
const CRON_TRIGGER_IN_CHUNK = 70
const DEFAULT_STATUSES = ['Processing', 'Preparing', 'Queued', 'Failed']

const TARGET_ORG_REGEX = /^[a-zA-Z0-9_.@-]+$/
const JOB_ID_REGEX = /^[a-zA-Z0-9]{15,18}$/
/** Salesforce sObject API name (queryable objects). */
const SOBJECT_NAME_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/

function validateTargetOrg (targetOrg) {
  if (typeof targetOrg !== 'string' || !targetOrg.trim()) return false
  return TARGET_ORG_REGEX.test(targetOrg.trim())
}

function validateJobId (jobId) {
  if (!jobId || typeof jobId !== 'string') return false
  return JOB_ID_REGEX.test(jobId.trim())
}

function validateSObjectName (sobjectName) {
  if (typeof sobjectName !== 'string' || !sobjectName.trim()) return false
  return SOBJECT_NAME_REGEX.test(sobjectName.trim())
}

function escapeSoqlLike (str) {
  return String(str).replace(/'/g, '\'\'')
}

function buildBatchJobsSoql (options) {
  const conditions = ["JobType = 'BatchApex'"]
  if (options.jobId && validateJobId(options.jobId)) {
    conditions.push("Id = '" + options.jobId.trim() + "'")
  }
  if (options.apexClassNameSearch && typeof options.apexClassNameSearch === 'string' && options.apexClassNameSearch.trim()) {
    const escaped = escapeSoqlLike(options.apexClassNameSearch.trim())
    conditions.push("ApexClass.Name LIKE '%" + escaped + "%'")
  }
  if (!options.jobId || !validateJobId(options.jobId)) {
    const raw = options.statuses
    const statuses = (raw === undefined || raw === null)
      ? DEFAULT_STATUSES
      : (Array.isArray(raw) ? raw : []).map(s => String(s).trim()).filter(Boolean)
    if (statuses.length > 0) {
      const statusListSoql = statuses.map(s => "'" + String(s).replace(/'/g, '\'\'') + "'").join(',')
      conditions.push('Status IN (' + statusListSoql + ')')
    }
  }
  const where = conditions.join(' AND ')
  let limit = options.limit
  if (limit === undefined || limit === null) limit = DEFAULT_SOQL_LIMIT
  const n = parseInt(limit, 10)
  const clamped = Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_SOQL_LIMIT) : DEFAULT_SOQL_LIMIT
  return BASE_SELECT + ' WHERE ' + where + ' ORDER BY CreatedDate DESC LIMIT ' + clamped
}

function buildScheduledCronSoql (options) {
  const where = "CronJobDetail.JobType = '7'"
  let limit = options.limit
  if (limit === undefined || limit === null) limit = DEFAULT_SOQL_LIMIT
  const n = parseInt(limit, 10)
  const clamped = Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_SOQL_LIMIT) : DEFAULT_SOQL_LIMIT
  return CRON_SELECT + ' WHERE ' + where + ' ORDER BY NextFireTime ASC NULLS LAST LIMIT ' + clamped
}

function getChildEnv () {
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  delete env.NODE_INSPECT_RESUME_ON_START
  return env
}

function sanitizeSfError (msg) {
  if (typeof msg !== 'string') return msg
  if (/debugger attached|waiting for the debugger/i.test(msg)) {
    return 'sf command failed. If the server is running under a debugger, try running without it (e.g. npm start).'
  }
  return msg
}

function runSf (args, timeoutMs) {
  const t = timeoutMs != null ? timeoutMs : constants.SF_CLI_TIMEOUT_MS
  return execFileAsync('sf', args, {
    maxBuffer: constants.SF_CLI_MAX_BUFFER,
    timeout: t,
    env: getChildEnv()
  })
}

/** Prefer non-empty trimmed stdout; avoids parsing whitespace-only stdout and ignoring stderr. */
function sfCliTextOutput (stdout, stderr) {
  const out = String(stdout ?? '').trim()
  const err = String(stderr ?? '').trim()
  return out || err
}

/**
 * Slice from s[start] through the matching top-level `}` for that `{`, respecting
 * JSON string rules (so `{`/`}` inside strings are ignored).
 */
function sliceBalancedJsonObject (s, start) {
  if (s[start] !== '{') return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escape) {
        escape = false
      } else if (c === '\\') {
        escape = true
      } else if (c === '"') {
        inString = false
      }
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        return s.slice(start, i + 1)
      }
    }
  }
  return null
}

/**
 * Parse CLI stdout/stderr that should be one JSON object. Strips BOM and ANSI
 * color codes, then tries the full string. If that fails, tries each `{` in
 * order — the first `{` is often a false start (e.g. `.../path/{id}/...` in a
 * URL printed before the real JSON).
 */
function parseSfJsonOutput (raw, contextLabel) {
  let s = raw == null ? '' : String(raw)
  s = s.replace(/^\uFEFF/, '').replace(/\x1b\[[0-9;]*m/g, '').trim()
  if (!s) {
    throw new Error(`Invalid JSON from ${contextLabel}: empty output`)
  }
  const tryCandidates = () => {
    try {
      return JSON.parse(s)
    } catch (_) {
      let idx = 0
      while (idx < s.length) {
        const start = s.indexOf('{', idx)
        if (start < 0) break
        const slice = sliceBalancedJsonObject(s, start)
        if (slice) {
          try {
            return JSON.parse(slice)
          } catch (_) {
            idx = start + 1
            continue
          }
        }
        idx = start + 1
      }
      return null
    }
  }
  const parsed = tryCandidates()
  if (parsed !== null) {
    return parsed
  }
  let firstErrMsg = 'could not parse JSON'
  try {
    JSON.parse(s)
  } catch (e) {
    firstErrMsg = e.message
  }
  const preview = s.length > 280 ? s.slice(0, 280) + '…' : s
  throw new Error(`Invalid JSON from ${contextLabel}: ${firstErrMsg}. Output preview: ${preview}`)
}

const ORG_LIST_RESULT_KEYS = ['nonScratchOrgs', 'scratchOrgs', 'other', 'sandboxes', 'devHubs']

function parseOrgList (stdout) {
  const data = parseSfJsonOutput(stdout, 'sf org list')
  const result = data.result || data
  const orgs = []
  const seen = new Set()
  const addOrg = (entry) => {
    if (!entry || typeof entry !== 'object') return
    const alias = entry.alias || entry.username
    const username = entry.username
    if (!alias && !username) return
    const key = String(username || alias)
    if (seen.has(key)) return
    seen.add(key)
    orgs.push({ alias: alias || username, username: username || alias })
  }
  const addGroup = (group) => {
    if (!group) return
    const list = Array.isArray(group) ? group : Object.values(group)
    for (const entry of list) {
      addOrg(entry)
    }
  }
  for (const key of ORG_LIST_RESULT_KEYS) {
    addGroup(result[key])
  }
  return { orgs }
}

function toCamelCase (str) {
  if (typeof str !== 'string' || !str) return str
  return str.charAt(0).toLowerCase() + str.slice(1).replace(/_(.)/g, (_, c) => c.toUpperCase())
}

function normalizeBatchJob (record) {
  const apexClass = record.ApexClass || {}
  const base = {
    id: record.Id || null,
    apexClassName: apexClass.Name || record.ApexClassName || '—',
    jobType: record.JobType || '—',
    jobItemsProcessed: record.JobItemsProcessed ?? '—',
    totalJobItems: record.TotalJobItems ?? '—',
    status: record.Status || '—',
    startedAt: record.CreatedDate || null,
    completedAt: record.CompletedDate || null
  }
  const passthrough = {
    apexClassId: record.ApexClassId,
    createdById: record.CreatedById,
    extendedStatus: record.ExtendedStatus,
    methodName: record.MethodName,
    numberOfErrors: record.NumberOfErrors,
    lastProcessed: record.LastProcessed,
    lastProcessedOffset: record.LastProcessedOffset,
    parentJobId: record.ParentJobId
  }
  const result = { ...base, ...passthrough }
  for (const key of Object.keys(record)) {
    if (key === 'attributes' || key === 'ApexClass') continue
    const camel = toCamelCase(key)
    if (!(camel in result) && record[key] !== undefined) result[camel] = record[key]
  }
  return result
}

function normalizeCronTrigger (record) {
  const detail = record.CronJobDetail || {}
  const base = {
    id: record.Id || null,
    name: detail.Name || '—',
    cronJobDetailId: record.CronJobDetailId || null,
    jobType: detail.JobType != null ? String(detail.JobType) : '—',
    cronExpression: record.CronExpression || '—',
    nextFireTime: record.NextFireTime || null,
    previousFireTime: record.PreviousFireTime || null,
    state: record.State || '—',
    timesTriggered: record.TimesTriggered ?? '—',
    timeZoneSidKey: record.TimeZoneSidKey || '—',
    apexClassName: '—',
    apexClassId: null
  }
  const result = { ...base }
  for (const key of Object.keys(record)) {
    if (key === 'attributes' || key === 'CronJobDetail') continue
    const camel = toCamelCase(key)
    if (!(camel in result) && record[key] !== undefined) result[camel] = record[key]
  }
  return result
}

function parseScheduledCronResult (stdout) {
  const data = parseSfJsonOutput(stdout, 'sf data query')
  const result = data.result || data
  const records = result.records || []
  return records.map(normalizeCronTrigger)
}

function parseQueryRecords (stdout) {
  const data = parseSfJsonOutput(stdout, 'sf data query')
  const result = data.result || data
  return result.records || []
}

/**
 * Latest ScheduledApex AsyncApexJob per CronTriggerId (name + class id), via CronTriggerId filter.
 */
async function fetchApexClassByCronTriggerIds (targetOrg, cronTriggerIds) {
  const map = new Map()
  const unique = [...new Set((cronTriggerIds || []).filter(Boolean))]
  if (!unique.length) return map

  for (let i = 0; i < unique.length; i += CRON_TRIGGER_IN_CHUNK) {
    const chunk = unique.slice(i, i + CRON_TRIGGER_IN_CHUNK)
    const inList = chunk.map(id => "'" + String(id).replace(/'/g, '\'\'') + "'").join(',')
    const soql =
      ASYNC_APEX_BY_CRON_SELECT +
      " WHERE JobType = 'ScheduledApex' AND CronTriggerId IN (" +
      inList +
      ') ORDER BY CreatedDate DESC LIMIT 2000'
    const args = [
      'data', 'query',
      '--query', soql,
      '--target-org', targetOrg.trim(),
      '--json'
    ]
    const { stdout, stderr } = await runSf(args).catch((err) => {
      const raw = err.stderr || err.stdout || err.message
      const msg = sanitizeSfError(String(raw))
      throw new Error(`sf data query failed: ${msg}`)
    })
    const output = sfCliTextOutput(stdout, stderr)
    const records = parseQueryRecords(output)
    for (const rec of records) {
      const ctid = rec.CronTriggerId
      if (!ctid || map.has(ctid)) continue
      const apex = rec.ApexClass || {}
      const name = apex.Name ? String(apex.Name) : null
      map.set(ctid, {
        apexClassName: name || '—',
        apexClassId: rec.ApexClassId || null
      })
    }
  }
  return map
}

function parseBatchJobsResult (stdout) {
  const data = parseSfJsonOutput(stdout, 'sf data query')
  const result = data.result || data
  const records = result.records || []
  return records.map(normalizeBatchJob)
}

async function listOrgs () {
  const { stdout, stderr } = await runSf(['org', 'list', '--json']).catch((err) => {
    const raw = err.stderr || err.stdout || err.message
    const msg = sanitizeSfError(String(raw))
    throw new Error(`sf org list failed: ${msg}`)
  })
  return parseOrgList(sfCliTextOutput(stdout, stderr))
}

async function getOrgInstanceUrl (targetOrg) {
  if (!validateTargetOrg(targetOrg)) {
    return null
  }
  const args = ['org', 'display', '--target-org', targetOrg.trim(), '--json']
  try {
    const { stdout, stderr } = await runSf(args)
    const data = parseSfJsonOutput(sfCliTextOutput(stdout, stderr), 'sf org display')
    const result = data.result || data
    const url = result.instanceUrl || result.instance_url
    return typeof url === 'string' && url.trim() ? url.trim().replace(/\/+$/, '') : null
  } catch (_) {
    return null
  }
}

async function getBatchJobs (targetOrg, options = {}) {
  if (!validateTargetOrg(targetOrg)) {
    throw new Error('Invalid targetOrg')
  }
  const soql = buildBatchJobsSoql(options)
  const args = [
    'data', 'query',
    '--query', soql,
    '--target-org', targetOrg.trim(),
    '--json'
  ]
  const { stdout, stderr } = await runSf(args).catch((err) => {
    const raw = err.stderr || err.stdout || err.message
    const msg = sanitizeSfError(String(raw))
    throw new Error(`sf data query failed: ${msg}`)
  })
  return parseBatchJobsResult(sfCliTextOutput(stdout, stderr))
}

async function getScheduledApexCronTriggers (targetOrg, options = {}) {
  if (!validateTargetOrg(targetOrg)) {
    throw new Error('Invalid targetOrg')
  }
  const soql = buildScheduledCronSoql(options)
  const args = [
    'data', 'query',
    '--query', soql,
    '--target-org', targetOrg.trim(),
    '--json'
  ]
  const { stdout, stderr } = await runSf(args).catch((err) => {
    const raw = err.stderr || err.stdout || err.message
    const msg = sanitizeSfError(String(raw))
    throw new Error(`sf data query failed: ${msg}`)
  })
  const triggers = parseScheduledCronResult(sfCliTextOutput(stdout, stderr))
  const ids = triggers.map((t) => t.id).filter(Boolean)
  const apexByCron = await fetchApexClassByCronTriggerIds(targetOrg, ids)
  return triggers.map((t) => {
    const info = apexByCron.get(t.id)
    return {
      ...t,
      apexClassName: info ? info.apexClassName : '—',
      apexClassId: info ? info.apexClassId : null
    }
  })
}

function parseOrgLimitsResult (stdout) {
  const data = parseSfJsonOutput(stdout, 'sf force limits api display')
  const raw = data.result !== undefined ? data.result : data
  const list = Array.isArray(raw) ? raw : []
  const limits = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const name = row.name != null ? String(row.name).trim() : ''
    const max = Number(row.max)
    const remaining = Number(row.remaining)
    if (!name || !Number.isFinite(max) || !Number.isFinite(remaining)) continue
    limits.push({ name, max, remaining })
  }
  return limits
}

function classifySObjectName (name) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return null
  if (n.endsWith('__c')) return { name: n, kind: 'custom' }
  if (n.endsWith('__mdt')) return { name: n, kind: 'custom-metadata' }
  if (n.endsWith('__e')) return { name: n, kind: 'platform-event' }
  if (n.endsWith('__x')) return { name: n, kind: 'external' }
  if (n.endsWith('__b')) return { name: n, kind: 'big-object' }
  return { name: n, kind: 'standard' }
}

function parseSObjectRecordCountsResult (stdout) {
  const data = parseSfJsonOutput(stdout, 'sf org list sobject record-counts')
  const result = data.result
  if (!Array.isArray(result)) return []
  const objects = []
  for (const entry of result) {
    if (!entry || typeof entry !== 'object') continue
    const name = entry.name != null ? String(entry.name).trim() : ''
    const row = classifySObjectName(name)
    if (!row) continue
    const count = Number(entry.count)
    objects.push({
      ...row,
      count: Number.isFinite(count) && count >= 0 ? count : 0
    })
  }
  objects.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return objects
}

async function getOrgSObjects (targetOrg) {
  if (!validateTargetOrg(targetOrg)) {
    throw new Error('Invalid targetOrg')
  }
  const args = [
    'org', 'list', 'sobject', 'record-counts',
    '--target-org', targetOrg.trim(),
    '--json'
  ]
  const { stdout, stderr } = await runSf(args).catch((err) => {
    const raw = err.stderr || err.stdout || err.message
    const msg = sanitizeSfError(String(raw))
    throw new Error(`sf org list sobject record-counts failed: ${msg}`)
  })
  return parseSObjectRecordCountsResult(sfCliTextOutput(stdout, stderr))
}

function parseCountQueryResult (stdout) {
  const data = parseSfJsonOutput(stdout, 'sf data query count')
  const result = data.result || data
  const totalSize = result.totalSize
  if (typeof totalSize === 'number' && Number.isFinite(totalSize) && totalSize >= 0) {
    return totalSize
  }
  throw new Error('COUNT() query did not return a valid totalSize')
}

async function getSObjectLiveRecordCount (targetOrg, sobjectName) {
  if (!validateTargetOrg(targetOrg)) {
    throw new Error('Invalid targetOrg')
  }
  const name = typeof sobjectName === 'string' ? sobjectName.trim() : ''
  if (!validateSObjectName(name)) {
    throw new Error('Invalid sobject name')
  }
  const soql = 'SELECT COUNT() FROM ' + name
  const args = [
    'data', 'query',
    '--query', soql,
    '--target-org', targetOrg.trim(),
    '--json'
  ]
  const { stdout, stderr } = await runSf(args).catch((err) => {
    const raw = err.stderr || err.stdout || err.message
    const msg = sanitizeSfError(String(raw))
    throw new Error(`sf data query failed: ${msg}`)
  })
  return parseCountQueryResult(sfCliTextOutput(stdout, stderr))
}

async function getOrgLimits (targetOrg) {
  if (!validateTargetOrg(targetOrg)) {
    throw new Error('Invalid targetOrg')
  }
  const args = [
    'force', 'limits', 'api', 'display',
    '--target-org', targetOrg.trim(),
    '--json'
  ]
  const { stdout, stderr } = await runSf(args).catch((err) => {
    const raw = err.stderr || err.stdout || err.message
    const msg = sanitizeSfError(String(raw))
    throw new Error(`sf force limits api display failed: ${msg}`)
  })
  return parseOrgLimitsResult(sfCliTextOutput(stdout, stderr))
}

/** Finished executions (batch ran to completion or terminal failure). */
const BATCH_EXECUTE_TERMINAL_STATUSES = new Set(['Completed', 'Failed', 'Aborted'])

function parseBulkExportCsvFile (filePath) {
  const buf = fs.readFileSync(filePath)
  const rows = parseCsv(buf, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true
  })
  return Array.isArray(rows) ? rows : []
}

/** Bulk CSV uses dotted column names; normalizeBatchJob expects nested ApexClass. */
function coerceBulkRowToSoqlRecordShape (row) {
  if (!row || typeof row !== 'object') return row
  const out = { ...row }
  const dotted =
    row['ApexClass.Name'] ??
    row['apexClass.name']
  if (dotted != null && String(dotted).trim() !== '' && !out.ApexClass) {
    out.ApexClass = { Name: String(dotted) }
  }
  const aliases = {
    Id: ['Id', 'id', 'ID'],
    CreatedDate: ['CreatedDate', 'createdDate', 'createddate', 'CREATEDDATE'],
    CompletedDate: ['CompletedDate', 'completedDate', 'completeddate', 'COMPLETEDDATE'],
    Status: ['Status', 'status', 'STATUS'],
    JobType: ['JobType', 'jobType', 'jobtype']
  }
  for (const [canonical, keys] of Object.entries(aliases)) {
    if (out[canonical] != null && String(out[canonical]).trim() !== '') continue
    for (const key of keys) {
      const val = row[key]
      if (val != null && String(val).trim() !== '') {
        out[canonical] = val
        break
      }
    }
  }
  return out
}

/**
 * Downloads all matching AsyncApexJob rows via Bulk API 2.0 (`sf data export bulk`) to a temp CSV,
 * then parses locally. CSV avoids multi-batch JSON export issues in the CLI; SOQL must comply with
 * Bulk API 2.0 query limits (see Salesforce Bulk API developer guide).
 */
async function fetchBatchApexJobsHistoryViaBulkExport (targetOrg) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sfdx-batch-analysis-'))
  const queryPath = path.join(tmpRoot, 'query.soql')
  const outPath = path.join(tmpRoot, 'export.csv')
  fs.writeFileSync(queryPath, BATCH_HISTORY_BULK_SOQL, 'utf8')
  const waitMin = constants.BATCH_ANALYSIS_BULK_WAIT_MINUTES
  try {
    const args = [
      'data', 'export', 'bulk',
      '--query-file', queryPath,
      '--output-file', outPath,
      '--result-format', 'csv',
      '--target-org', targetOrg.trim(),
      '--wait', String(waitMin)
    ]
    await runSf(args, constants.SF_CLI_BATCH_EXPORT_TIMEOUT_MS).catch((err) => {
      const raw = err.stderr || err.stdout || err.message
      const msg = sanitizeSfError(String(raw))
      throw new Error(`sf data export bulk failed: ${msg}`)
    })
    if (!fs.existsSync(outPath)) {
      throw new Error('Bulk export finished but output file was not found')
    }
    let records = parseBulkExportCsvFile(outPath)
    records = records.map(coerceBulkRowToSoqlRecordShape)
    const maxRows = constants.BATCH_ANALYSIS_MAX_TOTAL_ROWS
    if (records.length > maxRows) {
      records = records.slice(0, maxRows)
    }
    return records
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    } catch (_) {}
  }
}

function jobDurationMs (createdIso, completedIso) {
  if (!createdIso || !completedIso) return null
  const a = Date.parse(String(createdIso))
  const b = Date.parse(String(completedIso))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const d = b - a
  return d >= 0 ? d : null
}

function percentileSorted (sortedAsc, p) {
  if (!sortedAsc.length) return null
  const n = sortedAsc.length
  const rank = (p / 100) * (n - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sortedAsc[lo]
  const w = rank - lo
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w
}

function buildBatchJobAnalysisFromRecords (records) {
  let dateMin = null
  let dateMax = null
  const startTimes = []
  const jobStarts = []
  const jobExecutions = []
  const durationsAll = []
  const durationsByClass = new Map()
  const failuresByClass = new Map()

  for (const rec of records) {
    const norm = normalizeBatchJob(rec)
    const className = norm.apexClassName != null ? String(norm.apexClassName) : '—'
    const started = norm.startedAt || rec.CreatedDate
    if (started) {
      const startedStr = String(started)
      startTimes.push(startedStr)
      jobStarts.push({ startedAt: startedStr, apexClassName: className })
      const t = Date.parse(startedStr)
      if (Number.isFinite(t)) {
        if (dateMin == null || t < dateMin) dateMin = t
        if (dateMax == null || t > dateMax) dateMax = t
      }
    }

    const status = norm.status != null ? String(norm.status).trim() : ''
    const completed = norm.completedAt || rec.CompletedDate
    const startedRaw = norm.startedAt || rec.CreatedDate

    if (startedRaw && completed) {
      const dm = jobDurationMs(startedRaw, completed)
      if (dm != null) {
        jobExecutions.push({
          id: norm.id != null ? String(norm.id) : null,
          startedAt: String(startedRaw),
          completedAt: String(completed),
          apexClassName: className,
          status: status || '—'
        })
      }
    }

    if (BATCH_EXECUTE_TERMINAL_STATUSES.has(status)) {
      const dm = jobDurationMs(startedRaw, completed)
      if (dm != null) {
        durationsAll.push(dm)
      }
    }
    if (status === 'Completed') {
      const dm = jobDurationMs(norm.startedAt || rec.CreatedDate, norm.completedAt || rec.CompletedDate)
      if (dm != null) {
        if (!durationsByClass.has(className)) durationsByClass.set(className, [])
        durationsByClass.get(className).push(dm)
      }
    }

    if (status === 'Failed') {
      if (!failuresByClass.has(className)) failuresByClass.set(className, [])
      failuresByClass.get(className).push(norm)
    }
  }

  const totalRetrieved = records.length
  let executedCount = 0
  for (const rec of records) {
    const st = rec.Status != null ? String(rec.Status) : ''
    if (BATCH_EXECUTE_TERMINAL_STATUSES.has(st)) executedCount++
  }

  let overallAvgDurationMs = null
  let maxDurationMs = null
  if (durationsAll.length) {
    overallAvgDurationMs = durationsAll.reduce((a, b) => a + b, 0) / durationsAll.length
    maxDurationMs = Math.max(...durationsAll)
  }

  const durationByClass = []
  for (const [apexClassName, arr] of durationsByClass.entries()) {
    const sorted = [...arr].sort((a, b) => a - b)
    const sum = sorted.reduce((a, b) => a + b, 0)
    durationByClass.push({
      apexClassName,
      completedCount: sorted.length,
      avgDurationMs: sum / sorted.length,
      p50Ms: percentileSorted(sorted, 50),
      p90Ms: percentileSorted(sorted, 90),
      p95Ms: percentileSorted(sorted, 95)
    })
  }
  durationByClass.sort((a, b) => b.completedCount - a.completedCount)

  const failuresByClassList = []
  for (const [apexClassName, jobs] of failuresByClass.entries()) {
    failuresByClassList.push({
      apexClassName,
      count: jobs.length,
      jobs
    })
  }
  failuresByClassList.sort((a, b) => b.count - a.count)

  const summary = {
    dateRangeMin: dateMin != null ? new Date(dateMin).toISOString() : null,
    dateRangeMax: dateMax != null ? new Date(dateMax).toISOString() : null,
    totalRetrieved,
    executedCount,
    overallAvgDurationMs,
    maxDurationMs
  }

  return {
    summary,
    startTimes,
    jobStarts,
    jobExecutions,
    durationByClass,
    failuresByClass: failuresByClassList
  }
}

async function getBatchJobAnalysis (targetOrg) {
  if (!validateTargetOrg(targetOrg)) {
    throw new Error('Invalid targetOrg')
  }
  const records = await fetchBatchApexJobsHistoryViaBulkExport(targetOrg.trim())
  return buildBatchJobAnalysisFromRecords(records)
}

module.exports = {
  listOrgs,
  getBatchJobs,
  getScheduledApexCronTriggers,
  getOrgLimits,
  getOrgSObjects,
  getSObjectLiveRecordCount,
  getOrgInstanceUrl,
  getBatchJobAnalysis,
  validateTargetOrg,
  validateJobId,
  validateSObjectName
}
