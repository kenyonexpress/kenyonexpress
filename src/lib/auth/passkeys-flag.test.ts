import { describe, expect, it } from 'vitest'
import { passkeysEnabled } from './passkeys-flag'

describe('passkeysEnabled', () => {
  it('is on by default', () => {
    expect(passkeysEnabled({})).toBe(true)
    expect(passkeysEnabled({ NEXT_PUBLIC_PASSKEYS_ENABLED: '' })).toBe(true)
    expect(passkeysEnabled({ NEXT_PUBLIC_PASSKEYS_ENABLED: '1' })).toBe(true)
  })
  it.each(['0', 'false', 'FALSE', ' off '])('is off for %j', (v) => {
    expect(passkeysEnabled({ NEXT_PUBLIC_PASSKEYS_ENABLED: v })).toBe(false)
  })
})
