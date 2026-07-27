import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isValidVoucherCode } from './code'
import {
  type IssuedVoucherRow,
  type VoucherIssueClient,
  VoucherIssueError,
  type VoucherIssueInput,
  buildVoucherMoney,
  issueVoucher,
} from './issue'
import { verifyVoucherQrPayload } from './qr'

const SECRET = 'issue-test-secret-at-least-16-bytes-00'

/** In-memory fake of the Supabase surface issueVoucher touches. */
function fakeClient(options: { existing?: Set<string>; failInsertsFor?: Set<string> } = {}) {
  const existing = options.existing ?? new Set<string>()
  const failInsertsFor = options.failInsertsFor ?? new Set<string>()
  const inserted: IssuedVoucherRow[] = []
  let idCounter = 0

  const client: VoucherIssueClient = {
    from() {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                async maybeSingle() {
                  return { data: existing.has(value) ? { id: 'x' } : null, error: null }
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
                  if (failInsertsFor.has(row.code) || existing.has(row.code)) {
                    return { data: null, error: { code: '23505' } }
                  }
                  existing.add(row.code)
                  inserted.push(row)
                  idCounter += 1
                  return { data: { id: `voucher-${idCounter}` }, error: null }
                },
              }
            },
          }
        },
      }
    },
  }

  return { client, inserted }
}

function input(overrides: Partial<VoucherIssueInput> = {}): VoucherIssueInput {
  return {
    orderId: 'order-1',
    orderItemId: 'item-1',
    productId: 'product-1',
    supplierId: 'supplier-1',
    userId: 'user-1',
    priceIls: '200.00',
    couponPriceIls: '50.00',
    platformPercent: '25.00',
    couponExpiryDays: 30,
    offerValidUntil: new Date('2026-12-31T00:00:00.000Z'),
    now: new Date('2026-07-24T00:00:00.000Z'),
    ...overrides,
  }
}

describe('buildVoucherMoney', () => {
  it('splits face into coupon price paid online and balance due', () => {
    const money = buildVoucherMoney({ priceIls: '200.00', couponPriceIls: '50.00' })
    expect(money.faceValue).toBe(20000)
    expect(money.couponPrice).toBe(5000)
    expect(money.remainingDue).toBe(15000)
  })

  it('conservation holds: face = coupon + due', () => {
    const money = buildVoucherMoney({ priceIls: '149.90', couponPriceIls: '39.90' })
    expect(money.couponPrice + money.remainingDue).toBe(money.faceValue)
  })

  it('refuses a non-positive coupon price rather than invent a default', () => {
    expect(() => buildVoucherMoney({ priceIls: '200', couponPriceIls: '0' })).toThrow(
      VoucherIssueError,
    )
  })

  it('refuses a coupon price above the product price', () => {
    expect(() => buildVoucherMoney({ priceIls: '50', couponPriceIls: '60' })).toThrow(
      VoucherIssueError,
    )
  })
})

describe('issueVoucher', () => {
  beforeEach(() => {
    process.env.VOUCHER_QR_SECRET = SECRET
  })
  afterEach(() => {
    process.env.VOUCHER_QR_SECRET = undefined
  })

  it('issues a voucher with a valid code, signed QR, and money snapshot', async () => {
    const { client, inserted } = fakeClient()
    const { id, row } = await issueVoucher(client, input())
    expect(id).toBe('voucher-1')
    expect(inserted).toHaveLength(1)
    expect(isValidVoucherCode(row.code)).toBe(true)
    expect(row.platform_percent).toBe(25)
    expect(row.face_value_agorot).toBe(20000)
    expect(row.coupon_price_agorot).toBe(5000)
    expect(row.remaining_amount_due_agorot).toBe(15000)

    const parsed = verifyVoucherQrPayload(row.qr_payload)
    expect(parsed?.c).toBe(row.code)
    expect(parsed?.s).toBe('supplier-1')
    expect(parsed?.u).toBe('user-1')
  })

  // Until 2026-07-27 this issuer stamped a constant 100, which is the abolished
  // C11(a) rule: the platform keeps the whole prepayment and the supplier gets
  // nothing. The percent must come from the order line's snapshot.
  it('snapshots the caller platform percent rather than a constant', async () => {
    const { client } = fakeClient()
    const { row } = await issueVoucher(client, input({ platformPercent: '15.00' }))
    expect(row.platform_percent).toBe(15)
  })

  it('refuses to issue when the platform percent is out of range', async () => {
    const { client } = fakeClient()
    await expect(issueVoucher(client, input({ platformPercent: 101 }))).rejects.toThrow(
      VoucherIssueError,
    )
    await expect(issueVoucher(client, input({ platformPercent: -1 }))).rejects.toThrow(
      VoucherIssueError,
    )
  })

  it('refuses to issue when the platform percent is not a number', async () => {
    const { client } = fakeClient()
    await expect(issueVoucher(client, input({ platformPercent: 'not a percent' }))).rejects.toThrow(
      VoucherIssueError,
    )
  })

  it('clamps expiry to offer_valid_until when the rolling window overshoots', async () => {
    const { client } = fakeClient()
    const { row } = await issueVoucher(
      client,
      input({ couponExpiryDays: 365, offerValidUntil: new Date('2026-08-01T00:00:00.000Z') }),
    )
    expect(row.expires_at).toBe('2026-08-01T00:00:00.000Z')
    expect(new Date(row.expires_at).getTime()).toBeLessThanOrEqual(
      new Date(row.offer_valid_until).getTime(),
    )
  })

  it('retries past a UNIQUE(code) violation and still issues', async () => {
    // Force the first generated code to collide; the retry must succeed.
    const { client, inserted } = fakeClient()
    let first = true
    const original = client.from
    client.from = ((table: 'vouchers') => {
      const api = original(table)
      const originalInsert = api.insert
      api.insert = (row: IssuedVoucherRow) => {
        const built = originalInsert(row)
        if (first) {
          first = false
          return {
            select: () => ({
              single: async () => ({ data: null, error: { code: '23505' } }),
            }),
          }
        }
        return built
      }
      return api
      // biome-ignore lint/suspicious/noExplicitAny: test shim
    }) as any
    const { id } = await issueVoucher(client, input())
    expect(id).toBe('voucher-1')
    expect(inserted).toHaveLength(1)
  })

  it('refuses to issue once offer_valid_until has passed', async () => {
    const { client } = fakeClient()
    await expect(
      issueVoucher(
        client,
        input({
          offerValidUntil: new Date('2026-01-01T00:00:00.000Z'),
          now: new Date('2026-07-24T00:00:00.000Z'),
        }),
      ),
    ).rejects.toBeInstanceOf(VoucherIssueError)
  })

  it('refuses to issue a coupon product with no coupon price', async () => {
    const { client } = fakeClient()
    await expect(issueVoucher(client, input({ couponPriceIls: '0' }))).rejects.toBeInstanceOf(
      VoucherIssueError,
    )
  })
})
