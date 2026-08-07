import {
  buildRedeemUrl,
  normalizeScannedCode,
  parseScanInput,
  tokenFromRedeemUrl,
} from '@/lib/vouchers/scan-input'
import { describe, expect, it } from 'vitest'

const TOKEN = 'KEV1.eyJ2IjoxLCJjIjoiQUJDREVGR0hKSyJ9.c2lnbmF0dXJlLWhlcmU'

describe('parseScanInput', () => {
  it('takes a bare token whole, without normalising it', () => {
    expect(parseScanInput(TOKEN)).toEqual({ kind: 'token', token: TOKEN, code: null })
  })

  it('takes the token out of a redeem URL', () => {
    expect(parseScanInput(`https://kenyonexpress.co.il/redeem/${TOKEN}`)).toEqual({
      kind: 'token',
      token: TOKEN,
      code: null,
    })
  })

  it('accepts a redeem URL from any host, including localhost with a port', () => {
    expect(parseScanInput(`http://localhost:3000/redeem/${TOKEN}`).token).toBe(TOKEN)
  })

  it('ignores a query string and a fragment after the token', () => {
    expect(parseScanInput(`https://x.co/redeem/${TOKEN}?utm=qr#top`).token).toBe(TOKEN)
  })

  it('decodes a percent-encoded token in the path', () => {
    const encoded = TOKEN.replace(/\./g, '%2E')
    expect(parseScanInput(`https://x.co/redeem/${encoded}`).token).toBe(TOKEN)
  })

  // The signature is base64url with dots. Stripping punctuation, which is what
  // the short-code path does, would silently destroy it.
  it('never strips the dots of a token', () => {
    const parsed = parseScanInput(TOKEN)
    expect(parsed.token?.split('.')).toHaveLength(3)
  })

  it('rejects a KEV1 string that is not three parts', () => {
    expect(parseScanInput('KEV1.onlybody').kind).toBe('invalid')
    expect(parseScanInput('KEV1..sig').kind).toBe('invalid')
    expect(parseScanInput('KEV1.').kind).toBe('invalid')
  })

  it('accepts a hand-typed short code, hyphenated or not', () => {
    expect(parseScanInput('ABCDE-FGHJK')).toEqual({
      kind: 'code',
      token: null,
      code: 'ABCDEFGHJK',
    })
    expect(parseScanInput('abcdefghjk').code).toBe('ABCDEFGHJK')
    expect(parseScanInput('  ABCDE FGHJK  ').code).toBe('ABCDEFGHJK')
  })

  it('rejects a code of the wrong length', () => {
    expect(parseScanInput('ABCDE').kind).toBe('invalid')
    expect(parseScanInput('ABCDEFGHJKL').kind).toBe('invalid')
  })

  // I, L, O and U are not in the alphabet, so a code containing one was mistyped
  // and looking it up would only produce a confusing "not found" at the counter.
  it('rejects a code carrying a letter the alphabet excludes', () => {
    expect(parseScanInput('ABCDEFGHIK').kind).toBe('invalid')
    expect(parseScanInput('ABCDEFGHLK').kind).toBe('invalid')
    expect(parseScanInput('ABCDEFGHOK').kind).toBe('invalid')
    expect(parseScanInput('ABCDEFGHUK').kind).toBe('invalid')
  })

  it('rejects empty and junk input', () => {
    expect(parseScanInput('').kind).toBe('invalid')
    expect(parseScanInput('   ').kind).toBe('invalid')
    expect(parseScanInput('https://example.com/').kind).toBe('invalid')
  })

  it('rejects a URL that is not a redeem link even when it carries a token-like tail', () => {
    expect(parseScanInput(`https://evil.example/pay/${TOKEN}`).kind).toBe('invalid')
  })
})

describe('tokenFromRedeemUrl', () => {
  it('returns null when the path segment is not a KEV1 token', () => {
    expect(tokenFromRedeemUrl('https://x.co/redeem/ABCDEFGHJK')).toBeNull()
  })
})

describe('buildRedeemUrl', () => {
  it('joins base and token', () => {
    expect(buildRedeemUrl('https://kenyonexpress.co.il', TOKEN)).toBe(
      `https://kenyonexpress.co.il/redeem/${TOKEN}`,
    )
  })

  it('trims trailing slashes so the path cannot become protocol-relative', () => {
    expect(buildRedeemUrl('https://kenyonexpress.co.il///', TOKEN)).toBe(
      `https://kenyonexpress.co.il/redeem/${TOKEN}`,
    )
  })

  it('round-trips through the parser', () => {
    const url = buildRedeemUrl('http://localhost:3000', TOKEN)
    expect(parseScanInput(url)).toEqual({ kind: 'token', token: TOKEN, code: null })
  })
})

describe('normalizeScannedCode', () => {
  it('strips separators and upper-cases', () => {
    expect(normalizeScannedCode('ab-cd ef')).toBe('ABCDEF')
  })
})
