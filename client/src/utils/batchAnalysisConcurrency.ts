/** Overlap / concurrency analysis for batch job execution intervals. */

import type { BatchJobExecution } from '../types'
import { bucketStartTime, type ChartTimeZone } from './batchAnalysisBuckets'

export const SF_BATCH_CONCURRENCY_LIMIT = 5

const DEFAULT_BUCKET_MINUTES = 1
const MIN_BAR_MS = 1000

function parseDateKey (dateKey: string): { y: number; m: number; d: number } | null {
  const parts = dateKey.split('-')
  if (parts.length !== 3) return null
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const d = parseInt(parts[2], 10)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return { y, m: m - 1, d }
}

/** Inclusive start, exclusive end of calendar day in local or UTC. */
export function getDayBoundsMs (dateKey: string, zone: ChartTimeZone): { dayStart: number; dayEnd: number } | null {
  const p = parseDateKey(dateKey)
  if (!p) return null
  if (zone === 'utc') {
    const dayStart = Date.UTC(p.y, p.m, p.d, 0, 0, 0, 0)
    const dayEnd = Date.UTC(p.y, p.m, p.d + 1, 0, 0, 0, 0)
    return { dayStart, dayEnd }
  }
  const dayStart = new Date(p.y, p.m, p.d, 0, 0, 0, 0).getTime()
  const dayEnd = new Date(p.y, p.m, p.d + 1, 0, 0, 0, 0).getTime()
  return { dayStart, dayEnd }
}

export interface ClippedExecution {
  id: string | null
  startedAt: string
  completedAt: string
  startMs: number
  endMs: number
  apexClassName: string
  status: string
}

export function clipExecutionToDay (
  job: BatchJobExecution,
  dateKey: string,
  zone: ChartTimeZone
): ClippedExecution | null {
  const bounds = getDayBoundsMs(dateKey, zone)
  if (!bounds) return null
  const rawStart = Date.parse(job.startedAt)
  const rawEnd = Date.parse(job.completedAt)
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return null
  if (rawStart >= bounds.dayEnd || rawEnd <= bounds.dayStart) return null
  const startMs = Math.max(rawStart, bounds.dayStart)
  let endMs = Math.min(rawEnd, bounds.dayEnd)
  if (endMs <= startMs) endMs = startMs + MIN_BAR_MS
  return {
    id: job.id,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    startMs,
    endMs,
    apexClassName: job.apexClassName,
    status: job.status
  }
}

/** Job active during [startMs, endMs) — half-open interval. */
function jobActiveAt (job: ClippedExecution, tMs: number): boolean {
  return tMs >= job.startMs && tMs < job.endMs
}

function intervalsOverlap (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart
}

export interface ConcurrencySeries {
  timestamps: number[]
  counts: number[]
  peak: number
  minutesAtLimit: number
  dayStart: number
  dayEnd: number
}

function countActiveAt (jobs: ClippedExecution[], tMs: number): number {
  let count = 0
  for (const job of jobs) {
    if (jobActiveAt(job, tMs)) count++
  }
  return count
}

export function buildConcurrencySeriesForDay (
  executions: BatchJobExecution[],
  zone: ChartTimeZone,
  dateKey: string,
  bucketMinutes = DEFAULT_BUCKET_MINUTES
): ConcurrencySeries {
  const bounds = getDayBoundsMs(dateKey, zone)
  const empty: ConcurrencySeries = {
    timestamps: [],
    counts: [],
    peak: 0,
    minutesAtLimit: 0,
    dayStart: bounds?.dayStart ?? 0,
    dayEnd: bounds?.dayEnd ?? 0
  }
  if (!bounds) return empty

  const clipped = executions
    .map((j) => clipExecutionToDay(j, dateKey, zone))
    .filter((j): j is ClippedExecution => j != null)

  if (clipped.length === 0) return empty

  const bucketMs = bucketMinutes * 60 * 1000
  const timestamps: number[] = []
  const counts: number[] = []
  let peak = 0
  let minutesAtLimit = 0

  for (let t = bounds.dayStart; t < bounds.dayEnd; t += bucketMs) {
    const bucketEnd = Math.min(t + bucketMs, bounds.dayEnd)
    const sampleMs = t + bucketMs / 2
    let count = countActiveAt(clipped, sampleMs)
    if (count === 0) {
      for (const job of clipped) {
        if (intervalsOverlap(job.startMs, job.endMs, t, bucketEnd)) count++
      }
    }
    timestamps.push(sampleMs)
    counts.push(count)
    if (count > peak) peak = count
    if (count >= SF_BATCH_CONCURRENCY_LIMIT) {
      minutesAtLimit += (bucketEnd - t) / 60000
    }
  }

  return { timestamps, counts, peak, minutesAtLimit, dayStart: bounds.dayStart, dayEnd: bounds.dayEnd }
}

