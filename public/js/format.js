/** Formatting and display utilities. */

export function formatDate (isoString, useUtc) {
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

export function formatDateWithSeconds (isoString) {
  if (!isoString) return '—'
  try {
    const d = new Date(isoString)
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
  } catch (_) {
    return isoString
  }
}

export function escapeHtml (str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

export function getTimezoneOffsetString () {
  const min = -new Date().getTimezoneOffset()
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  const sign = min >= 0 ? '+' : '-'
  if (m === 0) return 'UTC' + sign + h
  return 'UTC' + sign + h + ':' + String(m).padStart(2, '0')
}
