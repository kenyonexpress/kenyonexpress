import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of category banners (STEP 62). What can only fail here is
 * the edge: the catalog gate runs before parsing, an empty window field is
 * null and not an invalid date, a half CTA and an external CTA are refused
 * before the round trip, the absent table names the migration, a category id
 * that is not a category is a field error, every write carries an audit row
 * naming the actor the service role hides, and a banner moved between
 * categories stales both category tags.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
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
    delete: () => builder(table, 'delete'),
  }),
}

const requireSection = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const updateTag = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: (s: string, a: string) => requireSection(s, a),
}))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  updateTag: (t: string) => updateTag(t),
}))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const BANNER = '22222222-2222-4222-8222-222222222222'
const CATEGORY = '33333333-3333-4333-8333-333333333333'
const OTHER_CATEGORY = '44444444-4444-4444-8444-444444444444'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const validForm = {
  category_id: CATEGORY,
  title_he: 'מבצעי החורף',
  subtitle_he: 'עד 40% הנחה',
  image_url: 'https://cdn.example/banner.webp',
  image_alt_he: 'כוסות חמות על שלג',
  cta_label_he: 'לכל המבצעים',
  cta_href: '/category/hot-deals',
  theme: 'light',
  starts_at: '',
  ends_at: '',
  priority: '0',
  is_active: 'on',
}

const { saveCategoryBanner, setCategoryBannerActive, deleteCategoryBanner } = await import(
  './category-banners'
)

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  updateTag.mockReset()
  requireSection.mockReset()
  requireSection.mockResolvedValue({ userId: ADMIN, role: 'content_uploader' })
})

