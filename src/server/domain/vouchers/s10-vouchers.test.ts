import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COUPON_VALIDITY_DAYS,
  CouponValidityError,
  DEFAULT_COUPON_VALIDITY_DAYS,
  resolveCouponValidityDays,
} from '@/lib/vouchers/validity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  VOUCHER_PIN_LENGTH,
  computeVoucherExpiry,
  formatVoucherPin,
  generateVoucherPin,
  isValidVoucherCode,
  isValidVoucherPin,
} from './code'
import { type IssuedVoucherRow, type VoucherIssueClient, issueVoucher } from './issue'
import { verifyVoucherQrPayload } from './qr'
import { validateVoucherRedemption } from './redemption'
import {
  TERMINAL_VOUCHER_STATES,
  VOUCHER_STATES,
  VoucherTransitionError,
  legalVoucherEvents,
  transition,
} from './state-machine'
import {
  type TransferOnClaimClient,
  classifyTransferError,
  transferVoucherOnClaim,
} from './transfer'

/**
 * S10 acceptance: a paid coupon line produces a voucher with a signed QR and an
 * 8-digit code, valid 30/60/90 days per product with 90 as the default, with
 * expires_at stamped, moving through issued / redeemed / expired / cancelled /
 * transferred. docs/S10-vouchers.md.
 */

const SECRET = 's10-test-secret-at-least-16-bytes-000'
const NOW = new Date('2026-11-04T00:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  process.env.VOUCHER_QR_SECRET = SECRET
})
afterEach(() => {
  process.env.VOUCHER_QR_SECRET = undefined
})

describe('8-digit code (partner_pin)', () => {
  it('is always exactly 8 ASCII digits, leading zeros kept', () => {
    for (let i = 0; i < 5000; i++) {
      const pin = generateVoucherPin()
      expect(pin).toHaveLength(VOUCHER_PIN_LENGTH)
      expect(isValidVoucherPin(pin)).toBe(true)
    }
  })

  it('matches the production CHECK ^[0-9]{8}$ and nothing looser', () => {
    expect(isValidVoucherPin('00012345')).toBe(true)
    expect(isValidVoucherPin('1234567')).toBe(false)
    expect(isValidVoucherPin('123456789')).toBe(false)
    expect(isValidVoucherPin('1234 5678')).toBe(false)
    expect(isValidVoucherPin('١٢٣٤٥٦٧٨')).toBe(false) // Arabic-Indic digits
  })

  it('uses every digit in every position (no modulo bias toward 0-5)', () => {
    const counts = Array.from({ length: 10 }, () => 0)
    const draws = 4000
    for (let i = 0; i < draws; i++) {
      for (const ch of generateVoucherPin()) counts[Number(ch)] = (counts[Number(ch)] ?? 0) + 1
    }
    const expected = (draws * VOUCHER_PIN_LENGTH) / 10
    for (const count of counts) {
      // 3200 per digit; a byte % 10 bias would push 0-5 to ~3328 and 6-9 to ~3072.
      expect(Math.abs(count - expected)).toBeLessThan(expected * 0.06)
    }
  })

  it('is displayed as two groups of four', () => {
    expect(formatVoucherPin('01234567')).toBe('0123 4567')
  })
})

describe('validity: 30 / 60 / 90 per product, default 90', () => {
  it('accepts exactly the three values', () => {
    expect([...COUPON_VALIDITY_DAYS]).toEqual([30, 60, 90])
    for (const days of COUPON_VALIDITY_DAYS) expect(resolveCouponValidityDays(days)).toBe(days)
    expect(resolveCouponValidityDays('60')).toBe(60)
  })

  it('reads an unset product as 90', () => {
    expect(DEFAULT_COUPON_VALIDITY_DAYS).toBe(90)
    expect(resolveCouponValidityDays(null)).toBe(90)
    expect(resolveCouponValidityDays(undefined)).toBe(90)
    expect(resolveCouponValidityDays('')).toBe(90)
  })

  it('refuses anything else instead of rounding it to a neighbour', () => {
    for (const bad of [0, 1, 29, 45, 89, 91, 365, -30, 30.5, 'abc', '45']) {
      expect(() => resolveCouponValidityDays(bad)).toThrow(CouponValidityError)
    }
  })

  it('expires_at = issue time + the product validity', () => {
    for (const days of COUPON_VALIDITY_DAYS) {
      const expiry = computeVoucherExpiry({
        issuedAt: NOW,
        couponExpiryDays: days,
        offerValidUntil: new Date(NOW.getTime() + 365 * DAY),
      })
      expect(expiry.getTime() - NOW.getTime()).toBe(days * DAY)
    }
  })

  it('an offer that ends sooner still caps expires_at', () => {
    const offerEnd = new Date(NOW.getTime() + 10 * DAY)
    const expiry = computeVoucherExpiry({
      issuedAt: NOW,
      couponExpiryDays: resolveCouponValidityDays(null),
      offerValidUntil: offerEnd,
    })
    expect(expiry.toISOString()).toBe(offerEnd.toISOString())
  })

  it('the migration sets the same rule in the database', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'migrations/pending/254_voucher_validity_pin_transfer.sql'),
      'utf8',
    )
    expect(sql).toContain('SET DEFAULT 90')
    expect(sql).toContain('CHECK (coupon_expiry_days IN (30, 60, 90))')
    // NOT NULL would refuse every physical product save: product-money writes
    // NULL there. See the note in 254.
    expect(sql).not.toMatch(/coupon_expiry_days SET NOT NULL/)
  })
})

