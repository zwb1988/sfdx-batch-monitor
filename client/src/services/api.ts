/** API client: orgs, batch jobs, scheduled jobs. */

import { buildBatchJobsUrl, type BatchQueryParams } from '../utils/filters'
import type { BatchAnalysisPayload, DataCloudIngestConnector, DataCloudIngestJob, DataCloudIngestObject, DataCloudIngestOperation, JobRecord, Org, OrgLimitRow, OrgObjectRow } from '../types'

interface OrgListJson {
  error?: string
  orgs?: Org[]
}

interface BatchJobsJson {
  error?: string
  jobs?: JobRecord[]
  instanceUrl?: string | null
}

export interface BatchJobsResult {
  jobs: JobRecord[]
  instanceUrl: string | null
}

interface OrgLimitsJson {
  error?: string
  limits?: OrgLimitRow[]
}

interface OrgObjectsJson {
  error?: string
  objects?: OrgObjectRow[]
}

interface ScheduledJobsJson {
  error?: string
  scheduledJobs?: JobRecord[]
}

export interface ScheduledJobsResult {
  scheduledJobs: JobRecord[]
}

interface OrgObjectLiveCountJson {
  error?: string
  count?: number
}

interface BatchAnalysisJson {
  error?: string
}

const BACKEND_UNREACHABLE_MSG =
  'Cannot reach the Express API on port 3000. Run `npm run dev` from the repo root (not the client folder) to start the server and UI together.'

