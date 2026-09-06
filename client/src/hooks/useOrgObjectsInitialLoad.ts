import { useEffect } from 'react'
import { fetchOrgObjectsForStore } from '../services/orgObjectsFetch'
import { useAppStore } from '../stores/appStore'

/** Load org objects once when the tab is opened (no interval polling). */
export function useOrgObjectsInitialLoad (): void {
  const selectedOrg = useAppStore((s) => s.selectedOrg)
  const activeTab = useAppStore((s) => s.activeTab)
  const activeCategory = useAppStore((s) => s.activeCategory)

  useEffect(() => {
    if (!selectedOrg || activeCategory !== 'monitoring' || activeTab !== 'org-objects') return
    void fetchOrgObjectsForStore(selectedOrg)
  }, [selectedOrg, activeCategory, activeTab])
}
