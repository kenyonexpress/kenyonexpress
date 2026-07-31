import { type Agorot, agorot, ilsToAgorot } from '@/lib/commerce/money'
import type { VoucherRateColumn } from '@/lib/commerce/order-money-columns'
import { computeVoucherExpiry, generateUniqueVoucherCode } from './code'
import { signVoucherQrPayload } from './qr'

/**
 * DB-facing issuing. Called from the payments branch once a coupon order line
 * is paid (that wiring lives in the payments files, which this branch does not
 * touch). Kept here so the collision retry and the money snapshot live next to
 * their pure siblings and can be unit tested against a fake client.
 *
 * Authoritative document: ARCHITECTURE-VOUCHER-REDEMPTION.md sections 2-4.
 */

export interface VoucherIssueInput {
  orderId: string
  orderItemId: string
  productId: string
  supplierId: string
  userId: string
  /** Full on-site price of the product, ILS decimal string or number. */
  priceIls: string | number
  /** Absolute amount charged online, ILS. Must be > 0 and <= priceIls. */
  couponPriceIls: string | number
  /**
   * The order line's snapshot of products.platform_percent. Required and with
   * no default: it decides how the prepayment splits between the platform and
   * the supplier's hold, so a missing value is a bug rather than a case to
   * paper over. Stamping a constant 100 here, as this issuer did until
   * 2026-07-27, silently re-imposed the abolished C11(a) rule in which the
   * supplier receives nothing.
   */
  platformPercent: string | number
  couponExpiryDays: number
  offerValidUntil: Date
  /**
   * Which rate column this database actually has, from probing it. Required
   * and with no default on purpose: the previous code assumed `platform_bp`,
   * the hosted project never received the migration that creates it, and the
   * silent result was that no voucher could be issued in production at all.
   * A default here would restore exactly that failure for the next caller.
   */
  rateColumn: VoucherRateColumn
  now?: Date
}

export interface IssuedVoucherRow {
  code: string
  qr_payload: string
  qr_key_id: string
  order_id: string
  order_item_id: string
  product_id: string
  supplier_id: string
  user_id: string
  status: 'issued'
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
  /**
   * Exactly one of these is ever set, chosen from `rateColumn`. Naming both at
   * once is not a safer hedge: one column that does not exist fails the whole
   * INSERT, so spelling more of them makes failure more likely, not less.
   */
  platform_bp?: number
  platform_percent?: number
  offer_valid_until: string
  expires_at: string
  issued_at: string
}

export class VoucherIssueError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VoucherIssueError'
  }
}

/**
 * Minimal shape of the Supabase client the issuer needs, so the logic is
 * testable without a live DB. The real createAdminClient() satisfies it.
 */
export interface VoucherIssueClient {
  from(table: 'vouchers'): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): { maybeSingle(): Promise<{ data: { id: string } | null; error: unknown }> }
    }
    insert(row: IssuedVoucherRow): {
      select(columns: string): {
        single(): Promise<{ data: { id: string } | null; error: { code?: string } | null }>
      }
    }
  }
}

/**
 * Builds the money snapshot and validates conservation up front, refusing to
 * issue rather than inventing defaults when the coupon price is missing or out
 * of range.
 */
export function buildVoucherMoney(input: {
  priceIls: string | number
  couponPriceIls: string | number
}): { faceValue: Agorot; couponPrice: Agorot; remainingDue: Agorot } {
  const faceValue = ilsToAgorot(input.priceIls)
  const couponPrice = ilsToAgorot(input.couponPriceIls)
  if (couponPrice <= 0) {
    throw new VoucherIssueError('coupon_price must be a positive amount')
  }
  if (couponPrice > faceValue) {
    throw new VoucherIssueError('coupon_price cannot exceed the product price')
  }
  const remainingDue = agorot(faceValue - couponPrice)
  return { faceValue, couponPrice, remainingDue }
}

const UNIQUE_VIOLATION = '23505'
const MAX_INSERT_RETRIES = 5

/**
 * Issues one voucher. Generate-probe-insert with a retry around the UNIQUE(code)
 * arbiter; after the retries are spent it throws instead of reusing a code.
 */
export async function issueVoucher(
  client: VoucherIssueClient,
  input: VoucherIssueInput,
): Promise<{ id: string; row: IssuedVoucherRow }> {
  const now = input.now ?? new Date()

  if (input.offerValidUntil.getTime() <= now.getTime()) {
    throw new VoucherIssueError('offer_valid_until has already passed; refusing to issue')
  }

  const { faceValue, couponPrice, remainingDue } = buildVoucherMoney(input)
  const platformPercent = Number(input.platformPercent)
  if (!Number.isFinite(platformPercent) || platformPercent < 0 || platformPercent > 100) {
    throw new VoucherIssueError(
      'platform_percent must be a number between 0 and 100; no default exists',
    )
  }

  const expiresAt = computeVoucherExpiry({
    issuedAt: now,
    couponExpiryDays: input.couponExpiryDays,
    offerValidUntil: input.offerValidUntil,
  })
  const keyId = process.env.VOUCHER_QR_KEY_ID ?? 'v1'

  const codeExists = async (code: string): Promise<boolean> => {
    const { data } = await client.from('vouchers').select('id').eq('code', code).maybeSingle()
    return data !== null
  }

  for (let attempt = 1; attempt <= MAX_INSERT_RETRIES; attempt++) {
    const code = await generateUniqueVoucherCode(codeExists)
    const qrPayload = signVoucherQrPayload({
      c: code,
      s: input.supplierId,
      u: input.userId,
      e: Math.floor(expiresAt.getTime() / 1000),
      k: keyId,
    })

    const row: IssuedVoucherRow = {
      code,
      qr_payload: qrPayload,
      qr_key_id: keyId,
      order_id: input.orderId,
      order_item_id: input.orderItemId,
      product_id: input.productId,
      supplier_id: input.supplierId,
      user_id: input.userId,
      status: 'issued',
      face_value_agorot: faceValue,
      coupon_price_agorot: couponPrice,
      remaining_amount_due_agorot: remainingDue,
      // 059 renames vouchers.platform_percent to platform_bp AND changes its
      // units to basis points, so the name and the number have to move
      // together: 30 written into platform_bp is a 0.3 percent split, and 3000
      // written into platform_percent violates the 0..100 check constraint.
      ...(input.rateColumn === 'platform_bp'
        ? { platform_bp: Math.round(platformPercent * 100) }
        : { platform_percent: platformPercent }),
      offer_valid_until: input.offerValidUntil.toISOString(),
      expires_at: expiresAt.toISOString(),
      issued_at: now.toISOString(),
    }

    const { data, error } = await client.from('vouchers').insert(row).select('id').single()

    if (!error && data) return { id: data.id, row }
    if (error?.code === UNIQUE_VIOLATION) continue // code raced; regenerate
    throw new VoucherIssueError(`voucher insert failed: ${JSON.stringify(error)}`)
  }

  throw new VoucherIssueError(
    `could not insert a unique voucher after ${MAX_INSERT_RETRIES} attempts`,
  )
}
