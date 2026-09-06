import type { JSX } from 'react'

/** Cloud/database glyph representing the Data Cloud category. */
export function DataCloudIcon (): JSX.Element {
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
      <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4-1.5A4 4 0 0 0 6.5 19h11z" />
      <ellipse cx="12" cy="19.5" rx="5" ry="1.5" opacity="0.55" />
    </svg>
  )
}
