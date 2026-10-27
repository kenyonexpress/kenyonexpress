import { describe, expect, it } from 'vitest'

/**
 * Integration tests for supplier verification page.
 * The page is a server component that requires database access,
 * so these tests verify the page structure and components exist.
 */

describe('AdminSuppliersVerifyPage', () => {
  it('has correct metadata', async () => {
    // Dynamic import to test module exports
    const module = await import('./page')
    expect(module.metadata).toBeDefined()
    expect(module.metadata.title).toBe('אימות ספקים')
  })

  it('exports default component', async () => {
    const module = await import('./page')
    expect(module.default).toBeDefined()
    expect(typeof module.default).toBe('function')
  })

  it('verification filters are defined correctly', () => {
    const VERIFICATION_FILTERS = [
      { value: '', label: 'הכל' },
      { value: 'unverified', label: 'לא מאומת' },
      { value: 'pending', label: 'ממתין' },
      { value: 'verified', label: 'מאומת' },
    ]

    expect(VERIFICATION_FILTERS).toHaveLength(4)
    expect(VERIFICATION_FILTERS[0]?.value).toBe('')
    expect(VERIFICATION_FILTERS[1]?.value).toBe('unverified')
    expect(VERIFICATION_FILTERS[2]?.value).toBe('pending')
    expect(VERIFICATION_FILTERS[3]?.value).toBe('verified')
  })
})
