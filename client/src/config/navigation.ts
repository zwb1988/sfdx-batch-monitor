import type { CategoryId, TabId } from '../types'

export interface NavTool {
  id: TabId
  label: string
}

export interface NavCategory {
  id: CategoryId
  label: string
  tools: NavTool[]
}

/**
 * Single source of truth for the sidebar: which categories exist, and which
 * tools live under each one. Add new categories/tools here only — the
 * sidebar renders itself from this list.
 */
export const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'monitoring',
    label: 'Monitoring',
    tools: [
      { id: 'batch-monitor', label: 'Batch monitor' },
      { id: 'batch-schedule', label: 'Batch schedule' },
      { id: 'batch-analysis', label: 'Batch analysis' },
      { id: 'org-limits', label: 'Org limits' },
      { id: 'org-objects', label: 'Org objects' }
    ]
  },
  {
    id: 'data-cloud',
    label: 'Data Cloud',
    tools: [
      { id: 'data-cloud-csv-ingest', label: 'CSV ingest' }
    ]
  }
]
