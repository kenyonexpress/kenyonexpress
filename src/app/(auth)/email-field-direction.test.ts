import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A LATIN FIELD INSIDE AN RTL FORM IS `dir="ltr"`, AND THE AUTH FORMS WERE THE
 * THREE THAT FORGOT.
 *
 * The rule is not invented here. `NewsletterSignup` states it in a comment and
 * `ContactForm`, `SupplierLeadForm`, `SupplierForm` and the signup phone input
 * all follow it: an address or a phone number is Latin even on a Hebrew page,
 * so the field is LTR while everything around it stays RTL. Without it the
 * caret starts on the wrong side and an `@` typed mid-string appears to jump.
 *
 * MEASURED in the browser before the fix, filling the same `you@example.com`
 * into each: computed direction `rtl` on /login, /forgot-password and /signup,
 * `ltr` on /contact. Screenshots showed the address flush right on the first
 * three and flush left on the fourth - one address, two renderings, one site.
 *
 * Scanned as source rather than rendered, because these are the auth forms:
 * three of the four inputs sit behind a `useState` toggle or a route that
 * needs a session to be interesting, and the attribute is static markup either
 * way.
 */

const AUTH = join(process.cwd(), 'src/app/(auth)')

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) acc.push(full)
  }
  return acc
}

/** Every `<input …/>` element in the file, as raw text. */
function inputs(source: string): string[] {
  return [...source.matchAll(/<input\b[\s\S]*?\/>/g)].map((m) => m[0])
}

describe('Latin fields in the auth forms', () => {
  const files = walk(AUTH)

  it('finds the forms at all', () => {
    // Guards the whole suite against a rename quietly emptying it.
    expect(files.length).toBeGreaterThan(3)
    expect(files.some((f) => f.endsWith('LoginForm.tsx'))).toBe(true)
  })

  it('marks every email and tel input LTR', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const input of inputs(readFileSync(file, 'utf8'))) {
        const latin = /type="(email|tel)"/.test(input)
        if (latin && !/dir="ltr"/.test(input)) {
          const name = /name="([^"]+)"/.exec(input)?.[1] ?? '?'
          offenders.push(`${file.slice(process.cwd().length + 1)} → ${name}`)
        }
      }
    }
    expect(offenders, 'add dir="ltr"; the form around it stays RTL').toEqual([])
  })

  it('leaves the Hebrew fields alone', () => {
    // The counterpart mistake, and the more visible one: a name or a password
    // hint forced LTR would strand Hebrew text on the wrong side of its own box.
    // `inputMode="numeric"` counts as Latin too - the SMS code in PhoneOtpForm
    // is six digits and is rightly LTR.
    const offenders: string[] = []
    for (const file of files) {
      for (const input of inputs(readFileSync(file, 'utf8'))) {
        const latin = /type="(email|tel)"/.test(input) || /inputMode="numeric"/.test(input)
        if (!latin && /dir="ltr"/.test(input)) {
          const name = /name="([^"]+)"/.exec(input)?.[1] ?? '?'
          offenders.push(`${file.slice(process.cwd().length + 1)} → ${name}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
