/** Application constants. */

export const THEME_STORAGE_KEY = 'sf-batch-monitor-theme'
export const MIN_INTERVAL = 1
export const DEFAULT_LIMIT = 100
export const MIN_LIMIT = 1
export const MAX_LIMIT = 2000
export const STATUS_OPTIONS = ['Queued', 'Preparing', 'Processing', 'Completed', 'Failed', 'Aborted', 'Holding'] as const
export type BatchJobStatusOption = (typeof STATUS_OPTIONS)[number]
export const DEFAULT_STATUSES = ['Processing', 'Preparing', 'Queued', 'Failed', 'Holding'] as const

/** Column keys for batch jobs table sorting (single source of truth). */
export const BATCH_TABLE_SORT_KEYS = [
  'id',
  'apexClassName',
  'jobType',
  'jobItemsProcessed',
  'status',
  'totalJobItems',
  'progress',
  'startedAt',
  'completedAt'
] as const
export type BatchTableSortKey = (typeof BATCH_TABLE_SORT_KEYS)[number]

/** Column keys for scheduled jobs table sorting. */
export const SCHEDULE_TABLE_SORT_KEYS = [
  'name',
  'state',
  'cronExpression',
  'nextFireTime',
  'previousFireTime',
  'apexClassName'
] as const
export type ScheduleTableSortKey = (typeof SCHEDULE_TABLE_SORT_KEYS)[number]

/** Schedule sort state may include keys not shown as columns (e.g. after data reload). */
export type ScheduleSortKey = ScheduleTableSortKey | 'timesTriggered'

export function isBatchTableSortKey (s: string): s is BatchTableSortKey {
  return (BATCH_TABLE_SORT_KEYS as readonly string[]).includes(s)
}

export function isScheduleTableSortKey (s: string): s is ScheduleTableSortKey {
  return (SCHEDULE_TABLE_SORT_KEYS as readonly string[]).includes(s)
}

/** Column keys for org objects table sorting. */
export const ORG_OBJECTS_SORT_KEYS = ['name', 'kind', 'count', 'share'] as const
export type OrgObjectsSortKey = (typeof ORG_OBJECTS_SORT_KEYS)[number]

export function isOrgObjectsSortKey (s: string): s is OrgObjectsSortKey {
  return (ORG_OBJECTS_SORT_KEYS as readonly string[]).includes(s)
}

export const ORG_OBJECTS_PAGE_SIZE = 100

export const ORG_OBJECT_KIND_LABELS: Record<string, string> = {
  standard: 'Standard',
  custom: 'Custom',
  'custom-metadata': 'Custom metadata',
  'platform-event': 'Platform event',
  external: 'External',
  'big-object': 'Big object'
}

export const BATCH_DETAIL_LABELS: Record<string, string> = {
  id: 'Batch ID',
  apexClassName: 'Apex Class Name',
  apexClassId: 'Apex Class ID',
  jobType: 'Job Type',
  status: 'Status',
  jobItemsProcessed: 'Job Items Processed',
  totalJobItems: 'Total Job Items',
  startedAt: 'Started',
  completedAt: 'Completed',
  createdById: 'Created By ID',
  extendedStatus: 'Extended Status',
  methodName: 'Method Name',
  numberOfErrors: 'Number Of Errors',
  lastProcessed: 'Last Processed',
  lastProcessedOffset: 'Last Processed Offset',
  parentJobId: 'Parent Job ID'
}

export const BATCH_DETAIL_ORDER = [
  'id', 'apexClassName', 'apexClassId', 'jobType', 'status', 'extendedStatus',
  'jobItemsProcessed', 'totalJobItems', 'numberOfErrors', 'lastProcessed', 'lastProcessedOffset',
  'methodName', 'startedAt', 'completedAt', 'createdById', 'parentJobId'
] as const

export const SCHEDULE_DETAIL_LABELS: Record<string, string> = {
  name: 'Name',
  state: 'State',
  cronExpression: 'Cron expression',
  nextFireTime: 'Next fire',
  previousFireTime: 'Previous fire',
  timesTriggered: 'Times triggered',
  timeZoneSidKey: 'Time zone',
  apexClassName: 'Apex class name',
  apexClassId: 'Apex class ID',
  id: 'CronTrigger ID',
  cronJobDetailId: 'CronJobDetail ID',
  jobType: 'Job type'
}

export const SCHEDULE_DETAIL_ORDER = [
  'name', 'state', 'cronExpression', 'nextFireTime', 'previousFireTime',
  'timesTriggered', 'timeZoneSidKey', 'apexClassName', 'apexClassId', 'id', 'cronJobDetailId', 'jobType'
] as const

export const DATA_CLOUD_JOB_POLL_INTERVAL_MS = 5000

export const DATA_CLOUD_INGEST_OPERATIONS = [
  { value: 'upsert', label: 'Upsert' },
  { value: 'delete', label: 'Delete' }
] as const

export const DATA_CLOUD_TERMINAL_JOB_STATES = new Set([
  'JobComplete',
  'Failed',
  'Aborted',
  'NotProcessed'
])

export const CRON_TRIGGER_STATE_REFERENCE = [
  { code: 'WAITING', description: 'The job is scheduled and idle until the next fire time.' },
  { code: 'ACQUIRED', description: 'The scheduler has selected the job and it is about to start running.' },
  { code: 'EXECUTING', description: 'The job is running right now.' },
  { code: 'COMPLETE', description: 'This run finished successfully (or the execution cycle completed).' },
  { code: 'ERROR', description: 'The run failed; check Apex debug logs, email logs, or your monitoring for details.' },
  { code: 'DELETED', description: 'The schedule was removed or the job was aborted.' },
  { code: 'PAUSED', description: 'Execution is paused; the job will not run until it is resumed.' },
  { code: 'BLOCKED', description: 'The job cannot run at the moment (for example, scheduling limits or conflicts).' }
] as const
