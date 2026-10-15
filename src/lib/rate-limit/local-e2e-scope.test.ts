import { describe, expect, it } from 'vitest'
import { localE2eScope } from './local-e2e-scope'

describe('localE2eScope', () => {
  it('adds nothing in a real build, on Vercel, or without an address', () => {
    expect(localE2eScope('203.0.113.9', {})).toBe('')
    expect(localE2eScope('203.0.113.9', { E2E_MOCK_CHECKOUT: 'local-build', VERCEL: '1' })).toBe('')
    expect(localE2eScope(null, { E2E_MOCK_CHECKOUT: 'local-build' })).toBe('')
    expect(localE2eScope('203.0.113.9', { E2E_MOCK_CHECKOUT: 'other' })).toBe('')
  })

  it('scopes the key to the address in a local E2E build', () => {
    expect(localE2eScope('203.0.113.9', { E2E_MOCK_CHECKOUT: 'local-build' })).toBe(
      ':ip:203.0.113.9',
    )
  })
})
