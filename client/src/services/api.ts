/** API client: orgs, batch jobs, scheduled jobs. */

import { buildBatchJobsUrl, type BatchQueryParams } from '../utils/filters'
import type { BatchAnalysisPayload, JobRecord, Org, OrgLimitRow, OrgObjectRow } from '../types'

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

function apiError (data: { error?: string } | null | undefined, fallback: string): string {
  return (data && typeof data.error === 'string' && data.error.trim()) ? data.error : fallback
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
