import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every cookie this app writes carries `sameSite`, and every one that a
 * script has no business reading carries `httpOnly`.
 *
 * `SameSite=Lax` is the first CSRF layer (lib/security/same-origin.ts is the
 * second): a cross-site POST does not carry a Lax cookie, so a forged form on
 * another site reaches a route handler with no session. It only works if no
 * cookie is written without it, and a cookie write is one line anywhere in
 * `src/`, so this is a scan of every write rather than a test of the ones
 * somebody remembered.
 *
 * `Strict` is deliberately not required. A Strict session cookie breaks the
 * top-level return from Cardcom's hosted page and from the Google OAuth
 * callback, both of which land in an authenticated context from another site.
 */

const ROOT = process.cwd()

function sourcesUnder(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourcesUnder(path))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push({ path, source: readFileSync(resolve(ROOT, path), 'utf8') })
    }
  }
  return out
}

/** A cookie-jar write: `cookieStore.set(`, `jar.set(`, `response.cookies.set(`. */
const COOKIE_WRITE = /\b(?:cookieStore|jar|cookies|[A-Za-z]+\.cookies)\.set\(/g

/**
 * The option builders that already carry the attributes, each pinned by its
 * own unit test. A write that passes one of these is covered by that test.
 */
const OPTION_BUILDERS = ['guestSessionCookieOptions(', 'referralCookieOptions(']

/**
 * Cookies a script must be able to read, by design, and why. Anything not
 * listed here that is written without `httpOnly` fails.
 */
const SCRIPT_READABLE = new Set([
  // Read by the pre-paint snippet that hides the consent banner before the
  // parser reaches it, and by the analytics client to decide whether to load.
  'CONSENT_COOKIE',
])

/** The text from a `.set(` up to its matching close paren. */
function callArguments(source: string, openIndex: number): string {
  let depth = 0
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0) return source.slice(openIndex + 1, i)
    }
  }
  return source.slice(openIndex + 1)
}

type Write = { path: string; args: string; line: number }

function cookieWrites(): Write[] {
  const writes: Write[] = []
  for (const { path, source } of sourcesUnder('src')) {
    for (const match of source.matchAll(COOKIE_WRITE)) {
      const open = match.index + match[0].length - 1
      const args = callArguments(source, open)
      const line = source.slice(0, match.index).split('\n').length
      writes.push({ path, args, line })
    }
  }
  return writes
}

const WRITES = cookieWrites()

/**
 * The Supabase SSR pass-through: `for (const { name, value, options } of
 * cookiesToSet) cookieStore.set(name, value, options)`. The attributes come
 * from `@supabase/ssr`, which sets `SameSite=Lax` and `httpOnly` on the
 * session cookies itself. `request.cookies.set(name, value)` in the proxy is
 * the same pass-through writing into the REQUEST so the refreshed session is
 * visible downstream; it produces no Set-Cookie header.
 */
function isSupabasePassThrough(write: Write): boolean {
  return /^\s*name,\s*value(?:,\s*options)?\s*$/.test(write.args)
}

describe('every cookie write carries its attributes', () => {
  it('finds the writes at all, so a broken scan cannot pass silently', () => {
    expect(WRITES.length).toBeGreaterThanOrEqual(8)
  })

  it.each(WRITES.map((w) => [`${w.path}:${w.line}`, w] as const))(
    '%s sets sameSite',
    (_label, write) => {
      if (isSupabasePassThrough(write)) return
      const viaBuilder = OPTION_BUILDERS.some((builder) => write.args.includes(builder))
      const literal = /\bsameSite\s*:\s*'(?:lax|strict)'/.test(write.args)
      expect(
        viaBuilder || literal,
        `${write.path}:${write.line} writes a cookie without sameSite. Add sameSite: 'lax' (or use one of ${OPTION_BUILDERS.join(', ')}).`,
      ).toBe(true)
    },
  )

  it.each(WRITES.map((w) => [`${w.path}:${w.line}`, w] as const))(
    '%s is httpOnly unless a script is meant to read it',
    (_label, write) => {
      if (isSupabasePassThrough(write)) return
      const viaBuilder = OPTION_BUILDERS.some((builder) => write.args.includes(builder))
      if (viaBuilder) return
      const name = write.args.match(/^\s*(?:\{\s*name:\s*)?([A-Z_]+)/)?.[1]
      if (name && SCRIPT_READABLE.has(name)) {
        expect(write.args).toMatch(/\bhttpOnly\s*:\s*false/)
        return
      }
      expect(
        /\bhttpOnly\s*:\s*true/.test(write.args),
        `${write.path}:${write.line} writes a cookie a script can read. Add httpOnly: true, or list the cookie in SCRIPT_READABLE with the reason.`,
      ).toBe(true)
    },
  )
})
