import { useEffect, type JSX } from 'react'
import { Footer } from './components/layout/Footer'
import { Header } from './components/layout/Header'
import { StatusMessage } from './components/ui/StatusMessage'
import { BatchAnalysisPanel } from './features/batch-analysis/BatchAnalysisPanel'
import { BatchMonitorPanel } from './features/batch-monitor/BatchMonitorPanel'
import { DetailModal } from './features/modals/DetailModal'
import { ScheduleStateHelpModal } from './features/modals/ScheduleStateHelpModal'
import { OrgLimitsPanel } from './features/org-limits/OrgLimitsPanel'
import { OrgObjectsPanel } from './features/org-objects/OrgObjectsPanel'
import { SchedulePanel } from './features/schedule/SchedulePanel'
import { useBatchPolling } from './hooks/useBatchPolling'
import { useOrgLimitsPolling } from './hooks/useOrgLimitsPolling'
import { useOrgObjectsInitialLoad } from './hooks/useOrgObjectsInitialLoad'
import { useOrgs } from './hooks/useOrgs'
import { useScheduledJobs } from './hooks/useScheduledJobs'
import { useAppStore } from './stores/appStore'
import { MIN_INTERVAL } from './utils/constants'
import { clampInterval } from './utils/filters'

export default function App (): JSX.Element {
  useOrgs()
  useBatchPolling()
  useOrgLimitsPolling()
  useOrgObjectsInitialLoad()
  const { refreshScheduledJobs } = useScheduledJobs()

  const theme = useAppStore((s) => s.theme)
  const applyThemeToDocument = useAppStore((s) => s.applyThemeToDocument)

  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme, applyThemeToDocument])

  const orgs = useAppStore((s) => s.orgs)
  const orgsLoading = useAppStore((s) => s.orgsLoading)
  const selectedOrg = useAppStore((s) => s.selectedOrg)
  const setSelectedOrg = useAppStore((s) => s.setSelectedOrg)
  const activeTab = useAppStore((s) => s.activeTab)
  const setActiveTab = useAppStore((s) => s.setActiveTab)
  const intervalSeconds = useAppStore((s) => s.intervalSeconds)
  const setIntervalSeconds = useAppStore((s) => s.setIntervalSeconds)
  const scheduleSearchQuery = useAppStore((s) => s.scheduleSearchQuery)
  const setScheduleSearchQuery = useAppStore((s) => s.setScheduleSearchQuery)

  const orgOk = !!selectedOrg.trim()

  return (
    <>
      <Header />
      <main className="main">
        <section className="controls controls-row controls-row--top" aria-label="Environment and refresh">
          <div className="control-group">
            <label htmlFor="org-select">Environment</label>
            <select
              id="org-select"
              aria-label="Select environment"
              disabled={orgsLoading}
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
            >
              <option value="">Select an org</option>
              {orgs.map((org, i) => {
                const val = org.alias || org.username || ''
                return (
                  <option key={val + '-' + i} value={val}>
                    {val}
                  </option>
                )
              })}
            </select>
          </div>
          {activeTab !== 'batch-analysis' && activeTab !== 'batch-schedule' && activeTab !== 'org-objects' && (
            <div className="control-group">
              <label htmlFor="interval-input">Refresh interval (seconds)</label>
              <input
                type="number"
                id="interval-input"
                min={1}
                aria-label="Refresh interval in seconds"
                disabled={!orgOk}
                value={intervalSeconds}
                onChange={(e) => {
                  const raw = e.target.value
                  setIntervalSeconds(clampInterval(raw === '' ? MIN_INTERVAL : raw))
                }}
                onInput={(e) => {
                  const el = e.target as HTMLInputElement
                  const v = clampInterval(el.value)
                  if (el.value !== '' && v < MIN_INTERVAL) {
                    el.value = String(MIN_INTERVAL)
                    setIntervalSeconds(MIN_INTERVAL)
                  }
                }}
              />
            </div>
          )}
        </section>

        <div className="tabs" role="tablist" aria-label="Main views">
          <button
            type="button"
            id="tab-batch-monitor"
            className="tab"
            role="tab"
            aria-selected={activeTab === 'batch-monitor'}
            aria-controls="tab-panel-batch-monitor"
            tabIndex={activeTab === 'batch-monitor' ? 0 : -1}
            onClick={() => setActiveTab('batch-monitor')}
          >
            Batch monitor
          </button>
          <button
            type="button"
            id="tab-batch-schedule"
            className="tab"
            role="tab"
            aria-selected={activeTab === 'batch-schedule'}
            aria-controls="tab-panel-batch-schedule"
            tabIndex={activeTab === 'batch-schedule' ? 0 : -1}
            onClick={() => setActiveTab('batch-schedule')}
          >
            Batch schedule
          </button>
          <button
            type="button"
            id="tab-batch-analysis"
            className="tab"
            role="tab"
            aria-selected={activeTab === 'batch-analysis'}
            aria-controls="tab-panel-batch-analysis"
            tabIndex={activeTab === 'batch-analysis' ? 0 : -1}
            onClick={() => setActiveTab('batch-analysis')}
          >
            Batch analysis
          </button>
          <button
            type="button"
            id="tab-org-limits"
            className="tab"
            role="tab"
            aria-selected={activeTab === 'org-limits'}
            aria-controls="tab-panel-org-limits"
            tabIndex={activeTab === 'org-limits' ? 0 : -1}
            onClick={() => setActiveTab('org-limits')}
          >
            Org limits
          </button>
          <button
            type="button"
            id="tab-org-objects"
            className="tab"
            role="tab"
            aria-selected={activeTab === 'org-objects'}
            aria-controls="tab-panel-org-objects"
            tabIndex={activeTab === 'org-objects' ? 0 : -1}
            onClick={() => setActiveTab('org-objects')}
          >
            Org objects
          </button>
        </div>

        {activeTab !== 'batch-analysis' && <StatusMessage />}

        {activeTab === 'batch-schedule' && (
          <section
            className="controls controls-row schedule-controls-row schedule-search-under-status"
            aria-label="Schedule search"
          >
            <div className="control-group">
              <label htmlFor="schedule-search-input">Search by name or Apex class</label>
              <input
                type="search"
                id="schedule-search-input"
                placeholder="Name or Apex class"
                aria-label="Search scheduled jobs by name or Apex class"
                disabled={!orgOk}
                value={scheduleSearchQuery}
                onChange={(e) => setScheduleSearchQuery(e.target.value)}
              />
            </div>
          </section>
        )}

        <BatchMonitorPanel />
        <SchedulePanel refreshScheduledJobs={refreshScheduledJobs} />
        <BatchAnalysisPanel />
        <OrgLimitsPanel />
        <OrgObjectsPanel />
      </main>
      <Footer />
      <DetailModal />
      <ScheduleStateHelpModal />
    </>
  )
}
