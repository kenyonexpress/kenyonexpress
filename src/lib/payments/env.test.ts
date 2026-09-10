import { acceptedWebhookSecrets, loadCardcomEnv } from '@/lib/payments/env'
import { describe, expect, it } from 'vitest'

/**
 * The checkout gate. GO-LIVE calls a checkout that is open by default a launch
 * blocker, and the reason is one-directional: the deployment where somebody
 * forgets to set the variable is the deployment taking real cards, and the
 * failure is silent in the direction that charges people.
 */

const PROD_SECRETS = {
  CARDCOM_TERMINAL_NUMBER: '1000',
  CARDCOM_API_NAME: 'api',
  CARDCOM_API_PASSWORD: 'pw',
  CARDCOM_WEBHOOK_SECRET: 'whs',
  NEXT_PUBLIC_APP_URL: 'https://kenyonexpress.co.il',
}

function prod(overrides: Record<string, string> = {}) {
  return loadCardcomEnv({ NODE_ENV: 'production', ...PROD_SECRETS, ...overrides } as never)
}

function dev(overrides: Record<string, string> = {}) {
  return loadCardcomEnv({ NODE_ENV: 'development', ...overrides } as never)
}

describe('checkoutEnabled in production', () => {
  it('is CLOSED when the variable is missing', () => {
    expect(prod().checkoutEnabled).toBe(false)
  })

  it('is CLOSED when the variable is empty', () => {
    expect(prod({ CHECKOUT_ENABLED: '' }).checkoutEnabled).toBe(false)
  })

  it('is CLOSED for anything other than the exact string true', () => {
    for (const value of ['TRUE', 'True', '1', 'yes', 'on', 'false']) {
      expect(prod({ CHECKOUT_ENABLED: value }).checkoutEnabled, value).toBe(false)
    }
  })

  it('opens only on an explicit true', () => {
    expect(prod({ CHECKOUT_ENABLED: 'true' }).checkoutEnabled).toBe(true)
  })
})

describe('checkoutEnabled outside production', () => {
  // A developer on the mock provider should not have to set a variable to see
  // a checkout, and no real card can be charged there.
  it('is open by default', () => {
    expect(dev().checkoutEnabled).toBe(true)
  })

  it('still closes on an explicit false', () => {
    expect(dev({ CHECKOUT_ENABLED: 'false' }).checkoutEnabled).toBe(false)
  })
})

describe('provider selection', () => {
  it('uses the mock when there is no terminal outside production', () => {
    expect(dev().useMock).toBe(true)
  })

  it('does not silently mock in production', () => {
    expect(prod({ CHECKOUT_ENABLED: 'true' }).useMock).toBe(false)
  })

  it('refuses to start in production with a secret missing', () => {
    expect(() =>
      loadCardcomEnv({
        NODE_ENV: 'production',
        ...PROD_SECRETS,
        CARDCOM_API_PASSWORD: '',
      } as never),
    ).toThrow(/CARDCOM_API_PASSWORD/)
  })
})

describe('webhook secret rotation', () => {
  it('accepts only the current secret when no previous one is set', () => {
    expect(acceptedWebhookSecrets(prod())).toEqual(['whs'])
  })

  it('accepts both during a rotation window, current first', () => {
    // Payment pages already open in shoppers' browsers carry the OLD secret in
    // the IndicatorUrl Cardcom will call back on. Without the second value, a
    // rotation drops every one of those callbacks.
    expect(acceptedWebhookSecrets(prod({ CARDCOM_WEBHOOK_SECRET_PREVIOUS: 'old' }))).toEqual([
      'whs',
      'old',
    ])
  })

  it('never treats whitespace as a secret', () => {
    // The direction that matters: an accidental `CARDCOM_WEBHOOK_SECRET_PREVIOUS=" "`
    // must not become a value a caller could present.
    expect(acceptedWebhookSecrets(prod({ CARDCOM_WEBHOOK_SECRET_PREVIOUS: '   ' }))).toEqual([
      'whs',
    ])
  })

  it('trims a pasted value rather than accepting only the untrimmed form', () => {
    expect(acceptedWebhookSecrets(prod({ CARDCOM_WEBHOOK_SECRET_PREVIOUS: ' old\n' }))).toEqual([
      'whs',
      'old',
    ])
  })

  it('leaves the previous secret null in dev, where the mock supplies the current one', () => {
    expect(dev().webhookSecretPrevious).toBeNull()
    expect(acceptedWebhookSecrets(dev())).toEqual(['mock-webhook-secret'])
  })
})

