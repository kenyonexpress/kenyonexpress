'use client'

import { applyTheme, getTheme } from '@/lib/theme'
import type React from 'react'
import { useEffect } from 'react'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const theme = getTheme()
    applyTheme(theme)
  }, [])

  return <>{children}</>
}
