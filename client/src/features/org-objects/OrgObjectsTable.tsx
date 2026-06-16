import { useState, type JSX, type MouseEvent } from 'react'
import { fetchOrgObjectLiveCount } from '../../services/api'
import { useAppStore } from '../../stores/appStore'
import {
  isOrgObjectsSortKey,
  ORG_OBJECTS_PAGE_SIZE,
  ORG_OBJECTS_SORT_KEYS,
  type OrgObjectsSortKey
} from '../../utils/constants'
import { barLevelForPercent } from '../../utils/orgLimitsUtils'
import {
  filterOrgObjects,
  formatOrgObjectCount,
  formatOrgObjectSharePercent,
  orgObjectKindLabel,
  orgObjectSharePercent,
  orgObjectsPageCount,
  paginateOrgObjects,
  sortOrgObjects,
  totalOrgObjectRecordCount,
  type OrgObjectKindFilter
} from '../../utils/orgObjectsUtils'

const ORG_OBJECTS_HEADER_LABELS: Record<OrgObjectsSortKey, string> = {
  name: 'Object API name',
  kind: 'Type',
  count: 'Record count',
  share: '% of total records'
}

interface LiveCountEntry {
  count: number | null
  loading: boolean
  failed: boolean
}

function ShareBar ({ count, totalRecords }: { count: number, totalRecords: number }): JSX.Element {
  const pct = orgObjectSharePercent(count, totalRecords)
  if (pct == null) {
    return <span className="limit-bar-na">—</span>
  }
  const level = barLevelForPercent(pct)
  const label = formatOrgObjectSharePercent(pct) + '% of total records'
  return (
    <div className="limit-bar-cell">
      <div className="limit-bar-track" role="img" aria-label={label}>
        <div
          className={'limit-bar-fill limit-bar-fill--' + level}
          style={{ width: pct + '%' }}
        />
      </div>
      <span className="limit-bar-pct">{formatOrgObjectSharePercent(pct)}%</span>
    </div>
  )
}

function LiveCountCell ({
  objectName,
  entry,
  disabled,
  onLoad
}: {
  objectName: string
  entry: LiveCountEntry | undefined
  disabled: boolean
  onLoad: (objectName: string) => void
}): JSX.Element {
  const loading = entry?.loading === true
  const count = entry?.count
  const failed = entry?.failed === true
  const actionLabel = count != null ? 'Reload' : 'Load'

  return (
    <div className="live-count-cell">
      <span className="live-count-value" aria-live="polite">
        {count != null ? formatOrgObjectCount(count) : '—'}
      </span>
      <button
        type="button"
        className="live-count-load-btn refresh-btn btn-icon"
        disabled={disabled || loading}
        aria-label={`${actionLabel} live record count for ${objectName}`}
        title={`${actionLabel} live record count (SELECT COUNT())`}
        onClick={() => onLoad(objectName)}
      >
        {loading
          ? <span className="live-count-spinner" aria-hidden="true" />
          : '↻'}
      </button>
      {failed ? (
        <span className="live-count-error" role="alert">
          Unable to load
        </span>
      ) : null}
    </div>
  )
}