describe('saveCategoryBanner', () => {
  it('propagates the catalog gate before parsing anything', async () => {
    requireSection.mockRejectedValue(new Error('forbidden'))
    await expect(saveCategoryBanner({ ok: false }, form(validForm))).rejects.toThrow('forbidden')
    expect(requireSection).toHaveBeenCalledWith('catalog', 'write')
    expect(calls).toHaveLength(0)
  })

  it('refuses a half CTA, an external CTA, and a window ending before it starts', async () => {
    const half = await saveCategoryBanner({ ok: false }, form({ ...validForm, cta_href: '' }))
    expect(half.ok).toBe(false)
    expect(half.fieldErrors?.cta_href?.[0]).toContain('גם טקסט וגם קישור')

    const external = await saveCategoryBanner(
      { ok: false },
      form({ ...validForm, cta_href: 'https://evil.example' }),
    )
    expect(external.ok).toBe(false)
    expect(external.fieldErrors?.cta_href?.[0]).toContain('פנימי')

    const backwards = await saveCategoryBanner(
      { ok: false },
      form({ ...validForm, starts_at: '2026-10-09T12:00', ends_at: '2026-10-09T10:00' }),
    )
    expect(backwards.ok).toBe(false)
    expect(backwards.fieldErrors?.ends_at?.[0]).toContain('אחרי')

    const noImage = await saveCategoryBanner({ ok: false }, form({ ...validForm, image_url: '' }))
    expect(noImage.ok).toBe(false)
    expect(noImage.fieldErrors?.image_url).toBeTruthy()

    const noCategory = await saveCategoryBanner(
      { ok: false },
      form({ ...validForm, category_id: '' }),
    )
    expect(noCategory.ok).toBe(false)
    expect(noCategory.fieldErrors?.category_id).toBeTruthy()
    expect(calls).toHaveLength(0)
  })

  it('inserts with an open window as nulls, both CTA halves, the actor, and an audit row', async () => {
    queue('category_banners.insert', {
      data: { id: BANNER, category_id: CATEGORY, categories: { slug: 'hot-deals' } },
      error: null,
    })
    const result = await saveCategoryBanner({ ok: false }, form(validForm))
    expect(result).toEqual({ ok: true, id: BANNER })

    const insert = calls.find((c) => c.op === 'insert')
    expect(insert?.table).toBe('category_banners')
    expect(insert?.payload).toMatchObject({
      category_id: CATEGORY,
      title_he: 'מבצעי החורף',
      subtitle_he: 'עד 40% הנחה',
      cta_label_he: 'לכל המבצעים',
      cta_href: '/category/hot-deals',
      theme: 'light',
      starts_at: null,
      ends_at: null,
      priority: 0,
      is_active: true,
      created_by: ADMIN,
    })

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ADMIN,
        actorRole: 'content_uploader',
        action: 'created',
        entityType: 'category_banners',
        entityId: BANNER,
      }),
    )
    expect(updateTag).toHaveBeenCalledWith(`category:${CATEGORY}`)
    expect(revalidatePath).toHaveBeenCalledWith('/category/hot-deals')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/category-banners')
  })

  it('converts a typed window to instants and drops an empty CTA pair to nulls', async () => {
    queue('category_banners.insert', {
      data: { id: BANNER, category_id: CATEGORY, categories: null },
      error: null,
    })
    const result = await saveCategoryBanner(
      { ok: false },
      form({
        ...validForm,
        cta_label_he: '',
        cta_href: '',
        subtitle_he: '  ',
        starts_at: '2026-10-09T10:00',
        ends_at: '2026-10-09T12:00',
      }),
    )
    expect(result.ok).toBe(true)
    const payload = calls.find((c) => c.op === 'insert')?.payload as Record<string, unknown>
    expect(payload.cta_label_he).toBeNull()
    expect(payload.cta_href).toBeNull()
    expect(payload.subtitle_he).toBeNull()
    expect(payload.starts_at).toBe(new Date('2026-10-09T10:00').toISOString())
    expect(payload.ends_at).toBe(new Date('2026-10-09T12:00').toISOString())
  })

  it('updates by id and stales both the old and the new category when moved', async () => {
    queue('category_banners.select', { data: { category_id: OTHER_CATEGORY }, error: null })
    queue('category_banners.update', {
      data: { id: BANNER, category_id: CATEGORY, categories: [{ slug: 'hot-deals' }] },
      error: null,
    })
    const result = await saveCategoryBanner({ ok: false }, form({ ...validForm, id: BANNER }))
    expect(result).toEqual({ ok: true, id: BANNER })
    const update = calls.find((c) => c.op === 'update')
    expect(update?.chain).toContainEqual(['eq', ['id', BANNER]])
    expect(update?.payload).not.toHaveProperty('created_by')
    expect(updateTag).toHaveBeenCalledWith(`category:${CATEGORY}`)
    expect(updateTag).toHaveBeenCalledWith(`category:${OTHER_CATEGORY}`)
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'updated' }))
  })

  it('names the migration on the absent table and the field on a dead category id', async () => {
    queue('category_banners.insert', {
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    })
    const absent = await saveCategoryBanner({ ok: false }, form(validForm))
    expect(absent.ok).toBe(false)
    expect(absent.error).toContain('267')

    queues.clear()
    queue('category_banners.insert', {
      data: null,
      error: { code: '23503', message: 'violates foreign key' },
    })
    const dead = await saveCategoryBanner({ ok: false }, form(validForm))
    expect(dead.ok).toBe(false)
    expect(dead.fieldErrors?.category_id?.[0]).toContain('אינה קיימת')
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('setCategoryBannerActive and deleteCategoryBanner', () => {
  it('refuses a malformed id without touching the database', async () => {
    const off = await setCategoryBannerActive('nope', false)
    expect(off.ok).toBe(false)
    const gone = await deleteCategoryBanner('nope')
    expect(gone.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('flips the flag with a status_change audit row and stales the category', async () => {
    queue('category_banners.update', {
      data: { id: BANNER, category_id: CATEGORY, categories: { slug: 'hot-deals' } },
      error: null,
    })
    const result = await setCategoryBannerActive(BANNER, false)
    expect(result).toEqual({ ok: true, id: BANNER })
    expect(calls[0]?.payload).toEqual({ is_active: false })
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'status_change',
        entityType: 'category_banners',
        entityId: BANNER,
        changes: { is_active: false },
      }),
    )
    expect(updateTag).toHaveBeenCalledWith(`category:${CATEGORY}`)
    expect(revalidatePath).toHaveBeenCalledWith('/category/hot-deals')
  })

  it('deletes with an audit row', async () => {
    queue('category_banners.delete', {
      data: { id: BANNER, category_id: CATEGORY, categories: null },
      error: null,
    })
    const result = await deleteCategoryBanner(BANNER)
    expect(result).toEqual({ ok: true })
    expect(calls[0]?.op).toBe('delete')
    expect(calls[0]?.chain).toContainEqual(['eq', ['id', BANNER]])
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleted', entityId: BANNER }),
    )
    expect(updateTag).toHaveBeenCalledWith(`category:${CATEGORY}`)
  })
})
