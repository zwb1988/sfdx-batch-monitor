import { useCallback, useEffect } from 'react'
import { fetchScheduledJobs } from '../services/api'
import { useAppStore } from '../stores/appStore'
import { getErrorMessage } from '../utils/errorUtils'

export function useScheduledJobs (): { refreshScheduledJobs: () => Promise<void> } {
  const activeTab = useAppStore((s) => s.activeTab)
  const activeCategory = useAppStore((s) => s.activeCategory)
  const selectedOrg = useAppStore((s) => s.selectedOrg)

  const load = useCallback(async () => {
    const st = useAppStore.getState()
    const org = st.selectedOrg.trim()
    if (!org || st.activeCategory !== 'monitoring' || st.activeTab !== 'batch-schedule' || st.scheduleRequestInFlight) return
    st.setScheduleRequestInFlight(true)
    st.setStatus('Loading scheduled jobs…', 'loading')
    try {
      const { scheduledJobs } = await fetchScheduledJobs(org)
      const next = useAppStore.getState()
      next.setScheduledJobs(scheduledJobs)
      const n = scheduledJobs.length
      next.setStatus('Loaded ' + n + ' scheduled job' + (n === 1 ? '' : 's') + '.', null)
    } catch (e: unknown) {
      const next = useAppStore.getState()
      next.setStatus(getErrorMessage(e) || 'Error loading scheduled jobs', 'error')
      next.setScheduledJobs([])
    } finally {
      useAppStore.getState().setScheduleRequestInFlight(false)
    }
  }, [])

  useEffect(() => {
    if (activeCategory !== 'monitoring' || activeTab !== 'batch-schedule' || !selectedOrg.trim()) return
    void load()
  }, [activeCategory, activeTab, selectedOrg, load])

  return { refreshScheduledJobs: load }
}
