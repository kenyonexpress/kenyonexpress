import { describe, expect, it, vi } from 'vitest'
import { useTranslation, useTranslations } from './use-translations'

vi.mock('next-intl', () => ({
  useTranslations: vi.fn((namespace?: string) => {
    return (key: string) => {
      if (namespace) {
        return `${namespace}.${key}`
      }
      return key
    }
  }),
}))

describe('useTranslations', () => {
  it('should call next-intl useTranslations with namespace', () => {
    const t = useTranslations('nav')
    expect(t).toBeDefined()
  })

  it('should work without namespace', () => {
    const t = useTranslations()
    expect(t).toBeDefined()
  })
})

describe('useTranslation', () => {
  it('should translate a key', () => {
    const result = useTranslation('home')
    expect(result).toBe('home')
  })

  it('should translate a key with namespace', () => {
    const result = useTranslation('home', 'nav')
    expect(result).toBe('nav.home')
  })
})