export function OrgObjectsTable ({
  searchQuery,
  kindFilter
}: {
  searchQuery: string
  kindFilter: OrgObjectKindFilter
}): JSX.Element {
  const selectedOrg = useAppStore((s) => s.selectedOrg)
  const orgObjects = useAppStore((s) => s.orgObjects)
  const sortKey = useAppStore((s) => s.orgObjectsSortKey)
  const sortDir = useAppStore((s) => s.orgObjectsSortDir)
  const toggleOrgObjectsSort = useAppStore((s) => s.toggleOrgObjectsSort)

  const [page, setPage] = useState(1)
  const [liveCounts, setLiveCounts] = useState<Record<string, LiveCountEntry>>({})

  const orgOk = !!selectedOrg.trim()
  const totalRecords = totalOrgObjectRecordCount(orgObjects)
  const filtered = filterOrgObjects(orgObjects, searchQuery, kindFilter)
  const sorted = sortOrgObjects(filtered, sortKey, sortDir)
  const totalPages = orgObjectsPageCount(sorted.length, ORG_OBJECTS_PAGE_SIZE)
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const pageRows = paginateOrgObjects(sorted, safePage, ORG_OBJECTS_PAGE_SIZE)
  const rangeStart = sorted.length === 0 ? 0 : (safePage - 1) * ORG_OBJECTS_PAGE_SIZE + 1
  const rangeEnd = sorted.length === 0 ? 0 : rangeStart + pageRows.length - 1

  function headerClass (key: OrgObjectsSortKey): string {
    let c = 'sortable'
    if (key === sortKey) {
      c += sortDir === 'asc' ? ' sort-asc' : ' sort-desc'
    }
    return c
  }

  function onHeadClick (e: MouseEvent<HTMLTableSectionElement>): void {
    const th = (e.target as HTMLElement).closest('th[data-sort]')
    if (!th) return
    const key = th.getAttribute('data-sort')
    if (key != null && isOrgObjectsSortKey(key)) toggleOrgObjectsSort(key)
  }

  async function onLoadLiveCount (objectName: string): Promise<void> {
    const org = selectedOrg.trim()
    if (!org) return

    setLiveCounts((prev) => ({
      ...prev,
      [objectName]: {
        count: prev[objectName]?.count ?? null,
        loading: true,
        failed: false
      }
    }))

    try {
      const count = await fetchOrgObjectLiveCount(org, objectName)
      setLiveCounts((prev) => ({
        ...prev,
        [objectName]: { count, loading: false, failed: false }
      }))
    } catch {
      setLiveCounts((prev) => ({
        ...prev,
        [objectName]: {
          count: prev[objectName]?.count ?? null,
          loading: false,
          failed: true
        }
      }))
    }
  }

  return (
    <div className="table-wrapper">
      <p className="table-row-count" aria-live="polite">
        {sorted.length === 0
          ? 'Showing 0 rows'
          : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${sorted.length.toLocaleString()} rows`}
      </p>
      <table id="org-objects-table" className="jobs-table" aria-label="Org objects">
        <thead onClick={onHeadClick}>
          <tr>
            {ORG_OBJECTS_SORT_KEYS.flatMap((key) => {
              const cells: JSX.Element[] = []
              if (key === 'share') {
                cells.push(
                  <th key="live-count" scope="col" className="org-objects-live-count-header">
                    Live record count
                  </th>
                )
              }
              cells.push(
                <th key={key} data-sort={key} className={headerClass(key)}>
                  {ORG_OBJECTS_HEADER_LABELS[key]}
                </th>
              )
              return cells
            })}
          </tr>
        </thead>
        <tbody>
          {pageRows.length === 0 ? (
            <tr>
              <td colSpan={5}>
                {orgObjects.length === 0 ? 'No objects loaded' : 'No objects match your filters'}
              </td>
            </tr>
          ) : (
            pageRows.map((row) => (
              <tr key={row.name}>
                <td className="org-objects-col-name">{row.name}</td>
                <td>{orgObjectKindLabel(row.kind)}</td>
                <td className="org-objects-col-count">{formatOrgObjectCount(row.count)}</td>
                <td className="org-objects-col-live-count">
                  <LiveCountCell
                    objectName={row.name}
                    entry={liveCounts[row.name]}
                    disabled={!orgOk}
                    onLoad={(name) => { void onLoadLiveCount(name) }}
                  />
                </td>
                <td className="org-objects-col-share">
                  <ShareBar count={row.count} totalRecords={totalRecords} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {sorted.length > ORG_OBJECTS_PAGE_SIZE && (
        <nav className="pagination-bar" aria-label="Org objects pagination">
          <button
            type="button"
            className="pagination-btn"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </button>
          <span className="pagination-status">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            className="pagination-btn"
            disabled={safePage >= totalPages}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}
