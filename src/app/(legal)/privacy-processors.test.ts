import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A PROCESSOR TABLE WITH NO CATCH-ALL ROW CLAIMS TO BE EXHAUSTIVE.
 *
 * `privacy.ts` lists the third parties that receive personal data - hosting,
 * database, payments, email, analytics, Sentry, Axiom, Twilio, Google, and
 * lawful authorities - and it has no "other infrastructure providers" row. Its
 * shape is a promise that the list is complete.
 *
 * Measured 2026-09-08: **Upstash was missing.** The rate limiter's keys are
 * `login:<ip>`, `cart_write:user:<uuid>`, `begin_checkout:user:<uuid>` and the
 * like, so an IP address and a user identifier are sent to a third party on
 * every guarded request. Ten vendors were named and that one was not.
 *
 * The gap is easy to open because a processor arrives as infrastructure. Nobody
 * adds Upstash thinking about the privacy policy; they add it to stop a login
 * form being hammered, and the personal data is in the KEY rather than in a
 * payload anyone would call user data.
 *
 * So this derives the vendor list from `src/lib/env.ts`, which is where a new
 * third party first appears in this codebase, and fails when one of them is not
 * in the table.
 */
const ROOT = resolve(__dirname, '..', '..', '..')
/**
 * COMMENTS STRIPPED, AND THIS TEST NEEDED IT IMMEDIATELY.
 *
 * The first version matched the raw file, and the header comment I had just
 * written names Upstash while explaining why it was missing. So deleting the
 * TABLE ROW left the test green: it was finding the vendor in the paragraph
 * about the vendor. A processor list guarded by prose about the processor list
 * guards nothing.
 *
 * Eighth occurrence of this shape in this stretch of work, and the first inside
 * a guard written in the same pass that found it.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

const privacy = code(readFileSync(join(ROOT, 'src/app/(legal)/_content/privacy.ts'), 'utf8'))
const env = readFileSync(join(ROOT, 'src/lib/env.ts'), 'utf8')

/**
 * Prefixes in env.ts that name an outside company. The others are ours:
 * ALLOW (an allowlist), CRON (our own secret), NODE, VOUCHER (our own signing).
 */
const NOT_A_VENDOR = new Set(['ALLOW', 'CRON', 'NODE', 'VOUCHER', 'NEXT'])

function vendorsInEnv(): string[] {
  const prefixes = [...env.matchAll(/^\s+(?:NEXT_PUBLIC_)?([A-Z][A-Z0-9_]+):/gm)]
    .map((m) => (m[1] ?? '').split('_')[0] ?? '')
    .filter((name) => name.length > 2 && !NOT_A_VENDOR.has(name))
  return [...new Set(prefixes)].sort()
}

describe('every vendor the environment names is in the processor table', () => {
  const vendors = vendorsInEnv()

  it('finds vendors at all, so a rename cannot empty this test', () => {
    expect(vendors.length).toBeGreaterThanOrEqual(3)
  })

  for (const vendor of vendors) {
    it(`${vendor} is listed`, () => {
      // Case-insensitive: the table writes them as they brand themselves.
      expect(
        new RegExp(vendor, 'i').test(privacy),
        `${vendor} appears in src/lib/env.ts and not in the privacy policy's processor table. The table has no catch-all row, so its shape claims to be complete.`,
      ).toBe(true)
    })
  }
})

describe('the Upstash row says what actually reaches it', () => {
  it('names the identifier, because that is where the personal data is', () => {
    // Not the request body - the KEY. That is the part that is easy to miss.
    expect(privacy).toContain('מונה בקשות לפי כתובת IP או מזהה משתמש')
  })

  it('says the request content is not sent', () => {
    expect(privacy).toContain('תוכן הבקשה עצמה אינו נשלח')
  })
})

describe('the table still has no catch-all', () => {
  it('does not add a vague row instead of naming vendors', () => {
    // "and other service providers" would make this test pass forever and the
    // policy mean nothing.
    for (const vague of ['ספקים נוספים', 'ספקי שירות אחרים', 'וכיוצא באלה']) {
      expect(privacy).not.toContain(vague)
    }
  })
})
