import { useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'

export interface ChartColors {
  accent: string
  text: string
  textMuted: string
  border: string
  surface: string
  warning: string
  error: string
}

/** CSS variables from the active theme (dark/light) for ECharts styling. */
export function useChartTheme (): ChartColors {
  const theme = useAppStore((s) => s.theme)
  return useMemo(() => {
    void theme
    const root = document.documentElement
    const s = getComputedStyle(root)
    return {
      accent: s.getPropertyValue('--accent').trim() || '#58a6ff',
      text: s.getPropertyValue('--text').trim() || '#e6edf3',
      textMuted: s.getPropertyValue('--text-muted').trim() || '#8b949e',
      border: s.getPropertyValue('--border').trim() || '#30363d',
      surface: s.getPropertyValue('--surface').trim() || '#161b22',
      warning: s.getPropertyValue('--warning').trim() || '#d29922',
      error: s.getPropertyValue('--error').trim() || '#f85149'
    }
  }, [theme])
}
