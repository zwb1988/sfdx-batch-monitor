import { useEffect, useRef, useState, type JSX } from 'react'
import {
  completeDataCloudIngestJob,
  connectDataCloud,
  createDataCloudIngestJob,
  disconnectDataCloud,
  fetchDataCloudIngestConnectors,
  fetchDataCloudIngestJob,
  fetchDataCloudIngestObjects,
  uploadDataCloudIngestFiles
} from '../../services/api'
import { useAppStore } from '../../stores/appStore'
import type {
  DataCloudIngestConnector,
  DataCloudIngestJob,
  DataCloudIngestObject,
  DataCloudIngestOperation
} from '../../types'
import {
  DATA_CLOUD_INGEST_OPERATIONS,
  DATA_CLOUD_JOB_POLL_INTERVAL_MS,
  DATA_CLOUD_TERMINAL_JOB_STATES
} from '../../utils/constants'
import { getErrorMessage } from '../../utils/errorUtils'
import { formatDate } from '../../utils/format'

function jobStateClass (state: string): string {
  const value = state.toLowerCase()
  if (value === 'jobcomplete') return 'completed'
  if (value === 'inprogress' || value === 'uploadcomplete' || value === 'open') return 'processing'
  if (value === 'failed' || value === 'aborted' || value === 'notprocessed') return 'failed'
  return 'holding'
}

