import { useEffect } from 'react'
import { fetchOrgObjectsForStore } from '../services/orgObjectsFetch'
import { useAppStore } from '../stores/appStore'

/** Load org objects once when the tab is opened (no interval polling). */
export function useOrgObjectsInitialLoad (): void {
  const selectedOrg = useAppStore((s) => s.selectedOrg)
  const activeTab = useAppStore((s) => s.activeTab)

  useEffect(() => {
    if (!selectedOrg || activeTab !== 'org-objects') return
    void fetchOrgObjectsForStore(selectedOrg)
  }, [selectedOrg, activeTab])
}
