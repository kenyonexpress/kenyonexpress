import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CART_COUPON_COOKIE, COUPON_COOKIE_MAX_AGE, couponCookieOptions } from './coupon-cookie'

describe('the cart coupon cookie', () => {
  it('is Secure over https', () => {
    expect(couponCookieOptions('https').secure).toBe(true)
    expect(couponCookieOptions('https:').secure).toBe(true)
  })

  it('is not Secure over plain http, so the E2E suite keeps working', () => {
    // The reason is in guest-session-cookie.ts: WebKit drops a Secure cookie on
    // http://localhost, and the Playwright suite runs a WebKit project there.
    expect(couponCookieOptions('http').secure).toBe(false)
    expect(couponCookieOptions(null).secure).toBe(false)
    expect(couponCookieOptions(undefined).secure).toBe(false)
  })

  it('takes the first hop of a forwarded chain, not the last', () => {
    // `https, http` is a TLS client in front of a plaintext internal hop. The
    // client's protocol is the one the flag is about.
    expect(couponCookieOptions('https, http').secure).toBe(true)
    expect(couponCookieOptions('http, https').secure).toBe(false)
  })

  it('keeps the attributes that were already right', () => {
    const options = couponCookieOptions('https')
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('lax')
    expect(options.path).toBe('/')
    expect(options.maxAge).toBe(COUPON_COOKIE_MAX_AGE)
  })

  it('names the cookie once', () => {
    expect(CART_COUPON_COOKIE).toBe('ke_cart_coupon')
  })
})

/**
 * THE GATE, and the reason this file is longer than the helper it tests.
 *
 * `secure` was missing from the guest session cookie because two writers each
 * hand-rolled the same options object. It was extracted into
 * `guestSessionCookieOptions`, a unit test was written for that one cookie, and
 * the coupon cookie went on missing `secure` in THREE places for as long again,
 * because a per-cookie test only ever guards the cookie it names.
 *
 * All three writers agreed with each other. That is what made it invisible: the
 * literals were consistent, just consistently wrong, and the only way to see it
 * was to compare them against a cookie in a different directory.
 *
 * So this sweeps the source instead of naming a cookie. Any object literal that
 * sets `httpOnly` is a cookie options object, and one that does not also decide
 * `secure` has left the decision to a default that is `false`.
 */
const SRC = resolve(process.cwd(), 'src')

/**
 * Cookies deliberately written without `secure`, each with the reason. Empty
 * today. An entry here is a decision somebody made in writing, which is the
 * whole difference between this list and an oversight.
 */
const WITHOUT_SECURE: Record<string, string> = {}

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
      continue
    }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue
    found.push(path)
  }
  return found
}

/**
 * The braces around an `httpOnly` at `index`: walk back to the `{` that is not
 * closed between it and the property, then forward to its partner.
 *
 * Deliberately naive about strings and comments. It is used only to decide
 * whether the word `secure` appears alongside `httpOnly`, and the failure mode
 * of a bad slice is a false alarm on a real cookie, not a miss.
 */
function enclosingObject(source: string, index: number): string {
  let depth = 0
  let start = -1
  for (let i = index; i >= 0; i--) {
    if (source[i] === '}') depth++
    else if (source[i] === '{') {
      if (depth === 0) {
        start = i
        break
      }
      depth--
    }
  }
  if (start === -1) return ''
  depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return source.slice(start)
}

describe('every cookie in src decides `secure`', () => {
  const offenders: string[] = []

  for (const path of sourceFiles(SRC)) {
    const source = readFileSync(path, 'utf8')
    const file = relative(process.cwd(), path)

    for (let index = source.indexOf('httpOnly'); index !== -1; ) {
      // A property or a type member, not the word in a sentence: `httpOnly`
      // followed by `:` or `?:`.
      const after = source.slice(index + 'httpOnly'.length, index + 'httpOnly'.length + 2)
      if (/^\??:/.test(after)) {
        const object = enclosingObject(source, index)
        if (object && !object.includes('secure')) {
          const line = source.slice(0, index).split('\n').length
          offenders.push(`${file}:${line}`)
        }
      }
      index = source.indexOf('httpOnly', index + 1)
    }
  }

  it('finds cookie options to check, so a broken sweep cannot pass silently', () => {
    // The sweep is only worth anything if it reaches the known cookies. If a
    // refactor moves them all behind a helper this number drops, and this
    // assertion is the prompt to re-point the sweep rather than delete it.
    const seen = sourceFiles(SRC).filter((path) => /httpOnly\??:/.test(readFileSync(path, 'utf8')))
    expect(seen.length, 'no cookie options objects found at all').toBeGreaterThanOrEqual(5)
  })

  it('has no cookie that leaves `secure` to its default', () => {
    const undeclared = offenders.filter((entry) => !((entry.split(':')[0] ?? '') in WITHOUT_SECURE))
    expect(
      undeclared,
      'a cookie options object sets httpOnly but never decides secure; add the flag, or add the file to WITHOUT_SECURE with the reason',
    ).toEqual([])
  })
})
