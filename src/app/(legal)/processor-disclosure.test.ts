import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * EVERY THIRD PARTY THE CODE CAN SEND PERSONAL DATA TO IS NAMED IN THE PRIVACY
 * POLICY.
 *
 * The Privacy Protection Law requires the holder of a database to say who
 * receives the information in it. The policy carries a table of recipients, and
 * that table is only as good as the last time somebody compared it with the
 * integrations.
 *
 * IT HAD ALREADY DRIFTED, and in a way worth describing precisely because it
 * was not wrong yet. `src/server/payments/invoices.ts` mirrors the customer's
 * invoice PDF - name, address, amount - into Cloudflare R2. The policy named
 * Supabase as the only storage provider and did not mention Cloudflare at all.
 *
 * That was ACCURATE on 2026-09-08, because R2 is not enabled on the Cloudflare
 * account (`403 code 10042`, measured from two independent doors) and the
 * mirror is gated behind `isR2Configured()`, so no invoice has ever gone there.
 * It would have stopped being accurate the moment somebody enabled R2 - which
 * is item 3 on the MANUAL list this project is asking the owner to complete.
 *
 * A legal document that becomes false when somebody does a task we asked them
 * to do is worth a test rather than a note. Cloudflare is now disclosed, and
 * this keeps the next integration from repeating it.
 */

const POLICY = readFileSync(resolve(process.cwd(), 'src/app/(legal)/_content/privacy.ts'), 'utf8')

/**
 * Processor -> the module that integrates it. The module path is asserted to
 * exist, so a renamed integration fails here instead of silently dropping a
 * processor out of the check.
 */
const DISCLOSED = [
  ['Cardcom', 'src/lib/payments/env.ts'],
  ['Supabase', 'src/lib/supabase/admin.ts'],
  ['Cloudflare', 'src/lib/storage/r2.ts'],
  ['Resend', 'src/lib/growth/resend.ts'],
  ['Sentry', 'src/lib/observability/sentry.ts'],
  ['PostHog', 'src/lib/observability/posthog.ts'],
  ['Axiom', 'src/lib/observability/axiom.ts'],
] as const

/**
 * Integrated and deliberately NOT in the recipients table, each with the reason.
 * An entry here is a claim that the service receives no personal data.
 */
const NOT_A_RECIPIENT = new Map([
  [
    'Meilisearch',
    'indexes the public catalogue only - product names, prices and categories. No customer row is ever sent, and the service is unprovisioned.',
  ],
  [
    'Upstash',
    'holds rate-limit counters keyed by a derived string, not request content. The IP itself is already disclosed under the hosting provider row, and the default backend is Postgres.',
  ],
])

describe('the recipients table matches the integrations', () => {
  it('checks a real list, not an empty one', () => {
    expect(DISCLOSED.length).toBeGreaterThanOrEqual(7)
  })

  it.each(DISCLOSED)('%s is integrated at %s', (_name, modulePath) => {
    expect(existsSync(resolve(process.cwd(), modulePath)), `${modulePath} is gone`).toBe(true)
  })

  it.each(DISCLOSED.map(([name]) => name))('%s is named in the privacy policy', (name) => {
    expect(
      POLICY.includes(name),
      `${name} can receive personal data and the recipients table does not name it. Either add a row or record it in NOT_A_RECIPIENT with the reason it receives none.`,
    ).toBe(true)
  })

  it.each([...NOT_A_RECIPIENT.keys()])('%s is excluded on the record, not by omission', (name) => {
    expect(NOT_A_RECIPIENT.get(name)?.length ?? 0).toBeGreaterThan(40)
  })
})

/**
 * The specific row this test was written for. Named explicitly so that deleting
 * it is a deliberate act rather than a diff nobody reads.
 */
describe('the invoice mirror is disclosed', () => {
  it('names Cloudflare and says an invoice copy goes there', () => {
    expect(POLICY).toContain('Cloudflare R2')
    expect(POLICY).toContain('חשבונית')
  })

  it('still mirrors invoices to R2, which is why the row is needed', () => {
    const invoices = readFileSync(resolve(process.cwd(), 'src/server/payments/invoices.ts'), 'utf8')
    expect(invoices).toContain('createR2PresignedPutUrl')
  })
})