/** Records what issueVoucher writes, the way vouchers would store it. */
function fakeIssueClient() {
  const rows: IssuedVoucherRow[] = []
  const client: VoucherIssueClient = {
    from() {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                async maybeSingle() {
                  return {
                    data: rows.some((r) => r.code === value) ? { id: 'x' } : null,
                    error: null,
                  }
                },
              }
            },
          }
        },
        insert(row: IssuedVoucherRow) {
          return {
            select() {
              return {
                async single() {
                  rows.push(row)
                  return { data: { id: `v-${rows.length}` }, error: null }
                },
              }
            },
          }
        },
      }
    },
  }
  return { client, rows }
}

describe('issuing on a paid coupon line', () => {
  it('writes code, signed QR, 8-digit pin, status issued and expires_at', async () => {
    const { client, rows } = fakeIssueClient()
    const { row } = await issueVoucher(client, {
      orderId: 'order-1',
      orderItemId: 'item-1',
      productId: 'product-1',
      supplierId: 'supplier-1',
      userId: 'user-1',
      priceIls: '300.00',
      couponPriceIls: '99.00',
      platformPercent: '20',
      couponExpiryDays: resolveCouponValidityDays(null),
      offerValidUntil: new Date(NOW.getTime() + 400 * DAY),
      rateColumn: 'platform_percent',
      now: NOW,
    })

    expect(rows).toHaveLength(1)
    expect(row.status).toBe('issued')
    expect(isValidVoucherCode(row.code)).toBe(true)
    expect(isValidVoucherPin(row.partner_pin)).toBe(true)
    expect(new Date(row.expires_at).getTime() - NOW.getTime()).toBe(90 * DAY)
    expect(row.issued_at).toBe(NOW.toISOString())

    const qr = verifyVoucherQrPayload(row.qr_payload)
    expect(qr?.c).toBe(row.code)
    expect(qr?.s).toBe('supplier-1')
    expect(qr?.u).toBe('user-1')
    expect(qr?.e).toBe(Math.floor(new Date(row.expires_at).getTime() / 1000))

    // Money stays integer agorot and conserved.
    expect(row.face_value_agorot).toBe(30000)
    expect(row.coupon_price_agorot).toBe(9900)
    expect(row.remaining_amount_due_agorot).toBe(20100)
    expect(Number.isInteger(row.face_value_agorot)).toBe(true)
  })

  it('draws a new pin together with a new code after a 23505', async () => {
    const pins: string[] = []
    let calls = 0
    const client: VoucherIssueClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: null, error: null }
                  },
                }
              },
            }
          },
          insert(row: IssuedVoucherRow) {
            return {
              select() {
                return {
                  async single() {
                    calls += 1
                    pins.push(row.partner_pin)
                    // First attempt collides on the per-supplier pin index.
                    if (calls === 1) return { data: null, error: { code: '23505' } }
                    return { data: { id: 'v-ok' }, error: null }
                  },
                }
              },
            }
          },
        }
      },
    }
    const { id } = await issueVoucher(client, {
      orderId: 'o',
      orderItemId: 'i',
      productId: 'p',
      supplierId: 's',
      userId: 'u',
      priceIls: 100,
      couponPriceIls: 10,
      platformPercent: 10,
      couponExpiryDays: 30,
      offerValidUntil: new Date(NOW.getTime() + 100 * DAY),
      rateColumn: 'platform_percent',
      now: NOW,
    })
    expect(id).toBe('v-ok')
    expect(calls).toBe(2)
    expect(pins).toHaveLength(2)
  })
})

