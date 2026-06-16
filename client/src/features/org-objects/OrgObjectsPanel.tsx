import { useMemo, useState, type JSX } from 'react'
import { fetchOrgObjectsForStore } from '../../services/orgObjectsFetch'
import { useAppStore } from '../../stores/appStore'
import type { OrgObjectKindFilter } from '../../utils/orgObjectsUtils'
import {
  getAvailableOrgObjectKindFilters,
  resolveOrgObjectKindFilter
} from '../../utils/orgObjectsUtils'
import { OrgObjectsTable } from './OrgObjectsTable'

const RECORD_COUNT_DISCLAIMER =
  'The returned record count is a cached snapshot in time that may not be present. ' +
  'The record count value is updated automatically at variable time intervals.'

function isOrgObjectKindFilter (value: string, options: { value: OrgObjectKindFilter }[]): value is OrgObjectKindFilter {
  return options.some((opt) => opt.value === value)
}

export function OrgObjectsPanel (): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<OrgObjectKindFilter>('all')

  const selectedOrg = useAppStore((s) => s.selectedOrg)
  const activeTab = useAppStore((s) => s.activeTab)
  const objectsRequestInFlight = useAppStore((s) => s.objectsRequestInFlight)
  const orgObjects = useAppStore((s) => s.orgObjects)
  const sortKey = useAppStore((s) => s.orgObjectsSortKey)
  const sortDir = useAppStore((s) => s.orgObjectsSortDir)

  const kindFilterOptions = useMemo(
    () => getAvailableOrgObjectKindFilters(orgObjects),
    [orgObjects]
  )
  const activeKindFilter = resolveOrgObjectKindFilter(kindFilter, orgObjects)

  const tableKey = [
    selectedOrg,
    orgObjects.length,
    orgObjects[0]?.name ?? '',
    sortKey,
    sortDir,
    searchQuery,
    activeKindFilter
  ].join('|')

  const orgOk = !!selectedOrg.trim()
  const onObjectsTab = activeTab === 'org-objects'
  const refreshDisabled = !orgOk || !onObjectsTab || objectsRequestInFlight
  const typeFilterDisabled = !orgOk || orgObjects.length === 0

  function onRefreshNow (): void {
    const org = selectedOrg.trim()
    if (org && onObjectsTab) void fetchOrgObjectsForStore(org)
  }

  function onKindFilterChange (value: string): void {
    if (isOrgObjectKindFilter(value, kindFilterOptions)) setKindFilter(value)
  }

  return (
    <section
      id="tab-panel-org-objects"
      className="tab-panel"
      role="tabpanel"
      aria-labelledby="tab-org-objects"
      hidden={!onObjectsTab}
    >
      <p className="org-objects-disclaimer" role="note">
        {RECORD_COUNT_DISCLAIMER}
      </p>

      <section className="controls controls-row">
        <div className="control-group">
          <label htmlFor="objects-name-search">Search by object name</label>
          <input
            type="search"
            id="objects-name-search"
            placeholder="e.g. Account"
            aria-label="Search org objects by API name"
            disabled={!orgOk}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="control-group">
          <label htmlFor="objects-kind-filter">Object type</label>
          <select
            id="objects-kind-filter"
            aria-label="Filter org objects by type"
            disabled={typeFilterDisabled}
            value={activeKindFilter}
            onChange={(e) => onKindFilterChange(e.target.value)}
          >
            {kindFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="table-section">
        <div className="table-toolbar timezone-option">
          <div className="timezone-option-left" aria-hidden="true" />
          <div className="table-header-actions">
            <button
              type="button"
              id="org-objects-refresh-btn"
              className="refresh-btn btn-icon"
              aria-label="Refresh org objects"
              disabled={refreshDisabled}
              title="Refresh org objects"
              onClick={onRefreshNow}
            >
              ↻
            </button>
          </div>
        </div>
        <OrgObjectsTable
          key={tableKey}
          searchQuery={searchQuery}
          kindFilter={activeKindFilter}
        />
      </section>
    </section>
  )
}
