import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTheme } from './theme-context'

describe('useTheme', () => {
  it('requires ThemeProvider context', () => {
    expect(() => {
      renderHook(() => useTheme())
    }).toThrow('useTheme must be used within a ThemeProvider')
  })
})
