const { execFile } = require('child_process')
const { promisify } = require('util')
const constants = require('../../config/constants')
const { DEFAULT_SOQL_LIMIT, MAX_SOQL_LIMIT } = constants

const execFileAsync = promisify(execFile)

const BASE_SELECT = 'SELECT Id, ApexClass.Name, JobType, JobItemsProcessed, TotalJobItems, Status, CreatedDate, CompletedDate FROM AsyncApexJob'
const DEFAULT_STATUSES = ['Processing', 'Preparing', 'Queued', 'Failed']

const TARGET_ORG_REGEX = /^[a-zA-Z0-9_.@-]+$/
const JOB_ID_REGEX = /^[a-zA-Z0-9]{15,18}$/

function validateTargetOrg (targetOrg) {
  if (typeof targetOrg !== 'string' || !targetOrg.trim()) return false
  return TARGET_ORG_REGEX.test(targetOrg.trim())
}

function validateJobId (jobId) {
  if (!jobId || typeof jobId !== 'string') return false
  return JOB_ID_REGEX.test(jobId.trim())
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

function runSf (args) {
  return execFileAsync('sf', args, {
    maxBuffer: constants.SF_CLI_MAX_BUFFER,
    timeout: constants.SF_CLI_TIMEOUT_MS,
    env: getChildEnv()
  })
}

function parseOrgList (stdout) {
  let data
  try {
    data = JSON.parse(stdout)
  } catch (e) {
    throw new Error('Invalid JSON from sf org list')
  }
  const result = data.result || data
  const orgs = []
  const addOrg = (entry) => {
    const alias = entry.alias || entry.username
    const username = entry.username
    if (alias || username) {
      orgs.push({ alias: alias || username, username: username || alias })
    }
  }
  if (result.nonScratchOrgs) {
    for (const entry of Object.values(result.nonScratchOrgs)) {
      addOrg(entry)
    }
  }
  if (result.scratchOrgs) {
    for (const entry of Object.values(result.scratchOrgs)) {
      addOrg(entry)
    }
  }
  return { orgs }
}

function normalizeBatchJob (record) {
  const apexClass = record.ApexClass || {}
  return {
    id: record.Id || null,
    apexClassName: apexClass.Name || record.ApexClassName || '—',
    jobType: record.JobType || '—',
    jobItemsProcessed: record.JobItemsProcessed ?? '—',
    totalJobItems: record.TotalJobItems ?? '—',
    status: record.Status || '—',
    startedAt: record.CreatedDate || null,
    completedAt: record.CompletedDate || null
  }
}

function parseBatchJobsResult (stdout) {
  let data
  try {
    data = JSON.parse(stdout)
  } catch (e) {
    throw new Error('Invalid JSON from sf data query')
  }
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
  const output = stderr && !stdout ? stderr : stdout
  return parseOrgList(output)
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
  const output = stderr && !stdout ? stderr : stdout
  return parseBatchJobsResult(output)
}

module.exports = {
  listOrgs,
  getBatchJobs,
  validateTargetOrg,
  validateJobId
}
