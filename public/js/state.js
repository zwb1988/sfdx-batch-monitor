/** Shared application state. */

export const state = {
  pollTimer: null,
  requestInFlight: false,
  lastRefreshedAt: null,
  jobsCache: [],
  lastInstanceUrl: null,
  currentBatchDetailJob: null,
  sortKey: 'startedAt',
  sortDir: 'desc'
}
