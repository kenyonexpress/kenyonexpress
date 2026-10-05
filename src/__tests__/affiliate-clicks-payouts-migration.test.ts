import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AFFILIATE_PAYOUT_REASON } from '@/lib/affiliates/payout'
import { REFERRAL_ALPHABET, REFERRAL_CODE_LENGTH } from '@/lib/referrals/code'
import { WALLET_REASON_LABELS } from '@/server/queries/account'
import { describe, expect, it } from 'vitest'

/**
 * Pending 252 and the code must describe the same two tables.
 *
 * The proxy inserts a click with a code shaped by `normalizeReferralCode`;
 * the SQL CHECK must accept exactly that alphabet or every click is 23514.
 * The payout action writes `pending` and the admin action flips to `paid` /
 * `rejected`; the CHECK must know those three words and no others. And the
 * two tables must be readable by their owner and writable by nobody, which
 * is the property every other affiliate table has (244).
 */

const SQL = readFileSync(
  resolve(process.cwd(), 'migrations/pending/252_affiliate_clicks_payouts.sql'),
  'utf8',
)

/** Strip `-- ...` comments so prose about what the file does not do is not matched. */
const code = SQL.replace(/^\s*--.*$/gm, '')

describe('252_affiliate_clicks_payouts.sql', () => {
  it('accepts exactly the 098 code alphabet on a click row', () => {
    const match = code.match(/CHECK \(code ~ '\^\[([^\]]+)\]\{(\d+)\}\$'\)/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe(REFERRAL_ALPHABET.replace('0123456789', '0-9'))
    expect(Number(match?.[2])).toBe(REFERRAL_CODE_LENGTH)
  })

  it('resolves and counts in one BEFORE INSERT trigger that drops a non-affiliate code', () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_affiliate_click_before_insert\(\)/)
    expect(code).toMatch(/BEFORE INSERT ON public\.affiliate_clicks/)
    expect(code).toMatch(/IF v_affiliate_id IS NULL THEN\s+RETURN NULL;/)
    expect(code).toMatch(/SET total_clicks = COALESCE\(total_clicks, 0\) \+ 1/)
    // Invoker, not definer: the service role is the only inserter.
    expect(code).not.toMatch(/SECURITY DEFINER/)
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.fn_affiliate_click_before_insert\(\) FROM PUBLIC, anon, authenticated/,
    )
  })

  it('knows the three payout statuses the code writes, and one open request at a time', () => {
    expect(code).toMatch(/CHECK \(status IN \('pending', 'paid', 'rejected'\)\)/)
    expect(code).toMatch(/CHECK \(amount_agorot > 0\)/)
    expect(code).toMatch(/CHECK \(\(status = 'pending'\) = \(decided_at IS NULL\)\)/)
    expect(code).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_payout_requests_one_open\s+ON public\.affiliate_payout_requests \(affiliate_id\)\s+WHERE status = 'pending'/,
    )
  })

  it('stores money as integer agorot only', () => {
    expect(code).toMatch(/amount_agorot\s+bigint\s+NOT NULL/)
    expect(code).not.toMatch(/numeric|double precision|real\b|_ils\b/)
  })

  it('is readable by the owner and the admin and writable by nobody', () => {
    for (const table of ['affiliate_clicks', 'affiliate_payout_requests']) {
      expect(code).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`))
      expect(code).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`))
      expect(code).toMatch(new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon`))
      expect(code).toMatch(new RegExp(`GRANT SELECT ON public\\.${table} TO authenticated`))
      expect(code).not.toMatch(new RegExp(`GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*${table}`))
    }
    const policies = [...code.matchAll(/CREATE POLICY (\w+)\s+ON public\.\w+ FOR (\w+)/g)].map(
      (m) => [m[1], m[2]],
    )
    expect(policies).toHaveLength(4)
    expect(policies.every(([, cmd]) => cmd === 'SELECT')).toBe(true)
  })

  it('names the ledger reason the admin action writes, and that reason is labelled', () => {
    expect(SQL).toContain(`reason \`${AFFILIATE_PAYOUT_REASON}\``)
    expect(WALLET_REASON_LABELS[AFFILIATE_PAYOUT_REASON]).toBeDefined()
    expect(WALLET_REASON_LABELS[AFFILIATE_PAYOUT_REASON]).not.toBe(AFFILIATE_PAYOUT_REASON)
  })

  it('alters no enum and touches no 244 table', () => {
    expect(code).not.toMatch(/ALTER TYPE/)
    expect(code).not.toMatch(/affiliate_campaigns|affiliate_conversions/)
  })
})