/**
 * THE MOCK PROVIDER ON THE CUSTOMER-FACING DEPLOYMENT.
 *
 * This is not a hypothetical. Measured on 2026-09-10 against the Vercel project
 * serving https://www.kenyonexpress.co.il: CARDCOM_USE_MOCK="true",
 * CHECKOUT_ENABLED="true", and no CARDCOM_TERMINAL_NUMBER, CARDCOM_API_NAME or
 * CARDCOM_API_PASSWORD anywhere in any of the three projects. With
 * `getPaymentProvider` returning the shared mock on `useMock` and the mock
 * approving the happy path, that combination let a shopper on the real domain
 * complete a checkout with no card charged.
 *
 * These cases pin the guard in both directions, because a guard that is too
 * wide is its own outage: preview must keep the mock.
 */
describe('the mock provider may not serve the production deployment', () => {
  const base = {
    NODE_ENV: 'production',
    CHECKOUT_ENABLED: 'true',
    CARDCOM_WEBHOOK_SECRET: 'wh',
    NEXT_PUBLIC_APP_URL: 'https://www.kenyonexpress.co.il',
  } as unknown as NodeJS.ProcessEnv

  it('refuses checkout in exactly the configuration production was found in', () => {
    const env = loadCardcomEnv({
      ...base,
      VERCEL_ENV: 'production',
      CARDCOM_USE_MOCK: 'true',
    } as NodeJS.ProcessEnv)

    expect(env.checkoutEnabled).toBe(false)
    expect(env.refusedReason).toContain('CARDCOM_USE_MOCK')
  })

  it('does not throw, because the safe state is no order rather than no site', () => {
    // A throw here would 500 the storefront on a configuration mistake. The
    // storefront must stay up and simply decline to take money.
    expect(() =>
      loadCardcomEnv({
        ...base,
        VERCEL_ENV: 'production',
        CARDCOM_USE_MOCK: 'true',
      } as NodeJS.ProcessEnv),
    ).not.toThrow()
  })

  it('leaves preview alone, where the mock is the point', () => {
    const env = loadCardcomEnv({
      ...base,
      VERCEL_ENV: 'preview',
      CARDCOM_USE_MOCK: 'true',
    } as NodeJS.ProcessEnv)

    expect(env.useMock).toBe(true)
    expect(env.checkoutEnabled).toBe(true)
    expect(env.refusedReason).toBeNull()
  })

  it('leaves a real production terminal alone', () => {
    const env = loadCardcomEnv({
      ...base,
      VERCEL_ENV: 'production',
      CARDCOM_TERMINAL_NUMBER: '1000',
      CARDCOM_API_NAME: 'api',
      CARDCOM_API_PASSWORD: 'pw',
    } as NodeJS.ProcessEnv)

    expect(env.useMock).toBe(false)
    expect(env.checkoutEnabled).toBe(true)
    expect(env.refusedReason).toBeNull()
  })

  it('still refuses when CHECKOUT_ENABLED was never set, not only when it was true', () => {
    const env = loadCardcomEnv({
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      CARDCOM_USE_MOCK: 'true',
      CARDCOM_WEBHOOK_SECRET: 'wh',
      NEXT_PUBLIC_APP_URL: 'https://www.kenyonexpress.co.il',
    } as unknown as NodeJS.ProcessEnv)

    expect(env.checkoutEnabled).toBe(false)
  })
})
