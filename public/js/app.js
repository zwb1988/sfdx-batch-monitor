const orgSelect = document.getElementById('org-select')
const intervalInput = document.getElementById('interval-input')
const refreshNowBtn = document.getElementById('refresh-now-btn')
const jobIdInput = document.getElementById('job-id-input')
const searchInput = document.getElementById('search-input')
const statusCheckboxes = document.getElementById('status-checkboxes')
const statusFilters = document.getElementById('status-filters')
const statusMessage = document.getElementById('status-message')
const jobsTbody = document.getElementById('jobs-tbody')
const jobsTable = document.querySelector('.jobs-table')
const themeToggle = document.getElementById('theme-toggle')
const showLocalTzCheckbox = document.getElementById('show-local-tz')
const timezoneDisplay = document.getElementById('timezone-display')
const limitInput = document.getElementById('limit-input')
const batchDetailOverlay = document.getElementById('batch-detail-overlay')
const batchDetailContent = document.getElementById('batch-detail-content')
const modalCloseBtn = batchDetailOverlay && batchDetailOverlay.querySelector('.modal-close')

const THEME_STORAGE_KEY = 'sf-batch-monitor-theme'
const MIN_INTERVAL = 1
const DEFAULT_LIMIT = 100
const MIN_LIMIT = 1
const MAX_LIMIT = 2000
const STATUS_OPTIONS = ['Queued', 'Preparing', 'Processing', 'Completed', 'Failed', 'Aborted', 'Holding']
const DEFAULT_STATUSES = ['Processing', 'Preparing', 'Queued', 'Failed']

let pollTimer = null
let requestInFlight = false
let lastRefreshedAt = null
let jobsCache = []
let lastInstanceUrl = null
let currentBatchDetailJob = null
let sortKey = 'startedAt'
let sortDir = 'desc'

function setStatus (text, type) {
  statusMessage.textContent = text
  statusMessage.className = 'status-message' + (type ? ' ' + type : '')
}

function setSecondaryControlsEnabled (enabled) {
  if (intervalInput) intervalInput.disabled = !enabled
  if (refreshNowBtn) refreshNowBtn.disabled = !enabled
  if (jobIdInput) jobIdInput.disabled = !enabled
  if (searchInput) searchInput.disabled = !enabled
  if (statusFilters) statusFilters.disabled = !enabled
  if (showLocalTzCheckbox) showLocalTzCheckbox.disabled = !enabled
  if (limitInput) limitInput.disabled = !enabled
  if (themeToggle) themeToggle.disabled = !enabled
}

function setOrgSelectEnabled (enabled) {
  if (orgSelect) orgSelect.disabled = !enabled
}

function getTimezoneOffsetString () {
  const min = -new Date().getTimezoneOffset()
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  const sign = min >= 0 ? '+' : '-'
  if (m === 0) return 'UTC' + sign + h
  return 'UTC' + sign + h + ':' + String(m).padStart(2, '0')
}

function updateTimezoneDisplay () {
  if (!timezoneDisplay) return
  const useUtc = !showLocalTzCheckbox || !showLocalTzCheckbox.checked
  timezoneDisplay.textContent = useUtc ? 'UTC' : getTimezoneOffsetString()
}

function getTheme () {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY)
    if (t === 'dark' || t === 'light') return t
  } catch (_) {}
  return 'dark'
}

function setTheme (theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch (_) {}
}

