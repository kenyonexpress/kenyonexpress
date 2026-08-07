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
