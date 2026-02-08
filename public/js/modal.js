/** Batch detail modal: open, close, format detail values. */

import { BATCH_DETAIL_LABELS, BATCH_DETAIL_ORDER } from './constants.js'
import { formatDate, escapeHtml } from './format.js'
import { statusClass, getProgress } from './jobUtils.js'

function formatBatchDetailValue (key, value, job, useUtc) {
  if (value === undefined || value === null || value === '') return '—'
  if (key === 'status') return value
  if (key === 'startedAt' || key === 'completedAt') {
    return formatDate(value, useUtc)
  }
  if (key === 'id' || key === 'apexClassId' || key === 'createdById' || key === 'parentJobId') return String(value)
  return String(value)
}

export function openBatchDetailModal (job, refs, state) {
  const overlay = refs?.batchDetailOverlay
  const content = refs?.batchDetailContent
  const showLocalTzCheckbox = refs?.showLocalTzCheckbox
  if (!overlay || !content || !job) return
  const progress = getProgress(job)
  const statusCls = statusClass(job.status)
  const useUtc = !showLocalTzCheckbox?.checked
  const seen = new Set()
  const rows = []
  for (const key of BATCH_DETAIL_ORDER) {
    if (!(key in job)) continue
    seen.add(key)
    const label = BATCH_DETAIL_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
    const raw = job[key]
    let value = formatBatchDetailValue(key, raw, job, useUtc)
    if (value === '—' && raw !== undefined && raw !== null && raw !== '') value = String(raw)
    rows.push({ key, label, value, isStatus: key === 'status' })
  }
  for (const key of Object.keys(job)) {
    if (seen.has(key)) continue
    const label = BATCH_DETAIL_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
    const raw = job[key]
    let value = formatBatchDetailValue(key, raw, job, useUtc)
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
  content.innerHTML = html
  overlay.classList.add('is-open')
  overlay.setAttribute('aria-hidden', 'false')
  state.currentBatchDetailJob = job
  const modalCloseBtn = refs?.modalCloseBtn
  if (modalCloseBtn) modalCloseBtn.focus()
}

export function closeBatchDetailModal (refs, state) {
  const overlay = refs?.batchDetailOverlay
  if (!overlay) return
  overlay.classList.remove('is-open')
  overlay.setAttribute('aria-hidden', 'true')
  state.currentBatchDetailJob = null
}
