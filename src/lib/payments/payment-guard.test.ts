import { describe, expect, it } from 'vitest'
import { isPaymentDisabled } from './payment-guard'

describe('isPaymentDisabled', () => {
  it('refuses the real provider while payment_production is off', () => {
    for (const vercelEnv of [undefined, 'development', 'preview', 'production']) {
      expect(isPaymentDisabled({ useMock: false, paymentProduction: false, vercelEnv })).toBe(true)
    }
  })

  it('refuses the mock on Vercel production while payment_production is off', () => {
    expect(
      isPaymentDisabled({ useMock: true, paymentProduction: false, vercelEnv: 'production' }),
    ).toBe(true)
  })

  it('lets the mock complete a checkout on preview and dev', () => {
    for (const vercelEnv of [undefined, 'development', 'preview']) {
      expect(isPaymentDisabled({ useMock: true, paymentProduction: false, vercelEnv })).toBe(false)
    }
  })

  it('never refuses once payment_production is on', () => {
    for (const useMock of [true, false]) {
      for (const vercelEnv of [undefined, 'preview', 'production']) {
        expect(isPaymentDisabled({ useMock, paymentProduction: true, vercelEnv })).toBe(false)
      }
    }
  })
})
