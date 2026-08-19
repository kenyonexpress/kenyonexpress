import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * READ AS SOURCE, AND NOT FOR WANT OF TRYING.
 *
 * `auth.ts` carries the `'use server'` directive, which requires every export
 * in the module to be an async function. `toHebrew` is a sync helper, so
 * exporting it to test it directly would fail the build - the thing under test
 * cannot be imported by design.
 *
 * What is being protected is narrow enough to survive that. Every key in
 * `ERROR_MAP` is an English string SUPABASE chooses, matched by substring, and
 * none of it is under our control. When one is reworded upstream the match
 * stops firing and "כתובת אימייל או סיסמה שגויים" silently becomes the generic
 * "אירעה שגיאה, נסו שוב": the form still looks like it works, the customer is
 * told nothing useful, and we are told nothing at all.
 *
 * So the rule is that the generic fallback is never silent.
 */

const AUTH = join(process.cwd(), 'src/server/actions/auth.ts')

function source(): string {
  return readFileSync(AUTH, 'utf8')
}

/** Comments describe the old behaviour; only real code should satisfy this. */
function code(): string {
  return source()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('the Supabase error map', () => {
  it('logs before falling back to the generic message', () => {
    const fn = /function toHebrew\([\s\S]*?\n}/.exec(code())?.[0]
    expect(fn, 'toHebrew has been renamed or moved; this test needs updating').toBeTruthy()

    expect(fn).toContain('auth.error_unmapped')
    // The unmatched message itself is what makes the log worth having: without
    // it the entry says only "something was unmapped".
    expect(fn).toMatch(/log\.warn\('auth\.error_unmapped',\s*\{\s*reason:\s*msg\s*\}\)/)
  })

  it('keeps the upstream text out of what the customer is shown', () => {
    const fn = /function toHebrew\([\s\S]*?\n}/.exec(code())?.[0] ?? ''

    // The returned strings are Hebrew constants or the generic fallback, never
    // the raw message - the same split log-coverage.test.ts holds API routes to.
    const returns = [...fn.matchAll(/return\s+([^\n]+)/g)].map((m) => (m[1] ?? '').trim())
    expect(returns.length).toBeGreaterThan(0)
    for (const value of returns) {
      expect(value, 'the upstream message must not be returned to the caller').not.toContain('msg')
    }
  })

  it('still maps the credential failure a shopper actually hits', () => {
    // The generic fallback being logged is not a licence to lose the mapping
    // that matters most: a wrong password is the common case on this form.
    expect(code()).toContain("'Invalid login credentials': 'כתובת אימייל או סיסמה שגויים'")
  })
})
