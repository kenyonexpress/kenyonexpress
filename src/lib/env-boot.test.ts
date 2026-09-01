import { skipProductionEnvHardFail } from '@/lib/env'
import { describe, expect, it } from 'vitest'

describe('skipProductionEnvHardFail', () => {
  it('skips outside production', () => {
    expect(skipProductionEnvHardFail({ NODE_ENV: 'development' })).toBe(true)
    expect(skipProductionEnvHardFail({ NODE_ENV: 'test' })).toBe(true)
    expect(skipProductionEnvHardFail({})).toBe(true)
  })

  it('skips a local next start that opted into the waiver', () => {
    expect(
      skipProductionEnvHardFail({ NODE_ENV: 'production', ALLOW_INCOMPLETE_ENV: 'true' }),
    ).toBe(true)
  })

  it('skips Vercel Preview without the project-wide waiver', () => {
    expect(skipProductionEnvHardFail({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })).toBe(true)
  })

  it('does not skip Production on Vercel', () => {
    expect(skipProductionEnvHardFail({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toBe(
      false,
    )
  })

  it('does not skip a production boot with no Vercel env and no waiver', () => {
    expect(skipProductionEnvHardFail({ NODE_ENV: 'production' })).toBe(false)
    expect(
      skipProductionEnvHardFail({ NODE_ENV: 'production', ALLOW_INCOMPLETE_ENV: 'false' }),
    ).toBe(false)
  })
})
