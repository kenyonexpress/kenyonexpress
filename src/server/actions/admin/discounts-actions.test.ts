import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of discount campaigns. The evaluation rules live in
 * lib/growth/discount and are proven there; what can only fail here is the
 * edge: shekels typed by a human become integer agorot and basis points
 * exactly once, a duplicate code is reported in Hebrew rather than as a
 * constraint code, used_count is never written from the form, and every
 * write carries an audit row with the actor the service role hides.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

function override(key: string, result: Result): void {
  queues.set(key, [result])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(client: string, table: string, op: string, payload?: unknown): never {
  const record: Call = { table: `${client}:${table}`, op, payload, chain: [] }
  calls.push(record)
  const key = `${client}:${table}.${op}`
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

function fakeClient(name: string) {
  return {
    from: (table: string) => ({
      select: (...args: unknown[]) => builder(name, table, 'select', args[0]),
      update: (payload: unknown) => builder(name, table, 'update', payload),
      insert: (payload: unknown) => builder(name, table, 'insert', payload),
    }),
  }
}

const adminClient = fakeClient('admin')

const requireSection = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: (s: string, a: string) => requireSection(s, a),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const CAMPAIGN = '22222222-2222-4222-8222-222222222222'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const percentForm = {
  code: 'summer-25',
  name: 'קיץ',
  kind: 'percent',
  percent: '12.5',
  amount_ils: '',
  max_discount_ils: '49.90',
  min_order_ils: '100',
  starts_at: '2026-06-01T00:00',
  expires_at: '2026-08-31T23:59',
  max_uses: '500',
  max_uses_per_user: '2',
  allow_stacking: 'on',
  is_active: 'true',
}

const { saveDiscountCampaign, archiveDiscountCampaign, setDiscountCampaignActive } = await import(
  './discounts'
)

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  requireSection.mockReset()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'admin' })
})

