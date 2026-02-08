/** UI helpers: status message, enable/disable controls, timezone display. */

import { getTimezoneOffsetString } from './format.js'

export function setStatus (text, type, refs) {
  const el = refs?.statusMessage
  if (!el) return
  el.textContent = text
  el.className = 'status-message' + (type ? ' ' + type : '')
}

export function setSecondaryControlsEnabled (enabled, refs) {
  const r = refs || {}
  if (r.intervalInput) r.intervalInput.disabled = !enabled
  if (r.refreshNowBtn) r.refreshNowBtn.disabled = !enabled
  if (r.jobIdInput) r.jobIdInput.disabled = !enabled
  if (r.searchInput) r.searchInput.disabled = !enabled
  if (r.statusFilters) r.statusFilters.disabled = !enabled
  if (r.showLocalTzCheckbox) r.showLocalTzCheckbox.disabled = !enabled
  if (r.limitInput) r.limitInput.disabled = !enabled
  if (r.themeToggle) r.themeToggle.disabled = !enabled
}

export function setOrgSelectEnabled (enabled, refs) {
  if (refs?.orgSelect) refs.orgSelect.disabled = !enabled
}

export function updateTimezoneDisplay (refs) {
  const timezoneDisplay = refs?.timezoneDisplay
  const showLocalTzCheckbox = refs?.showLocalTzCheckbox
  if (!timezoneDisplay) return
  const useUtc = !showLocalTzCheckbox?.checked
  timezoneDisplay.textContent = useUtc ? 'UTC' : getTimezoneOffsetString()
}
