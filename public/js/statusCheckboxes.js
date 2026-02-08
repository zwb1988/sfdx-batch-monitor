/** Status filter checkboxes: build UI and wire change to startPolling. */

import { STATUS_OPTIONS, DEFAULT_STATUSES } from './constants.js'

export function buildStatusCheckboxes (refs, onStatusChange) {
  const statusCheckboxes = refs?.statusCheckboxes
  if (!statusCheckboxes) return
  statusCheckboxes.innerHTML = ''
  for (const status of STATUS_OPTIONS) {
    const label = document.createElement('label')
    label.className = 'status-checkbox-label'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.value = status
    input.name = 'status'
    if (DEFAULT_STATUSES.includes(status)) input.checked = true
    label.appendChild(input)
    label.appendChild(document.createTextNode(' ' + status))
    statusCheckboxes.appendChild(label)
  }
  statusCheckboxes.addEventListener('change', (e) => {
    if (e.target?.type === 'checkbox' && e.target.name === 'status' && onStatusChange) {
      onStatusChange()
    }
  })
}