async function readApiJson<T> (res: Response): Promise<T> {
  const text = await res.text()
  if (!text.trim()) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(BACKEND_UNREACHABLE_MSG)
    }
    throw new Error(`Empty response from API (HTTP ${res.status})`)
  }
  if (/^\s*</.test(text)) {
    throw new Error(
      res.status === 404
        ? 'API endpoint not found. Restart the Express server (`npm run dev` from the repo root).'
        : 'Server returned HTML instead of JSON. Check that the Express backend is running on port 3000.'
    )
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Invalid JSON from API (HTTP ${res.status}): ${text.slice(0, 160)}`)
  }
}

function apiError (data: { error?: unknown; error_description?: unknown; errorMessage?: unknown; message?: unknown; errors?: unknown } | null | undefined, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback
  const parts: string[] = []
  function push (value: unknown): void {
    if (typeof value !== 'string') return
    const text = value.trim()
    if (text && !parts.includes(text)) parts.push(text)
  }
  push(data.error)
  push(data.error_description)
  push(data.errorMessage)
  push(data.message)
  if (Array.isArray(data.errors)) {
    for (const item of data.errors) {
      if (typeof item === 'string') push(item)
      else if (item && typeof item === 'object') {
        const row = item as { message?: unknown; errorCode?: unknown; error?: unknown }
        push(row.errorCode)
        push(row.message)
        push(row.error)
      }
    }
  }
  return parts.length ? parts.join(' — ') : fallback
}

function requireApiOk (
  res: Response,
  data: { error?: unknown; error_description?: unknown; errorMessage?: unknown; message?: unknown; errors?: unknown } | null | undefined,
  fallback: string
): void {
  const message = apiError(data, fallback)
  const hasErrorField = !!(data && typeof data.error === 'string' && data.error.trim())
  if (!res.ok || hasErrorField) throw new Error(message)
}

export async function fetchOrgs (): Promise<Org[]> {
  const res = await fetch('/api/orgs')
  const data = await readApiJson<OrgListJson>(res)
  if (!res.ok) throw new Error(apiError(data, 'Failed to load orgs'))
  return data.orgs ?? []
}

export async function fetchBatchJobs (targetOrg: string, params: BatchQueryParams): Promise<BatchJobsResult> {
  const url = buildBatchJobsUrl(targetOrg, params)
  const res = await fetch(url)
  const data = await readApiJson<BatchJobsJson>(res)
  if (!res.ok) throw new Error(apiError(data, 'Failed to load batch jobs'))
  return { jobs: data.jobs ?? [], instanceUrl: data.instanceUrl ?? null }
}

export async function fetchOrgLimits (targetOrg: string): Promise<OrgLimitRow[]> {
  const params = new URLSearchParams()
  params.set('targetOrg', targetOrg)
  const res = await fetch('/api/org-limits?' + params.toString())
  const data = await readApiJson<OrgLimitsJson>(res)
  if (!res.ok) throw new Error(apiError(data, 'Failed to load org limits'))
  return data.limits ?? []
}

export async function fetchOrgObjects (targetOrg: string): Promise<OrgObjectRow[]> {
  const params = new URLSearchParams()
  params.set('targetOrg', targetOrg)
  const res = await fetch('/api/org-objects?' + params.toString())
  const data = await readApiJson<OrgObjectsJson>(res)
  if (!res.ok) throw new Error(apiError(data, 'Failed to load org objects'))
  return data.objects ?? []
}

export async function fetchOrgObjectLiveCount (targetOrg: string, sobject: string): Promise<number> {
  const params = new URLSearchParams()
  params.set('targetOrg', targetOrg)
  params.set('sobject', sobject)
  const res = await fetch('/api/org-objects/live-count?' + params.toString())
  const data = await readApiJson<OrgObjectLiveCountJson>(res)
  if (!res.ok) throw new Error(apiError(data, 'Failed to load live record count'))
  const count = data.count
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
    throw new Error('Invalid live record count response')
  }
  return count
}

export async function fetchScheduledJobs (targetOrg: string): Promise<ScheduledJobsResult> {
  const params = new URLSearchParams()
  params.set('targetOrg', targetOrg)
  const res = await fetch('/api/scheduled-jobs?' + params.toString())
  const data = await readApiJson<ScheduledJobsJson>(res)
  if (!res.ok) throw new Error(apiError(data, 'Failed to load scheduled jobs'))
  return { scheduledJobs: data.scheduledJobs ?? [] }
}

export async function fetchBatchAnalysis (targetOrg: string): Promise<BatchAnalysisPayload> {
  const params = new URLSearchParams()
  params.set('targetOrg', targetOrg)
  const res = await fetch('/api/batch-analysis?' + params.toString())
  const data = await readApiJson<Partial<BatchAnalysisPayload> & BatchAnalysisJson>(res)
  if (!res.ok) throw new Error(apiError(data, 'Failed to load batch analysis'))
  if (data.summary == null) {
    throw new Error('Invalid batch analysis response')
  }
  return {
    summary: data.summary,
    startTimes: data.startTimes ?? [],
    jobStarts: Array.isArray(data.jobStarts) ? data.jobStarts : [],
    jobExecutions: Array.isArray(data.jobExecutions) ? data.jobExecutions : [],
    durationByClass: data.durationByClass ?? [],
    failuresByClass: data.failuresByClass ?? []
  }
}

function dataCloudQuery (connectionId: string): string {
  const params = new URLSearchParams()
  params.set('connectionId', connectionId)
  return params.toString()
}

interface DataCloudConnectionJson {
  error?: string
  connected?: boolean
  connectionId?: string
  expiresAt?: string
}

interface DataCloudConnectorsJson {
  error?: string
  connectors?: DataCloudIngestConnector[]
}

interface DataCloudObjectsJson {
  error?: string
  objects?: DataCloudIngestObject[]
}

interface DataCloudJobJson {
  error?: string
  job?: DataCloudIngestJob
}

interface DataCloudUploadJson {
  error?: string
  accepted?: boolean
  uploaded?: Array<{ originalName: string; bytes: number }>
}

export async function connectDataCloud (
  loginUrl: string,
  clientId: string,
  clientSecret: string
): Promise<{ connectionId: string; expiresAt: string | null }> {
  const res = await fetch('/api/data-cloud/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginUrl, clientId, clientSecret })
  })
  const data = await readApiJson<DataCloudConnectionJson>(res)
  requireApiOk(res, data, 'Failed to connect to Data Cloud')
  if (!data.connected || !data.connectionId) {
    throw new Error('Data Cloud authorization did not return a connection')
  }
  return { connectionId: data.connectionId, expiresAt: data.expiresAt ?? null }
}

export async function disconnectDataCloud (connectionId: string): Promise<void> {
  const res = await fetch('/api/data-cloud/connect?' + dataCloudQuery(connectionId), {
    method: 'DELETE'
  })
  const data = await readApiJson<DataCloudConnectionJson>(res)
  requireApiOk(res, data, 'Failed to disconnect from Data Cloud')
}

export async function fetchDataCloudIngestConnectors (
  connectionId: string
): Promise<DataCloudIngestConnector[]> {
  const res = await fetch('/api/data-cloud/ingest-connectors?' + dataCloudQuery(connectionId))
  const data = await readApiJson<DataCloudConnectorsJson>(res)
  requireApiOk(res, data, 'Failed to load Ingestion API connectors')
  return data.connectors ?? []
}

export async function fetchDataCloudIngestObjects (
  connectionId: string,
  sourceName: string,
  connectorId: string,
  connectionName?: string
): Promise<DataCloudIngestObject[]> {
  const params = new URLSearchParams()
  params.set('connectionId', connectionId)
  params.set('sourceName', sourceName)
  if (connectorId) params.set('connectorId', connectorId)
  if (connectionName) params.set('connectionName', connectionName)
  const res = await fetch('/api/data-cloud/ingest-objects?' + params.toString())
  const data = await readApiJson<DataCloudObjectsJson>(res)
  requireApiOk(res, data, 'Failed to load Ingestion API objects')
  return data.objects ?? []
}

export async function createDataCloudIngestJob (
  connectionId: string,
  body: { sourceName: string; object: string; operation: DataCloudIngestOperation }
): Promise<DataCloudIngestJob> {
  const res = await fetch('/api/data-cloud/ingest-jobs?' + dataCloudQuery(connectionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await readApiJson<DataCloudJobJson>(res)
  requireApiOk(res, data, 'Failed to create ingest job')
  if (!data.job?.id) throw new Error('Create job response did not include a job id')
  return data.job
}

export async function uploadDataCloudIngestFiles (
  connectionId: string,
  jobId: string,
  files: File[]
): Promise<void> {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  const res = await fetch(
    '/api/data-cloud/ingest-jobs/' + encodeURIComponent(jobId) + '/batches?' + dataCloudQuery(connectionId),
    { method: 'PUT', body: form }
  )
  const data = await readApiJson<DataCloudUploadJson>(res)
  requireApiOk(res, data, 'Failed to upload CSV files')
}

export async function completeDataCloudIngestJob (
  connectionId: string,
  jobId: string
): Promise<DataCloudIngestJob> {
  const res = await fetch(
    '/api/data-cloud/ingest-jobs/' + encodeURIComponent(jobId) + '?' + dataCloudQuery(connectionId),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'UploadComplete' })
    }
  )
  const data = await readApiJson<DataCloudJobJson>(res)
  requireApiOk(res, data, 'Failed to complete ingest job')
  if (!data.job) throw new Error('Complete job response did not include job info')
  return data.job
}

export async function fetchDataCloudIngestJob (
  connectionId: string,
  jobId: string
): Promise<DataCloudIngestJob> {
  const params = new URLSearchParams()
  params.set('connectionId', connectionId)
  params.set('jobId', jobId)
  const res = await fetch('/api/data-cloud/ingest-jobs?' + params.toString())
  const data = await readApiJson<DataCloudJobJson>(res)
  requireApiOk(res, data, 'Failed to load ingest job')
  if (!data.job) throw new Error('Job info response did not include a job')
  return data.job
}
