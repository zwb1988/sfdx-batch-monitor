import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type JSX } from 'react'
import { fetchBatchAnalysis } from '../../services/api'
import { useAppStore } from '../../stores/appStore'
import type { BatchAnalysisPayload } from '../../types'
import type { ApexClassHourRank, ChartTimeZone } from '../../utils/batchAnalysisBuckets'
import {
  buildDailyVolume,
  buildDayHourHeatmap,
  buildStartsPerHourForDay,
  buildTopApexClassesByHourForDay
} from '../../utils/batchAnalysisBuckets'
import {
  buildConcurrencySeriesForDay,
  buildExecutionDays,
  buildGanttRowsForDay,
  countExecutionsOverlappingDay,
  filterExecutionsByClass,
  listBatchClassesForDay
} from '../../utils/batchAnalysisConcurrency'
import { formatDate, formatDurationMs } from '../../utils/format'
import {
  BatchConcurrencyChart,
  BatchDailyVolumeChart,
  BatchExecutionTimelineChart,
  BatchHeatmapChart,
  BatchHourlyLineChart
} from './BatchAnalysisECharts'
import { useChartTheme } from './useChartTheme'

export function BatchAnalysisPanel (): JSX.Element {
  const selectedOrg = useAppStore((s) => s.selectedOrg)
  const activeTab = useAppStore((s) => s.activeTab)
  const openAnalysisFailuresModal = useAppStore((s) => s.openAnalysisFailuresModal)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chartZone, setChartZone] = useState<ChartTimeZone>('local')
  const [payload, setPayload] = useState<BatchAnalysisPayload | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [durationFilter, setDurationFilter] = useState('')
  const [batchClassSearch, setBatchClassSearch] = useState('')
  const [selectedBatchClasses, setSelectedBatchClasses] = useState<Set<string>>(() => new Set())

  const chartColors = useChartTheme()
  const handleSelectDay = useCallback((day: string) => {
    setSelectedDay(day)
    setSelectedBatchClasses(new Set())
    setBatchClassSearch('')
  }, [])

  const orgOk = !!selectedOrg.trim()
  const onAnalysisTab = activeTab === 'batch-analysis'

  useEffect(() => {
    if (!orgOk) {
      const t = window.setTimeout(() => {
        setPayload(null)
        setError(null)
        setLoading(false)
        setSelectedDay(null)
      }, 0)
      return () => window.clearTimeout(t)
    }
  }, [orgOk])

  const startTimes = useMemo(() => payload?.startTimes ?? [], [payload])
  const jobStarts = useMemo(() => payload?.jobStarts ?? [], [payload])
  const jobExecutions = useMemo(() => payload?.jobExecutions ?? [], [payload])
  const heatmap = useMemo(() => buildDayHourHeatmap(startTimes, chartZone), [startTimes, chartZone])
  const dailyVolume = useMemo(() => buildDailyVolume(startTimes, chartZone), [startTimes, chartZone])
  const executionDays = useMemo(() => buildExecutionDays(jobExecutions, chartZone), [jobExecutions, chartZone])

  const analysisDays = useMemo(() => {
    const merged = new Set([...heatmap.days, ...executionDays])
    return [...merged].sort((a, b) => a.localeCompare(b))
  }, [heatmap.days, executionDays])

  const resolvedDay = useMemo(() => {
    const days = analysisDays
    if (days.length === 0) return null
    if (selectedDay != null && days.includes(selectedDay)) return selectedDay
    return days[days.length - 1]
  }, [analysisDays, selectedDay])

  const batchClassesOnDay = useMemo(() => {
    if (resolvedDay == null) return []
    return listBatchClassesForDay(jobExecutions, chartZone, resolvedDay)
  }, [jobExecutions, chartZone, resolvedDay])

  const filteredBatchClassOptions = useMemo(() => {
    const q = batchClassSearch.trim().toLowerCase()
    if (!q) return batchClassesOnDay
    return batchClassesOnDay.filter((name) => name.toLowerCase().includes(q))
  }, [batchClassesOnDay, batchClassSearch])

  const filteredExecutions = useMemo(
    () => filterExecutionsByClass(jobExecutions, selectedBatchClasses),
    [jobExecutions, selectedBatchClasses]
  )

  const hourlyForSelectedDay = useMemo(() => {
    if (resolvedDay == null) return Array.from({ length: 24 }, () => 0)
    return buildStartsPerHourForDay(startTimes, chartZone, resolvedDay)
  }, [startTimes, chartZone, resolvedDay])

  const apexClassesByHourForDay = useMemo((): Map<number, ApexClassHourRank[]> => {
    if (resolvedDay == null) return new Map()
    return buildTopApexClassesByHourForDay(jobStarts, chartZone, resolvedDay)
  }, [jobStarts, chartZone, resolvedDay])

  const concurrencySeries = useMemo(() => {
    if (resolvedDay == null) {
      return { timestamps: [], counts: [], peak: 0, minutesAtLimit: 0, dayStart: 0, dayEnd: 0 }
    }
    return buildConcurrencySeriesForDay(filteredExecutions, chartZone, resolvedDay)
  }, [filteredExecutions, chartZone, resolvedDay])

  const jobsOnSelectedDay = useMemo(() => {
    if (resolvedDay == null) return 0
    return countExecutionsOverlappingDay(filteredExecutions, chartZone, resolvedDay)
  }, [filteredExecutions, chartZone, resolvedDay])

  const ganttRows = useMemo(() => {
    if (resolvedDay == null) {
      return { lanes: [], segments: [], totalExecutions: 0, dayStart: 0, dayEnd: 0 }
    }
    return buildGanttRowsForDay(filteredExecutions, chartZone, resolvedDay)
  }, [filteredExecutions, chartZone, resolvedDay])

  const durationRows = useMemo(() => payload?.durationByClass ?? [], [payload])
  const filteredDurationRows = useMemo(() => {
    const q = durationFilter.trim().toLowerCase()
    if (!q) return durationRows
    return durationRows.filter((r) => r.apexClassName.toLowerCase().includes(q))
  }, [durationRows, durationFilter])

  const failureGroups = payload?.failuresByClass ?? []

  function performBatchAnalysis (): void {
    if (!onAnalysisTab || !orgOk) return
    const org = selectedOrg.trim()
    setLoading(true)
    setError(null)
    void fetchBatchAnalysis(org)
      .then((data) => {
        setPayload(data)
        setError(null)
        setSelectedBatchClasses(new Set())
        setBatchClassSearch('')
      })
      .catch((e: unknown) => {
        setPayload(null)
        setError(e instanceof Error ? e.message : 'Failed to load batch analysis')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const summary = payload?.summary

  const zoneLabel = chartZone === 'utc' ? 'UTC' : 'Local'

  function handleBatchClassFilterChange (e: ChangeEvent<HTMLSelectElement>): void {
    const next = new Set(Array.from(e.target.selectedOptions, (opt) => opt.value))
    setSelectedBatchClasses(next)
  }

  function selectAllBatchClasses (): void {
    setSelectedBatchClasses(new Set(batchClassesOnDay))
  }

  function clearBatchClassFilter (): void {
    setSelectedBatchClasses(new Set())
  }

  return (
    <section
      id="tab-panel-batch-analysis"
      className="tab-panel"
      role="tabpanel"
      aria-labelledby="tab-batch-analysis"
      hidden={!onAnalysisTab}
    >
      <section className="controls controls-row batch-analysis-top-controls">
        <div className="control-group">
          <span id="chart-zone-label" className="control-label-static">
            Chart time zone
          </span>
          <select
            id="batch-analysis-chart-zone"
            aria-labelledby="chart-zone-label"
            disabled={!orgOk || loading}
            value={chartZone}
            onChange={(e) => setChartZone(e.target.value === 'utc' ? 'utc' : 'local')}
          >
            <option value="local">Browser local time</option>
            <option value="utc">UTC</option>
          </select>
        </div>
        <div className="control-group control-group--batch-analysis-action">
          <span className="control-label-static" aria-hidden="true">
            Analysis
          </span>
          <button
            type="button"
            id="batch-analysis-perform-btn"
            className="btn-batch-analysis"
            disabled={!orgOk || loading || !onAnalysisTab}
            onClick={performBatchAnalysis}
          >
            Analyze Batches
          </button>
        </div>
      </section>

      <p className="batch-analysis-lede">
        Loads all <code>AsyncApexJob</code> batch rows via <strong>Bulk API 2.0</strong>{' '}
        (<code>sf data export bulk</code> to a temp CSV, then analyzed locally). Salesforce may retain only
        recent history (often on the order of days). This tab does not use the global polling interval or status line.
      </p>

      <section className="batch-analysis-metrics" aria-label="Batch analysis summary">
        <div className="batch-analysis-metric">
          <span className="batch-analysis-metric-label">Date range (job start)</span>
          <span className="batch-analysis-metric-value">
            {summary?.dateRangeMin != null && summary?.dateRangeMax != null
              ? (
              <>
                {formatDate(summary.dateRangeMin, chartZone === 'utc')}
                {' → '}
                {formatDate(summary.dateRangeMax, chartZone === 'utc')}
              </>
                )
              : '—'}
          </span>
        </div>
        <div className="batch-analysis-metric">
          <span className="batch-analysis-metric-label">Retrieved / executed</span>
          <span className="batch-analysis-metric-value">
            {summary != null
              ? `${summary.totalRetrieved.toLocaleString()} / ${summary.executedCount.toLocaleString()}`
              : '—'}
          </span>
          <span className="batch-analysis-metric-hint">All rows / terminal (completed, failed, aborted)</span>
        </div>
        <div className="batch-analysis-metric">
          <span className="batch-analysis-metric-label">Avg batch duration</span>
          <span className="batch-analysis-metric-value">
            {summary != null ? formatDurationMs(summary.overallAvgDurationMs) : '—'}
          </span>
          <span className="batch-analysis-metric-hint">Terminal jobs with start and end time</span>
        </div>
        <div className="batch-analysis-metric">
          <span className="batch-analysis-metric-label">Max execution time</span>
          <span className="batch-analysis-metric-value">
            {summary != null ? formatDurationMs(summary.maxDurationMs) : '—'}
          </span>
        </div>
      </section>

      <section className="table-section batch-analysis-section">
        {orgOk && loading && (
          <p className="batch-analysis-loading-banner" role="status">
            Running batch analysis…
          </p>
        )}

        {!orgOk && <p className="batch-analysis-placeholder">Select an environment to analyze batch history.</p>}
        {orgOk && !payload && !loading && (
          <p className="batch-analysis-placeholder">
            Click <strong>Analyze Batches</strong> to load results.
          </p>
        )}
        {orgOk && error != null && (
          <p className="batch-analysis-placeholder error" role="alert">
            {error}
          </p>
        )}

        {orgOk && payload != null && (
          <div className={'batch-analysis-body' + (loading ? ' batch-analysis-body--refreshing' : '')}>
            <div className="batch-analysis-block">
              <h3 className="batch-analysis-heading">Starts by day and hour</h3>
              <p className="batch-analysis-muted batch-analysis-chart-hint">
                Interactive heatmap (Apache ECharts). Click a cell to select that day for the line chart below.
              </p>
              <div className="batch-analysis-echart">
                <BatchHeatmapChart
                  heatmap={heatmap}
                  colors={chartColors}
                  jobStarts={jobStarts}
                  chartZone={chartZone}
                  onSelectDay={handleSelectDay}
                />
              </div>
            </div>

            <div className="batch-analysis-block">
              <h3 className="batch-analysis-heading">Batch starts per hour (one day)</h3>
              <div className="control-group analysis-day-picker">
                <label htmlFor="batch-analysis-day-select">Day</label>
                <select
                  id="batch-analysis-day-select"
                  aria-label="Day for hourly line chart"
                  disabled={analysisDays.length === 0 || loading}
                  value={resolvedDay ?? ''}
                  onChange={(e) => {
                    const day = e.target.value
                    if (day) handleSelectDay(day)
                    else setSelectedDay(null)
                  }}
                >
                  {analysisDays.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              {resolvedDay != null && (
                <div className="batch-analysis-echart">
                  <BatchHourlyLineChart
                    counts={hourlyForSelectedDay}
                    dayLabel={resolvedDay}
                    zoneLabel={zoneLabel}
                    colors={chartColors}
                    apexByHour={apexClassesByHourForDay}
                  />
                </div>
              )}
            </div>

            <div className="batch-analysis-block">
              <h3 className="batch-analysis-heading">Concurrent execution (one day)</h3>
              <p className="batch-analysis-muted batch-analysis-chart-hint">
                Plots each batch from <code>CreatedDate</code> (start) through <code>CompletedDate</code> (end).
                Each row is one Apex batch class; multiple runs of the same class share that row. The timeline
                shows the full 24-hour day. Use the horizontal slider below to zoom time; use the
                vertical slider on the right to zoom and scroll batch classes (Shift + mouse wheel also works).
              </p>
              {jobExecutions.length === 0 && (
                <p className="batch-analysis-muted batch-analysis-chart-hint" role="status">
                  No jobs with both start and end times were returned. Overlap charts need completed execution
                  intervals from the bulk export.
                </p>
              )}
              {resolvedDay != null && jobExecutions.length > 0 && (
                <>
                  <section className="controls controls-row batch-analysis-batch-filter">
                    <div className="control-group batch-analysis-multiselect-group">
                      <label htmlFor="batch-class-filter-search">Filter batch classes</label>
                      <input
                        id="batch-class-filter-search"
                        type="search"
                        placeholder="Search class name"
                        autoComplete="off"
                        disabled={loading || batchClassesOnDay.length === 0}
                        value={batchClassSearch}
                        onChange={(e) => setBatchClassSearch(e.target.value)}
                      />
                    </div>
                    <div className="control-group batch-analysis-multiselect-group">
                      <label htmlFor="batch-class-filter">Compare batch classes</label>
                      <select
                        id="batch-class-filter"
                        multiple
                        size={Math.min(10, Math.max(4, filteredBatchClassOptions.length || 4))}
                        className="batch-analysis-multiselect"
                        aria-label="Select batch classes to compare on overlap charts"
                        disabled={loading || batchClassesOnDay.length === 0}
                        value={Array.from(selectedBatchClasses)}
                        onChange={handleBatchClassFilterChange}
                      >
                        {filteredBatchClassOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <p className="batch-analysis-metric-hint">
                        {selectedBatchClasses.size === 0
                          ? 'Showing all batch classes on this day. Ctrl/Cmd+click to select a subset to compare.'
                          : `Comparing ${selectedBatchClasses.size} of ${batchClassesOnDay.length} batch class${batchClassesOnDay.length === 1 ? '' : 'es'}.`}
                      </p>
                      <div className="batch-analysis-filter-actions">
                        <button
                          type="button"
                          className="btn-batch-filter"
                          disabled={loading || batchClassesOnDay.length === 0}
                          onClick={selectAllBatchClasses}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="btn-batch-filter"
                          disabled={loading || selectedBatchClasses.size === 0}
                          onClick={clearBatchClassFilter}
                        >
                          Show all
                        </button>
                      </div>
                    </div>
                  </section>
                  <div className="batch-analysis-overlap-stats" aria-label="Overlap summary for selected day">
                    <div className="batch-analysis-metric">
                      <span className="batch-analysis-metric-label">Jobs running ({resolvedDay})</span>
                      <span className="batch-analysis-metric-value">
                        {jobsOnSelectedDay > 0 ? jobsOnSelectedDay.toLocaleString() : '—'}
                      </span>
                      <span className="batch-analysis-metric-hint">Batches active during this day (start → end)</span>
                    </div>
                    <div className="batch-analysis-metric">
                      <span className="batch-analysis-metric-label">Peak concurrent</span>
                      <span className="batch-analysis-metric-value">
                        {concurrencySeries.peak > 0 ? concurrencySeries.peak.toLocaleString() : '—'}
                      </span>
                    </div>
                    <div className="batch-analysis-metric">
                      <span className="batch-analysis-metric-label">Time at limit (≥5)</span>
                      <span className="batch-analysis-metric-value">
                        {concurrencySeries.minutesAtLimit > 0
                          ? formatDurationMs(concurrencySeries.minutesAtLimit * 60000)
                          : '—'}
                      </span>
                      <span className="batch-analysis-metric-hint">1-minute buckets at or above Salesforce limit</span>
                    </div>
                  </div>
                  <div className="batch-analysis-echart">
                    <BatchConcurrencyChart
                      series={concurrencySeries}
                      dayLabel={resolvedDay}
                      zoneLabel={zoneLabel}
                      chartZone={chartZone}
                      colors={chartColors}
                      executions={filteredExecutions}
                    />
                  </div>
                  <h4 className="batch-analysis-subheading">Execution timeline</h4>
                  <div className="batch-analysis-echart batch-analysis-echart--tall">
                    <BatchExecutionTimelineChart
                      gantt={ganttRows}
                      dayLabel={resolvedDay}
                      zoneLabel={zoneLabel}
                      chartZone={chartZone}
                      colors={chartColors}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="batch-analysis-block">
              <h3 className="batch-analysis-heading">Daily volume</h3>
              <p className="batch-analysis-muted batch-analysis-chart-hint">
                Click a bar to select that day for the hourly chart above.
              </p>
              <div className="batch-analysis-echart">
                <BatchDailyVolumeChart
                  rows={dailyVolume}
                  colors={chartColors}
                  onSelectDay={handleSelectDay}
                  selectedDay={resolvedDay}
                />
              </div>
            </div>

            <div className="batch-analysis-block">
              <h3 className="batch-analysis-heading">Duration by Apex class (completed jobs)</h3>
              <section className="controls controls-row batch-analysis-duration-filter">
                <div className="control-group">
                  <label htmlFor="duration-class-filter">Filter by class name</label>
                  <input
                    id="duration-class-filter"
                    type="search"
                    placeholder="Substring match"
                    autoComplete="off"
                    disabled={loading}
                    value={durationFilter}
                    onChange={(e) => setDurationFilter(e.target.value)}
                  />
                </div>
              </section>
              <div className="table-wrapper">
                <table className="jobs-table analysis-metrics-table">
                  <thead>
                    <tr>
                      <th scope="col">Apex class</th>
                      <th scope="col">Completed</th>
                      <th scope="col">Avg</th>
                      <th scope="col">p50</th>
                      <th scope="col">p90</th>
                      <th scope="col">p95</th>
                    </tr>
                  </thead>
                  <tbody>
                    {durationRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="batch-analysis-muted">
                          No completed batch jobs with measurable duration.
                        </td>
                      </tr>
                    )}
                    {durationRows.length > 0 && filteredDurationRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="batch-analysis-muted">
                          No classes match this filter.
                        </td>
                      </tr>
                    )}
                    {filteredDurationRows.map((row) => (
                      <tr key={row.apexClassName}>
                        <td>{row.apexClassName}</td>
                        <td>{row.completedCount.toLocaleString()}</td>
                        <td>{formatDurationMs(row.avgDurationMs)}</td>
                        <td>{formatDurationMs(row.p50Ms)}</td>
                        <td>{formatDurationMs(row.p90Ms)}</td>
                        <td>{formatDurationMs(row.p95Ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="batch-analysis-block">
              <h3 className="batch-analysis-heading">Failures by Apex class</h3>
              <div className="table-wrapper">
                <table className="jobs-table analysis-metrics-table">
                  <thead>
                    <tr>
                      <th scope="col">Apex class</th>
                      <th scope="col">Failures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failureGroups.length === 0 && (
                      <tr>
                        <td colSpan={2} className="batch-analysis-muted">
                          No failed batch jobs in retrieved history.
                        </td>
                      </tr>
                    )}
                    {failureGroups.map((row) => (
                      <tr key={row.apexClassName}>
                        <td>
                          <button
                            type="button"
                            className="schedule-name-trigger"
                            title="View failure messages"
                            onClick={() => openAnalysisFailuresModal(row.apexClassName, row.jobs)}
                          >
                            {row.apexClassName}
                          </button>
                        </td>
                        <td>{row.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </section>
  )
}
