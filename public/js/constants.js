/** Application constants. */

export const THEME_STORAGE_KEY = 'sf-batch-monitor-theme'
export const MIN_INTERVAL = 1
export const DEFAULT_LIMIT = 100
export const MIN_LIMIT = 1
export const MAX_LIMIT = 2000
export const STATUS_OPTIONS = ['Queued', 'Preparing', 'Processing', 'Completed', 'Failed', 'Aborted', 'Holding']
export const DEFAULT_STATUSES = ['Processing', 'Preparing', 'Queued', 'Failed']

export const BATCH_DETAIL_LABELS = {
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
]
