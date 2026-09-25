import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WALLET_REASON_LABELS } from '@/server/queries/account'
import { describe, expect, it } from 'vitest'
import { AFFILIATE_WALLET_REASON } from './pay'

/**
 * The affiliate programme is four call sites in files that already existed,
 * and "finished features with no consumer" is the defect shape this repo keeps
 * finding. These pin the consumers, the same way referrals/wired.test.ts does.
 */

const root = process.cwd()
function code(file: string): string {
  return readFileSync(join(root, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('the attribution', () => {
  it('is snapshotted at checkout, the last request that can still read the cookie', () => {
    const checkout = code('src/server/actions/payments/checkout.ts')
    expect(checkout).toContain(
      'snapshotAffiliateAttribution(admin, { orderId: order.id, userId: user.id })',
    )
  })

  it('reads the one cookie the proxy writes and normalises before writing', () => {
    const attribution = code('src/server/affiliates/attribution.ts')
    expect(attribution).toContain('REFERRAL_COOKIE')
    expect(attribution).toContain('normalizeReferralCode(')
    expect(attribution).toContain('update({ affiliate_code: code })')
  })
})

describe('the conversion', () => {
  it('runs in finalize, after the referral, with the snapshotted code', () => {
    const finalize = code('src/server/payments/finalize.ts')
    const referralAt = finalize.indexOf('completeReferralForOrder(admin, {')
    const affiliateAt = finalize.indexOf('recordAffiliateConversionForOrder(admin, {')
    expect(referralAt).toBeGreaterThan(0)
    expect(affiliateAt).toBeGreaterThan(referralAt)
    expect(finalize).toContain('affiliateCode: order.affiliate_code')
    expect(finalize).toContain('affiliate_code, ${orderCashbackSelect(orderGeneration)}')
  })

  it('decides nothing itself: every outcome comes from decideConversion', () => {
    const convert = code('src/server/affiliates/convert.ts')
    expect(convert).toContain('decideConversion({')
    expect(convert).not.toMatch(/commission_bp\s*\*/)
    expect(convert).not.toContain('applyBp(')
  })

  it('reuses the referral fraud guard and the referral signal table', () => {
    const convert = code('src/server/affiliates/convert.ts')
    expect(convert).toContain("rpc('fn_referral_fraud_signals'")
    expect(code('src/server/affiliates/signals.ts')).toContain("from('referral_signals')")
  })

  it('reads a missing 244 as a warning and not as a thrown finalize', () => {
    const convert = code('src/server/affiliates/convert.ts')
    expect(convert).toContain("'42P01'")
    expect(convert).toContain('affiliates.campaigns_table_missing')
  })
})

describe('the payout', () => {
  it('moves money through fn_wallet_transfer with a per-conversion idempotency key', () => {
    const pay = code('src/server/affiliates/pay.ts')
    expect(pay).toContain("rpc('fn_wallet_transfer'")
    expect(pay).toContain('p_idempotency: `affiliate:${row.id}`')
    expect(pay).toContain("'platform:cashback_reserve'")
  })

  it('converts agorot to shekels once, at the RPC boundary only', () => {
    const pay = code('src/server/affiliates/pay.ts')
    expect(pay).toContain('p_amount_ils: agorotToIls(commission)')
    expect(pay).not.toMatch(/\/\s*100\b/)
  })

  it('has a Hebrew label on the wallet ledger for its reason code', () => {
    expect(WALLET_REASON_LABELS[AFFILIATE_WALLET_REASON]).toBeDefined()
    expect(WALLET_REASON_LABELS[AFFILIATE_WALLET_REASON]).not.toBe(AFFILIATE_WALLET_REASON)
  })

  it('is the ONE payer: the admin queue approves through the same function', () => {
    expect(code('src/server/actions/admin/affiliate-campaigns.ts')).toContain(
      'payAffiliateConversion(',
    )
  })
})

describe('the share', () => {
  it('puts the code on every channel of the product share row', () => {
    const row = code('src/components/shared/ProductShareRow.tsx')
    expect(row).toContain('useShareAttribution()')
    expect(row.match(/url=\{shareHref\}/g)?.length).toBe(4)
    expect(row).toContain('url: shareHref()')
  })

  it('asks the server only for a signed-in visitor', () => {
    const hook = code('src/components/shared/useShareAttribution.ts')
    // The browser client is imported lazily (see the hook), so the session
    // read is `createClient().auth.getUser()` and the gate is on its result.
    expect(hook).toContain("import('@/lib/supabase/client')")
    expect(hook).toContain('.auth.getUser()')
    expect(hook).toContain('!result.data.user')
  })
})

describe('the enrolment', () => {
  it('mints through the sanctioned definer on the service key, uuid from the session', () => {
    const action = code('src/server/actions/affiliates.ts')
    expect(action).toContain("rpc('fn_ensure_referral_code'")
    expect(action).toContain('createAdminClient()')
    expect(action).toContain('supabase.auth.getUser()')
    expect(action).not.toContain("formData.get('user_id')")
  })

  it('is reachable from the account nav', () => {
    expect(code('src/components/account/AccountNav.tsx')).toContain("'/account/affiliate'")
  })
})
