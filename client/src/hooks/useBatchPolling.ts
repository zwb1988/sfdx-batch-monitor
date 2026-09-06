import { useEffect } from 'react'
import { fetchBatchJobsForStore } from '../services/batchFetch'
import { useAppStore } from '../stores/appStore'
import { clampInterval } from '../utils/filters'

/** Poll batch jobs while batch tab is active and an org is selected. */
export function useBatchPolling (): void {
  const selectedOrg = useAppStore((s) => s.selectedOrg)
  const activeTab = useAppStore((s) => s.activeTab)
  const activeCategory = useAppStore((s) => s.activeCategory)
  const intervalSeconds = useAppStore((s) => s.intervalSeconds)
  const jobIdFilter = useAppStore((s) => s.jobIdFilter)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const limit = useAppStore((s) => s.limit)
  const selectedStatuses = useAppStore((s) => s.selectedStatuses)

  const statusesKey = selectedStatuses.join(',')

  useEffect(() => {
    if (!selectedOrg || activeCategory !== 'monitoring' || activeTab !== 'batch-monitor') return

    const intervalMs = clampInterval(intervalSeconds) * 1000
    let cancelled = false
    let timerId: ReturnType<typeof setInterval> | null = null

    async function tick (): Promise<void> {
      if (cancelled) return
      await fetchBatchJobsForStore(selectedOrg)
    }

    void tick()
    timerId = setInterval(() => { void tick() }, intervalMs)

    return () => {
      cancelled = true
      if (timerId != null) clearInterval(timerId)
    }
  }, [selectedOrg, activeCategory, activeTab, intervalSeconds, jobIdFilter, searchQuery, limit, statusesKey])
}
