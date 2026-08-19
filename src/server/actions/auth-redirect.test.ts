import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `NEXT_PUBLIC_APP_URL` IS NOT REQUIRED AT BOOT, SO IT MUST NEVER BE
 * INTERPOLATED BARE.
 *
 * `lib/env.ts` refuses to start without the Cardcom secrets, the Supabase keys,
 * `VOUCHER_QR_SECRET` and `CRON_SECRET`. This one is absent from that list, so
 * a deploy without it boots green - and a template literal turns the gap into
 * the four-letter string "undefined" rather than an error.
 *
 * MEASURED against `pnpm start` on a machine where the variable was unset: the
 * Google button sent the customer to a real Google screen carrying
 * `redirect_to=undefined%2Fauth%2Fcallback%3Fnext%3D%2F`. No thrown error, no
 * log line, a working-looking button, and a broken trip back. The same read sat
 * behind the magic link and the password-reset mail, so all three routes into
 * an account shared it.
 *
 * The rule is therefore about the SHAPE of the read, not about one file: every
 * other consumer in `src/` already supplies `?? 'https://kenyonexpress.co.il'`
 * or calls `siteUrl()`. Anything that interpolates the variable straight into a
 * string has no fallback by construction.
 */

const SRC = join(process.cwd(), 'src')

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full)
  }
  return acc
}

/** Strips comments so prose about the old behaviour cannot fail the test. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('the app origin', () => {
  it('is never interpolated straight from the environment', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const body = code(file)
      // `${process.env.NEXT_PUBLIC_APP_URL}` - inside a template literal, with
      // nothing between the read and the string it lands in.
      if (/\$\{\s*process\.env\.NEXT_PUBLIC_APP_URL\s*\}/.test(body)) {
        offenders.push(file.slice(process.cwd().length + 1))
      }
    }
    expect(
      offenders,
      'use siteUrl() from @/lib/site-url, or supply a ?? fallback; a bare read stringifies to "undefined"',
    ).toEqual([])
  })

  it('reaches the auth redirects through siteUrl', () => {
    const auth = code(join(SRC, 'server/actions/auth.ts'))

    // The three ways into an account: Google, the magic link, the reset mail.
    expect(auth).toContain("import { siteUrl } from '@/lib/site-url'")
    expect(auth.match(/authRedirect\(/g) ?? []).toHaveLength(4) // 1 definition + 3 uses
    expect(auth).not.toContain('process.env.NEXT_PUBLIC_APP_URL')
  })

  it('still points every one of them at /auth/callback', () => {
    // The fallback is worthless if the path it is glued to drifts: the callback
    // route is the only thing that exchanges the code for a session.
    const auth = code(join(SRC, 'server/actions/auth.ts'))
    const paths = [...auth.matchAll(/authRedirect\(\s*[`'"]([^`'"]*)/g)].map((m) => m[1])
    expect(paths.filter(Boolean)).toEqual([
      '/auth/callback?next=${encodeURIComponent(next)}',
      '/auth/callback',
      '/auth/callback?next=/reset-password',
    ])
  })
})
