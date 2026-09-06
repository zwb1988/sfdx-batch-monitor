import { useEffect } from 'react'
import { fetchOrgLimitsForStore } from '../services/limitsFetch'
import { useAppStore } from '../stores/appStore'
import { clampInterval } from '../utils/filters'

/** Poll org limits while org-limits tab is active and an org is selected. */
export function useOrgLimitsPolling (): void {
  const selectedOrg = useAppStore((s) => s.selectedOrg)
  const activeTab = useAppStore((s) => s.activeTab)
  const activeCategory = useAppStore((s) => s.activeCategory)
  const intervalSeconds = useAppStore((s) => s.intervalSeconds)

  useEffect(() => {
    if (!selectedOrg || activeCategory !== 'monitoring' || activeTab !== 'org-limits') return

    const intervalMs = clampInterval(intervalSeconds) * 1000
    let cancelled = false
    let timerId: ReturnType<typeof setInterval> | null = null

    async function tick (): Promise<void> {
      if (cancelled) return
      await fetchOrgLimitsForStore(selectedOrg)
    }

    void tick()
    timerId = setInterval(() => { void tick() }, intervalMs)

    return () => {
      cancelled = true
      if (timerId != null) clearInterval(timerId)
    }
  }, [selectedOrg, activeCategory, activeTab, intervalSeconds])
}
