import { describe, expect, it } from 'vitest'
import {
  PAYMENT_GATE_CLOSED_MESSAGE,
  assessPaymentProviderGate,
  readPaymentProviderGate,
} from './provider-gate'

describe('assessPaymentProviderGate', () => {
  it('is live with checkout enabled and a real provider, in production', () => {
    expect(
      assessPaymentProviderGate({ checkoutEnabled: true, useMock: false }, 'production'),
    ).toEqual({
      live: true,
      reasons: [],
    })
  })

  it('closes when the operator switch is off, everywhere', () => {
    for (const nodeEnv of ['production', 'development', 'test']) {
      const gate = assessPaymentProviderGate({ checkoutEnabled: false, useMock: false }, nodeEnv)
      expect(gate.live, nodeEnv).toBe(false)
      expect(gate.reasons).toContain('CHECKOUT_DISABLED')
    }
  })

  it('closes on the mock provider in production, which is the incident this module exists for', () => {
    const gate = assessPaymentProviderGate({ checkoutEnabled: true, useMock: true }, 'production')
    expect(gate.live).toBe(false)
    expect(gate.reasons).toEqual(['MOCK_IN_PRODUCTION'])
  })

  it('reports both reasons at once rather than the first it met', () => {
    const gate = assessPaymentProviderGate({ checkoutEnabled: false, useMock: true }, 'production')
    expect(gate.reasons).toEqual(['CHECKOUT_DISABLED', 'MOCK_IN_PRODUCTION'])
  })

  it('leaves the mock provider open outside production, which is how a laptop runs a checkout', () => {
    expect(
      assessPaymentProviderGate({ checkoutEnabled: true, useMock: true }, 'development').live,
    ).toBe(true)
    expect(assessPaymentProviderGate({ checkoutEnabled: true, useMock: true }, 'test').live).toBe(
      true,
    )
  })
})

describe('readPaymentProviderGate', () => {
  it('reads the process env through loadCardcomEnv and stays open on a test laptop', () => {
    const gate = readPaymentProviderGate({
      NODE_ENV: 'test',
      CARDCOM_USE_MOCK: 'true',
    } as NodeJS.ProcessEnv)
    expect(gate.live).toBe(true)
  })

  it('closes in production with the mock selected', () => {
    const gate = readPaymentProviderGate({
      NODE_ENV: 'production',
      CHECKOUT_ENABLED: 'true',
      CARDCOM_USE_MOCK: 'true',
    } as NodeJS.ProcessEnv)
    expect(gate.live).toBe(false)
    expect(gate.reasons).toEqual(['MOCK_IN_PRODUCTION'])
  })

  it('closes, and does not throw, when a production env is missing a credential', () => {
    // loadCardcomEnv throws on a missing CARDCOM_TERMINAL_NUMBER outside mock
    // mode; the page must render "not yet" rather than a 500.
    const gate = readPaymentProviderGate({
      NODE_ENV: 'production',
      CHECKOUT_ENABLED: 'true',
      CARDCOM_USE_MOCK: 'false',
      CARDCOM_TERMINAL_NUMBER: '1000',
    } as NodeJS.ProcessEnv)
    expect(gate.live).toBe(false)
    expect(gate.reasons).toEqual(['ENV_INCOMPLETE'])
  })

  it('closes in production when CHECKOUT_ENABLED is simply unset', () => {
    const gate = readPaymentProviderGate({
      NODE_ENV: 'production',
      CARDCOM_TERMINAL_NUMBER: '1000',
      CARDCOM_API_NAME: 'a',
      CARDCOM_API_PASSWORD: 'b',
      CARDCOM_WEBHOOK_SECRET: 'c',
      NEXT_PUBLIC_APP_URL: 'https://example.co.il',
    } as NodeJS.ProcessEnv)
    expect(gate.live).toBe(false)
    expect(gate.reasons).toEqual(['CHECKOUT_DISABLED'])
  })

  it('carries one Hebrew sentence for the shopper, whatever the reason', () => {
    expect(PAYMENT_GATE_CLOSED_MESSAGE).toMatch(/[֐-׿]/)
    expect(PAYMENT_GATE_CLOSED_MESSAGE).not.toMatch(/CHECKOUT_ENABLED|MOCK/)
  })
})
