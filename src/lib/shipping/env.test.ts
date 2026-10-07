import { describe, expect, it } from 'vitest'
import { loadShippingEnv, offeredCarrierIds } from './env'

const base = { NODE_ENV: 'production' } as NodeJS.ProcessEnv

describe('loadShippingEnv', () => {
  it('defaults to the mock when no carrier is configured, even in production', () => {
    const env = loadShippingEnv(base)
    expect(env.useMock).toBe(true)
    expect(offeredCarrierIds(env)).toEqual(['israel_post', 'chita', 'yamit'])
  })

  it('treats half a configuration as absent', () => {
    const env = loadShippingEnv({ ...base, CHITA_API_BASE_URL: 'https://api.example' })
    expect(env.carriers.chita).toBeNull()
    expect(env.useMock).toBe(true)
  })

  it('offers only the configured carriers once one is real', () => {
    const env = loadShippingEnv({
      ...base,
      CHITA_API_BASE_URL: 'https://api.example/',
      CHITA_API_KEY: 'k',
      CHITA_ACCOUNT_ID: ' 42 ',
    })
    expect(env.useMock).toBe(false)
    expect(env.carriers.chita).toEqual({
      baseUrl: 'https://api.example',
      apiKey: 'k',
      accountId: '42',
    })
    expect(offeredCarrierIds(env)).toEqual(['chita'])
  })

  it('forces the mock under the flag and under NODE_ENV=test', () => {
    const configured = { ...base, YAMIT_API_BASE_URL: 'https://y', YAMIT_API_KEY: 'k' }
    expect(loadShippingEnv(configured).useMock).toBe(false)
    expect(loadShippingEnv({ ...configured, SHIPPING_CARRIERS_USE_MOCK: 'true' }).useMock).toBe(
      true,
    )
    expect(loadShippingEnv({ ...configured, NODE_ENV: 'test' } as NodeJS.ProcessEnv).useMock).toBe(
      true,
    )
  })

  it('clamps the timeout to a sane window', () => {
    expect(loadShippingEnv(base).timeoutMs).toBe(8000)
    expect(loadShippingEnv({ ...base, SHIPPING_CARRIER_TIMEOUT_MS: '2500' }).timeoutMs).toBe(2500)
    expect(loadShippingEnv({ ...base, SHIPPING_CARRIER_TIMEOUT_MS: '5' }).timeoutMs).toBe(8000)
    expect(loadShippingEnv({ ...base, SHIPPING_CARRIER_TIMEOUT_MS: 'abc' }).timeoutMs).toBe(8000)
  })
})