function formatBytes (bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function CopyIcon (): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon (): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function JobIdWithCopy ({ jobId }: { jobId: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  async function copyJobId (): Promise<void> {
    try {
      await navigator.clipboard.writeText(jobId)
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <span className="dc-job-id-copy">
      <code className="dc-job-id-inline" title="Ingest job ID">{jobId}</code>
      <button
        type="button"
        className={'dc-copy-btn' + (copied ? ' is-copied' : '')}
        aria-label={copied ? 'Copied job ID' : 'Copy job ID'}
        title={copied ? 'Copied' : 'Copy job ID'}
        onClick={() => { void copyJobId() }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </span>
  )
}

export function DataCloudIngestPanel (): JSX.Element {
  const activeTab = useAppStore((state) => state.activeTab)
  const onIngestTab = activeTab === 'data-cloud-csv-ingest'

  const [loginUrl, setLoginUrl] = useState('https://login.salesforce.com')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [connectionId, setConnectionId] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState('')

  const [connectors, setConnectors] = useState<DataCloudIngestConnector[]>([])
  const [connectorsLoading, setConnectorsLoading] = useState(false)
  const [sourceName, setSourceName] = useState('')
  const [objects, setObjects] = useState<DataCloudIngestObject[]>([])
  const [objectsLoading, setObjectsLoading] = useState(false)
  const [objectName, setObjectName] = useState('')
  const [operation, setOperation] = useState<DataCloudIngestOperation>('upsert')
  const [files, setFiles] = useState<File[]>([])

  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [job, setJob] = useState<DataCloudIngestJob | null>(null)
  const [jobIdInput, setJobIdInput] = useState('')
  const [lookingUpJob, setLookingUpJob] = useState(false)
  const [pollError, setPollError] = useState('')
  const pollCancelledRef = useRef(false)
  const consoleBodyRef = useRef<HTMLDivElement>(null)

  const connected = !!connectionId
  const selectedConnector = connectors.find((connector) => connector.name === sourceName)
  const canConnect = !connected && !connecting && !!loginUrl.trim() && !!clientId.trim() && !!clientSecret
  const canRun = connected && !busy && !!sourceName && !!objectName && files.length > 0
  const jobIsActive = !!job && !DATA_CLOUD_TERMINAL_JOB_STATES.has(job.state)
  const isMonitoring = connected && jobIsActive && !busy
  const showJobLookup = !busy && !isMonitoring
  const canMonitorJob = connected && !lookingUpJob && !!jobIdInput.trim()

  function appendLog (line: string): void {
    setLog((previous) => [...previous, line])
  }

  useEffect(() => {
    const el = consoleBodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  useEffect(() => {
    function onBeforeUnload (event: BeforeUnloadEvent): void {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  async function onConnect (): Promise<void> {
    if (!canConnect) return
    setConnecting(true)
    setConnectionError('')
    setPollError('')
    try {
      const connection = await connectDataCloud(loginUrl.trim(), clientId.trim(), clientSecret)
      setConnectionId(connection.connectionId)
      setConnectorsLoading(true)
      try {
        const rows = await fetchDataCloudIngestConnectors(connection.connectionId)
        setConnectors(rows)
        if (!sourceName && rows.length === 1) setSourceName(rows[0].name)
        if (job?.id && !DATA_CLOUD_TERMINAL_JOB_STATES.has(job.state)) {
          appendLog('Reconnected — resuming monitoring for job ' + job.id + '.')
        }
      } catch (error: unknown) {
        setConnectionError(getErrorMessage(error) || 'Connected, but could not load Ingestion API connectors')
      } finally {
        setConnectorsLoading(false)
      }
    } catch (error: unknown) {
      setConnectionId('')
      setConnectionError(getErrorMessage(error) || 'Authorization failed')
    } finally {
      setConnecting(false)
    }
  }

  async function onDisconnect (): Promise<void> {
    const currentConnectionId = connectionId
    setConnectionId('')
    if (currentConnectionId) {
      try {
        await disconnectDataCloud(currentConnectionId)
      } catch {
        // The local UI is already disconnected; an expired server session needs no further action.
      }
    }
  }

  useEffect(() => {
    if (!connectionId || !sourceName || !selectedConnector) return
    let alive = true
    const connector = selectedConnector
    fetchDataCloudIngestObjects(
      connectionId,
      sourceName,
      connector.id,
      connector.connectionName
    )
      .then((rows) => {
        if (!alive) return
        setObjects(rows)
        setObjectsLoading(false)
        if (!objectName && rows.length === 1) setObjectName(rows[0].name)
      })
      .catch((error: unknown) => {
        if (!alive) return
        setObjects([])
        setObjectsLoading(false)
        setConnectionError(getErrorMessage(error) || 'Failed to load Ingestion API objects')
      })
    return () => {
      alive = false
    }
  }, [connectionId, sourceName, selectedConnector])

  useEffect(() => {
    const jobId = job?.id
    const state = job?.state || ''
    if (!connectionId || !onIngestTab || !jobId || DATA_CLOUD_TERMINAL_JOB_STATES.has(state) || busy) return

    pollCancelledRef.current = false
    let timerId: ReturnType<typeof setInterval> | null = null

    async function poll (): Promise<void> {
      if (pollCancelledRef.current || !jobId) return
      try {
        const next = await fetchDataCloudIngestJob(connectionId, jobId)
        if (pollCancelledRef.current) return
        setJob(next)
        if (next.errorMessage) {
          setPollError(next.errorMessage)
        } else {
          setPollError('')
        }
        if (DATA_CLOUD_TERMINAL_JOB_STATES.has(next.state)) {
          const suffix = next.errorMessage ? ' Error: ' + next.errorMessage : ''
          setLog((previous) => [...previous, 'Job finished with state ' + next.state + '.' + suffix])
        }
      } catch (error: unknown) {
        if (!pollCancelledRef.current) {
          setPollError(getErrorMessage(error) || 'Failed to poll ingest job')
        }
      }
    }

    void poll()
    timerId = setInterval(() => { void poll() }, DATA_CLOUD_JOB_POLL_INTERVAL_MS)
    return () => {
      pollCancelledRef.current = true
      if (timerId != null) clearInterval(timerId)
    }
  }, [connectionId, job?.id, job?.state, onIngestTab, busy])

  function onSourceChange (value: string): void {
    setSourceName(value)
    setObjects([])
    setObjectName('')
    setConnectionError('')
    if (value) setObjectsLoading(true)
  }

  async function onMonitorJob (): Promise<void> {
    const jobId = jobIdInput.trim()
    if (!connected || !jobId) return
    setLookingUpJob(true)
    setPollError('')
    try {
      const next = await fetchDataCloudIngestJob(connectionId, jobId)
      setJob(next)
      setJobIdInput(next.id)
      if (next.errorMessage) setPollError(next.errorMessage)
      const suffix = DATA_CLOUD_TERMINAL_JOB_STATES.has(next.state)
        ? ' Job is already in a terminal state.'
        : ' Monitoring until processing finishes…'
      appendLog('Loaded job ' + next.id + ' (' + (next.state || 'Unknown') + ').' + suffix)
    } catch (error: unknown) {
      const message = getErrorMessage(error) || 'Failed to load ingest job'
      setPollError(message)
      appendLog('Error: ' + message)
    } finally {
      setLookingUpJob(false)
    }
  }

  async function onRunIngest (): Promise<void> {
    if (!canRun) return
    setBusy(true)
    setPollError('')
    setLog([])
    setJob(null)
    try {
      appendLog('Creating ' + operation + ' job for ' + sourceName + ' / ' + objectName + '…')
      const created = await createDataCloudIngestJob(connectionId, {
        sourceName,
        object: objectName,
        operation
      })
      setJob(created)
      setJobIdInput(created.id)
      appendLog('Job ' + created.id + ' created (' + (created.state || 'Open') + ').')

      appendLog('Uploading ' + files.length + ' CSV file' + (files.length === 1 ? '' : 's') + '…')
      await uploadDataCloudIngestFiles(connectionId, created.id, files)
      appendLog('CSV upload accepted.')

      appendLog('Marking job UploadComplete…')
      const completed = await completeDataCloudIngestJob(connectionId, created.id)
      setJob(completed)
      if (completed.errorMessage) setPollError(completed.errorMessage)
      appendLog('Job state is now ' + (completed.state || 'UploadComplete') + '. Monitoring until processing finishes…')
    } catch (error: unknown) {
      const message = getErrorMessage(error) || 'Ingest failed'
      setPollError(message)
      appendLog('Error: ' + message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      id="tab-panel-data-cloud-csv-ingest"
      className="tab-panel"
      role="tabpanel"
      aria-labelledby="tab-data-cloud-csv-ingest"
      hidden={!onIngestTab}
    >
      <section className="table-section dc-auth-card" aria-label="Data Cloud connection">
        <div className="table-toolbar timezone-option">
          <div className="timezone-option-left">
            <strong>Data Cloud connection</strong>
            <span
              className={'dc-connection-status ' + (connected ? 'is-connected' : 'is-disconnected')}
              role="status"
              aria-label={connected ? 'Connected' : 'Disconnected'}
            >
              <span aria-hidden="true">●</span>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <div className="dc-auth-body">
          <p className="org-objects-disclaimer">
            Authenticate with the connected app’s client-credentials flow. Credentials are sent only
            to this local server and are not saved in browser storage or project files.
          </p>
          <section className="controls controls-row dc-auth-controls">
            <div className="control-group">
              <label htmlFor="dc-login-url">Salesforce domain</label>
              <input
                id="dc-login-url"
                type="url"
                placeholder="https://my-domain.my.salesforce.com"
                disabled={connected || connecting}
                value={loginUrl}
                onChange={(event) => setLoginUrl(event.target.value)}
              />
            </div>
            <div className="control-group">
              <label htmlFor="dc-client-id">Client ID</label>
              <input
                id="dc-client-id"
                type="text"
                autoComplete="username"
                disabled={connected || connecting}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />
            </div>
            <div className="control-group">
              <label htmlFor="dc-client-secret">Client secret</label>
              <div className="dc-secret-input">
                <input
                  id="dc-client-secret"
                  type={showSecret ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={connected || connecting}
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                />
                <button
                  type="button"
                  className="dc-secret-toggle"
                  disabled={connected || connecting}
                  aria-label={showSecret ? 'Hide client secret' : 'Show client secret'}
                  onClick={() => setShowSecret((value) => !value)}
                >
                  {showSecret ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="control-group control-group--batch-analysis-action">
              <label htmlFor="dc-connect-btn">Connection</label>
              {connected
                ? (
                  <button
                    type="button"
                    id="dc-connect-btn"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => { void onDisconnect() }}
                  >
                    Disconnect
                  </button>
                  )
                : (
                  <button
                    type="button"
                    id="dc-connect-btn"
                    className="btn-batch-analysis"
                    disabled={!canConnect}
                    onClick={() => { void onConnect() }}
                  >
                    {connecting ? 'Connecting…' : 'Connect'}
                  </button>
                  )}
            </div>
          </section>
          {connectionError && <p className="status-message error">{connectionError}</p>}
        </div>
      </section>

      <section className="controls controls-row dc-ingest-controls" aria-label="Data Cloud ingest setup">
        <div className="control-group">
          <label htmlFor="dc-source-name">Ingestion API (sourceName)</label>
          <select
            id="dc-source-name"
            disabled={!connected || busy || connectorsLoading}
            value={sourceName}
            onChange={(event) => onSourceChange(event.target.value)}
          >
            <option value="">{connectorsLoading ? 'Loading connectors…' : 'Select a connector'}</option>
            {connectors.map((connector) => (
              <option key={connector.id} value={connector.name}>
                {connector.label === connector.name
                  ? connector.name
                  : connector.label + ' (' + connector.name + ')'}
              </option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label htmlFor="dc-object-name">Object</label>
          <select
            id="dc-object-name"
            disabled={!connected || busy || !sourceName || objectsLoading}
            value={objectName}
            onChange={(event) => setObjectName(event.target.value)}
          >
            <option value="">{objectsLoading ? 'Loading objects…' : 'Select an object'}</option>
            {objects.map((object) => (
              <option key={object.name} value={object.name}>
                {object.label === object.name ? object.name : object.label + ' (' + object.name + ')'}
              </option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label htmlFor="dc-operation">Operation</label>
          <select
            id="dc-operation"
            disabled={!connected || busy}
            value={operation}
            onChange={(event) => setOperation(event.target.value as DataCloudIngestOperation)}
          >
            {DATA_CLOUD_INGEST_OPERATIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="controls controls-row" aria-label="CSV files">
        <div className="control-group dc-file-control">
          <label htmlFor="dc-csv-files">CSV files</label>
          <input
            type="file"
            id="dc-csv-files"
            accept=".csv,text/csv"
            multiple
            disabled={busy}
            onChange={(event) => setFiles(event.target.files ? Array.from(event.target.files) : [])}
          />
          {files.length > 0 && (
            <ul className="dc-file-list">
              {files.map((file) => (
                <li key={file.name + file.size}>{file.name} ({formatBytes(file.size)})</li>
              ))}
            </ul>
          )}
        </div>
        <div className="control-group control-group--batch-analysis-action">
          <label htmlFor="dc-run-ingest-btn">Run job</label>
          <button
            type="button"
            id="dc-run-ingest-btn"
            className="btn-batch-analysis"
            disabled={!canRun}
            onClick={() => { void onRunIngest() }}
          >
            {busy ? 'Running…' : 'Create, upload, and monitor'}
          </button>
        </div>
      </section>

      <section className="table-section dc-ingest-status">
        <div className="table-toolbar timezone-option">
          <div className="timezone-option-left">
            <strong>Job status</strong>
            {job?.id && <JobIdWithCopy jobId={job.id} />}
            {job && (
              <>
                <span className={'status-badge ' + jobStateClass(job.state)}>{job.state || '—'}</span>
                {connected && String(job.state).toLowerCase() === 'inprogress' && (
                  <span className="dc-job-spinner" role="status" aria-label="Job in progress" />
                )}
              </>
            )}
          </div>
        </div>
        <div className="dc-ingest-status-body">
          {showJobLookup && (
            <section className="controls controls-row dc-job-lookup" aria-label="Monitor ingest job by ID">
              <div className="control-group dc-job-lookup-id">
                <label htmlFor="dc-job-id-input">Job ID</label>
                <input
                  id="dc-job-id-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Enter an ingest job ID"
                  value={jobIdInput}
                  disabled={lookingUpJob}
                  onChange={(event) => setJobIdInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && canMonitorJob) {
                      event.preventDefault()
                      void onMonitorJob()
                    }
                  }}
                />
              </div>
              <div className="control-group control-group--batch-analysis-action">
                <label htmlFor="dc-monitor-job-btn">Monitor</label>
                <button
                  type="button"
                  id="dc-monitor-job-btn"
                  className="btn-batch-analysis"
                  disabled={!canMonitorJob}
                  onClick={() => { void onMonitorJob() }}
                >
                  {lookingUpJob ? 'Loading…' : 'Monitor job'}
                </button>
              </div>
            </section>
          )}
          {!connected && showJobLookup && (
            <p className="batch-analysis-env-hint" role="note">
              {job?.id && jobIsActive
                ? 'Disconnected — connect again to resume monitoring job ' + job.id + '.'
                : 'Connect to Data Cloud to look up and monitor a job ID.'}
            </p>
          )}
          {job
            ? (
              <dl className="dc-job-meta">
                <div><dt>Job ID</dt><dd><JobIdWithCopy jobId={job.id} /></dd></div>
                <div><dt>Source</dt><dd>{job.sourceName || sourceName}</dd></div>
                <div><dt>Object</dt><dd>{job.object || objectName}</dd></div>
                <div><dt>Operation</dt><dd>{job.operation || operation}</dd></div>
                <div><dt>Created</dt><dd>{job.createdDate ? formatDate(job.createdDate, false) : '—'}</dd></div>
                <div><dt>Retries</dt><dd>{job.retries == null ? '—' : String(job.retries)}</dd></div>
                {job.errorMessage && (
                  <div className="dc-job-error">
                    <dt>Error</dt>
                    <dd>{job.errorMessage}</dd>
                  </div>
                )}
              </dl>
              )
            : (
              <p className="empty-state-text">
                Run an ingest job, or enter a Job ID above to start monitoring.
              </p>
              )}
          {pollError && <p className="status-message error">{pollError}</p>}
          <section className="dc-console" aria-label="Ingest log">
            <header className="dc-console-header">Console</header>
            <div className="dc-console-body" ref={consoleBodyRef} role="log" aria-live="polite">
              {log.length === 0
                ? <div className="dc-console-line dc-console-line--muted">Waiting for log output…</div>
                : log.map((line, index) => (
                  <div
                    key={index}
                    className={
                      'dc-console-line' +
                      (line.toLowerCase().startsWith('error:') ? ' dc-console-line--error' : '')
                    }
                  >
                    <span className="dc-console-prompt" aria-hidden="true">›</span>
                    {line}
                  </div>
                  ))}
            </div>
          </section>
        </div>
      </section>
    </section>
  )
}
