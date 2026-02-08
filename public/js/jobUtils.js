/** Batch job helpers: status class, progress, comparison for sorting. */

export function statusClass (status) {
  if (!status) return ''
  const s = (status + '').toLowerCase()
  if (s === 'completed') return 'completed'
  if (s === 'processing' || s === 'preparing' || s === 'queued') return 'processing'
  if (s === 'failed' || s === 'aborted') return 'failed'
  if (s === 'holding') return 'holding'
  return ''
}

export function getProgress (job) {
  const p = Number(job.jobItemsProcessed)
  const t = Number(job.totalJobItems)
  if (t === 0) return 100
  if (Number.isFinite(p) && Number.isFinite(t) && t > 0) {
    return Math.min(100, Math.round((p / t) * 100))
  }
  if (String(job.status || '').trim() === 'Completed') return 100
  return null
}

export function compare (a, b, key, getProgressFn) {
  if (key === 'progress') {
    const va = getProgressFn(a)
    const vb = getProgressFn(b)
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
