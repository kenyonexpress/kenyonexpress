import { describe, expect, it } from 'vitest'
import { cartWriteIdentifier } from './write-limit-identifier'

const ip = async () => '203.0.113.9'

describe('cartWriteIdentifier', () => {
  it('charges a guest to the address', async () => {
    expect(await cartWriteIdentifier(null, ip, {})).toBe('ip:203.0.113.9')
  })

  it('charges a signed-in shopper to the user alone in a real build', async () => {
    expect(await cartWriteIdentifier('u1', ip, {})).toBe('user:u1')
    expect(
      await cartWriteIdentifier('u1', ip, { E2E_MOCK_CHECKOUT: 'local-build', VERCEL: '1' }),
    ).toBe('user:u1')
  })

  it('charges a signed-in shopper per address in a local E2E build only', async () => {
    expect(await cartWriteIdentifier('u1', ip, { E2E_MOCK_CHECKOUT: 'local-build' })).toBe(
      'user:u1:ip:203.0.113.9',
    )
    expect(await cartWriteIdentifier('u1', ip, { E2E_MOCK_CHECKOUT: 'other' })).toBe('user:u1')
  })
})
