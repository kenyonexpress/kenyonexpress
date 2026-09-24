import { IMAGE_HOST_ERROR } from '@/lib/images/remote-hosts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The action returns `{ error } | { success }`; read the error arm without an unsafe cast. */
function errorOf(result: unknown): string | undefined {
  return typeof result === 'object' && result !== null && 'error' in result
    ? String((result as { error: unknown }).error)
    : undefined
}

/**
 * The action layer of the product editor and the bulk tools. The schema, the
 * money derivation, the publish gate and the uploader policy are each proven
 * in their own pure module; what can only fail here is the wiring between
 * them: which fields reach the row, that shekels become agorot exactly once,
 * that the WhatsApp column is retried without rather than reported as a
 * crash, that a content_uploader can neither price nor publish, that removed
 * variants are soft-deleted, and that every write audits its outcome.
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

const USER = '99999999-9999-4999-8999-999999999999'

function fakeClient(name: string) {
  return {
    from: (table: string) => ({
      select: (...args: unknown[]) => builder(name, table, 'select', args[0]),
      update: (payload: unknown) => builder(name, table, 'update', payload),
      insert: (payload: unknown) => builder(name, table, 'insert', payload),
    }),
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
  }
}

const requestClient = fakeClient('request')
const adminClient = fakeClient('admin')

const requireStaffSession = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const updateTag = vi.fn()
const redirect = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({ requireStaffSession: () => requireStaffSession() }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  revalidateTag: vi.fn(),
  updateTag: (t: string) => updateTag(t),
}))
vi.mock('next/navigation', () => ({ redirect: (p: string) => redirect(p) }))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const PRODUCT = '22222222-2222-4222-8222-222222222222'
const SUPPLIER = '33333333-3333-4333-8333-333333333333'
const CATEGORY = '44444444-4444-4444-8444-444444444444'
const V1 = '55555555-5555-4555-8555-555555555555'
const V2 = '66666666-6666-4666-8666-666666666666'
const P1 = '77777777-7777-4777-8777-777777777777'
const P2 = '88888888-8888-4888-8888-888888888888'

const WHATSAPP_MISSING =
  "Could not find the 'whatsapp_enabled' column of 'products' in the schema cache"

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const physicalForm = {
  slug: 'demo-product',
  name_he: 'מוצר הדגמה',
  type: 'physical',
  kenyon_price: '100',
  full_price: '150',
  platform_percent: '30',
  discount_percent: '10',
  status: 'draft',
  supplier_id: SUPPLIER,
  category_id: CATEGORY,
  highlights: ' ראשון \n\nשני',
  tags: 'מבצע, מבצע, חדש,',
}

const completeSupplier = {
  id: SUPPLIER,
  name: 'ספק',
  contact_phone: '0501234567',
  address: 'רחוב 1',
  logo_url: 'https://images.unsplash.com/logo.png',
  status: 'active',
}

function inserts(): Call[] {
  return calls.filter((c) => c.table === 'request:products' && c.op === 'insert')
}

const {
  upsertProduct,
  deleteProduct,
  bulkUpdateProductStatus,
  bulkAssignCategory,
  bulkAdjustPrices,
  bulkSoftDeleteProducts,
  deleteVariant,
} = await import('./products')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  updateTag.mockReset()
  redirect.mockReset()
  requireStaffSession.mockReset()
  requireStaffSession.mockResolvedValue({ userId: ADMIN, role: 'admin' })
  queue('request:products.insert', { data: { id: PRODUCT }, error: null })
})

describe('upsertProduct: refusals before any write', () => {
  it('refuses a caller without a staff session', async () => {
    requireStaffSession.mockRejectedValue(new Error('no'))
    expect(await upsertProduct(null, form(physicalForm))).toEqual({ error: 'אין הרשאה' })
    expect(calls).toHaveLength(0)
  })

  it('returns the first schema message', async () => {
    expect(await upsertProduct(null, form({ ...physicalForm, slug: 'Bad Slug' }))).toEqual({
      error: 'קישור יכול להכיל אותיות לועזיות, מספרים ומקפים בלבד',
    })
    expect(calls).toHaveLength(0)
  })

  it('validates the images list: JSON, array shape, and host allowlist', async () => {
    expect(await upsertProduct(null, form({ ...physicalForm, images: '{oops' }))).toEqual({
      error: 'רשימת התמונות אינה תקינה',
    })
    expect(await upsertProduct(null, form({ ...physicalForm, images: '{"a":1}' }))).toEqual({
      error: 'רשימת התמונות אינה תקינה',
    })
    expect(
      await upsertProduct(
        null,
        form({ ...physicalForm, images: '["/ok.webp","https://evil.example/x.png"]' }),
      ),
    ).toEqual({ error: IMAGE_HOST_ERROR })
    expect(inserts()).toHaveLength(0)
  })

  it('names the first invalid variant', async () => {
    expect(
      await upsertProduct(
        null,
        form({ ...physicalForm, variants: '[{"name_he":"S","sku":"S-1"},{"name_he":"M"}]' }),
      ),
    ).toEqual({ error: 'גרסה לא תקינה: Required' })
    expect(inserts()).toHaveLength(0)
  })

  it('refuses a priced product with no split, because there is no default', async () => {
    expect(await upsertProduct(null, form({ ...physicalForm, platform_percent: '' }))).toEqual({
      error: 'חייב להגדיר עמלת פלטפורמה או אחוז לספק. אין ברירת מחדל.',
    })
    expect(inserts()).toHaveLength(0)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('surfaces a failed before-read on edit', async () => {
    override('request:products.select', { data: null, error: { message: 'read failed' } })
    expect(await upsertProduct(null, form({ ...physicalForm, id: PRODUCT }))).toEqual({
      error: 'read failed',
    })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })
})

describe('upsertProduct: create', () => {
  it('inserts the parsed row with derived money, a false WhatsApp flag, and redirects', async () => {
    const result = await upsertProduct(
      null,
      form({ ...physicalForm, images: '["/a.webp","https://picsum.photos/200"]' }),
    )
    expect(result).toBeUndefined()
    expect(redirect).toHaveBeenCalledWith('/admin/products')

    const [insert] = inserts()
    expect(insert?.payload).toMatchObject({
      slug: 'demo-product',
      name_he: 'מוצר הדגמה',
      type: 'physical',
      status: 'draft',
      supplier_id: SUPPLIER,
      category_id: CATEGORY,
      kenyon_price: 100,
      full_price: 150,
      highlights: ['ראשון', 'שני'],
      tags: ['מבצע', 'חדש'],
      // buildProductMoneyWrite, completed from the one side given.
      platform_percent: 30,
      supplier_split_percent: 70,
      discount_percent: 10,
      coupon_price_ils: null,
      coupon_expiry_days: null,
      commission_percent: 30,
      commission_type: 'physical_percent',
      price_ils: 100,
      whatsapp_enabled: false,
      images: ['/a.webp', 'https://picsum.photos/200'],
      created_by: USER,
    })
    expect(insert?.payload).not.toHaveProperty('id')
    expect(insert?.payload).not.toHaveProperty('approval_status')
    expect(insert?.payload).not.toHaveProperty('recurring_amount_ils')
    expect(insert?.chain).toContainEqual(['select', ['id']])
    // No before-read and no publish-gate supplier read on a draft create.
    expect(calls.some((c) => c.op === 'select')).toBe(false)

    expect(writeAuditLog).toHaveBeenCalledTimes(2)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'created',
      entityType: 'products',
      entityId: PRODUCT,
      changes: { slug: 'demo-product', kenyon_price: 100, platform_percent: 30 },
    })
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      action: 'created',
      entityId: PRODUCT,
      changes: {
        old: null,
        new: { id: PRODUCT, status: 'draft', kenyon_price: 100, platform_percent: 30 },
      },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/products')
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('refuses a recurring product: the action never reads the three recurring inputs', async () => {
    // runUpsertProduct does not pass recurring_amount_ils, billing_interval or
    // billing_interval_count from the form into the schema, so the superRefine
    // for type=recurring fails before any write. Pinned so that wiring the form
    // up later has to update this test rather than silently change behaviour.
    const result = await upsertProduct(
      null,
      form({
        ...physicalForm,
        type: 'recurring',
        recurring_amount_ils: '49.90',
        billing_interval: 'monthly',
        billing_interval_count: '3',
      }),
    )
    expect(result).toEqual({ error: 'סכום החיוב התקופתי נדרש למוצר עם חיוב חודשי קבוע' })
    expect(inserts()).toHaveLength(0)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('derives the coupon badge from the two prices and stores the coupon fields', async () => {
    await upsertProduct(
      null,
      form({
        ...physicalForm,
        type: 'coupon',
        is_coupon_enabled: 'true',
        coupon_price_ils: '35',
        coupon_expiry_days: '60',
        discount_percent: '99',
      }),
    )
    const [insert] = inserts()
    expect(insert?.payload).toMatchObject({
      type: 'coupon',
      coupon_price_ils: 35,
      coupon_expiry_days: 60,
      discount_percent: 65,
      commission_type: 'coupon_absolute',
    })
  })

  it('retries once without the WhatsApp column when it is missing and untouched', async () => {
    override('request:products.insert', { data: null, error: { message: WHATSAPP_MISSING } })
    queue('request:products.insert', { data: { id: PRODUCT }, error: null })
    await upsertProduct(null, form(physicalForm))
    const attempts = inserts()
    expect(attempts).toHaveLength(2)
    expect(attempts[0]?.payload).toHaveProperty('whatsapp_enabled', false)
    expect(attempts[1]?.payload).not.toHaveProperty('whatsapp_enabled')
    expect(redirect).toHaveBeenCalledWith('/admin/products')
  })

  it('reports the missing migration when the admin deliberately ticked WhatsApp', async () => {
    override('request:products.insert', { data: null, error: { message: WHATSAPP_MISSING } })
    const result = await upsertProduct(null, form({ ...physicalForm, whatsapp_enabled: 'true' }))
    expect(errorOf(result)).toMatch(/^כפתור הוואטסאפ עדיין לא מופעל במסד הנתונים/)
    expect(inserts()).toHaveLength(1)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('translates the recurring schema error and passes other errors through', async () => {
    override('request:products.insert', {
      data: null,
      error: { message: 'column products.billing_interval does not exist' },
    })
    const recurring = await upsertProduct(null, form(physicalForm))
    expect(errorOf(recurring)).toMatch(/^סוג המוצר "חיוב חודשי קבוע" עדיין לא מופעל/)

    override('request:products.insert', { data: null, error: { message: 'duplicate slug' } })
    expect(await upsertProduct(null, form(physicalForm))).toEqual({ error: 'duplicate slug' })

    override('request:products.insert', { data: null, error: null })
    expect(await upsertProduct(null, form(physicalForm))).toEqual({
      error: 'שמירת המוצר נכשלה',
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('upsertProduct: publish gate', () => {
  it('refuses to publish without a supplier, naming every blocker at once', async () => {
    const result = await upsertProduct(
      null,
      form({ ...physicalForm, status: 'active', supplier_id: '' }),
    )
    expect(errorOf(result)).toContain('חייב לשייך ספק למוצר')
    expect(inserts()).toHaveLength(0)
    expect(calls.some((c) => c.table === 'admin:suppliers')).toBe(false)
  })

  it('loads the supplier through the service role and refuses an incomplete one', async () => {
    override('admin:suppliers.select', {
      data: { ...completeSupplier, contact_phone: null, logo_url: null },
      error: null,
    })
    const result = await upsertProduct(null, form({ ...physicalForm, status: 'active' }))
    expect(errorOf(result)).toContain('חסר טלפון של הספק')
    expect(errorOf(result)).toContain('חסר לוגו של הספק')
    const read = calls.find((c) => c.table === 'admin:suppliers')
    expect(read?.chain).toContainEqual(['eq', ['id', SUPPLIER]])
    expect(inserts()).toHaveLength(0)
  })

  it('publishes when the supplier is complete and active', async () => {
    override('admin:suppliers.select', { data: completeSupplier, error: null })
    await upsertProduct(null, form({ ...physicalForm, status: 'active' }))
    expect(inserts()[0]?.payload).toMatchObject({ status: 'active' })
    expect(redirect).toHaveBeenCalledWith('/admin/products')
  })
})

describe('upsertProduct: edit', () => {
  const before = { id: PRODUCT, slug: 'old', name_he: 'ישן', status: 'active' }

  it('updates the row, soft-deletes removed variants, and upserts the submitted ones', async () => {
    queue('request:products.select', { data: before, error: null })
    queue('request:products.update', { data: { id: PRODUCT }, error: null })
    queue('request:product_variants.select', { data: [{ id: V1 }, { id: V2 }], error: null })

    const variants = JSON.stringify([
      { id: V1, name_he: 'S', sku: 'S-1', price: 90 },
      { name_he: 'M', sku: 'M-1' },
    ])
    await upsertProduct(null, form({ ...physicalForm, id: PRODUCT, variants }))
    expect(redirect).toHaveBeenCalledWith('/admin/products')

    const update = calls.find((c) => c.table === 'request:products' && c.op === 'update')
    expect(update?.payload).toMatchObject({
      slug: 'demo-product',
      platform_percent: 30,
      images: [],
    })
    expect(update?.payload).not.toHaveProperty('id')
    expect(update?.chain).toContainEqual(['eq', ['id', PRODUCT]])
    expect(inserts()).toHaveLength(0)

    const variantCalls = calls.filter((c) => c.table === 'request:product_variants')
    expect(variantCalls[0]?.op).toBe('select')
    expect(variantCalls[0]?.chain).toContainEqual(['eq', ['product_id', PRODUCT]])
    const removal = variantCalls[1]
    expect(removal?.op).toBe('update')
    expect(removal?.payload).toMatchObject({ is_active: false })
    expect(removal?.chain).toContainEqual(['in', ['id', [V2]]])
    const kept = variantCalls[2]
    expect(kept?.op).toBe('update')
    expect(kept?.payload).toMatchObject({ name_he: 'S', sku: 'S-1', price: 90 })
    expect(kept?.payload).not.toHaveProperty('id')
    expect(kept?.chain).toContainEqual(['eq', ['id', V1]])
    const added = variantCalls[3]
    expect(added?.op).toBe('insert')
    expect(added?.payload).toMatchObject({ name_he: 'M', sku: 'M-1', product_id: PRODUCT })

    const actions = writeAuditLog.mock.calls.map((c) => {
      const e = c[0] as { action: string; entityType: string }
      return `${e.entityType}:${e.action}`
    })
    expect(actions).toEqual([
      'products:updated',
      'product_variants:deleted',
      'product_variants:updated',
      'products:updated',
    ])
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      changes: { removed_variant_ids: [V2] },
    })
    expect(writeAuditLog.mock.calls[2]?.[0]).toMatchObject({
      changes: { variant_ids: [V1, null] },
    })
    expect(writeAuditLog.mock.calls[3]?.[0]).toMatchObject({
      changes: { old: before, new: { id: PRODUCT, status: 'draft', kenyon_price: 100 } },
    })
  })

  it('surfaces an update failure and a variant removal failure', async () => {
    override('request:products.update', { data: null, error: { message: 'rls' } })
    expect(await upsertProduct(null, form({ ...physicalForm, id: PRODUCT }))).toEqual({
      error: 'rls',
    })
    expect(writeAuditLog).not.toHaveBeenCalled()

    override('request:products.update', { data: { id: PRODUCT }, error: null })
    override('request:product_variants.select', { data: [{ id: V1 }], error: null })
    override('request:product_variants.update', { data: null, error: { message: 'locked' } })
    expect(await upsertProduct(null, form({ ...physicalForm, id: PRODUCT }))).toEqual({
      error: 'locked',
    })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('upsertProduct: content_uploader', () => {
  beforeEach(() => {
    requireStaffSession.mockResolvedValue({ userId: ADMIN, role: 'content_uploader' })
  })

  it('creates a draft with no money and forces the approval queue', async () => {
    await upsertProduct(null, form({ ...physicalForm, status: 'active' }))
    const [insert] = inserts()
    const payload = insert?.payload as Record<string, unknown>
    expect(payload).toMatchObject({
      slug: 'demo-product',
      status: 'draft',
      approval_status: 'pending',
      created_by: USER,
    })
    for (const key of [
      'kenyon_price',
      'full_price',
      'platform_percent',
      'supplier_split_percent',
      'discount_percent',
      'coupon_price_ils',
      'price_ils',
      'commission_type',
    ]) {
      expect(payload).not.toHaveProperty(key)
    }
    expect(calls.some((c) => c.table === 'admin:suppliers')).toBe(false)
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      changes: { new: { status: 'draft', kenyon_price: undefined, platform_percent: undefined } },
    })
    expect(redirect).toHaveBeenCalledWith('/admin/products')
  })

  it('edits without touching status, so a live product stays live', async () => {
    queue('request:products.select', { data: { id: PRODUCT, status: 'active' }, error: null })
    queue('request:products.update', { data: { id: PRODUCT }, error: null })
    await upsertProduct(null, form({ ...physicalForm, id: PRODUCT, status: 'draft' }))
    const update = calls.find((c) => c.table === 'request:products' && c.op === 'update')
    expect(update?.payload).not.toHaveProperty('status')
    expect(update?.payload).not.toHaveProperty('platform_percent')
    expect(update?.payload).toMatchObject({ approval_status: 'pending' })
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      changes: { new: { status: 'active' } },
    })
  })
})

describe('deleteProduct', () => {
  it('archives with deleted_at and audits', async () => {
    expect(await deleteProduct(PRODUCT)).toEqual({})
    const update = calls.find((c) => c.table === 'request:products' && c.op === 'update')
    expect(update?.payload).toMatchObject({ status: 'archived' })
    expect((update?.payload as { deleted_at: string }).deleted_at).toMatch(/^\d{4}-/)
    expect(update?.chain).toContainEqual(['eq', ['id', PRODUCT]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'deleted',
      entityType: 'products',
      entityId: PRODUCT,
      changes: { status: 'archived' },
    })
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('surfaces the error and refuses without a session', async () => {
    override('request:products.update', { data: null, error: { message: 'x' } })
    expect(await deleteProduct(PRODUCT)).toEqual({ error: 'x' })
    requireStaffSession.mockRejectedValue(new Error('no'))
    expect(await deleteProduct(PRODUCT)).toEqual({ error: 'אין הרשאה' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('bulkUpdateProductStatus', () => {
  it('writes one status across the ids and audits the set', async () => {
    expect(await bulkUpdateProductStatus([P1, P2], 'paused')).toEqual({})
    const update = calls.find((c) => c.table === 'request:products' && c.op === 'update')
    expect(update?.payload).toEqual({ status: 'paused' })
    expect(update?.chain).toContainEqual(['in', ['id', [P1, P2]]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'status_change',
      changes: { ids: [P1, P2], status: 'paused' },
    })
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('surfaces the error and refuses without a session', async () => {
    override('request:products.update', { data: null, error: { message: 'x' } })
    expect(await bulkUpdateProductStatus([P1], 'active')).toEqual({ error: 'x' })
    requireStaffSession.mockRejectedValue(new Error('no'))
    expect(await bulkUpdateProductStatus([P1], 'active')).toEqual({ error: 'אין הרשאה' })
  })
})

describe('bulkAssignCategory', () => {
  it('refuses an empty selection and a malformed category before any write', async () => {
    expect(await bulkAssignCategory([], CATEGORY)).toEqual({ error: 'לא נבחרו מוצרים' })
    expect(await bulkAssignCategory([P1], 'not-a-uuid')).toEqual({ error: 'קטגוריה לא תקינה' })
    expect(calls).toHaveLength(0)
    requireStaffSession.mockRejectedValue(new Error('no'))
    expect(await bulkAssignCategory([P1], CATEGORY)).toEqual({ error: 'אין הרשאה' })
  })

  it('assigns (or clears) the category and writes two audit rows', async () => {
    expect(await bulkAssignCategory([P1, P2], null)).toEqual({})
    const update = calls.find((c) => c.table === 'request:products' && c.op === 'update')
    expect(update?.payload).toEqual({ category_id: null })
    expect(update?.chain).toContainEqual(['in', ['id', [P1, P2]]])
    expect(writeAuditLog).toHaveBeenCalledTimes(2)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'updated',
      changes: { ids: [P1, P2], category_id: null },
    })
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      changes: { old: { ids: [P1, P2] }, new: { ids: [P1, P2], category_id: null } },
    })
  })

  it('surfaces the error', async () => {
    override('request:products.update', { data: null, error: { message: 'x' } })
    expect(await bulkAssignCategory([P1], CATEGORY)).toEqual({ error: 'x' })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('bulkAdjustPrices', () => {
  it('refuses an empty selection, an out-of-range value, and a missing session', async () => {
    expect(await bulkAdjustPrices([], { mode: 'percent', value: 10 })).toEqual({
      error: 'לא נבחרו מוצרים',
    })
    expect(await bulkAdjustPrices([P1], { mode: 'percent', value: 600 })).toEqual({
      error: 'ערך מחיר לא תקין',
    })
    expect(calls).toHaveLength(0)
    requireStaffSession.mockRejectedValue(new Error('no'))
    expect(await bulkAdjustPrices([P1], { mode: 'set', value: 10 })).toEqual({
      error: 'אין הרשאה',
    })
  })

  it('surfaces a failed load', async () => {
    override('request:products.select', { data: null, error: { message: 'load' } })
    expect(await bulkAdjustPrices([P1], { mode: 'percent', value: 10 })).toEqual({
      error: 'load',
    })
  })

  it('percent mode scales both prices in integer agorot and skips unusable rows', async () => {
    override('request:products.select', {
      data: [
        { id: P1, name_he: 'א', kenyon_price: 33.35, full_price: 40 },
        { id: P2, name_he: 'ב', kenyon_price: 10, full_price: Number.NaN },
        { id: PRODUCT, name_he: 'ג', kenyon_price: 20, full_price: null },
        { id: USER, name_he: 'ד', kenyon_price: Number.NaN, full_price: null },
      ],
      error: null,
    })
    expect(
      await bulkAdjustPrices([P1, P2, PRODUCT, USER], { mode: 'percent', value: -10 }),
    ).toEqual({ updated: 2, skipped: ['ב', 'ד'] })
    const updates = calls.filter((c) => c.table === 'request:products' && c.op === 'update')
    expect(updates).toHaveLength(2)
    expect(updates[0]?.payload).toEqual({ kenyon_price: 30.02, full_price: 36 })
    expect(updates[0]?.chain).toContainEqual(['eq', ['id', P1]])
    expect(updates[1]?.payload).toEqual({ kenyon_price: 18 })
    expect(writeAuditLog).toHaveBeenCalledTimes(2)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      changes: { mode: 'percent', value: -10, updated: 2, skipped: ['ב', 'ד'] },
    })
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      changes: { new: { prices: { mode: 'percent', value: -10 }, updated: 2 } },
    })
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('set mode writes the price and skips rows whose full price would fall below it', async () => {
    override('request:products.select', {
      data: [
        { id: P1, name_he: 'א', kenyon_price: 50, full_price: 100 },
        { id: P2, name_he: 'ב', kenyon_price: 50, full_price: null },
        { id: PRODUCT, name_he: 'ג', kenyon_price: 500, full_price: 600 },
      ],
      error: null,
    })
    expect(await bulkAdjustPrices([P1, P2, PRODUCT], { mode: 'set', value: 120 })).toEqual({
      updated: 2,
      skipped: ['א'],
    })
    const updates = calls.filter((c) => c.table === 'request:products' && c.op === 'update')
    expect(updates.map((u) => u.payload)).toEqual([{ kenyon_price: 120 }, { kenyon_price: 120 }])
    expect(updates[1]?.chain).toContainEqual(['eq', ['id', PRODUCT]])
  })

  it('stops at the first failed write and reports how many succeeded', async () => {
    override('request:products.select', {
      data: [
        { id: P1, name_he: 'א', kenyon_price: 10, full_price: null },
        { id: P2, name_he: 'ב', kenyon_price: 10, full_price: null },
      ],
      error: null,
    })
    queue('request:products.update', { data: null, error: null })
    queue('request:products.update', { data: null, error: { message: 'boom' } })
    expect(await bulkAdjustPrices([P1, P2], { mode: 'percent', value: 25 })).toEqual({
      error: 'boom',
      updated: 1,
    })
    override('request:products.update', { data: null, error: { message: 'boom' } })
    expect(await bulkAdjustPrices([P1, P2], { mode: 'set', value: 5 })).toEqual({
      error: 'boom',
      updated: 0,
    })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('bulkSoftDeleteProducts', () => {
  it('refuses an empty selection, archives the rest, and audits', async () => {
    expect(await bulkSoftDeleteProducts([])).toEqual({ error: 'לא נבחרו מוצרים' })
    expect(await bulkSoftDeleteProducts([P1, P2])).toEqual({})
    const update = calls.find((c) => c.table === 'request:products' && c.op === 'update')
    expect(update?.payload).toMatchObject({ status: 'archived' })
    expect(update?.chain).toContainEqual(['in', ['id', [P1, P2]]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'deleted',
      changes: { ids: [P1, P2], status: 'archived' },
    })
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('surfaces the error and refuses without a session', async () => {
    override('request:products.update', { data: null, error: { message: 'x' } })
    expect(await bulkSoftDeleteProducts([P1])).toEqual({ error: 'x' })
    requireStaffSession.mockRejectedValue(new Error('no'))
    expect(await bulkSoftDeleteProducts([P1])).toEqual({ error: 'אין הרשאה' })
  })
})

describe('deleteVariant', () => {
  it('soft-deletes and deactivates the variant, then audits', async () => {
    expect(await deleteVariant(V1)).toEqual({})
    const update = calls.find((c) => c.table === 'request:product_variants' && c.op === 'update')
    expect(update?.payload).toMatchObject({ is_active: false })
    expect(update?.chain).toContainEqual(['eq', ['id', V1]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'deleted',
      entityType: 'product_variants',
      entityId: V1,
    })
  })

  it('surfaces the error and refuses without a session', async () => {
    override('request:product_variants.update', { data: null, error: { message: 'x' } })
    expect(await deleteVariant(V1)).toEqual({ error: 'x' })
    requireStaffSession.mockRejectedValue(new Error('no'))
    expect(await deleteVariant(V1)).toEqual({ error: 'אין הרשאה' })
  })
})
