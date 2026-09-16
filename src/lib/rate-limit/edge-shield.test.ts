import { describe, expect, it } from 'vitest'
import { edgeClientAddress, edgeShieldPolicyFor } from './edge-shield'

describe('edgeShieldPolicyFor', () => {
  it('meters the public API as anonymous', () => {
    expect(edgeShieldPolicyFor('/api/search')).toBe('api-anon')
    expect(edgeShieldPolicyFor('/api/search/suggest')).toBe('api-anon')
    expect(edgeShieldPolicyFor('/api/checkout/postal-code')).toBe('api-anon')
    expect(edgeShieldPolicyFor('/api/a')).toBe('api-anon')
  })

  it('gives device surfaces the wider policy', () => {
    expect(edgeShieldPolicyFor('/api/app/session')).toBe('api-device')
    expect(edgeShieldPolicyFor('/api/supplier/app/pin')).toBe('api-device')
    expect(edgeShieldPolicyFor('/api/push/register')).toBe('api-device')
  })

  it('stands aside for machine callers that prove themselves with a secret', () => {
    for (const path of [
      '/api/cron/health',
      '/api/jobs/run',
      '/api/jobs/dlq',
      '/api/webhooks/products',
      '/api/payments/cardcom/webhook',
      '/api/search/index-job',
      '/api/search/index-dlq',
      '/api/alerts/uptimerobot',
      '/api/health',
    ]) {
      expect(edgeShieldPolicyFor(path), path).toBeNull()
    }
  })

  it('never meters a page', () => {
    expect(edgeShieldPolicyFor('/')).toBeNull()
    expect(edgeShieldPolicyFor('/product/x')).toBeNull()
    expect(edgeShieldPolicyFor('/apiary')).toBeNull()
  })
})

describe('edgeClientAddress', () => {
  it('takes the first forwarded address', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
    expect(edgeClientAddress(headers)).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip', () => {
    expect(edgeClientAddress(new Headers({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9')
  })

  it('is null with no address, so local callers share no bucket', () => {
    expect(edgeClientAddress(new Headers())).toBeNull()
    expect(edgeClientAddress(new Headers({ 'x-forwarded-for': ' ' }))).toBeNull()
  })

  it('bounds the key', () => {
    const long = 'a'.repeat(200)
    expect(edgeClientAddress(new Headers({ 'x-forwarded-for': long }))).toHaveLength(64)
  })
})
