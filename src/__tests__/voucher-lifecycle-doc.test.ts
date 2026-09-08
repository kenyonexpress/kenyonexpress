import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE VOUCHER DOC SAID THE EXPIRY SWEEP WAS NOT RUNNING. IT HAD BEEN FOR A WEEK.
 *
 * `docs/VOUCHER-LIFECYCLE.md` carried an operational warning - "vouchers do not
 * expire on their own and expiry warnings are never sent" - and called it the
 * highest-impact consequence on the voucher path. It stopped being true on
 * 2026-09-02 and stayed on the page until 2026-09-08. Measured from the
 * workflow's own logs: `expire-vouchers` is in `main`'s `cron-jobs.json`, which
 * is the list a `schedule:` trigger runs, and run 34175710698 recorded
 * `expire-vouchers -> 200`.
 *
 * A stale warning is not the safe direction of a documentation error. It sends
 * someone to fix a thing that works, and it teaches them the document is not
 * worth reading, which is how the NEXT warning gets ignored.
 */
const ROOT = resolve(__dirname, '..', '..')
const doc = readFileSync(join(ROOT, 'docs', 'VOUCHER-LIFECYCLE.md'), 'utf8')

describe('the expiry section describes the scheduler that exists', () => {
  it('carries no standing warning that the scheduler is off', () => {
    // Asserted against the WARNING's own form, not against the words in it.
    // The correction below necessarily quotes the stale sentence to say it was
    // stale, and a loose phrase match flags that quotation - which is the same
    // mistake migration-lint.mjs once made against its own documentation, and
    // it caught me writing this file.
    expect(doc).not.toContain('> **Operational warning.** No scheduler is currently running')
    expect(doc).not.toMatch(/^> .*never sent/m)
  })

  it('names the evidence rather than asserting the scheduler works', () => {
    expect(doc).toContain('cron-jobs.json')
    expect(doc).toContain('expire-vouchers -> 200')
  })
})

describe('the reminder buckets STEP 12 asks for are written down', () => {
  it('records both offsets, not just "before the deadline"', () => {
    expect(doc).toMatch(/7 and 1 days/)
    expect(doc).toContain('ARRAY[7, 1]')
  })
})

describe('the residual drift is still stated', () => {
  it('keeps the two jobs that genuinely never run', () => {
    // Correcting the warning must not turn into "the cron situation is fine".
    // retention and weekly-digest exist only on this branch and are never
    // called; whatsapp exists only on main and 404s.
    for (const job of ['retention', 'weekly-digest', 'whatsapp']) {
      expect(doc).toContain(job)
    }
    expect(doc).toContain('audit-cron-drift')
  })
})
