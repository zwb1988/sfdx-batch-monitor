/** Filter and query params: interval, limit, statuses, build API URL. */

import { MIN_INTERVAL, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT } from './constants.js'

export function clampInterval (value) {
  const n = parseInt(value, 10)
  if (isNaN(n) || n < MIN_INTERVAL) return MIN_INTERVAL
  return n
}

export function clampLimit (value) {
  const n = parseInt(value, 10)
  if (isNaN(n) || n < MIN_LIMIT) return MIN_LIMIT
  return Math.min(n, MAX_LIMIT)
}

export function getSelectedStatuses (refs) {
  const statusCheckboxes = refs?.statusCheckboxes
  if (!statusCheckboxes) return []
  const selected = []
  statusCheckboxes.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
    if (cb.value) selected.push(cb.value)
  })
  return selected
}

export function buildBatchJobsUrl (targetOrg, refs) {
  const params = new URLSearchParams()
  params.set('targetOrg', targetOrg)
  const limit = clampLimit(refs?.limitInput?.value ?? DEFAULT_LIMIT)
  params.set('limit', String(limit))
  const jobId = refs?.jobIdInput?.value?.trim()
  if (jobId) params.set('jobId', jobId)
  const search = refs?.searchInput?.value?.trim()
  if (search) params.set('search', search)
  const statuses = getSelectedStatuses(refs)
  params.set('statuses', statuses.join(','))
  return '/api/batch-jobs?' + params.toString()
}
