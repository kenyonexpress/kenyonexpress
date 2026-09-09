import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Customer-facing voucher reads. RLS (051 vouchers_owner_read) already scopes
 * rows to auth.uid(); the user_id filter here is defence in depth, not the
 * boundary.
 */

/**
 * What the buyer of a gift is told about a coupon they own but may not use.
 *
 * `recipientEmail` is here and the claim token is not, and that split is the
 * point: the buyer typed the address, so showing it back is showing them their
 * own input, while the token is a bearer credential that would let them collect
 * the gift themselves.
 */
export interface VoucherGiftState {
  recipientName: string | null
  recipientEmail: string | null
  /** When the buyer asked for it to be sent (226). Null means immediately. */
  deliverAt: string | null
  /** When it was queued. Null means it has not been queued yet. */
  queuedAt: string | null
}

export interface CustomerVoucher {
  id: string
  /**
   * WITHHELD - empty string - while this is an uncollected gift. See
   * `withholdGiftedCode`. Not optional, because every existing caller renders
   * it unconditionally and a type that let them keep doing so would be a type
   * that let the leak back in.
   */
  code: string
  qr_payload: string
  /**
   * Set only when the code above has been withheld, and it is what the surfaces
   * render in its place. Null on an ordinary coupon.
   */
  gift: VoucherGiftState | null
  status: 'issued' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
  offer_valid_until: string
  expires_at: string
  issued_at: string
  redeemed_at: string | null
  product: { name_he: string | null; slug: string | null } | null
  supplier: { name: string | null } | null
}

const GIFT_SELECT = `gift_claim_token_hash, gift_claimed_at, gift_sent_at,
       gift_recipient_name, gift_recipient_email`

const VOUCHER_SELECT = `id, code, qr_payload, status,
       face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
       offer_valid_until, expires_at, issued_at, redeemed_at,
       ${GIFT_SELECT},
       product:products(name_he, slug),
       supplier:suppliers(name)`

/** The gift columns as they come back from Postgres, before they are a state. */
type GiftColumns = {
  gift_claim_token_hash?: string | null
  gift_claimed_at?: string | null
  gift_sent_at?: string | null
  gift_deliver_at?: string | null
  gift_recipient_name?: string | null
  gift_recipient_email?: string | null
}

/**
 * Blanks the code and the QR of a gift its buyer has not given away yet.
 *
 * WHY THIS IS AT THE READ AND NOT IN THE PAGES. A gifted voucher stays owned by
 * the BUYER until the recipient claims it - deliberately, because the buyer
 * paid and a refund belongs to them - so it comes back from an ownership-scoped
 * read like any other coupon. Four customer surfaces render a code or a QR out
 * of these two functions: `/account/coupons`, `/coupon/[id]`, the Apple Wallet
 * pass at `/api/wallet/apple/[id]`, and the confirmation page. Fixing four
 * templates leaves the fifth one somebody adds next month, and the failure is
 * silent: the page looks right, and the only symptom is a recipient turning up
 * at a counter to be told the coupon was already used - by the person who
 * bought it for them.
 *
 * So the code never leaves this file for a voucher that is not the reader's to
 * present. A surface cannot print what it was not given.
 *
 * `qr_payload` goes with it, and that is not tidiness: the QR IS the code. A
 * blanked code beside a live QR is the same leak with an extra step.
 *
 * NOT A SECURITY BOUNDARY, AND SAYING SO MATTERS. RLS scopes these rows to the
 * owner, and the owner here IS the buyer - so this withholds from somebody who
 * could read the row directly with their own token. It is a correctness rule
 * about whose coupon it is, and the thing that actually stops the buyer
 * REDEEMING it is that the counter burns a code they were never shown.
 */
function withholdGiftedCode<T extends { code: string; qr_payload: string } & GiftColumns>(
  row: T,
): T & { gift: VoucherGiftState | null } {
  const held = Boolean(row.gift_claim_token_hash) && !row.gift_claimed_at
  if (!held) return { ...row, gift: null }

  return {
    ...row,
    code: '',
    qr_payload: '',
    gift: {
      recipientName: row.gift_recipient_name ?? null,
      recipientEmail: row.gift_recipient_email ?? null,
      // 226 is pending, so this column may not have been selected at all.
      // Absent reads as "no schedule", which is what it means.
      deliverAt: row.gift_deliver_at ?? null,
      queuedAt: row.gift_sent_at ?? null,
    },
  }
}

/**
 * A voucher read, or a throw. Never a silent absence.
 *
 * A voucher is a thing the customer has already PAID for, and every caller of
 * these reads renders "not there" as a fact: the account page says the customer
 * has no coupons, and the counter's lookup answers `not_found`, 404, and writes
 * a refusal row saying the code does not exist. A discarded `error` produced
 * exactly those, from a query that never got an answer at all - and the refusal
 * log, which exists so a disputed scan can be reconstructed, was left holding a
 * record of something that did not happen.
 *
 * PGRST116 is exempt for `.single()` / `.maybeSingle()`, where it is the "no
 * row" answer these callers already handle, and is the reason this is not the
 * same helper the cart uses.
 */
function voucherReadOrFail<T>(
  result: { data: T; error: { code?: string; message?: string } | null },
  event: string,
  context: Record<string, unknown> = {},
): T {
  if (!result.error) return result.data
  if (result.error.code === 'PGRST116') return result.data
  log.error(event, { ...context, error: result.error })
  throw new Error(`${event}: ${result.error.message ?? 'voucher read failed'}`)
}

