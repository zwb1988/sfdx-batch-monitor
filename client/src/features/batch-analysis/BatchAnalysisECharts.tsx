import type { EChartsOption } from 'echarts'
import { useMemo, type JSX } from 'react'
import ReactECharts from 'echarts-for-react'
import type { ChartColors } from './useChartTheme'
import type {
  ApexClassHourRank,
  ChartTimeZone,
  DailyVolumeRow,
  DayHourHeatmap
} from '../../utils/batchAnalysisBuckets'
import { buildTopApexClassesForDayHour } from '../../utils/batchAnalysisBuckets'
import type { BatchJobExecution } from '../../types'
import type { ConcurrencySeries, GanttRowsResult } from '../../utils/batchAnalysisConcurrency'
import {
  SF_BATCH_CONCURRENCY_LIMIT,
  activeJobsAtTime,
  barColorForStatus
} from '../../utils/batchAnalysisConcurrency'
import { formatDate, formatDurationMs } from '../../utils/format'

function heatmapOption (
  heatmap: DayHourHeatmap,
  colors: ChartColors,
  jobStarts: Array<{ startedAt: string; apexClassName: string }>,
  zone: ChartTimeZone
): EChartsOption {
  const hourLabels = Array.from({ length: 24 }, (_, i) => String(i))
  const data = heatmap.counts.flatMap((row, di) =>
    row.map((c, hi) => [hi, di, c] as [number, number, number])
  )
  const vmax = Math.max(1, heatmap.maxCount)

  return {
    backgroundColor: 'transparent',
    textStyle: { color: colors.text },
    tooltip: {
      position: 'top',
      confine: true,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      extraCssText: 'max-width:26rem;white-space:normal',
      formatter (params: unknown): string {
        const p = params as { value?: [number, number, number] }
        const v = p.value
        if (!v || !Array.isArray(v)) return ''
        const [h, d, n] = v
        const day = heatmap.days[d]
        if (day == null) return ''
        let html = `<div><strong>${escapeTooltipHtml(day)}</strong><br/>${h}:00 — ${n} start${n === 1 ? '' : 's'}</div>`
        const top = buildTopApexClassesForDayHour(jobStarts, zone, day, h, 20)
        if (top.length > 0) {
          html +=
            '<div style="margin-top:6px;font-size:12px;opacity:0.92">Top Apex classes (up to 20):</div><ol style="margin:4px 0 0 18px;padding:0">'
          for (const row of top) {
            html += `<li style="margin:2px 0">${escapeTooltipHtml(row.apexClassName)} — ${row.count}</li>`
          }
          html += '</ol>'
        }
        return html
      }
    },
    grid: { left: 72, right: 16, top: 16, bottom: 72, containLabel: false },
    xAxis: {
      type: 'category',
      data: hourLabels,
      name: 'Hour',
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: colors.textMuted },
      axisLabel: { color: colors.textMuted, fontSize: 10 },
      axisLine: { lineStyle: { color: colors.border } },
      splitArea: { show: true, areaStyle: { color: ['transparent', 'rgba(128,128,128,0.04)'] } }
    },
    yAxis: {
      type: 'category',
      data: heatmap.days,
      axisLabel: { color: colors.textMuted, fontSize: 11 },
      axisLine: { lineStyle: { color: colors.border } },
      splitArea: { show: true, areaStyle: { color: ['transparent', 'rgba(128,128,128,0.04)'] } }
    },
    visualMap: {
      min: 0,
      max: vmax,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 12,
      itemWidth: 14,
      itemHeight: 120,
      inRange: {
        color: ['#fffde7', '#fff176', '#ffeb3b', '#ff9800', '#f44336', '#b71c1c']
      },
      textStyle: { color: colors.textMuted },
      text: ['High', 'Low']
    },
    series: [
      {
        type: 'heatmap',
        data,
        emphasis: {
          itemStyle: {
            shadowBlur: 8,
            shadowColor: colors.accent
          }
        },
        progressive: 0,
        animation: false
      }
    ]
  }
}