describe('saveDiscountCampaign', () => {
  it('propagates the section gate before parsing anything', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    await expect(saveDiscountCampaign({ ok: false }, form(percentForm))).rejects.toThrow(
      'forbidden',
    )
    expect(requireSection).toHaveBeenCalledWith('discounts', 'write')
    expect(calls).toHaveLength(0)
  })

  it('returns field errors for the type-dependent rules without writing', async () => {
    const missingPercent = await saveDiscountCampaign(
      { ok: false },
      form({ ...percentForm, percent: '' }),
    )
    expect(missingPercent.ok).toBe(false)
    expect(missingPercent.fieldErrors?.percent).toEqual(['אחוז הנחה נדרש'])

    const fixedWithCap = await saveDiscountCampaign(
      { ok: false },
      form({ ...percentForm, kind: 'fixed', percent: '', amount_ils: '20' }),
    )
    expect(fixedWithCap.fieldErrors?.max_discount_ils).toEqual(['תקרה רלוונטית רק להנחה באחוזים'])

    const fixedNoAmount = await saveDiscountCampaign(
      { ok: false },
      form({ ...percentForm, kind: 'fixed', percent: '', max_discount_ils: '' }),
    )
    expect(fixedNoAmount.fieldErrors?.amount_ils?.[0]).toMatch(/^סכום הנחה נדרש/)

    const reversed = await saveDiscountCampaign(
      { ok: false },
      form({ ...percentForm, starts_at: '2026-09-01T00:00', expires_at: '2026-08-01T00:00' }),
    )
    expect(reversed.fieldErrors?.expires_at).toEqual(['תאריך הסיום חייב להיות אחרי ההתחלה'])

    const hebrewCode = await saveDiscountCampaign(
      { ok: false },
      form({ ...percentForm, code: 'קיץ' }),
    )
    expect(hebrewCode.fieldErrors?.code?.[0]).toMatch(/לועזיות/)

    expect(calls).toHaveLength(0)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('creates a percent campaign in basis points and agorot, never used_count', async () => {
    queue('admin:discount_campaigns.insert', { data: { id: CAMPAIGN }, error: null })
    expect(await saveDiscountCampaign({ ok: false }, form(percentForm))).toEqual({ ok: true })

    const insert = calls.find((c) => c.table === 'admin:discount_campaigns' && c.op === 'insert')
    expect(insert?.payload).toEqual({
      code: 'SUMMER-25',
      name: 'קיץ',
      description: null,
      kind: 'percent',
      percent_bp: 1250,
      amount_agorot: null,
      max_discount_agorot: 4990,
      min_order_agorot: 10000,
      starts_at: '2026-06-01T00:00',
      expires_at: '2026-08-31T23:59',
      max_uses: 500,
      max_uses_per_user: 2,
      allow_stacking: true,
      is_active: true,
      created_by: ADMIN,
    })
    expect(insert?.payload).not.toHaveProperty('used_count')
    expect(insert?.chain).toContainEqual(['select', ['id']])

    expect(writeAuditLog).toHaveBeenCalledTimes(1)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      actorId: ADMIN,
      action: 'created',
      entityType: 'discount_campaigns',
      entityId: CAMPAIGN,
      changes: { code: 'SUMMER-25', percent_bp: 1250, max_discount_agorot: 4990 },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/discounts')
  })

  it('updates a fixed campaign in agorot with the percent side nulled', async () => {
    const result = await saveDiscountCampaign(
      { ok: false },
      form({
        ...percentForm,
        id: CAMPAIGN,
        kind: 'fixed',
        percent: '',
        amount_ils: '15.50',
        max_discount_ils: '',
        max_uses: '',
        starts_at: '',
        expires_at: '',
        allow_stacking: '',
        is_active: '',
        description: 'תיאור',
      }),
    )
    expect(result).toEqual({ ok: true })
    const update = calls.find((c) => c.table === 'admin:discount_campaigns' && c.op === 'update')
    expect(update?.payload).toMatchObject({
      kind: 'fixed',
      percent_bp: null,
      amount_agorot: 1550,
      max_discount_agorot: null,
      max_uses: null,
      starts_at: null,
      expires_at: null,
      allow_stacking: false,
      is_active: false,
      description: 'תיאור',
    })
    expect(update?.chain).toContainEqual(['eq', ['id', CAMPAIGN]])
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'updated',
      entityId: CAMPAIGN,
      changes: { amount_agorot: 1550, percent_bp: null },
    })
  })

  it('names a duplicate code in Hebrew and passes other errors through', async () => {
    queue('admin:discount_campaigns.insert', {
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    })
    expect(await saveDiscountCampaign({ ok: false }, form(percentForm))).toEqual({
      ok: false,
      error: 'קוד ההנחה הזה כבר קיים',
    })

    override('admin:discount_campaigns.insert', {
      data: null,
      error: { code: '23514', message: 'check violated' },
    })
    expect(await saveDiscountCampaign({ ok: false }, form(percentForm))).toEqual({
      ok: false,
      error: 'שמירה נכשלה: check violated',
    })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('archiveDiscountCampaign', () => {
  it('soft deletes and deactivates in one write, then audits the actor', async () => {
    expect(await archiveDiscountCampaign(CAMPAIGN)).toEqual({ ok: true })
    const update = calls.find((c) => c.table === 'admin:discount_campaigns' && c.op === 'update')
    expect(update?.payload).toMatchObject({ is_active: false })
    expect((update?.payload as { deleted_at: string }).deleted_at).toMatch(/^\d{4}-/)
    expect(update?.chain).toContainEqual(['eq', ['id', CAMPAIGN]])
    // No before-read: the 169 trigger holds the snapshot.
    expect(calls.some((c) => c.op === 'select')).toBe(false)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'deleted',
      entityType: 'discount_campaigns',
      entityId: CAMPAIGN,
      changes: { is_active: false },
    })
  })

  it('reports the write failure and propagates the gate', async () => {
    override('admin:discount_campaigns.update', { data: null, error: { message: 'locked' } })
    expect(await archiveDiscountCampaign(CAMPAIGN)).toEqual({
      ok: false,
      error: 'ארכוב נכשל: locked',
    })
    expect(writeAuditLog).not.toHaveBeenCalled()

    requireSection.mockRejectedValue(new Error('forbidden'))
    await expect(archiveDiscountCampaign(CAMPAIGN)).rejects.toThrow('forbidden')
  })
})

describe('setDiscountCampaignActive', () => {
  it('flips only is_active and audits the status change', async () => {
    expect(await setDiscountCampaignActive(CAMPAIGN, false)).toEqual({ ok: true })
    const update = calls.find((c) => c.table === 'admin:discount_campaigns' && c.op === 'update')
    expect(update?.payload).toEqual({ is_active: false })
    expect(update?.chain).toContainEqual(['eq', ['id', CAMPAIGN]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'status_change',
      entityId: CAMPAIGN,
      changes: { is_active: false },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/discounts')
  })

  it('reports the write failure', async () => {
    override('admin:discount_campaigns.update', { data: null, error: { message: 'x' } })
    expect(await setDiscountCampaignActive(CAMPAIGN, true)).toEqual({
      ok: false,
      error: 'עדכון נכשל: x',
    })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})