function applyTheme (theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function updateThemeButton () {
  if (!themeToggle) return
  const theme = document.documentElement.getAttribute('data-theme') || 'dark'
  if (theme === 'dark') {
    themeToggle.textContent = '☀'
    themeToggle.setAttribute('aria-label', 'Switch to light theme')
    themeToggle.setAttribute('title', 'Switch to light theme')
  } else {
    themeToggle.textContent = '🌙'
    themeToggle.setAttribute('aria-label', 'Switch to dark theme')
    themeToggle.setAttribute('title', 'Switch to dark theme')
  }
}

function toggleTheme () {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark'
  const next = theme === 'dark' ? 'light' : 'dark'
  setTheme(next)
  applyTheme(next)
  updateThemeButton()
}

function formatDate (isoString, useUtc) {
  if (!isoString) return '—'
  try {
    const d = new Date(isoString)
    const opts = { dateStyle: 'short', timeStyle: 'short' }
    if (useUtc) opts.timeZone = 'UTC'
    return d.toLocaleString(undefined, opts)
  } catch (_) {
    return isoString
  }
}

function formatDateWithSeconds (isoString) {
  if (!isoString) return '—'
  try {
    const d = new Date(isoString)
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
  } catch (_) {
    return isoString
  }
}

function statusClass (status) {
  if (!status) return ''
  const s = (status + '').toLowerCase()
  if (s === 'completed') return 'completed'
  if (s === 'processing' || s === 'preparing' || s === 'queued') return 'processing'
  if (s === 'failed' || s === 'aborted') return 'failed'
  if (s === 'holding') return 'holding'
  return ''
}

function escapeHtml (str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function getProgress (job) {
  const p = Number(job.jobItemsProcessed)
  const t = Number(job.totalJobItems)
  if (t === 0) return 100
  if (Number.isFinite(p) && Number.isFinite(t) && t > 0) {
    return Math.min(100, Math.round((p / t) * 100))
  }
  if (String(job.status || '').trim() === 'Completed') return 100
  return null
}

function compare (a, b, key) {
  if (key === 'progress') {
    const va = getProgress(a)
    const vb = getProgress(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return va - vb
  }
  const va = a[key]
  const vb = b[key]
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (key === 'startedAt' || key === 'completedAt') {
    return new Date(va) - new Date(vb)
  }
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb))
}

function sortJobs (jobs) {
  const arr = jobs.slice()
  arr.sort((a, b) => {
    const c = compare(a, b, sortKey)
    return sortDir === 'asc' ? c : -c
  })
  return arr
}

function renderJobs (jobs) {
  jobsCache = jobs || []
  const sorted = sortJobs(jobsCache)
  jobsTbody.innerHTML = ''
  if (!sorted || sorted.length === 0) {
    const tr = document.createElement('tr')
    tr.innerHTML = '<td colspan="9">No batch jobs</td>'
    jobsTbody.appendChild(tr)
    return
  }
  const useUtc = !showLocalTzCheckbox || !showLocalTzCheckbox.checked
  for (const job of sorted) {
    const tr = document.createElement('tr')
    const statusCls = statusClass(job.status)
    const progress = getProgress(job)
    const progressCell = progress != null
      ? '<td class="progress-cell"><div class="progress-ring" style="--progress: ' + progress + '" aria-label="' + progress + '%"><span class="progress-value">' + progress + '%</span></div></td>'
      : '<td class="progress-cell"><span class="progress-na">—</span></td>'
    const batchId = job.id ? String(job.id) : '—'
    const batchIdCell = job.id
      ? '<button type="button" class="batch-id-trigger" data-job-id="' + escapeHtml(job.id) + '" title="View batch details">' + escapeHtml(batchId) + '</button>'
      : escapeHtml(batchId)
    tr.innerHTML =
      '<td>' + batchIdCell + '</td>' +
      '<td>' + escapeHtml(String(job.apexClassName)) + '</td>' +
      '<td>' + escapeHtml(String(job.jobType)) + '</td>' +
      '<td>' + escapeHtml(String(job.jobItemsProcessed)) + '</td>' +
      '<td><span class="status-badge ' + statusCls + '">' + escapeHtml(String(job.status)) + '</span></td>' +
      '<td>' + escapeHtml(String(job.totalJobItems)) + '</td>' +
      progressCell +
      '<td>' + formatDate(job.startedAt, useUtc) + '</td>' +
      '<td>' + formatDate(job.completedAt, useUtc) + '</td>'
    jobsTbody.appendChild(tr)
  }
  updateSortIndicators()
}

function updateSortIndicators () {
  const headers = jobsTable && jobsTable.querySelectorAll('th[data-sort]')
  if (!headers) return
  headers.forEach(th => {
    const key = th.getAttribute('data-sort')
    th.classList.remove('sort-asc', 'sort-desc')
    if (key === sortKey) {
      th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc')
    }
  })
}

var BATCH_DETAIL_LABELS = {
  id: 'Batch ID',
  apexClassName: 'Apex Class Name',
  apexClassId: 'Apex Class ID',
  jobType: 'Job Type',
  status: 'Status',
  jobItemsProcessed: 'Job Items Processed',
  totalJobItems: 'Total Job Items',
  startedAt: 'Started',
  completedAt: 'Completed',
  createdById: 'Created By ID',
  extendedStatus: 'Extended Status',
  methodName: 'Method Name',
  numberOfErrors: 'Number Of Errors',
  lastProcessed: 'Last Processed',
  lastProcessedOffset: 'Last Processed Offset',
  parentJobId: 'Parent Job ID'
}

var BATCH_DETAIL_ORDER = [
  'id', 'apexClassName', 'apexClassId', 'jobType', 'status', 'extendedStatus',
  'jobItemsProcessed', 'totalJobItems', 'numberOfErrors', 'lastProcessed', 'lastProcessedOffset',
  'methodName', 'startedAt', 'completedAt', 'createdById', 'parentJobId'
]

function formatBatchDetailValue (key, value, job) {
  if (value === undefined || value === null || value === '') return '—'
  if (key === 'status') return value
  if (key === 'startedAt' || key === 'completedAt') {
    const useUtc = !showLocalTzCheckbox || !showLocalTzCheckbox.checked
    return formatDate(value, useUtc)
  }
  if (key === 'id' || key === 'apexClassId' || key === 'createdById' || key === 'parentJobId') return String(value)
  return String(value)
}

function openBatchDetailModal (job) {
  if (!batchDetailOverlay || !batchDetailContent || !job) return
  const progress = getProgress(job)
  const statusCls = statusClass(job.status)
  const seen = new Set()
  const rows = []
  for (const key of BATCH_DETAIL_ORDER) {
    if (!(key in job)) continue
    seen.add(key)
    const label = BATCH_DETAIL_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
    const raw = job[key]
    let value = formatBatchDetailValue(key, raw, job)
    if (value === '—' && raw !== undefined && raw !== null && raw !== '') value = String(raw)
    rows.push({ key, label, value, isStatus: key === 'status' })
  }
  for (const key of Object.keys(job)) {
    if (seen.has(key)) continue
    const label = BATCH_DETAIL_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
    const raw = job[key]
    let value = formatBatchDetailValue(key, raw, job)
    if (value === '—' && raw !== undefined && raw !== null && raw !== '') value = String(raw)
    rows.push({ key, label, value, isStatus: key === 'status' })
  }
  const progressStr = progress != null ? progress + '%' : '—'
  const totalIdx = rows.findIndex((r) => r.key === 'totalJobItems')
  if (totalIdx >= 0) {
    rows.splice(totalIdx + 1, 0, { key: 'progress', label: 'Progress', value: progressStr, isStatus: false })
  } else {
    rows.push({ key: 'progress', label: 'Progress', value: progressStr, isStatus: false })
  }
  let html = '<ul class="batch-detail-list">'
  for (const row of rows) {
    const valueContent = row.isStatus && row.value !== '—'
      ? '<span class="status-badge ' + statusCls + '">' + escapeHtml(String(row.value)) + '</span>'
      : escapeHtml(String(row.value))
    html += '<li><span class="batch-detail-label">' + escapeHtml(row.label) + '</span><span class="batch-detail-value">' + valueContent + '</span></li>'
  }
  html += '</ul>'
  batchDetailContent.innerHTML = html
  batchDetailOverlay.classList.add('is-open')
  batchDetailOverlay.setAttribute('aria-hidden', 'false')
  currentBatchDetailJob = job
  if (modalCloseBtn) modalCloseBtn.focus()
}

function closeBatchDetailModal () {
  if (!batchDetailOverlay) return
  batchDetailOverlay.classList.remove('is-open')
  batchDetailOverlay.setAttribute('aria-hidden', 'true')
  currentBatchDetailJob = null
}

function clampInterval (value) {
  const n = parseInt(value, 10)
  if (isNaN(n) || n < MIN_INTERVAL) return MIN_INTERVAL
  return n
}

function getSelectedStatuses () {
  if (!statusCheckboxes) return []
  const selected = []
  statusCheckboxes.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
    if (cb.value) selected.push(cb.value)
  })
  return selected
}