function escapeTooltipHtml (s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function hourlyLineOption (
  counts: number[],
  dayLabel: string,
  zoneLabel: string,
  colors: ChartColors,
  apexByHour: Map<number, ApexClassHourRank[]>
): EChartsOption {
  const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}`)
  return {
    backgroundColor: 'transparent',
    title: {
      text: `${dayLabel} (${zoneLabel})`,
      left: 0,
      top: 0,
      textStyle: { color: colors.textMuted, fontSize: 12, fontWeight: 'normal' }
    },
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      extraCssText: 'max-width:24rem;white-space:normal',
      formatter (params: unknown): string {
        const arr = params as Array<{ axisValue: string; data: number }>
        const first = arr[0]
        if (!first) return ''
        const hour = parseInt(first.axisValue, 10)
        const total = first.data
        const top = Number.isFinite(hour) ? apexByHour.get(hour) ?? [] : []
        let html =
          `<div><strong>${first.axisValue}:00</strong> — ${total} start${total === 1 ? '' : 's'}</div>`
        if (top.length > 0) {
          html += `<div style="margin-top:6px;opacity:0.92;font-size:12px">Most starts by Apex class (top 20):</div>`
          html += '<ol style="margin:4px 0 0 18px;padding:0">'
          for (const row of top) {
            html += `<li style="margin:2px 0">${escapeTooltipHtml(row.apexClassName)} — ${row.count}</li>`
          }
          html += '</ol>'
        }
        return html
      }
    },
    grid: { left: 44, right: 20, top: 40, bottom: 28 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: hourLabels,
      name: 'Hour',
      nameLocation: 'middle',
      nameGap: 22,
      nameTextStyle: { color: colors.textMuted },
      axisLabel: { color: colors.textMuted, fontSize: 10 },
      axisLine: { lineStyle: { color: colors.border } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: colors.border, type: 'dashed' } },
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } }
    },
    series: [
      {
        type: 'line',
        data: counts,
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2.5, color: colors.accent },
        itemStyle: { color: colors.accent, borderColor: colors.surface, borderWidth: 1 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: hexWithAlpha(colors.accent, 0.35) },
              { offset: 1, color: hexWithAlpha(colors.accent, 0.03) }
            ]
          }
        }
      }
    ]
  }
}

/** Rough alpha overlay for area fill when accent is hex or rgb. */
function hexWithAlpha (color: string, alpha: number): string {
  const c = color.trim()
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    if (c.length === 7) {
      const r = parseInt(c.slice(1, 3), 16)
      const g = parseInt(c.slice(3, 5), 16)
      const b = parseInt(c.slice(5, 7), 16)
      return `rgba(${r},${g},${b},${alpha})`
    }
  }
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`
  return color
}

function dailyVolumeBarOption (
  rows: DailyVolumeRow[],
  colors: ChartColors,
  selectedDay: string | null
): EChartsOption {
  const dates = rows.map((r) => r.date)
  const maxVal = Math.max(1, ...rows.map((r) => r.count))

  return {
    backgroundColor: 'transparent',
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text }
    },
    grid: { left: 92, right: 28, top: 16, bottom: 24 },
    xAxis: {
      type: 'value',
      max: maxVal,
      splitLine: { lineStyle: { color: colors.border } },
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } }
    },
    yAxis: {
      type: 'category',
      data: dates,
      inverse: true,
      axisLabel: { color: colors.textMuted, fontSize: 11 },
      axisLine: { lineStyle: { color: colors.border } }
    },
    series: [
      {
        type: 'bar',
        data: rows.map((r) => ({
          value: r.count,
          itemStyle:
            r.date === selectedDay
              ? {
                  color: colors.accent,
                  borderColor: colors.accent,
                  borderWidth: 1,
                  shadowBlur: 10,
                  shadowColor: colors.accent
                }
              : {
                  color: colors.accent,
                  opacity: 0.82,
                  borderRadius: [0, 4, 4, 0]
                }
        })),
        barMaxWidth: 22
      }
    ]
  }
}

