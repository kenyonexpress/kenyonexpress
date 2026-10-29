import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const state: { result: { data: unknown; error: unknown } | 'throw' } = {
  result: { data: null, error: null },
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (state.result === 'throw') throw new Error('down')
            return state.result
          },
        }),
      }),
    }),
  }),
}))

const { cardVerifyEnabled } = await import('./card-verify-gate')

describe('cardVerifyEnabled', () => {
  beforeEach(() => {
    state.result = { data: null, error: null }
  })

  it('is off when the flag row is missing', async () => {
    expect(await cardVerifyEnabled({} as NodeJS.ProcessEnv)).toBe(false)
  })
  it('is off when the flag is false', async () => {
    state.result = { data: { bool_value: false }, error: null }
    expect(await cardVerifyEnabled({} as NodeJS.ProcessEnv)).toBe(false)
  })
  it('is on when the flag is true', async () => {
    state.result = { data: { bool_value: true }, error: null }
    expect(await cardVerifyEnabled({} as NodeJS.ProcessEnv)).toBe(true)
  })
  it('fails closed on a read error or throw', async () => {
    state.result = { data: null, error: { message: 'x' } }
    expect(await cardVerifyEnabled({} as NodeJS.ProcessEnv)).toBe(false)
    state.result = 'throw'
    expect(await cardVerifyEnabled({} as NodeJS.ProcessEnv)).toBe(false)
  })
  it('FLAG_CARD_VERIFY_ENABLED=1 overrides', async () => {
    state.result = 'throw'
    expect(await cardVerifyEnabled({ FLAG_CARD_VERIFY_ENABLED: '1' } as NodeJS.ProcessEnv)).toBe(
      true,
    )
  })
})
