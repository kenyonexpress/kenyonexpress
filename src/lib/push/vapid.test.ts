import { describe, expect, it } from 'vitest'
import { urlBase64ToUint8Array } from './vapid'

describe('urlBase64ToUint8Array', () => {
  it('decodes the urlsafe alphabet, which plain atob rejects', () => {
    // 0xfb 0xff 0xbf encodes to '-_-_' in base64url and '+/+/' in standard.
    expect([...urlBase64ToUint8Array('-_-_')]).toEqual([0xfb, 0xff, 0xbf])
  })

  it.each([
    ['no padding needed', 'AAAA', 3],
    ['one pad char implied', 'AAA', 2],
    ['two pad chars implied', 'AA', 1],
  ])('restores stripped padding: %s', (_name, input, byteLength) => {
    expect(urlBase64ToUint8Array(input)).toHaveLength(byteLength)
  })

  it('round-trips a realistic 65-byte uncompressed P-256 point', () => {
    // What a real VAPID public key is: 0x04 || X || Y.
    const point = new Uint8Array(65).map((_, i) => (i === 0 ? 4 : i))
    const base64url = Buffer.from(point).toString('base64url')
    expect([...urlBase64ToUint8Array(base64url)]).toEqual([...point])
  })
})
