import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The admin voucher console: lookup by code and manual redemption. The
 * scannability rule is proven in lib/admin/voucher-view.test.ts; what can only
 * fail here is the plumbing: that the redeem is a CAS on `status = issued`,
 * that a raced row is refused rather than double-redeemed, that the redemption
 * row and the audit row carry the reason, and that a caller without the
 * section, or over the limit, stops before any read.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function override(key: string, result: Result): void {
  queues.set(key, [result])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(table: string, op: string, payload?: unknown): never {
  const record: Call = { table, op, payload, chain: [] }
  calls.push(record)
  const key = `${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          record.chain.push([String(prop), args])
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle(key))
          return proxy
        }
      },
    },
  )
  return proxy as never
}

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
    update: (payload: unknown) => builder(table, 'update', payload),
    insert: (payload: unknown) => builder(table, 'insert', payload),
  }),
}

const requireSection = vi.fn()
const writeAuditLog = vi.fn()
const checkRateLimit = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: (...args: unknown[]) => requireSection(...args),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const VOUCHER_ID = '22222222-2222-4222-8222-222222222222'
const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333'
const CODE = 'ABCDE12345'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}

function voucherRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VOUCHER_ID,
    code: CODE,
    status: 'issued',
    face_value_agorot: 20000,
    coupon_price_agorot: 12000,
    remaining_amount_due_agorot: 8000,
    expires_at: '2099-01-01T00:00:00Z',
    redeemed_at: null,
    supplier_id: SUPPLIER_ID,
    product: { name_he: 'ארוחה' },
    supplier: { name: 'בית עסק' },
    ...overrides,
  }
}

const { lookupAdminVoucher, redeemAdminVoucher } = await import('./vouchers')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  requireSection.mockReset()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
  writeAuditLog.mockReset()
  checkRateLimit.mockReset()
  checkRateLimit.mockResolvedValue(true)
})

describe('lookupAdminVoucher', () => {
  it('refuses a caller without catalog read, or over the limit, before any read', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    expect(await lookupAdminVoucher(null, form({ code: CODE }))).toEqual({ error: 'אין הרשאה' })
    requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
    checkRateLimit.mockResolvedValue(false)
    expect(await lookupAdminVoucher(null, form({ code: CODE }))).toEqual({
      error: 'יותר מדי בדיקות, נסו שוב בעוד רגע',
    })
    expect(requireSection).toHaveBeenCalledWith('catalog', 'read')
    expect(checkRateLimit).toHaveBeenCalledWith(`admin-voucher-lookup:${ADMIN}`, 60, 3600)
    expect(calls).toEqual([])
  })

  it('rejects a short code without a read', async () => {
    expect(await lookupAdminVoucher(null, form({ code: 'ab-1' }))).toEqual({
      error: 'קוד שובר לא תקין',
    })
    expect(calls).toEqual([])
  })

  it('normalises the typed code, and maps the row with its scannability', async () => {
    override('vouchers.select', { data: voucherRow(), error: null })
    const result = await lookupAdminVoucher(null, form({ code: ' abcde-12345 ' }))
    expect(result).toEqual({
      voucher: {
        id: VOUCHER_ID,
        code: CODE,
        status: 'issued',
        productName: 'ארוחה',
        customerName: null,
        supplierName: 'בית עסק',
        supplierId: SUPPLIER_ID,
        faceValueAgorot: 20000,
        couponPriceAgorot: 12000,
        remainingAmountDueAgorot: 8000,
        expiresAt: '2099-01-01T00:00:00Z',
        redeemedAt: null,
        scannable: true,
      },
    })
    expect(find('vouchers', 'select')?.chain).toContainEqual(['eq', ['code', CODE]])
  })

  it('marks a redeemed voucher unscannable and tolerates missing joins', async () => {
    override('vouchers.select', {
      data: voucherRow({
        status: 'redeemed',
        redeemed_at: '2026-01-01',
        product: null,
        supplier: null,
      }),
      error: null,
    })
    const result = await lookupAdminVoucher(null, form({ code: CODE }))
    expect(result).toMatchObject({
      voucher: { scannable: false, productName: null, supplierName: null },
    })
  })

  it('distinguishes a code that is not there from a read that failed', async () => {
    expect(await lookupAdminVoucher(null, form({ code: CODE }))).toEqual({
      error: 'קוד שובר לא נמצא',
    })
    override('vouchers.select', { data: null, error: { message: 'timeout' } })
    expect(await lookupAdminVoucher(null, form({ code: CODE }))).toEqual({
      error: 'לא ניתן לבדוק את השובר כרגע',
    })
  })
})

describe('redeemAdminVoucher', () => {
  const valid = { code: CODE, reason: 'הסורק בחנות מקולקל' }

  it('refuses a caller without orders write, or over the limit, before any read', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    expect(await redeemAdminVoucher(null, form(valid))).toEqual({ error: 'אין הרשאה' })
    requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
    checkRateLimit.mockResolvedValue(false)
    expect(await redeemAdminVoucher(null, form(valid))).toEqual({
      error: 'יותר מדי מימושים, נסו שוב בעוד רגע',
    })
    expect(requireSection).toHaveBeenCalledWith('orders', 'write')
    expect(calls).toEqual([])
  })

  it('requires a code and a reason before any read', async () => {
    expect(await redeemAdminVoucher(null, form({ code: 'ab', reason: 'סיבה' }))).toEqual({
      error: 'קוד שובר לא תקין',
    })
    expect(await redeemAdminVoucher(null, form({ code: CODE, reason: ' x ' }))).toEqual({
      error: 'חובה לציין סיבה למימוש ידני',
    })
    expect(calls).toEqual([])
  })

  it('distinguishes a missing voucher from a failed read', async () => {
    expect(await redeemAdminVoucher(null, form(valid))).toEqual({ error: 'קוד שובר לא נמצא' })
    override('vouchers.select', { data: null, error: { message: 'timeout' } })
    expect(await redeemAdminVoucher(null, form(valid))).toEqual({
      error: 'לא ניתן לקרוא את השובר כרגע',
    })
    expect(find('vouchers', 'update')).toBeUndefined()
  })

  it('refuses a voucher that is not scannable without writing', async () => {
    override('vouchers.select', { data: voucherRow({ status: 'redeemed' }), error: null })
    expect(await redeemAdminVoucher(null, form(valid))).toEqual({ error: 'השובר אינו ניתן למימוש' })
    override('vouchers.select', {
      data: voucherRow({ expires_at: '2000-01-01T00:00:00Z' }),
      error: null,
    })
    expect(await redeemAdminVoucher(null, form(valid))).toEqual({ error: 'השובר אינו ניתן למימוש' })
    expect(find('vouchers', 'update')).toBeUndefined()
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('redeems with a CAS on issued, records the redemption and audits with the reason', async () => {
    override('vouchers.select', { data: voucherRow(), error: null })
    override('vouchers.update', { data: { id: VOUCHER_ID, status: 'redeemed' }, error: null })

    const result = await redeemAdminVoucher(null, form(valid))
    expect(result).toEqual({ success: 'השובר מומש ידנית', code: CODE })

    const update = find('vouchers', 'update')
    expect(update?.payload).toMatchObject({
      status: 'redeemed',
      redeemed_by_user_id: ADMIN,
      redeemed_by_supplier_id: SUPPLIER_ID,
    })
    const redeemedAt = (update?.payload as { redeemed_at: string }).redeemed_at
    expect(redeemedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(update?.chain).toContainEqual(['eq', ['id', VOUCHER_ID]])
    expect(update?.chain).toContainEqual(['eq', ['status', 'issued']])

    expect(find('voucher_redemptions', 'insert')?.payload).toEqual({
      voucher_id: VOUCHER_ID,
      supplier_id: SUPPLIER_ID,
      scanned_by: ADMIN,
      code_entered: CODE,
      outcome: 'success',
      scan_method: 'manual',
      amount_collected_agorot: 8000,
      metadata: { source: 'admin_manual', reason: 'הסורק בחנות מקולקל' },
    })

    expect(writeAuditLog).toHaveBeenCalledWith({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'manual_override',
      entityType: 'vouchers',
      entityId: VOUCHER_ID,
      changes: {
        old: { status: 'issued', redeemed_at: null },
        new: { status: 'redeemed', redeemed_at: redeemedAt, reason: 'הסורק בחנות מקולקל' },
      },
    })
  })

  it('refuses a raced row and a failed update without a redemption row', async () => {
    override('vouchers.select', { data: voucherRow(), error: null })
    override('vouchers.update', { data: null, error: null })
    expect(await redeemAdminVoucher(null, form(valid))).toEqual({
      error: 'השובר כבר לא ניתן למימוש',
    })
    override('vouchers.update', { data: null, error: { message: 'down' } })
    expect(await redeemAdminVoucher(null, form(valid))).toEqual({ error: 'מימוש השובר נכשל' })
    expect(find('voucher_redemptions', 'insert')).toBeUndefined()
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})
