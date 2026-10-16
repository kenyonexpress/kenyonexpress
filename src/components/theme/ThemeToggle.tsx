'use client'

import { Moon, Sun } from '@/components/icons'
import { useTheme } from '@/lib/theme/theme-context'

const LABELS = {
  light: 'עבור למצב כהה',
  dark: 'עבור למצב בהיר',
} as const

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const label = LABELS[theme]

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center gap-1.5 transition-colors hover:text-heading-hover"
      aria-label={label}
      title={label}
    >
      {theme === 'light' ? (
        <Moon size={16} strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Sun size={16} strokeWidth={1.8} aria-hidden="true" />
      )}
      <span>{theme === 'light' ? 'כהה' : 'בהיר'}</span>
    </button>
  )
}