export function BatchHeatmapChart ({
  heatmap,
  colors,
  jobStarts,
  chartZone,
  onSelectDay
}: {
  heatmap: DayHourHeatmap
  colors: ChartColors
  jobStarts: Array<{ startedAt: string; apexClassName: string }>
  chartZone: ChartTimeZone
  onSelectDay: (day: string) => void
}): JSX.Element {
  const option = useMemo(
    () => heatmapOption(heatmap, colors, jobStarts, chartZone),
    [heatmap, colors, jobStarts, chartZone]
  )
  const height = Math.min(640, Math.max(300, heatmap.days.length * 26 + 160))

  const onEvents = useMemo(
    () => ({
      click (params: unknown): void {
        const p = params as { componentType?: string; seriesType?: string; value?: [number, number, number] }
        if (p.componentType !== 'series' || p.seriesType !== 'heatmap') return
        const v = p.value
        if (!v || !Array.isArray(v)) return
        const dayIdx = v[1]
        const day = heatmap.days[dayIdx]
        if (day != null) onSelectDay(day)
      }
    }),
    [heatmap.days, onSelectDay]
  )

  if (heatmap.days.length === 0) {
    return <p className="batch-analysis-muted">No job starts in range.</p>
  }

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%', minHeight: 280 }}
      opts={{ renderer: 'canvas' }}
      notMerge
      lazyUpdate
      onEvents={onEvents}
    />
  )
}