function enumerateDateKeysBetween (startKey: string, endKey: string, zone: ChartTimeZone): string[] {
  const p0 = parseDateKey(startKey)
  const p1 = parseDateKey(endKey)
  if (!p0 || !p1) return []
  const keys: string[] = []
  let y = p0.y
  let m = p0.m
  let d = p0.d
  while (true) {
    keys.push(y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'))
    if (y === p1.y && m === p1.m && d === p1.d) break
    if (zone === 'utc') {
      const next = new Date(Date.UTC(y, m, d + 1))
      y = next.getUTCFullYear()
      m = next.getUTCMonth()
      d = next.getUTCDate()
    } else {
      const next = new Date(y, m, d + 1)
      y = next.getFullYear()
      m = next.getMonth()
      d = next.getDate()
    }
  }
  return keys
}

/** Calendar days where at least one job execution overlaps. */
export function buildExecutionDays (
  executions: BatchJobExecution[],
  zone: ChartTimeZone
): string[] {
  const daySet = new Set<string>()
  for (const job of executions) {
    const startB = bucketStartTime(job.startedAt, zone)
    const endB = bucketStartTime(job.completedAt, zone)
    if (!startB || !endB) continue
    for (const dateKey of enumerateDateKeysBetween(startB.dateKey, endB.dateKey, zone)) {
      if (clipExecutionToDay(job, dateKey, zone) != null) daySet.add(dateKey)
    }
  }
  return [...daySet].sort((a, b) => a.localeCompare(b))
}

export function countExecutionsOverlappingDay (
  executions: BatchJobExecution[],
  zone: ChartTimeZone,
  dateKey: string
): number {
  return executions.filter((j) => clipExecutionToDay(j, dateKey, zone) != null).length
}

/** Apex batch class names with at least one execution overlapping the given day. */
export function listBatchClassesForDay (
  executions: BatchJobExecution[],
  zone: ChartTimeZone,
  dateKey: string
): string[] {
  const names = new Set<string>()
  for (const job of executions) {
    if (clipExecutionToDay(job, dateKey, zone) != null) {
      names.add(job.apexClassName != null ? String(job.apexClassName) : '—')
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

export function filterExecutionsByClass (
  executions: BatchJobExecution[],
  selectedClasses: ReadonlySet<string>
): BatchJobExecution[] {
  if (selectedClasses.size === 0) return executions
  return executions.filter((j) => selectedClasses.has(j.apexClassName != null ? String(j.apexClassName) : '—'))
}

export interface ActiveJobAtTime {
  apexClassName: string
  count: number
}

export function activeJobsAtTime (
  executions: BatchJobExecution[],
  zone: ChartTimeZone,
  dateKey: string,
  tMs: number,
  topN = 10
): ActiveJobAtTime[] {
  const clipped = executions
    .map((j) => clipExecutionToDay(j, dateKey, zone))
    .filter((j): j is ClippedExecution => j != null)

  const m = new Map<string, number>()
  for (const job of clipped) {
    if (jobActiveAt(job, tMs)) {
      const name = job.apexClassName != null ? String(job.apexClassName) : '—'
      m.set(name, (m.get(name) ?? 0) + 1)
    }
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([apexClassName, count]) => ({ apexClassName, count }))
}

export interface GanttSegment {
  laneIndex: number
  /** Y-axis category label (matches gantt.lanes entry). */
  laneLabel: string
  apexClassName: string
  id: string | null
  startMs: number
  endMs: number
  status: string
  startedAt: string
  completedAt: string
}

export interface GanttRowsResult {
  /** Y-axis lane labels (one per Apex class). */
  lanes: string[]
  /** Execution bars; multiple segments may share a lane (same batch class). */
  segments: GanttSegment[]
  totalExecutions: number
  dayStart: number
  dayEnd: number
}

function laneLabel (apexClassName: string, count: number): string {
  const cls = apexClassName != null ? String(apexClassName) : '—'
  if (count <= 1) return cls
  return cls + ' (' + count + ' runs)'
}

function barColorForStatus (status: string, colors: { accent: string; error: string; warning: string }): string {
  if (status === 'Failed') return colors.error
  if (status === 'Aborted') return colors.warning
  return colors.accent
}

export function buildGanttRowsForDay (
  executions: BatchJobExecution[],
  zone: ChartTimeZone,
  dateKey: string
): GanttRowsResult {
  const bounds = getDayBoundsMs(dateKey, zone)
  const empty: GanttRowsResult = {
    lanes: [],
    segments: [],
    totalExecutions: 0,
    dayStart: 0,
    dayEnd: 0
  }
  if (!bounds) return empty

  const clipped = executions
    .map((j) => clipExecutionToDay(j, dateKey, zone))
    .filter((j): j is ClippedExecution => j != null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)

  const totalExecutions = clipped.length
  if (totalExecutions === 0) {
    return { ...empty, dayStart: bounds.dayStart, dayEnd: bounds.dayEnd }
  }

  const byClass = new Map<string, ClippedExecution[]>()
  for (const job of clipped) {
    const name = job.apexClassName != null ? String(job.apexClassName) : '—'
    if (!byClass.has(name)) byClass.set(name, [])
    byClass.get(name)!.push(job)
  }

  const classNames = [...byClass.entries()]
    .sort((a, b) => {
      const aMin = Math.min(...a[1].map((j) => j.startMs))
      const bMin = Math.min(...b[1].map((j) => j.startMs))
      return aMin - bMin || a[0].localeCompare(b[0])
    })
    .map(([name]) => name)

  const laneIndex = new Map<string, number>()
  classNames.forEach((name, i) => laneIndex.set(name, i))

  const lanes = classNames.map((name) => laneLabel(name, byClass.get(name)!.length))

  const segments: GanttSegment[] = clipped.map((job) => {
    const name = job.apexClassName != null ? String(job.apexClassName) : '—'
    const idx = laneIndex.get(name) ?? 0
    return {
      laneIndex: idx,
      laneLabel: lanes[idx],
      apexClassName: name,
      id: job.id,
      startMs: job.startMs,
      endMs: job.endMs,
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt
    }
  })

  return {
    lanes,
    segments,
    totalExecutions,
    dayStart: bounds.dayStart,
    dayEnd: bounds.dayEnd
  }
}

export { barColorForStatus }
