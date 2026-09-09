import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SECTIONS 33: "buyer sees order but not the code".
 *
 * A GIFTED VOUCHER IS STILL OWNED BY THE BUYER. That is deliberate and not an
 * oversight: `vouchers.user_id` is NOT NULL, the recipient usually has no
 * account yet, and the person who paid is the person a refund and a receipt
 * belong to. Ownership moves only when the recipient opens the claim link.
 *
 * Which means the gift comes back from an ownership-scoped read exactly like
 * any other coupon, and four customer surfaces render a code or a QR out of
 * these two functions: `/account/coupons`, `/coupon/[id]`, the Apple Wallet
 * pass, and (through its own read) the confirmation page. Before this, the
 * buyer could see - and use - the present they had just paid to give away, and
 * the recipient would follow their link to a coupon already redeemed.
 *
 * The withholding is therefore asserted AT THE READ, not on the pages: a page
 * cannot print what it was never handed, and the next surface somebody adds
 * inherits the rule instead of having to remember it.
 */

type Result = { data: unknown; error: unknown }

const readResult: Result = { data: null, error: null }

function makeBuilder() {
  const builder: Record<string, unknown> = {}
  for (const method of ['from', 'select', 'eq', 'in', 'is', 'not', 'or', 'order', 'limit']) {
    builder[method] = () => builder
  }
  builder.single = async () => ({ ...readResult })
  builder.maybeSingle = async () => ({ ...readResult })
  // biome-ignore lint/suspicious/noThenProperty: PostgREST builders are thenable, and these reads are awaited with no terminal call
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ ...readResult })
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => (makeBuilder().from as (t: string) => unknown)(t),
    auth: { getUser: async () => ({ data: { user: { id: 'buyer-1' } } }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeBuilder() }))
vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { getCustomerVouchers, getCustomerVoucher } = await import('@/server/queries/vouchers')

const VOUCHER_ID = '11111111-1111-4111-8111-111111111111'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: VOUCHER_ID,
    code: 'ABCDEFGHJK',
    qr_payload: 'ke:v1:ABCDEFGHJK:sig',
    status: 'issued',
    face_value_agorot: 20000,
    coupon_price_agorot: 2000,
    remaining_amount_due_agorot: 18000,
    offer_valid_until: '2026-12-01T00:00:00.000Z',
    expires_at: '2026-12-30T00:00:00.000Z',
    issued_at: '2026-09-01T00:00:00.000Z',
    redeemed_at: null,
    gift_claim_token_hash: null,
    gift_claimed_at: null,
    gift_sent_at: null,
    gift_recipient_name: null,
    gift_recipient_email: null,
    product: { name_he: 'ארוחת בוקר', slug: 'breakfast' },
    supplier: { name: 'טעמים' },
    ...overrides,
  }
}

const unclaimedGift = (overrides: Record<string, unknown> = {}) =>
  row({
    gift_claim_token_hash: 'a'.repeat(64),
    gift_claimed_at: null,
    gift_sent_at: '2026-09-01T00:00:00.000Z',
    gift_recipient_name: 'דנה',
    gift_recipient_email: 'dana@example.com',
    ...overrides,
  })

beforeEach(() => {
  readResult.data = null
  readResult.error = null
})

describe('getCustomerVouchers', () => {
  it('hands back the code and the QR of an ordinary coupon', async () => {
    readResult.data = [row()]
    const [voucher] = await getCustomerVouchers()
    expect(voucher?.code).toBe('ABCDEFGHJK')
    expect(voucher?.qr_payload).toBe('ke:v1:ABCDEFGHJK:sig')
    expect(voucher?.gift).toBeNull()
  })

  it('WITHHOLDS the code of a gift the recipient has not collected', async () => {
    readResult.data = [unclaimedGift()]
    const [voucher] = await getCustomerVouchers()
    expect(voucher?.code).toBe('')
  })

  it('withholds the QR PAYLOAD with it, because the QR is the code', async () => {
    // A blanked code beside a live QR is the same leak with one extra step: the
    // payload is what the counter scans and burns.
    readResult.data = [unclaimedGift()]
    const [voucher] = await getCustomerVouchers()
    expect(voucher?.qr_payload).toBe('')
  })

  it('leaks the code through no field at all', async () => {
    readResult.data = [unclaimedGift()]
    const [voucher] = await getCustomerVouchers()
    expect(JSON.stringify(voucher)).not.toContain('ABCDEFGHJK')
  })

  it('never hands over the claim token hash, which is the credential', async () => {
    readResult.data = [unclaimedGift()]
    const [voucher] = await getCustomerVouchers()
    expect(voucher?.gift?.recipientEmail).toBe('dana@example.com')
    expect(JSON.stringify(voucher?.gift)).not.toContain('a'.repeat(64))
  })

  it('tells the buyer who it went to, which is their own input read back', async () => {
    readResult.data = [unclaimedGift()]
    const [voucher] = await getCustomerVouchers()
    expect(voucher?.gift).toEqual({
      recipientName: 'דנה',
      recipientEmail: 'dana@example.com',
      deliverAt: null,
      queuedAt: '2026-09-01T00:00:00.000Z',
    })
  })

  it('gives the code back once the gift has been CLAIMED', async () => {
    /**
     * After a claim, `user_id` is the recipient, so this read returns the row
     * to THEM - and they are exactly who should see the code. Keying the rule
     * on `gift_claimed_at` rather than on the token hash is what makes that
     * work; keying it on the hash alone would leave the recipient holding a
     * coupon they can never present.
     */
    readResult.data = [unclaimedGift({ gift_claimed_at: '2026-09-05T00:00:00.000Z' })]
    const [voucher] = await getCustomerVouchers()
    expect(voucher?.code).toBe('ABCDEFGHJK')
    expect(voucher?.gift).toBeNull()
  })

  it('withholds per row, not per list', async () => {
    readResult.data = [unclaimedGift({ id: 'v-gift' }), row({ id: 'v-mine' })]
    const vouchers = await getCustomerVouchers()
    expect(vouchers.find((v) => v.id === 'v-gift')?.code).toBe('')
    expect(vouchers.find((v) => v.id === 'v-mine')?.code).toBe('ABCDEFGHJK')
  })
})

describe('getCustomerVoucher', () => {
  it('withholds the code on the detail read too', async () => {
    // The one that matters most: this is the read behind the QR page and the
    // Apple Wallet pass.
    readResult.data = unclaimedGift()
    const voucher = await getCustomerVoucher(VOUCHER_ID)
    expect(voucher?.code).toBe('')
    expect(voucher?.qr_payload).toBe('')
    expect(voucher?.gift?.recipientName).toBe('דנה')
  })

  it('leaves an ordinary coupon untouched', async () => {
    readResult.data = row()
    const voucher = await getCustomerVoucher(VOUCHER_ID)
    expect(voucher?.code).toBe('ABCDEFGHJK')
    expect(voucher?.gift).toBeNull()
  })

  it('still returns null for a voucher that is not there', async () => {
    readResult.data = null
    expect(await getCustomerVoucher(VOUCHER_ID)).toBeNull()
  })
})
