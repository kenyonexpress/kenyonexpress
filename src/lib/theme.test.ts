import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  getTheme,
  saveTheme,
} from './theme'

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')

    // Mock matchMedia for jsdom environment
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation((query) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })
    }
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  describe('getSystemTheme', () => {
    it('should return a valid theme', () => {
      const theme = getSystemTheme()
      expect(['light', 'dark']).toContain(theme)
    })
  })

  describe('getStoredTheme', () => {
    it('should return null when nothing is stored', () => {
      const theme = getStoredTheme()
      expect(theme).toBeNull()
    })

    it('should return stored dark theme', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark')
      const theme = getStoredTheme()
      expect(theme).toBe('dark')
    })

    it('should return stored light theme', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light')
      const theme = getStoredTheme()
      expect(theme).toBe('light')
    })

    it('should return null for invalid stored value', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
      const theme = getStoredTheme()
      expect(theme).toBeNull()
    })
  })

  describe('getTheme', () => {
    it('should return stored theme if available', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark')
      const theme = getTheme()
      expect(theme).toBe('dark')
    })

    it('should return valid theme if nothing is stored', () => {
      const theme = getTheme()
      expect(['light', 'dark']).toContain(theme)
    })
  })

  describe('applyTheme', () => {
    it('should add dark class when applying dark theme', () => {
      applyTheme('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('should remove dark class when applying light theme', () => {
      document.documentElement.classList.add('dark')
      applyTheme('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  describe('saveTheme', () => {
    it('should save dark theme to localStorage and apply it', () => {
      saveTheme('dark')
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('should save light theme to localStorage and apply it', () => {
      document.documentElement.classList.add('dark')
      saveTheme('light')
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })
})
