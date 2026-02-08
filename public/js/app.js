/**
 * Main entry: init DOM refs, theme, API, table, modal, polling; bind events.
 */

import { initDOM } from './dom.js'
import { state } from './state.js'
import { MIN_INTERVAL, MIN_LIMIT } from './constants.js'
import { getTheme, applyTheme, updateThemeButton, toggleTheme } from './theme.js'
import { setStatus, setSecondaryControlsEnabled, setOrgSelectEnabled, updateTimezoneDisplay } from './ui.js'
import { clampInterval, clampLimit } from './filters.js'
import { fetchOrgs, fetchBatchJobs } from './api.js'
import { renderJobs, onSort } from './table.js'
import { openBatchDetailModal, closeBatchDetailModal } from './modal.js'
import { stopPolling, pollOnce, startPolling } from './polling.js'
import { buildStatusCheckboxes } from './statusCheckboxes.js'

function init () {
  const refs = initDOM()
  applyTheme(getTheme())
  updateThemeButton(refs.themeToggle)
  if (refs.themeToggle) refs.themeToggle.addEventListener('click', () => toggleTheme(refs.themeToggle))
  updateTimezoneDisplay(refs)

  setOrgSelectEnabled(false, refs)
  setSecondaryControlsEnabled(false, refs)
  setStatus('Loading orgs…', 'loading', refs)

  const deps = {
    fetchBatchJobs,
    renderJobs,
    setStatus,
    clampInterval
  }

  buildStatusCheckboxes(refs, () => startPolling(state, refs, deps))

  fetchOrgs()
    .then(orgs => {
      refs.orgSelect.innerHTML = '<option value="">Select an org</option>'
      for (const org of orgs) {
        const opt = document.createElement('option')
        opt.value = org.alias || org.username
        opt.textContent = org.alias || org.username
        refs.orgSelect.appendChild(opt)
      }
      setStatus('Select an org', null, refs)
      setOrgSelectEnabled(true, refs)
      setSecondaryControlsEnabled(false, refs)

      refs.orgSelect.addEventListener('change', () => {
        setSecondaryControlsEnabled(!!(refs.orgSelect.value?.trim()), refs)
        startPolling(state, refs, deps)
      })

      if (refs.refreshNowBtn) {
        refs.refreshNowBtn.addEventListener('click', () => {
          const org = refs.orgSelect?.value?.trim()
          if (org) pollOnce(org, state, refs, deps)
        })
      }

      refs.intervalInput.addEventListener('change', () => {
        refs.intervalInput.value = String(clampInterval(refs.intervalInput.value))
        startPolling(state, refs, deps)
      })
      refs.intervalInput.addEventListener('input', () => {
        const v = clampInterval(refs.intervalInput.value)
        if (refs.intervalInput.value !== '' && v < MIN_INTERVAL) {
          refs.intervalInput.value = String(MIN_INTERVAL)
        }
      })

      refs.jobIdInput.addEventListener('change', () => startPolling(state, refs, deps))
      refs.searchInput.addEventListener('change', () => startPolling(state, refs, deps))
      refs.searchInput.addEventListener('input', () => {
        clearTimeout(refs.searchInput._searchTimer)
        refs.searchInput._searchTimer = setTimeout(() => startPolling(state, refs, deps), 300)
      })

      refs.jobsTable?.querySelector('thead')?.addEventListener('click', (e) => {
        onSort(e, state, refs, renderJobs)
      })

      refs.jobsTbody?.addEventListener('click', (e) => {
        const trigger = e.target.closest('.batch-id-trigger')
        if (!trigger) return
        const jobId = trigger.getAttribute('data-job-id')
        if (!jobId) return
        const job = state.jobsCache.find((j) => j.id === jobId)
        if (job) openBatchDetailModal(job, refs, state)
      })

      if (refs.modalCloseBtn) refs.modalCloseBtn.addEventListener('click', () => closeBatchDetailModal(refs, state))
      refs.batchDetailOverlay?.addEventListener('click', (e) => {
        if (e.target === refs.batchDetailOverlay) closeBatchDetailModal(refs, state)
      })
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && refs.batchDetailOverlay?.classList.contains('is-open')) {
          closeBatchDetailModal(refs, state)
        }
      })

      refs.showLocalTzCheckbox?.addEventListener('change', () => {
        updateTimezoneDisplay(refs)
        renderJobs(state.jobsCache, state, refs)
        if (state.currentBatchDetailJob) openBatchDetailModal(state.currentBatchDetailJob, refs, state)
      })

      if (refs.limitInput) {
        refs.limitInput.addEventListener('change', () => {
          refs.limitInput.value = String(clampLimit(refs.limitInput.value))
          startPolling(state, refs, deps)
        })
        refs.limitInput.addEventListener('input', () => {
          const v = clampLimit(refs.limitInput.value)
          if (refs.limitInput.value !== '' && v < MIN_LIMIT) {
            refs.limitInput.value = String(MIN_LIMIT)
          }
        })
      }
    })
    .catch(err => {
      setStatus(err.message || 'Failed to load orgs', 'error', refs)
    })
}

init()
