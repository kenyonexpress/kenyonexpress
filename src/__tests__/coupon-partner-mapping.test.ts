import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ONE QUESTION, ONE ANSWER: WHAT IS THE BRIEF'S "COUPON-PARTNER"?
 *
 * `docs/DECISION-LOG.md` D-001 settled it on 2026-09-07 against production.
 * There is no `coupon_partner` in `user_role` and zero of the 146 policies name
 * one. Wherever the queue says "coupon-partner" it means `vendor`, and the
 * permission comes from a `supplier_members` row rather than the profile role:
 * `redeem_voucher` and `is_supplier_member()` both derive the supplier from
 * membership and never read `profiles.role`. D-001's stated reason for refusing
 * to add the role was that it would create a SECOND SOURCE OF TRUTH which could
 * disagree with the first.
 *
 * That is exactly what then happened to the ANSWER. On 2026-09-08
 * `guard-required.test.ts` re-labelled `support` as the coupon partner, and the
 * launch-readiness assessment cited that label as evidence that a requirement
 * about a different role was met. Three sources said `vendor`, two said
 * `support`, and the one an owner reads before launching was in the minority.
 *
 * This test is the fork guard. It does not care which answer is right in the
 * abstract; it cares that the repository gives one.
 */
const ROOT = resolve(__dirname, '..', '..')
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8')

/** Every file that mentions the brief's role name, as of 2026-09-08. */
const MENTIONS = [
  'docs/DECISION-LOG.md',
  'docs/LAUNCH-READINESS-2026-09-08.md',
  'docs/MEGA-BLOCK-AUDIT.md',
  'docs/ROLE-MATRIX.md',
  'src/db/__tests__/rls-role-boundaries.test.ts',
  'src/server/actions/admin/guard-required.test.ts',
  'src/server/queries/supplier-redemptions.test.ts',
]

describe('the decision of record', () => {
  it('D-001 maps the role to vendor and the permission to membership', () => {
    const log = read('docs', 'DECISION-LOG.md')
    const d001 = log.slice(log.indexOf('## D-001'), log.indexOf('## D-002'))
    expect(d001).toContain('vendor')
    expect(d001).toContain('supplier_members')
  })

  it('the measured role table agrees with it', () => {
    const matrix = read('docs', 'ROLE-MATRIX.md')
    expect(matrix).toContain('D-001')
    expect(matrix).toContain('supplier_members')
  })
})

describe('nothing claims the answer is support', () => {
  // The specific fork that happened. `support` is the read-only STAFF role and
  // a different subject; conflating them makes a true statement about support
  // read as evidence about a coupon partner.
  const FORKED =
    /coupon.?partner[^.\n]{0,80}`?support`?|`?support`?[^.\n]{0,40}(is|as) the[^.\n]{0,20}coupon.?partner/i

  for (const file of MENTIONS) {
    it(`${file} does not map coupon-partner onto support`, () => {
      const text = read(...file.split('/'))
      const forked = text.match(FORKED)
      expect(
        forked?.[0] ?? null,
        `${file} appears to map the coupon partner onto \`support\`. D-001 maps it to \`vendor\` via supplier_members.`,
      ).toBeNull()
    })
  }
})

describe('every mention defers to the decision instead of re-deciding', () => {
  // MEGA-BLOCK-AUDIT reached the same conclusion independently and predates
  // D-001, which is why it is allowed to state it in its own words.
  const INDEPENDENT = new Set(['docs/DECISION-LOG.md', 'docs/MEGA-BLOCK-AUDIT.md'])

  for (const file of MENTIONS) {
    if (INDEPENDENT.has(file)) continue
    it(`${file} points at D-001 or the role matrix`, () => {
      const text = read(...file.split('/'))
      expect(
        /D-001|ROLE-MATRIX/.test(text),
        `${file} answers this question without citing the decision`,
      ).toBe(true)
    })
  }
})
