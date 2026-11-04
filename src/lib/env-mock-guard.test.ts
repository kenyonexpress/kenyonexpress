import { envSchema } from '@/lib/env'
import { describe, expect, it } from 'vitest'

/** Messages of the custom issues the boot schema raises for this environment. */
function issues(source: Record<string, string>): string[] {
  const result = envSchema.safeParse(source)
  return result.success ? [] : result.error.issues.map((i) => i.message)
}

const MOCK_REFUSED = 'CARDCOM_USE_MOCK must not be true in production'

describe('env: CARDCOM_USE_MOCK on Vercel production', () => {
  it('refuses the mock provider when VERCEL_ENV is production', () => {
    expect(issues({ VERCEL_ENV: 'production', CARDCOM_USE_MOCK: 'true' })).toContain(MOCK_REFUSED)
  })

  it('refuses it even with the local waiver set', () => {
    expect(
      issues({
        NODE_ENV: 'production',
        ALLOW_INCOMPLETE_ENV: 'true',
        VERCEL_ENV: 'production',
        CARDCOM_USE_MOCK: 'true',
      }),
    ).toContain(MOCK_REFUSED)
  })

  it('allows the mock on preview and development', () => {
    for (const VERCEL_ENV of ['preview', 'development']) {
      expect(issues({ VERCEL_ENV, CARDCOM_USE_MOCK: 'true' })).not.toContain(MOCK_REFUSED)
    }
    expect(issues({ CARDCOM_USE_MOCK: 'true' })).not.toContain(MOCK_REFUSED)
  })

  it('allows production when the mock is off', () => {
    for (const CARDCOM_USE_MOCK of ['false', '']) {
      expect(issues({ VERCEL_ENV: 'production', CARDCOM_USE_MOCK })).not.toContain(MOCK_REFUSED)
    }
    expect(issues({ VERCEL_ENV: 'production' })).not.toContain(MOCK_REFUSED)
  })
})
