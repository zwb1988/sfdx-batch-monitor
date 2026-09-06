import type { JSX } from 'react'

/** Activity/gauge glyph representing the Monitoring category. */
export function MonitoringIcon (): JSX.Element {
  return (
    <svg
      className="sidebar-category-icon-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}
