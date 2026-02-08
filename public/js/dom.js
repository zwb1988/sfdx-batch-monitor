/** DOM element references. Call initDOM() once after DOM is ready. */

const refs = {}

export function initDOM () {
  refs.orgSelect = document.getElementById('org-select')
  refs.intervalInput = document.getElementById('interval-input')
  refs.refreshNowBtn = document.getElementById('refresh-now-btn')
  refs.jobIdInput = document.getElementById('job-id-input')
  refs.searchInput = document.getElementById('search-input')
  refs.statusCheckboxes = document.getElementById('status-checkboxes')
  refs.statusFilters = document.getElementById('status-filters')
  refs.statusMessage = document.getElementById('status-message')
  refs.jobsTbody = document.getElementById('jobs-tbody')
  refs.jobsTable = document.querySelector('.jobs-table')
  refs.themeToggle = document.getElementById('theme-toggle')
  refs.showLocalTzCheckbox = document.getElementById('show-local-tz')
  refs.timezoneDisplay = document.getElementById('timezone-display')
  refs.limitInput = document.getElementById('limit-input')
  refs.batchDetailOverlay = document.getElementById('batch-detail-overlay')
  refs.batchDetailContent = document.getElementById('batch-detail-content')
  refs.modalCloseBtn = refs.batchDetailOverlay?.querySelector('.modal-close')
  return refs
}

export function getRefs () {
  return refs
}
