/** Loose API row shapes (SOQL / CLI). */

export type JobRecord = Record<string, unknown>

export interface Org {
  alias?: string
  username?: string
}

export type TabId = 'batch-monitor' | 'batch-schedule' | 'org-limits' | 'org-objects' | 'batch-analysis'

export type OrgObjectKind =
  | 'standard'
  | 'custom'
  | 'custom-metadata'
  | 'platform-event'
  | 'external'
  | 'big-object'

export interface OrgObjectRow {
  name: string
  kind: OrgObjectKind
  count: number
}

export interface OrgLimitRow {
  name: string
  max: number
  remaining: number
}

export interface BatchAnalysisSummary {
  dateRangeMin: string | null
  dateRangeMax: string | null
  totalRetrieved: number
  executedCount: number
  overallAvgDurationMs: number | null
  maxDurationMs: number | null
}

export interface DurationByClassRow {
  apexClassName: string
  completedCount: number
  avgDurationMs: number
  p50Ms: number | null
  p90Ms: number | null
  p95Ms: number | null
}

export interface FailuresByClassRow {
  apexClassName: string
  count: number
  jobs: JobRecord[]
}

export interface BatchJobStartEvent {
  startedAt: string
  apexClassName: string
}

export interface BatchJobExecution {
  id: string | null
  startedAt: string
  completedAt: string
  apexClassName: string
  status: string
}

export interface BatchAnalysisPayload {
  summary: BatchAnalysisSummary
  startTimes: string[]
  /** Start time + Apex class per row (same order as bulk history); used for hourly tooltips. */
  jobStarts: BatchJobStartEvent[]
  /** Jobs with measurable start and end times; used for overlap / concurrency charts. */
  jobExecutions: BatchJobExecution[]
  durationByClass: DurationByClassRow[]
  failuresByClass: FailuresByClassRow[]
}

export type DetailModalState =
  | { mode: 'batch'; job: JobRecord }
  | { mode: 'schedule'; job: JobRecord }
  | { mode: 'analysis-failures'; apexClassName: string; jobs: JobRecord[] }
  | null

export type StatusVariant = 'loading' | 'error' | null
