/** Theme (dark/light) persistence and application. */

import { THEME_STORAGE_KEY } from './constants.js'

export function getTheme () {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY)
    if (t === 'dark' || t === 'light') return t
  } catch (_) {}
  return 'dark'
}

export function setTheme (theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch (_) {}
}

export function applyTheme (theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function updateThemeButton (themeToggle) {
  if (!themeToggle) return
  const theme = document.documentElement.getAttribute('data-theme') || 'dark'
  if (theme === 'dark') {
    themeToggle.textContent = '☀'
    themeToggle.setAttribute('aria-label', 'Switch to light theme')
    themeToggle.setAttribute('title', 'Switch to light theme')
  } else {
    themeToggle.textContent = '🌙'
    themeToggle.setAttribute('aria-label', 'Switch to dark theme')
    themeToggle.setAttribute('title', 'Switch to dark theme')
  }
}

export function toggleTheme (themeToggle) {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark'
  const next = theme === 'dark' ? 'light' : 'dark'
  setTheme(next)
  applyTheme(next)
  updateThemeButton(themeToggle)
}
