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

/**
 * Comments blanked out, character for character, so offsets and line numbers
 * survive.
 *
 * WHY THIS EXISTS. The sweep below matches the TEXT `httpOnly:`, and a file
 * that DOCUMENTS a cookie is not a file that sets one.
 * `src/lib/supabase/cookie-options.ts` quotes the measured output of
 * `@supabase/ssr` in its header — `{ path: '/', sameSite: 'lax', httpOnly:
 * false, maxAge: ... }`, the before shape, without `secure` — and the sweep
 * read that prose as a cookie and went red on the one file in the repo whose
 * entire job is adding the flag.
 *
 * That is worse than a plain false alarm. The cheapest way out of it is
 * `WITHOUT_SECURE['src/lib/supabase/cookie-options.ts'] = '...'`, and the
 * allowlist is per FILE: the exemption would have covered the real options
 * object in that same file, forever, for the next person who edits it. A gate
 * whose false alarm is answered by exempting the code it protects is a gate
 * that disarms itself.
 *
 * Strings are tracked so a `//` inside a literal is not mistaken for a comment.
 * A regular expression literal containing `//` would still fool it; there is
 * none in `src/`, and the failure mode is the old one, a false alarm on a real
 * file, not a miss.
 */
function withoutComments(source: string): string {
  const out = source.split('')
  let i = 0
  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') out[i++] = ' '
      continue
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      while (i < stop) {
        if (source[i] !== '\n') out[i] = ' '
        i++
      }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i++
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    i++
  }
  return out.join('')
}

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
    const source = withoutComments(readFileSync(path, 'utf8'))
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
    const seen = sourceFiles(SRC).filter((path) =>
      /httpOnly\??:/.test(withoutComments(readFileSync(path, 'utf8'))),
    )
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

describe('withoutComments', () => {
  it('blanks a line comment but keeps the line count', () => {
    const stripped = withoutComments('const a = 1 // httpOnly: false\nconst b = 2')
    expect(stripped).not.toContain('httpOnly')
    expect(stripped.split('\n')).toHaveLength(2)
    expect(stripped).toContain('const b = 2')
  })

  it('blanks a block comment and keeps every newline inside it', () => {
    const source = '/**\n * { httpOnly: false }\n */\nconst x = 1'
    const stripped = withoutComments(source)
    expect(stripped).not.toContain('httpOnly')
    expect(stripped).toHaveLength(source.length)
    expect(stripped.split('\n')).toHaveLength(4)
  })

  it('leaves a `//` that is inside a string alone', () => {
    const source = "const url = 'https://example.test' // httpOnly: false"
    const stripped = withoutComments(source)
    expect(stripped).toContain("'https://example.test'")
    expect(stripped).not.toContain('httpOnly')
  })

  it('still sees a real options object', () => {
    const source = 'const o = { httpOnly: true, secure: true }'
    expect(withoutComments(source)).toBe(source)
  })
})
