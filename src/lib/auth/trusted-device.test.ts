import { describe, expect, it } from 'vitest'
import {
  TRUSTED_DEVICE_TTL_MS,
  isDeviceTrustedFor,
  openTrustedDevice,
  sealTrustedDevice,
} from './trusted-device'

const SECRET = 'test-secret'
const NOW = 1_800_000_000_000

describe('trusted device seal (remember-device, 30 days)', () => {
  it('round-trips a payload sealed with the same secret', () => {
    const sealed = sealTrustedDevice({ userId: 'u1', expiresAt: NOW + 1000 }, SECRET)
    expect(openTrustedDevice(sealed, SECRET, NOW)).toEqual({ userId: 'u1', expiresAt: NOW + 1000 })
  })

  it('is exactly thirty days', () => {
    expect(TRUSTED_DEVICE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('rejects a tampered body, a wrong secret, an expiry in the past and junk', () => {
    const sealed = sealTrustedDevice({ userId: 'u1', expiresAt: NOW + 1000 }, SECRET)
    const [body, mac] = sealed.split('.')
    const forgedBody = Buffer.from(
      JSON.stringify({ userId: 'u2', expiresAt: NOW + 1000 }),
    ).toString('base64url')
    expect(openTrustedDevice(`${forgedBody}.${mac}`, SECRET, NOW)).toBeNull()
    expect(openTrustedDevice(sealed, 'other', NOW)).toBeNull()
    expect(openTrustedDevice(sealed, SECRET, NOW + 1000)).toBeNull()
    expect(openTrustedDevice(`${body}`, SECRET, NOW)).toBeNull()
    expect(openTrustedDevice('', SECRET, NOW)).toBeNull()
  })

  it('counts only for the user it names, and never without a secret', () => {
    const sealed = sealTrustedDevice({ userId: 'u1', expiresAt: NOW + 1000 }, SECRET)
    expect(isDeviceTrustedFor(sealed, 'u1', SECRET, NOW)).toBe(true)
    expect(isDeviceTrustedFor(sealed, 'u2', SECRET, NOW)).toBe(false)
    expect(isDeviceTrustedFor(sealed, 'u1', null, NOW)).toBe(false)
    expect(isDeviceTrustedFor(undefined, 'u1', SECRET, NOW)).toBe(false)
  })
})
