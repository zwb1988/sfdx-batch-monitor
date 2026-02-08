/** Polling: start, stop, poll once. */

import { clampInterval } from './filters.js'
import { formatDateWithSeconds } from './format.js'

export function stopPolling (state) {
  if (state.pollTimer) {
    clearInterval(state.pollTimer)
    state.pollTimer = null
  }
}

export async function pollOnce (targetOrg, state, refs, deps) {
  const { fetchBatchJobs, renderJobs, setStatus } = deps
  if (state.requestInFlight) return
  state.requestInFlight = true
  const refreshNowBtn = refs?.refreshNowBtn
  const orgSelect = refs?.orgSelect
  if (refreshNowBtn) refreshNowBtn.disabled = true
  setStatus('Loading…', 'loading', refs)
  try {
    const { jobs, instanceUrl } = await fetchBatchJobs(targetOrg, refs)
    state.lastInstanceUrl = instanceUrl
    renderJobs(jobs, state, refs)
    state.lastRefreshedAt = new Date()
    const sec = clampInterval(refs?.intervalInput?.value)
    const lastStr = state.lastRefreshedAt ? ' Last refreshed: ' + formatDateWithSeconds(state.lastRefreshedAt.toISOString()) : ''
    setStatus('Refresh every ' + sec + ' second(s).' + lastStr, null, refs)
  } catch (err) {
    setStatus(err.message || 'Error loading batch jobs', 'error', refs)
    renderJobs([], state, refs)
  } finally {
    state.requestInFlight = false
    if (refreshNowBtn) refreshNowBtn.disabled = !(orgSelect?.value?.trim())
  }
}

export function startPolling (state, refs, deps) {
  const { renderJobs, setStatus, clampInterval: clamp } = deps
  const targetOrg = refs?.orgSelect?.value?.trim()
  if (!targetOrg) {
    stopPolling(state)
    setStatus('Select an org', null, refs)
    renderJobs([], state, refs)
    return
  }
  stopPolling(state)
  const sec = clamp(refs?.intervalInput?.value) * 1000
  pollOnce(targetOrg, state, refs, deps)
  state.pollTimer = setInterval(() => pollOnce(targetOrg, state, refs, deps), sec)
}
