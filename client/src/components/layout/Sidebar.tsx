import { useState, type JSX } from 'react'
import { NAV_CATEGORIES, type NavCategory } from '../../config/navigation'
import { LeaveTabModal } from '../../features/modals/LeaveTabModal'
import { useAppStore } from '../../stores/appStore'
import type { CategoryId, TabId } from '../../types'
import { DataCloudIcon } from '../ui/DataCloudIcon'
import { MonitoringIcon } from '../ui/MonitoringIcon'

const CATEGORY_ICONS: Record<CategoryId, () => JSX.Element> = {
  monitoring: MonitoringIcon,
  'data-cloud': DataCloudIcon
}

function initialExpanded (activeCategory: CategoryId): Record<CategoryId, boolean> {
  const state = {} as Record<CategoryId, boolean>
  for (const category of NAV_CATEGORIES) {
    state[category.id] = category.id === activeCategory
  }
  return state
}

export function Sidebar (): JSX.Element {
  const activeCategory = useAppStore((s) => s.activeCategory)
  const activeTab = useAppStore((s) => s.activeTab)
  const lastTabByCategory = useAppStore((s) => s.lastTabByCategory)
  const setActiveCategory = useAppStore((s) => s.setActiveCategory)
  const selectTool = useAppStore((s) => s.selectTool)

  const [expanded, setExpanded] = useState<Record<CategoryId, boolean>>(() => initialExpanded(activeCategory))
  const [pendingNav, setPendingNav] = useState<{ category: CategoryId, tab: TabId, expand: boolean } | null>(null)

  function trySelectTool (category: CategoryId, tab: TabId, expand = false): void {
    if (activeTab === 'data-cloud-csv-ingest' && tab !== 'data-cloud-csv-ingest') {
      setPendingNav({ category, tab, expand })
      return
    }
    selectTool(category, tab)
    if (expand) setExpanded((prev) => ({ ...prev, [category]: true }))
  }

  function onCategoryClick (category: NavCategory): void {
    const hasTools = category.tools.length > 0
    if (!hasTools) {
      setActiveCategory(category.id)
      return
    }

    const remembered = lastTabByCategory[category.id]
    const tab = category.tools.some((t) => t.id === remembered)
      ? remembered
      : category.tools[0].id

    if (activeCategory === category.id && activeTab === tab) {
      setExpanded((prev) => ({ ...prev, [category.id]: !prev[category.id] }))
      return
    }

    trySelectTool(category.id, tab, true)
  }

  return (
    <nav className="sidebar" aria-label="Tool categories">
      {NAV_CATEGORIES.map((category) => {
        const Icon = CATEGORY_ICONS[category.id]
        const isCategoryActive = activeCategory === category.id
        const isExpanded = expanded[category.id] ?? false
        const hasTools = category.tools.length > 0
        const toolsId = 'sidebar-tools-' + category.id

        return (
          <div key={category.id} className="sidebar-category">
            <button
              type="button"
              className={'sidebar-category-header' + (isCategoryActive ? ' is-active' : '')}
              aria-expanded={hasTools ? isExpanded : undefined}
              aria-controls={hasTools ? toolsId : undefined}
              onClick={() => onCategoryClick(category)}
            >
              <span className="sidebar-category-icon" aria-hidden="true">
                <Icon />
              </span>
              <span className="sidebar-category-label">{category.label}</span>
              {hasTools && (
                <span className={'sidebar-chevron' + (isExpanded ? ' is-expanded' : '')} aria-hidden="true">
                  ›
                </span>
              )}
            </button>

            {hasTools && (
              <div id={toolsId} className={'sidebar-tools-wrap' + (isExpanded ? ' is-expanded' : '')}>
                <ul className="sidebar-tools">
                  {category.tools.map((tool) => {
                    const isToolActive = isCategoryActive && activeTab === tool.id
                    return (
                      <li key={tool.id}>
                        <button
                          type="button"
                          id={'tab-' + tool.id}
                          className={'sidebar-tool' + (isToolActive ? ' is-active' : '')}
                          aria-current={isToolActive ? 'page' : undefined}
                          onClick={() => trySelectTool(category.id, tool.id)}
                        >
                          {tool.label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )
      })}
      <LeaveTabModal
        open={pendingNav != null}
        onCancel={() => setPendingNav(null)}
        onConfirm={() => {
          if (pendingNav) {
            selectTool(pendingNav.category, pendingNav.tab)
            if (pendingNav.expand) {
              setExpanded((prev) => ({ ...prev, [pendingNav.category]: true }))
            }
          }
          setPendingNav(null)
        }}
      />
    </nav>
  )
}
