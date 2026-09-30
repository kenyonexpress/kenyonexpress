import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isServedOverHttps, sessionCookieOptions } from './session-cookie'

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

/**
 * The session cookie policy, and the ratchet that keeps every server-side
 * Supabase client on it. The attributes themselves are three booleans; what
 * regresses silently is a NEW `createServerClient` call written without
 * `cookieOptions`, which would fall back to the library's `httpOnly: false`
 * and put the refresh token back within reach of any injected script.
 */

describe('sessionCookieOptions', () => {
  it('is HttpOnly, SameSite=Lax and Secure on the production origin', () => {
    expect(
      sessionCookieOptions(env({ NEXT_PUBLIC_APP_URL: 'https://kenyonexpress.co.il' })),
    ).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
    })
  })

  it('drops Secure only for an explicit http:// origin (the local pnpm start)', () => {
    expect(sessionCookieOptions(env({ NEXT_PUBLIC_APP_URL: 'http://localhost:3311' })).secure).toBe(
      false,
    )
    expect(sessionCookieOptions(env({ NEXT_PUBLIC_APP_URL: 'HTTP://127.0.0.1:3000' })).secure).toBe(
      false,
    )
  })

  it('fails towards Secure when the variable is missing or malformed', () => {
    expect(isServedOverHttps(env({}))).toBe(true)
    expect(isServedOverHttps(env({ NEXT_PUBLIC_APP_URL: '' }))).toBe(true)
    expect(isServedOverHttps(env({ NEXT_PUBLIC_APP_URL: 'kenyonexpress.co.il' }))).toBe(true)
  })

  it('never widens SameSite: Strict would drop the OAuth and magic-link returns', () => {
    expect(sessionCookieOptions(env({})).sameSite).toBe('lax')
  })
})

function sourcesUnder(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourcesUnder(path))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push({ path, source: readFileSync(resolve(process.cwd(), path), 'utf8') })
    }
  }
  return out
}

describe('every createServerClient call carries the session cookie policy', () => {
  // Sites that CONSTRUCT the ssr client. `lib/supabase/bearer.ts` imports
  // `createClient` from ./server under the same name and is a caller, not a
  // site; it is the one the scan must not confuse.
  const sites = sourcesUnder('src').filter(
    ({ source }) =>
      source.includes("from '@supabase/ssr'") && source.includes('createServerClient('),
  )

  it('finds the two known sites, so a broken scan cannot pass silently', () => {
    expect(sites.map((s) => s.path).sort()).toEqual(['src/lib/supabase/server.ts', 'src/proxy.ts'])
  })

  it.each(sites.map((s) => [s.path, s.source] as const))(
    '%s passes cookieOptions',
    (_p, source) => {
      expect(source).toMatch(/cookieOptions:\s*sessionCookieOptions\(\)/)
    },
  )

  it('the browser client is never handed a session cookie to read', () => {
    // A browser client with `cookieOptions` of its own would be a second
    // policy; it has nothing to read once the cookie is HttpOnly and it says so.
    const client = readFileSync(resolve(process.cwd(), 'src/lib/supabase/client.ts'), 'utf8')
    expect(client).not.toMatch(/cookieOptions/)
    expect(client).toMatch(/HttpOnly/)
  })
})