export function BatchHourlyLineChart ({
  counts,
  dayLabel,
  zoneLabel,
  colors,
  apexByHour
}: {
  counts: number[]
  dayLabel: string
  zoneLabel: string
  colors: ChartColors
  apexByHour: Map<number, ApexClassHourRank[]>
}): JSX.Element {
  const option = useMemo(
    () => hourlyLineOption(counts, dayLabel, zoneLabel, colors, apexByHour),
    [counts, dayLabel, zoneLabel, colors, apexByHour]
  )

  return (
    <ReactECharts
      option={option}
      style={{ height: 260, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
      lazyUpdate
    />
  )
}

export function BatchDailyVolumeChart ({
  rows,
  colors,
  onSelectDay,
  selectedDay
}: {
  rows: DailyVolumeRow[]
  colors: ChartColors
  onSelectDay: (day: string) => void
  selectedDay: string | null
}): JSX.Element {
  const option = useMemo(
    () => dailyVolumeBarOption(rows, colors, selectedDay),
    [rows, colors, selectedDay]
  )

  const onEvents = useMemo(
    () => ({
      click (params: unknown): void {
        const p = params as { componentType?: string; seriesType?: string; dataIndex?: number }
        if (p.componentType !== 'series' || p.seriesType !== 'bar') return
        const idx = p.dataIndex
        if (typeof idx !== 'number' || idx < 0 || idx >= rows.length) return
        onSelectDay(rows[idx].date)
      }
    }),
    [rows, onSelectDay]
  )

  if (rows.length === 0) {
    return <p className="batch-analysis-muted">No job starts in range.</p>
  }

  const height = Math.min(520, Math.max(220, rows.length * 28 + 80))

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%', minHeight: 200 }}
      opts={{ renderer: 'canvas' }}
      notMerge
      lazyUpdate
      onEvents={onEvents}
    />
  )
}

function formatTimeAxisLabel (ms: number, zone: ChartTimeZone): string {
  const d = new Date(ms)
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  if (zone === 'utc') opts.timeZone = 'UTC'
  return d.toLocaleTimeString(undefined, opts)
}

function concurrencyOption (
  series: ConcurrencySeries,
  dayLabel: string,
  zoneLabel: string,
  zone: ChartTimeZone,
  colors: ChartColors,
  executions: BatchJobExecution[]
): EChartsOption {
  const baseData = series.timestamps.map((t, i) => [t, Math.min(series.counts[i], SF_BATCH_CONCURRENCY_LIMIT)] as [number, number])
  const overData = series.timestamps.map((t, i) => [t, Math.max(0, series.counts[i] - SF_BATCH_CONCURRENCY_LIMIT)] as [number, number])
  const yMax = Math.max(SF_BATCH_CONCURRENCY_LIMIT + 1, series.peak, 1)
  const hasDayRange = series.dayEnd > series.dayStart

  return {
    backgroundColor: 'transparent',
    title: {
      text: `${dayLabel} (${zoneLabel})`,
      left: 0,
      top: 0,
      textStyle: { color: colors.textMuted, fontSize: 12, fontWeight: 'normal' }
    },
    textStyle: { color: colors.text },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      extraCssText: 'max-width:24rem;white-space:normal',
      formatter (params: unknown): string {
        const arr = params as Array<{ axisValue: number; data: [number, number]; seriesName?: string }>
        const first = arr[0]
        if (!first) return ''
        const tMs = first.data[0]
        const base = arr.find((p) => p.seriesName === 'At limit')?.data[1] ?? 0
        const over = arr.find((p) => p.seriesName === 'Over limit')?.data[1] ?? 0
        const total = base + over
        const timeLabel = formatTimeAxisLabel(tMs, zone)
        let html = `<div><strong>${escapeTooltipHtml(timeLabel)}</strong> — ${total} concurrent job${total === 1 ? '' : 's'}</div>`
        if (total >= SF_BATCH_CONCURRENCY_LIMIT) {
          html += `<div style="margin-top:4px;color:${colors.error}">At or above Salesforce limit (${SF_BATCH_CONCURRENCY_LIMIT})</div>`
        }
        const active = activeJobsAtTime(executions, zone, dayLabel, tMs, 10)
        if (active.length > 0) {
          html += '<div style="margin-top:6px;font-size:12px;opacity:0.92">Running Apex classes:</div><ol style="margin:4px 0 0 18px;padding:0">'
          for (const row of active) {
            html += `<li style="margin:2px 0">${escapeTooltipHtml(row.apexClassName)} — ${row.count}</li>`
          }
          html += '</ol>'
        }
        return html
      }
    },
    legend: {
      data: ['At limit', 'Over limit'],
      top: 0,
      right: 0,
      textStyle: { color: colors.textMuted, fontSize: 11 }
    },
    grid: { left: 44, right: 20, top: 48, bottom: 36 },
    xAxis: {
      type: 'time',
      min: hasDayRange ? series.dayStart : undefined,
      max: hasDayRange ? series.dayEnd : undefined,
      axisLabel: {
        color: colors.textMuted,
        fontSize: 10,
        hideOverlap: true,
        formatter (value: number): string {
          return formatTimeAxisLabel(value, zone)
        }
      },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.border, type: 'dashed' } },
      minInterval: 3600 * 1000
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: yMax,
      minInterval: 1,
      name: 'Concurrent',
      nameTextStyle: { color: colors.textMuted },
      splitLine: { lineStyle: { color: colors.border, type: 'dashed' } },
      axisLabel: { color: colors.textMuted },
      axisLine: { lineStyle: { color: colors.border } }
    },
    series: [
      {
        name: 'At limit',
        type: 'line',
        stack: 'concurrency',
        data: baseData,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: colors.accent },
        itemStyle: { color: colors.accent },
        areaStyle: { color: hexWithAlpha(colors.accent, 0.35) },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: colors.warning, type: 'dashed', width: 1.5 },
          label: {
            formatter: 'Salesforce limit (' + SF_BATCH_CONCURRENCY_LIMIT + ')',
            color: colors.warning,
            fontSize: 11
          },
          data: [{ yAxis: SF_BATCH_CONCURRENCY_LIMIT }]
        },
        animation: false
      },
      {
        name: 'Over limit',
        type: 'line',
        stack: 'concurrency',
        data: overData,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: colors.error },
        itemStyle: { color: colors.error },
        areaStyle: { color: hexWithAlpha(colors.error, 0.45) },
        animation: false
      }
    ]
  }
}

