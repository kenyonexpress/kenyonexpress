import { afterEach, describe, expect, it, vi } from 'vitest'
import { READ_ONLY_SPECS, assertWritableTarget, isProductionBaseUrl } from '../../e2e/prod-guard'

// C202: no E2E write flow may run against production.
describe('e2e prod guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('recognises every production host and nothing else', () => {
    expect(isProductionBaseUrl('https://www.kenyonexpress.co.il')).toBe(true)
    expect(isProductionBaseUrl('https://WWW.kenyonexpress.co.il/product/x')).toBe(true)
    expect(isProductionBaseUrl('https://kenyonexpress.co.il')).toBe(true)
    expect(isProductionBaseUrl('https://kenyonexpress.vercel.app')).toBe(true)
    expect(isProductionBaseUrl('https://kenyonexpress-git-feat-ofir.vercel.app')).toBe(false)
    expect(isProductionBaseUrl('http://localhost:3000')).toBe(false)
    expect(isProductionBaseUrl(undefined)).toBe(false)
    expect(isProductionBaseUrl('not a url')).toBe(false)
  })

  it('refuses a write on production and allows it on a preview', () => {
    expect(() => assertWritableTarget('add to cart', 'https://www.kenyonexpress.co.il')).toThrow(
      /E2E write refused on production/,
    )
    expect(() =>
      assertWritableTarget('add to cart', 'https://kenyonexpress-abc123.vercel.app'),
    ).not.toThrow()
    expect(() => assertWritableTarget('add to cart', undefined)).not.toThrow()
  })

  it('reads E2E_BASE_URL when no URL is passed', () => {
    vi.stubEnv('E2E_BASE_URL', 'https://www.kenyonexpress.co.il')
    expect(() => assertWritableTarget('submit checkout')).toThrow(/submit checkout/)
  })

  it('narrows playwright to the read-only specs on production', async () => {
    vi.stubEnv('E2E_BASE_URL', 'https://www.kenyonexpress.co.il')
    const { default: config } = await import('../../playwright.config')
    expect(config.testMatch).toEqual(READ_ONLY_SPECS.map((f) => `**/${f}`))
    expect(READ_ONLY_SPECS).not.toContain('production-smoke.spec.ts')
    expect(READ_ONLY_SPECS).not.toContain('checkout.spec.ts')
  })

  it('runs the full suite on a preview URL', async () => {
    vi.stubEnv('E2E_BASE_URL', 'https://kenyonexpress-abc123.vercel.app')
    const { default: config } = await import('../../playwright.config')
    expect(config.testMatch).toBeUndefined()
  })
})
