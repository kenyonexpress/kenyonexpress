'use client'

import { type Theme, ThemeContext } from '@/lib/theme/theme-context'
import { type ReactNode, useEffect, useState } from 'react'

const THEME_STORAGE_KEY = 'ke-theme'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage may not be available in some environments
  }

  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme())

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    // Also update the dark class for Tailwind CSS dark mode support
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    // Update dark class for Tailwind CSS
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