function ganttTimelineOption (
  gantt: GanttRowsResult,
  dayLabel: string,
  zoneLabel: string,
  zone: ChartTimeZone,
  colors: ChartColors,
  chartHeight: number
): EChartsOption {
  const gridTop = 40
  const gridBottom = 56
  const plotHeight = Math.max(chartHeight - gridTop - gridBottom, 80)
  const laneCount = Math.max(gantt.lanes.length, 1)
  const labelFontSize = Math.max(7, Math.min(10, Math.floor(plotHeight / laneCount / 2.4)))
  const longestLabel = Math.max(...gantt.lanes.map((l) => l.length), 8)
  const labelColumnWidth = Math.min(360, Math.max(168, Math.ceil(longestLabel * labelFontSize * 0.58)))
  /** Gap between y-axis labels and the plot area so bars never overlap names. */
  const plotLabelGap = 14
  const gridLeft = labelColumnWidth + plotLabelGap
  /** When many batch classes, start zoomed in so row labels stay readable. */
  const visibleLanesTarget = 14
  const initialYEnd =
    laneCount <= visibleLanesTarget ? 100 : Math.min(100, Math.round((visibleLanesTarget / laneCount) * 100))
  const ySliderWidth = laneCount > 1 ? 16 : 0
  const gridRight = 28 + ySliderWidth + 8

  const plainData = gantt.segments.map((seg) => [
    seg.laneIndex,
    seg.startMs,
    seg.endMs,
    seg.apexClassName,
    seg.status,
    seg.startedAt,
    seg.completedAt,
    seg.id
  ])

  return {
    backgroundColor: 'transparent',
    title: {
      text: `${dayLabel} (${zoneLabel}) — ${gantt.totalExecutions} execution${gantt.totalExecutions === 1 ? '' : 's'}, ${gantt.lanes.length} batch class${gantt.lanes.length === 1 ? '' : 'es'}`,
      left: 0,
      top: 0,
      textStyle: { color: colors.textMuted, fontSize: 12, fontWeight: 'normal' }
    },
    textStyle: { color: colors.text },
    tooltip: {
      confine: true,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text },
      extraCssText: 'max-width:26rem;white-space:normal',
      formatter (params: unknown): string {
        const p = params as { data?: unknown[] | { value?: unknown[] } }
        const raw = p.data
        const v = Array.isArray(raw) ? raw : (raw as { value?: unknown[] })?.value
        if (!v || !Array.isArray(v)) return ''
        const [, startMs, endMs, apexClassName, status, startedAt, completedAt, id] = v
        const duration = typeof startMs === 'number' && typeof endMs === 'number' ? endMs - startMs : null
        let html = `<div><strong>${escapeTooltipHtml(String(apexClassName ?? '—'))}</strong></div>`
        if (id) html += `<div>Job Id: ${escapeTooltipHtml(String(id))}</div>`
        html += `<div>Status: ${escapeTooltipHtml(String(status ?? '—'))}</div>`
        html += `<div>Start: ${escapeTooltipHtml(formatDate(String(startedAt ?? ''), zone === 'utc'))}</div>`
        html += `<div>End: ${escapeTooltipHtml(formatDate(String(completedAt ?? ''), zone === 'utc'))}</div>`
        html += `<div>Duration: ${escapeTooltipHtml(formatDurationMs(duration))}</div>`
        return html
      }
    },
    grid: { left: gridLeft, right: gridRight, top: gridTop, bottom: gridBottom },
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        filterMode: 'none',
        start: 0,
        end: 100,
        height: 22,
        bottom: 8,
        borderColor: colors.border,
        fillerColor: hexWithAlpha(colors.accent, 0.15),
        handleStyle: { color: colors.accent },
        textStyle: { color: colors.textMuted }
      },
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        start: 0,
        end: 100
      },
      ...(laneCount > 1
        ? [
            {
              type: 'slider' as const,
              yAxisIndex: 0,
              filterMode: 'none' as const,
              orient: 'vertical' as const,
              right: 4,
              width: ySliderWidth,
              start: 0,
              end: initialYEnd,
              borderColor: colors.border,
              fillerColor: hexWithAlpha(colors.accent, 0.15),
              handleStyle: { color: colors.accent },
              textStyle: { color: colors.textMuted },
              brushSelect: false
            },
            {
              type: 'inside' as const,
              yAxisIndex: 0,
              filterMode: 'none' as const,
              start: 0,
              end: initialYEnd,
              zoomOnMouseWheel: 'shift' as const,
              moveOnMouseWheel: false,
              moveOnMouseMove: true
            }
          ]
        : [])
    ],
    xAxis: {
      type: 'time',
      min: gantt.dayStart,
      max: gantt.dayEnd,
      axisLabel: {
        color: colors.textMuted,
        fontSize: 10,
        hideOverlap: true,
        formatter (value: number): string {
          return formatTimeAxisLabel(value, zone)
        }
      },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.border, type: 'dashed' } },
      minInterval: 3600 * 1000
    },
    yAxis: {
      type: 'category',
      data: gantt.lanes,
      inverse: true,
      boundaryGap: true,
      axisLabel: {
        show: true,
        interval: 0,
        color: colors.textMuted,
        fontSize: labelFontSize,
        width: labelColumnWidth - 12,
        overflow: 'truncate',
        align: 'right',
        verticalAlign: 'middle',
        margin: 8
      },
      axisTick: {
        alignWithLabel: true,
        lineStyle: { color: colors.border }
      },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { show: false }
    },
    series: [
      {
        type: 'custom',
        name: 'Execution',
        dimensions: ['laneIndex', 'start', 'end'],
        clip: true,
        renderItem (params: unknown, api: unknown) {
          const p = params as {
            dataIndex?: number
            coordSys?: { x: number; y: number; width: number; height: number }
          }
          const a = api as {
            value: (dim: number) => unknown
            coord: (val: [number, number]) => [number, number]
            size: (val: [number, number]) => [number, number]
          }
          if (typeof p.dataIndex !== 'number') return undefined
          const startMs = Number(a.value(1))
          const endMs = Number(a.value(2))
          const categoryIndex = Number(a.value(0))
          const status = String(a.value(4) ?? '')
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(categoryIndex)) {
            return undefined
          }
          const start = a.coord([startMs, categoryIndex])
          const end = a.coord([endMs, categoryIndex])
          if (!Number.isFinite(start[0]) || !Number.isFinite(start[1]) || !Number.isFinite(end[0])) {
            return undefined
          }
          const bandHeight = a.size([0, 1])[1]
          const height = Math.max(bandHeight * 0.65, 4)
          const width = Math.max(end[0] - start[0], 3)
          const cs = p.coordSys
          let x = start[0]
          let y = start[1] - height / 2
          let w = width
          let h = height
          if (cs) {
            const plotLeft = cs.x + 1
            const plotRight = cs.x + cs.width
            const plotTop = cs.y
            const plotBottom = cs.y + cs.height
            const right = x + w
            const bottom = y + h
            x = Math.max(x, plotLeft)
            y = Math.max(y, plotTop)
            w = Math.min(right, plotRight) - x
            h = Math.min(bottom, plotBottom) - y
            if (w <= 0 || h <= 0) return undefined
          }
          return {
            type: 'rect' as const,
            shape: { x, y, width: w, height: h },
            style: {
              fill: barColorForStatus(status, colors),
              opacity: 0.9
            }
          }
        },
        encode: { x: [1, 2], y: 0 },
        data: plainData,
        animation: false,
        z: 2
      }
    ] as EChartsOption['series']
  }
}