function clampLimit (value) {
  const n = parseInt(value, 10)
  if (isNaN(n) || n < MIN_LIMIT) return MIN_LIMIT
  return Math.min(n, MAX_LIMIT)
}

function buildBatchJobsUrl (targetOrg) {
  const params = new URLSearchParams()
  params.set('targetOrg', targetOrg)
  const limit = clampLimit(limitInput ? limitInput.value : DEFAULT_LIMIT)
  params.set('limit', String(limit))
  const jobId = jobIdInput.value && jobIdInput.value.trim()
  if (jobId) params.set('jobId', jobId)
  const search = searchInput.value && searchInput.value.trim()
  if (search) params.set('search', search)
  const statuses = getSelectedStatuses()
  params.set('statuses', statuses.join(','))
  return '/api/batch-jobs?' + params.toString()
}

async function fetchOrgs () {
  const res = await fetch('/api/orgs')
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load orgs')
  return data.orgs || []
}

async function fetchBatchJobs (targetOrg) {
  const url = buildBatchJobsUrl(targetOrg)
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load batch jobs')
  lastInstanceUrl = data.instanceUrl || null
  return data.jobs || []
}

function stopPolling () {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function pollOnce (targetOrg) {
  if (requestInFlight) return
  requestInFlight = true
  if (refreshNowBtn) refreshNowBtn.disabled = true
  setStatus('Loading…', 'loading')
  try {
    const jobs = await fetchBatchJobs(targetOrg)
    renderJobs(jobs)
    lastRefreshedAt = new Date()
    const sec = clampInterval(intervalInput.value)
    const lastStr = lastRefreshedAt ? ' Last refreshed: ' + formatDateWithSeconds(lastRefreshedAt.toISOString()) : ''
    setStatus('Refresh every ' + sec + ' second(s).' + lastStr)
  } catch (err) {
    setStatus(err.message || 'Error loading batch jobs', 'error')
    renderJobs([])
  } finally {
    requestInFlight = false
    if (refreshNowBtn) refreshNowBtn.disabled = !(orgSelect.value && orgSelect.value.trim())
  }
}

function startPolling () {
  const targetOrg = orgSelect.value && orgSelect.value.trim()
  if (!targetOrg) {
    stopPolling()
    setStatus('Select an org')
    renderJobs([])
    return
  }
  stopPolling()
  const sec = clampInterval(intervalInput.value) * 1000
  pollOnce(targetOrg)
  pollTimer = setInterval(() => pollOnce(targetOrg), sec)
}

function onSort (e) {
  const th = e.target.closest('th[data-sort]')
  if (!th) return
  const key = th.getAttribute('data-sort')
  if (!key) return
  if (sortKey === key) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey = key
    sortDir = 'asc'
  }
  renderJobs(jobsCache)
}