describe('status machine: issued / redeemed / expired / cancelled / transferred', () => {
  const ctx = {
    supplierId: 's',
    actingSupplierId: 's',
    expiresAt: new Date(NOW.getTime() + DAY),
    now: NOW,
  }

  it('carries every status the item names', () => {
    for (const s of ['issued', 'redeemed', 'expired', 'cancelled', 'transferred'] as const) {
      expect(VOUCHER_STATES).toContain(s)
    }
  })

  it('issued --TRANSFER--> transferred, and transferred is terminal', () => {
    expect(transition('issued', 'TRANSFER', ctx)).toBe('transferred')
    expect(TERMINAL_VOUCHER_STATES).toContain('transferred')
    expect(legalVoucherEvents('transferred')).toEqual([])
    expect(() => transition('transferred', 'REDEEM', ctx)).toThrow(VoucherTransitionError)
  })

  it('a dead coupon cannot be passed on', () => {
    expect(() =>
      transition('issued', 'TRANSFER', { ...ctx, expiresAt: new Date(NOW.getTime() - 1) }),
    ).toThrow(/PAST_EXPIRY/)
  })

  it('a retired copy reads as void at the counter', () => {
    expect(
      validateVoucherRedemption({
        voucher: {
          code: 'ABCDE12345',
          status: 'transferred',
          supplierId: 's',
          expiresAt: new Date(NOW.getTime() + DAY).toISOString(),
          faceValueAgorot: 100,
          couponPriceAgorot: 10,
          remainingAmountDueAgorot: 90,
        },
        requestingSupplierId: 's',
        now: NOW,
      }),
    ).toBe('cancelled')
  })
})

type RpcArgs = Parameters<TransferOnClaimClient['rpc']>[1]

function fakeTransferClient(
  answers: Array<{ data: string | null; error: { code?: string; message?: string } | null }>,
) {
  const calls: RpcArgs[] = []
  const client: TransferOnClaimClient = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: null, error: null }
                },
              }
            },
          }
        },
      }
    },
    rpc(_fn, args) {
      calls.push(args)
      const answer = answers.shift() ?? { data: null, error: { message: 'no answer queued' } }
      return Promise.resolve(answer)
    },
  }
  return { client, calls }
}

describe('transfer on gift claim', () => {
  const input = {
    voucherId: 'old-voucher',
    tokenHash: 'hash',
    newUserId: 'recipient',
    supplierId: 'supplier-1',
    expiresAt: new Date(NOW.getTime() + 30 * DAY),
  }

  it('sends a fresh code, a QR signed to the recipient and an 8-digit pin', async () => {
    const { client, calls } = fakeTransferClient([{ data: 'new-voucher', error: null }])
    const result = await transferVoucherOnClaim(client, input)
    expect(result).toMatchObject({ ok: true, voucherId: 'new-voucher' })
    const args = calls[0] as RpcArgs
    expect(args.p_voucher_id).toBe('old-voucher')
    expect(args.p_new_user_id).toBe('recipient')
    expect(isValidVoucherCode(args.p_code)).toBe(true)
    expect(isValidVoucherPin(args.p_partner_pin)).toBe(true)
    const qr = verifyVoucherQrPayload(args.p_qr_payload)
    expect(qr?.c).toBe(args.p_code)
    expect(qr?.u).toBe('recipient')
    expect(qr?.s).toBe('supplier-1')
    // Same expiry as the buyer's copy: a transfer moves ownership, not time.
    expect(qr?.e).toBe(Math.floor(input.expiresAt.getTime() / 1000))
  })

  it('redraws code and pin after a unique collision', async () => {
    const { client, calls } = fakeTransferClient([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: 'new-voucher', error: null },
    ])
    const result = await transferVoucherOnClaim(client, input)
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0]?.p_code).not.toBe(calls[1]?.p_code)
  })

  it('maps every refusal the SQL raises', () => {
    expect(classifyTransferError({ code: 'P0002', message: 'voucher_not_found' })).toBe('NOT_FOUND')
    expect(classifyTransferError({ code: 'P0001', message: 'gift_already_claimed' })).toBe(
      'CLAIMED',
    )
    expect(classifyTransferError({ code: 'P0001', message: 'voucher_not_issued' })).toBe(
      'NOT_ISSUED',
    )
    expect(classifyTransferError({ code: 'P0001', message: 'voucher_expired' })).toBe('EXPIRED')
    expect(classifyTransferError({ code: '57014', message: 'statement timeout' })).toBe('FAILED')
  })

  it('does not retry a refusal', async () => {
    const { client, calls } = fakeTransferClient([
      { data: null, error: { code: 'P0001', message: 'gift_already_claimed' } },
    ])
    const result = await transferVoucherOnClaim(client, input)
    expect(result).toMatchObject({ ok: false, code: 'CLAIMED' })
    expect(calls).toHaveLength(1)
  })

  it('the SQL function is service-role only and atomic', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'migrations/pending/254_voucher_validity_pin_transfer.sql'),
      'utf8',
    )
    expect(sql).toMatch(/FOR UPDATE;/)
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.transfer_voucher_on_claim[^;]+FROM anon, authenticated;/,
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.transfer_voucher_on_claim[^;]+TO service_role;/,
    )
    for (const raised of [
      'voucher_not_found',
      'gift_already_claimed',
      'voucher_not_issued',
      'voucher_expired',
    ]) {
      expect(sql).toContain(`'${raised}'`)
    }
  })
})