export function BatchConcurrencyChart ({
  series,
  dayLabel,
  zoneLabel,
  chartZone,
  colors,
  executions
}: {
  series: ConcurrencySeries
  dayLabel: string
  zoneLabel: string
  chartZone: ChartTimeZone
  colors: ChartColors
  executions: BatchJobExecution[]
}): JSX.Element {
  const option = useMemo(
    () => concurrencyOption(series, dayLabel, zoneLabel, chartZone, colors, executions),
    [series, dayLabel, zoneLabel, chartZone, colors, executions]
  )

  if (series.timestamps.length === 0) {
    return <p className="batch-analysis-muted">No completed execution intervals overlap this day.</p>
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 280, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
      lazyUpdate
    />
  )
}

export const GANTT_TIMELINE_HEIGHT = 600

export function BatchExecutionTimelineChart ({
  gantt,
  dayLabel,
  zoneLabel,
  chartZone,
  colors
}: {
  gantt: GanttRowsResult
  dayLabel: string
  zoneLabel: string
  chartZone: ChartTimeZone
  colors: ChartColors
}): JSX.Element {
  const option = useMemo(
    () => ganttTimelineOption(gantt, dayLabel, zoneLabel, chartZone, colors, GANTT_TIMELINE_HEIGHT),
    [gantt, dayLabel, zoneLabel, chartZone, colors]
  )

  if (gantt.segments.length === 0) {
    return <p className="batch-analysis-muted">No completed execution intervals overlap this day.</p>
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: GANTT_TIMELINE_HEIGHT, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
      lazyUpdate
    />
  )
}
