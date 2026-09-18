'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
type ThemeMode = 'system' | Theme

const themeStorageKey = 'loutre-theme'

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function useTheme(): readonly [
  ThemeMode | null,
  Theme | null,
  (mode: ThemeMode) => void,
] {
  const [mode, setMode] = useState<ThemeMode | null>(null)
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const syncTheme = () => {
      const storedTheme = localStorage.getItem(themeStorageKey)
      setMode(
        storedTheme === 'light' || storedTheme === 'dark'
          ? storedTheme
          : 'system',
      )
      setTheme(
        document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      )
    }
    const syncSystemTheme = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(themeStorageKey) === null) {
        applyTheme(event.matches ? 'dark' : 'light')
        syncTheme()
      }
    }

    syncTheme()
    media.addEventListener('change', syncSystemTheme)

    return () => media.removeEventListener('change', syncSystemTheme)
  }, [])

  const selectTheme = (nextMode: ThemeMode) => {
    if (nextMode === 'system') {
      localStorage.removeItem(themeStorageKey)
      const nextTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches
        ? 'dark'
        : 'light'
      applyTheme(nextTheme)
      setMode('system')
      setTheme(nextTheme)
      return
    }

    localStorage.setItem(themeStorageKey, nextMode)
    applyTheme(nextMode)
    setMode(nextMode)
    setTheme(nextMode)
  }

  return [mode, theme, selectTheme] as const
}

export function ThemeToggle({
  darkLabel,
  lightLabel,
}: {
  readonly darkLabel: string
  readonly lightLabel: string
}) {
  const [, theme, selectTheme] = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? lightLabel : darkLabel

  return (
    <button
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink-soft transition hover:border-line-strong hover:bg-surface-muted hover:text-ink"
      type="button"
      onClick={() => selectTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      {isDark ? (
        <Sun size={15} aria-hidden="true" />
      ) : (
        <Moon size={15} aria-hidden="true" />
      )}
    </button>
  )
}

export function ThemePicker({
  systemLabel,
  lightLabel,
  darkLabel,
}: {
  readonly systemLabel: string
  readonly lightLabel: string
  readonly darkLabel: string
}) {
  const [mode, , selectTheme] = useTheme()

  return (
    <select
      className="h-10 w-full rounded-lg border border-line bg-surface-muted/45 px-3 text-xs font-medium text-ink outline-none transition focus:border-line-strong"
      value={mode ?? 'system'}
      onChange={(event) => selectTheme(event.target.value as ThemeMode)}
      aria-label="Theme"
    >
      <option value="system">{systemLabel}</option>
      <option value="light">{lightLabel}</option>
      <option value="dark">{darkLabel}</option>
    </select>
  )
}
