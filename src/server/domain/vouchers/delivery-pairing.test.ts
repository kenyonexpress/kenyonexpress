import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GUEST CHECKOUT AND VOUCHER RESEND ARE ONE DECISION.
 *
 * STEP 12 asks for a `resend` verb and there is none. The voucher email goes
 * once, at the end of `finalizeOrder`, deduplicated by Resend's own idempotency
 * key `voucher-email:<orderId>`; no admin or customer action sends it again.
 *
 * That is tolerable only because checkout requires an account. `beginCheckout`
 * refuses an anonymous caller at both entry points, so every voucher belongs to
 * a signed-in customer and is reachable without the email at
 * `/account/my-vouchers` and `/coupon/[id]`, both gated by `src/proxy.ts`. A
 * customer who loses the email logs in.
 *
 * Add guest checkout and that stops being true in the same commit that adds it:
 * a buyer with a lost email would have no account to look in and no way to ask
 * for the voucher again, and a convenience gap becomes a lost purchase. The two
 * facts are far apart in the tree and nothing else connects them.
 */
const ROOT = resolve(__dirname, '..', '..', '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

const checkout = read('src/server/actions/payments/checkout.ts')
const proxy = read('src/proxy.ts')

/** Any path that would send a voucher email a second time, on demand. */
function hasResendPath(): boolean {
  const email = read('src/server/payments/voucher-email.ts')
  const adminVouchers = read('src/server/actions/admin/vouchers.ts')
  return /export async function resend|resendVoucher/i.test(`${email}\n${adminVouchers}`)
}

describe('the pair holds', () => {
  it('checkout refuses an anonymous caller, which is what makes resend optional', () => {
    // Two entry points, both guarded. A single guard would be one refactor away
    // from a hole.
    const refusals = checkout.match(/if \(!user\)/g) ?? []
    expect(refusals.length).toBeGreaterThanOrEqual(2)
    expect(checkout).toContain('יש להתחבר לפני התשלום')
  })

  it('or there is a resend path, if it ever stops refusing', () => {
    const guestCheckoutAllowed = !checkout.includes('יש להתחבר לפני התשלום')
    expect(
      !guestCheckoutAllowed || hasResendPath(),
      'Checkout no longer requires an account and there is still no way to resend a voucher email. A guest who loses the email has no account to look in and no way to ask again.',
    ).toBe(true)
  })
})

describe('the account routes that replace the email are still gated', () => {
  it('both voucher surfaces sit behind a session', () => {
    expect(proxy).toContain("pathname.startsWith('/account')")
    expect(proxy).toContain("pathname.startsWith('/coupon/')")
  })
})

describe('the email itself stays send-once', () => {
  it('is deduplicated by the provider rather than by a flag we would have to keep correct', () => {
    expect(read('src/server/payments/voucher-email.ts')).toContain('voucher-email:')
  })
})