function buildStatusCheckboxes () {
  if (!statusCheckboxes) return
  statusCheckboxes.innerHTML = ''
  for (const status of STATUS_OPTIONS) {
    const label = document.createElement('label')
    label.className = 'status-checkbox-label'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.value = status
    input.name = 'status'
    if (DEFAULT_STATUSES.indexOf(status) !== -1) input.checked = true
    label.appendChild(input)
    label.appendChild(document.createTextNode(' ' + status))
    statusCheckboxes.appendChild(label)
  }
  statusCheckboxes.addEventListener('change', (e) => {
    if (e.target && e.target.type === 'checkbox' && e.target.name === 'status') {
      startPolling()
    }
  })
}

async function init () {
  applyTheme(getTheme())
  updateThemeButton()
  themeToggle && themeToggle.addEventListener('click', toggleTheme)
  updateTimezoneDisplay()

  // While loading environments: disable all controls
  setOrgSelectEnabled(false)
  setSecondaryControlsEnabled(false)

  setStatus('Loading orgs…', 'loading')
  buildStatusCheckboxes()
  try {
    const orgs = await fetchOrgs()
    orgSelect.innerHTML = '<option value="">Select an org</option>'
    for (const org of orgs) {
      const opt = document.createElement('option')
      opt.value = org.alias || org.username
      opt.textContent = org.alias || org.username
      orgSelect.appendChild(opt)
    }
    setStatus('Select an org')
    // Environments loaded: enable only the environment dropdown
    setOrgSelectEnabled(true)
    setSecondaryControlsEnabled(false)
    orgSelect.addEventListener('change', () => {
      setSecondaryControlsEnabled(!!(orgSelect.value && orgSelect.value.trim()))
      startPolling()
    })
    refreshNowBtn && refreshNowBtn.addEventListener('click', () => pollOnce(orgSelect.value && orgSelect.value.trim()))
    intervalInput.addEventListener('change', () => {
      intervalInput.value = String(clampInterval(intervalInput.value))
      startPolling()
    })
    intervalInput.addEventListener('input', () => {
      const v = clampInterval(intervalInput.value)
      if (intervalInput.value !== '' && v < MIN_INTERVAL) {
        intervalInput.value = String(MIN_INTERVAL)
      }
    })
    jobIdInput.addEventListener('change', startPolling)
    searchInput.addEventListener('change', startPolling)
    searchInput.addEventListener('input', () => {
      clearTimeout(searchInput._searchTimer)
      searchInput._searchTimer = setTimeout(startPolling, 300)
    })
    jobsTable && jobsTable.querySelector('thead').addEventListener('click', onSort)
    jobsTbody && jobsTbody.addEventListener('click', (e) => {
      const trigger = e.target.closest('.batch-id-trigger')
      if (!trigger) return
      const jobId = trigger.getAttribute('data-job-id')
      if (!jobId) return
      const job = jobsCache.find((j) => j.id === jobId)
      if (job) openBatchDetailModal(job)
    })
    modalCloseBtn && modalCloseBtn.addEventListener('click', closeBatchDetailModal)
    batchDetailOverlay && batchDetailOverlay.addEventListener('click', (e) => {
      if (e.target === batchDetailOverlay) closeBatchDetailModal()
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && batchDetailOverlay && batchDetailOverlay.classList.contains('is-open')) {
        closeBatchDetailModal()
      }
    })
    showLocalTzCheckbox && showLocalTzCheckbox.addEventListener('change', () => {
      updateTimezoneDisplay()
      renderJobs(jobsCache)
      if (currentBatchDetailJob) openBatchDetailModal(currentBatchDetailJob)
    })
    limitInput && limitInput.addEventListener('change', () => {
      limitInput.value = String(clampLimit(limitInput.value))
      startPolling()
    })
    limitInput && limitInput.addEventListener('input', () => {
      const v = clampLimit(limitInput.value)
      if (limitInput.value !== '' && v < MIN_LIMIT) {
        limitInput.value = String(MIN_LIMIT)
      }
    })
  } catch (err) {
    setStatus(err.message || 'Failed to load orgs', 'error')
  }
}

init()
