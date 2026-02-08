/** Jobs table: render rows, sort indicators, sort handler. */

import { formatDate, escapeHtml } from './format.js'
import { statusClass, getProgress, compare } from './jobUtils.js'

function sortJobs (jobs, state) {
  const arr = (jobs || []).slice()
  arr.sort((a, b) => {
    const c = compare(a, b, state.sortKey, getProgress)
    return state.sortDir === 'asc' ? c : -c
  })
  return arr
}

export function renderJobs (jobs, state, refs) {
  state.jobsCache = jobs || []
  const sorted = sortJobs(state.jobsCache, state)
  const tbody = refs?.jobsTbody
  const showLocalTzCheckbox = refs?.showLocalTzCheckbox
  if (!tbody) return
  tbody.innerHTML = ''
  if (!sorted.length) {
    const tr = document.createElement('tr')
    tr.innerHTML = '<td colspan="9">No batch jobs</td>'
    tbody.appendChild(tr)
    return
  }
  const useUtc = !showLocalTzCheckbox?.checked
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
    tbody.appendChild(tr)
  }
  updateSortIndicators(state, refs)
}

export function updateSortIndicators (state, refs) {
  const jobsTable = refs?.jobsTable
  const headers = jobsTable?.querySelectorAll('th[data-sort]')
  if (!headers) return
  headers.forEach(th => {
    const key = th.getAttribute('data-sort')
    th.classList.remove('sort-asc', 'sort-desc')
    if (key === state.sortKey) {
      th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc')
    }
  })
}

export function onSort (e, state, refs, renderJobsFn) {
  const th = e.target.closest('th[data-sort]')
  if (!th) return
  const key = th.getAttribute('data-sort')
  if (!key) return
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'
  } else {
    state.sortKey = key
    state.sortDir = 'asc'
  }
  renderJobsFn(state.jobsCache, state, refs)
}
