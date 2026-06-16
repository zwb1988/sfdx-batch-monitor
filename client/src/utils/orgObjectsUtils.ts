import type { OrgObjectKind, OrgObjectRow } from '../types'
import type { OrgObjectsSortKey } from './constants'

export type OrgObjectKindFilter = 'all' | OrgObjectKind

const KIND_DISPLAY_ORDER: OrgObjectKind[] = [
  'standard',
  'custom',
  'custom-metadata',
  'platform-event',
  'external',
  'big-object'
]

export function orgObjectKindLabel (kind: OrgObjectKind): string {
  switch (kind) {
    case 'standard': return 'Standard'
    case 'custom': return 'Custom'
    case 'custom-metadata': return 'Custom metadata'
    case 'platform-event': return 'Platform event'
    case 'external': return 'External'
    case 'big-object': return 'Big object'
    default: return kind
  }
}

export function formatOrgObjectCount (count: number): string {
  return Number.isFinite(count) ? count.toLocaleString() : '—'
}

/** Sum of record counts across all loaded objects (denominator for share %). */
export function totalOrgObjectRecordCount (objects: OrgObjectRow[]): number {
  let total = 0
  for (const row of objects) {
    if (Number.isFinite(row.count) && row.count > 0) total += row.count
  }
  return total
}

/** Object count as 0–100% of total loaded record counts; null when total is 0. */
export function orgObjectSharePercent (count: number, totalRecords: number): number | null {
  if (!Number.isFinite(count) || count < 0 || totalRecords <= 0) return null
  return Math.min(100, (count / totalRecords) * 100)
}

export function formatOrgObjectSharePercent (pct: number): string {
  if (!Number.isFinite(pct)) return '—'
  if (pct > 0 && pct < 1) return pct.toFixed(1)
  return String(Math.round(pct))
}

/** Type filter options present in loaded org object rows (always includes "All types"). */
export function getAvailableOrgObjectKindFilters (
  objects: OrgObjectRow[]
): { value: OrgObjectKindFilter, label: string }[] {
  const kinds = new Set<OrgObjectKind>()
  for (const row of objects) kinds.add(row.kind)
  const options: { value: OrgObjectKindFilter, label: string }[] = [
    { value: 'all', label: 'All types' }
  ]
  for (const kind of KIND_DISPLAY_ORDER) {
    if (kinds.has(kind)) {
      options.push({ value: kind, label: orgObjectKindLabel(kind) })
    }
  }
  return options
}

export function resolveOrgObjectKindFilter (
  kindFilter: OrgObjectKindFilter,
  objects: OrgObjectRow[]
): OrgObjectKindFilter {
  if (kindFilter === 'all') return 'all'
  const available = getAvailableOrgObjectKindFilters(objects)
  return available.some((opt) => opt.value === kindFilter) ? kindFilter : 'all'
}

export function filterOrgObjects (
  objects: OrgObjectRow[],
  searchQuery: string,
  kindFilter: OrgObjectKindFilter
): OrgObjectRow[] {
  const q = searchQuery.trim().toLowerCase()
  return objects.filter((row) => {
    if (kindFilter !== 'all' && row.kind !== kindFilter) return false
    if (!q) return true
    return row.name.toLowerCase().includes(q) ||
      orgObjectKindLabel(row.kind).toLowerCase().includes(q) ||
      formatOrgObjectCount(row.count).replace(/,/g, '').includes(q.replace(/,/g, ''))
  })
}

export function sortOrgObjects (
  objects: OrgObjectRow[],
  sortKey: OrgObjectsSortKey,
  sortDir: 'asc' | 'desc'
): OrgObjectRow[] {
  const arr = objects.slice()
  arr.sort((a, b) => {
    let c = 0
    if (sortKey === 'count' || sortKey === 'share') {
      c = a.count - b.count
      if (c === 0) c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    } else if (sortKey === 'name') {
      c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    } else {
      c = orgObjectKindLabel(a.kind).localeCompare(orgObjectKindLabel(b.kind), undefined, { sensitivity: 'base' })
      if (c === 0) c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    }
    return sortDir === 'asc' ? c : -c
  })
  return arr
}

export function paginateOrgObjects<T> (items: T[], page: number, pageSize: number): T[] {
  if (pageSize < 1 || items.length === 0) return []
  const start = (page - 1) * pageSize
  if (start >= items.length) return []
  return items.slice(start, start + pageSize)
}

export function orgObjectsPageCount (totalItems: number, pageSize: number): number {
  if (totalItems <= 0 || pageSize < 1) return 1
  return Math.ceil(totalItems / pageSize)
}