export async function getCustomerVouchers(): Promise<CustomerVoucher[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const data = voucherReadOrFail(
    await supabase
      .from('vouchers')
      .select(VOUCHER_SELECT)
      .eq('user_id', user.id)
      // active vouchers first, then most recent
      .order('status', { ascending: true })
      .order('issued_at', { ascending: false }),
    'voucher.customer_list_read_failed',
    { userId: user.id },
  )

  const rows = (data ?? []) as unknown as (CustomerVoucher & GiftColumns)[]
  return rows.map(withholdGiftedCode) as CustomerVoucher[]
}

/**
 * One voucher, with everything /coupon/[id] puts on screen: the code and its
 * QR, the money snapshot, the deadline, and enough about the business for the
 * customer to find it.
 *
 * Read through the user-scoped client, so RLS (051 vouchers_owner_read) is the
 * boundary; the user_id filter repeats it in code. A voucher id is a UUID and
 * not a secret worth relying on, so an id belonging to somebody else returns
 * null here exactly as a made-up one does.
 */
export interface CustomerVoucherDetail extends CustomerVoucher {
  supplier: {
    name: string | null
    city: string | null
    address: string | null
    contact_phone: string | null
    whatsapp: string | null
  } | null
}

export async function getCustomerVoucher(id: string): Promise<CustomerVoucherDetail | null> {
  // A malformed id would make Postgres raise 22P02 rather than return nothing.
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const data = voucherReadOrFail(
    await supabase
      .from('vouchers')
      .select(
        // No platform_percent here on purpose: that column is mid-rename to
        // platform_bp (059) and the hosted project has not been cut over, so
        // naming it would tie this page to whichever side of the rename it
        // lands on. The customer's page has no use for the split anyway.
        `id, code, qr_payload, status,
       face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
       offer_valid_until, expires_at, issued_at, redeemed_at,
       ${GIFT_SELECT},
       product:products(name_he, slug),
       supplier:suppliers(name, city, address, contact_phone, whatsapp)`,
      )
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle(),
    'voucher.customer_detail_read_failed',
    { voucherId: id, userId: user.id },
  )

  const row = data as unknown as (CustomerVoucherDetail & GiftColumns) | null
  if (!row) return null
  return withholdGiftedCode(row) as CustomerVoucherDetail
}

/** True while a voucher can still be presented at a counter. */
export function isVoucherRedeemable(v: {
  status: string
  expires_at: string
}): boolean {
  return v.status === 'issued' && new Date(v.expires_at).getTime() > Date.now()
}

/** What the counter is shown before it commits to burning a voucher. */
export interface RedemptionPreview {
  id: string
  code: string
  status: CustomerVoucher['status']
  supplierId: string
  faceValueAgorot: number
  couponPriceAgorot: number
  remainingAmountDueAgorot: number
  expiresAt: string
  redeemedAt: string | null
  productName: string | null
  customerName: string | null
}

/**
 * Loads a voucher for the confirm step of a supplier redemption, and returns it
 * only when it belongs to one of `supplierIds`.
 *
 * The service-role client is deliberate and is not a shortcut around RLS. The
 * supplier policy on vouchers (073, vouchers_supplier_read_redeemed) exposes a
 * voucher only AFTER it has been redeemed by that supplier, which is correct:
 * it stops a supplier session from reading the outstanding-voucher table. But a
 * confirm screen has to show the customer's name and the balance to collect
 * BEFORE the scan, so it reads with the service role and re-imposes the
 * ownership check here in code.
 *
 * This is a display path only. It decides nothing: redeem_voucher() re-derives
 * the supplier from supplier_members inside the transaction that flips the
 * status, so a mistake here cannot redeem anything that function would refuse.
 */
export async function getVoucherForRedemption(
  code: string,
  supplierIds: string[],
): Promise<RedemptionPreview | null> {
  if (supplierIds.length === 0) return null

  const admin = createAdminClient()
  const data = voucherReadOrFail(
    await admin
      .from('vouchers')
      .select(
        `id, code, status, supplier_id, user_id,
       face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
       expires_at, redeemed_at,
       product:products(name_he)`,
      )
      .eq('code', code)
      .maybeSingle(),
    'voucher.redemption_read_failed',
    { code },
  )

  if (!data) return null
  // Anti-enumeration: another supplier's voucher is indistinguishable from one
  // that does not exist, which is the same collapse redeem_voucher() performs.
  if (!supplierIds.includes(data.supplier_id)) return null

  // NOT through the guard: a missing customer name degrades one line on the
  // confirm screen, and refusing the whole scan over it would send a paying
  // customer away for a display field.
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', data.user_id)
    .maybeSingle()

  const product = data.product as { name_he: string | null } | { name_he: string | null }[] | null
  const productName = Array.isArray(product)
    ? (product[0]?.name_he ?? null)
    : (product?.name_he ?? null)

  return {
    id: data.id,
    code: data.code,
    status: data.status as CustomerVoucher['status'],
    supplierId: data.supplier_id,
    faceValueAgorot: data.face_value_agorot,
    couponPriceAgorot: data.coupon_price_agorot,
    remainingAmountDueAgorot: data.remaining_amount_due_agorot,
    expiresAt: data.expires_at,
    redeemedAt: data.redeemed_at,
    productName,
    customerName: profile?.full_name ?? null,
  }
}
