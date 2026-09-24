import { IMAGE_HOST_ERROR } from '@/lib/images/remote-hosts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action layer of the category CRUD. The form schema is exercised through
 * the action because it lives inside the 'use server' module; what is proven
 * here is the plumbing: a permission failure returns the Hebrew error and
 * writes nothing, the right table/op is called with the parsed fields, the
 * catalogue cache tag is invalidated, and the audit row carries the outcome.
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

const USER = '33333333-3333-4333-8333-333333333333'

function fakeClient(name: string) {
  return {
    from: (table: string) => ({
      select: (...args: unknown[]) => builder(name, table, 'select', args[0]),
      update: (payload: unknown) => builder(name, table, 'update', payload),
      insert: (payload: unknown) => builder(name, table, 'insert', payload),
      delete: () => builder(name, table, 'delete'),
    }),
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
  }
}

const requestClient = fakeClient('request')

const requireAdminSession = vi.fn()
const writeAuditLog = vi.fn()
const revalidatePath = vi.fn()
const updateTag = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/admin/rbac', () => ({ requireAdminSession: () => requireAdminSession() }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: (e: unknown) => writeAuditLog(e) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
  revalidateTag: vi.fn(),
  updateTag: (t: string) => updateTag(t),
}))

const ADMIN = '11111111-1111-4111-8111-111111111111'
const CAT = '22222222-2222-4222-8222-222222222222'
const PARENT = '44444444-4444-4444-8444-444444444444'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const validForm = {
  slug: 'electronics',
  name_he: 'אלקטרוניקה',
  name_en: 'Electronics',
  sort_order: '3',
  is_active: 'true',
}

const { upsertCategory, softDeleteCategory, deleteCategory, updateCategorySortOrder } =
  await import('./categories')

beforeEach(() => {
  calls.length = 0
  queues.clear()
  writeAuditLog.mockReset()
  revalidatePath.mockReset()
  updateTag.mockReset()
  requireAdminSession.mockReset()
  requireAdminSession.mockResolvedValue({ userId: ADMIN, role: 'admin' })
})

describe('upsertCategory', () => {
  it('refuses a caller without an admin session before touching the database', async () => {
    requireAdminSession.mockRejectedValue(new Error('no session'))
    expect(await upsertCategory(null, form(validForm))).toEqual({ error: 'אין הרשאה' })
    expect(calls).toHaveLength(0)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('returns the first schema message for a bad slug and for a foreign image host', async () => {
    expect(await upsertCategory(null, form({ ...validForm, slug: 'Bad Slug' }))).toEqual({
      error: 'מזהה יכול להכיל אותיות לועזיות, מספרים ומקפים בלבד',
    })
    expect(
      await upsertCategory(null, form({ ...validForm, icon_url: 'https://evil.example/x.png' })),
    ).toEqual({ error: IMAGE_HOST_ERROR })
    expect(calls).toHaveLength(0)
  })

  it('creates a category with the parsed fields, the creator, and two audit rows', async () => {
    queue('request:categories.insert', { data: { id: CAT }, error: null })
    const result = await upsertCategory(
      null,
      form({
        ...validForm,
        parent_id: PARENT,
        description_he: 'תיאור',
        icon_url: 'https://images.unsplash.com/photo.jpg',
      }),
    )
    expect(result).toEqual({ success: 'קטגוריה נוצרה' })

    const insert = calls.find((c) => c.table === 'request:categories' && c.op === 'insert')
    expect(insert?.payload).toEqual({
      slug: 'electronics',
      name_he: 'אלקטרוניקה',
      name_en: 'Electronics',
      description_he: 'תיאור',
      parent_id: PARENT,
      icon_url: 'https://images.unsplash.com/photo.jpg',
      sort_order: 3,
      is_active: true,
      created_by: USER,
    })
    expect(insert?.chain).toContainEqual(['select', ['id']])
    // No before-read on a create.
    expect(calls.some((c) => c.op === 'select')).toBe(false)

    expect(writeAuditLog).toHaveBeenCalledTimes(2)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      actorId: ADMIN,
      actorRole: 'admin',
      action: 'created',
      entityType: 'categories',
      entityId: CAT,
      changes: { slug: 'electronics', sort_order: 3 },
    })
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      action: 'created',
      entityId: undefined,
      changes: { old: null, new: { id: null, slug: 'electronics' } },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/categories')
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('surfaces the insert error and writes no audit row', async () => {
    queue('request:categories.insert', { data: null, error: { message: 'duplicate slug' } })
    expect(await upsertCategory(null, form(validForm))).toEqual({ error: 'duplicate slug' })
    expect(writeAuditLog).not.toHaveBeenCalled()
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('updates an existing category, snapshotting the old row into the audit', async () => {
    const before = { id: CAT, slug: 'old', name_he: 'ישן', parent_id: null, is_active: true }
    queue('request:categories.select', { data: before, error: null })
    const result = await upsertCategory(null, form({ ...validForm, id: CAT, is_active: 'false' }))
    expect(result).toEqual({ success: 'קטגוריה עודכנה' })

    const read = calls.find((c) => c.op === 'select')
    expect(read?.chain).toContainEqual(['eq', ['id', CAT]])
    const update = calls.find((c) => c.table === 'request:categories' && c.op === 'update')
    expect(update?.payload).toMatchObject({ slug: 'electronics', is_active: false, sort_order: 3 })
    expect(update?.payload).not.toHaveProperty('id')
    expect(update?.chain).toContainEqual(['eq', ['id', CAT]])

    expect(writeAuditLog).toHaveBeenCalledTimes(2)
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'updated',
      entityId: CAT,
      changes: { is_active: false },
    })
    expect(writeAuditLog.mock.calls[1]?.[0]).toMatchObject({
      action: 'updated',
      entityId: CAT,
      changes: { old: before, new: { id: CAT, slug: 'electronics' } },
    })
  })

  it('surfaces the update error', async () => {
    override('request:categories.update', { data: null, error: { message: 'rls denied' } })
    expect(await upsertCategory(null, form({ ...validForm, id: CAT }))).toEqual({
      error: 'rls denied',
    })
    expect(writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('softDeleteCategory', () => {
  it('stamps deleted_at on the row and audits a delete', async () => {
    expect(await softDeleteCategory(CAT)).toEqual({})
    const update = calls.find((c) => c.table === 'request:categories' && c.op === 'update')
    expect((update?.payload as { deleted_at: string }).deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(update?.chain).toContainEqual(['eq', ['id', CAT]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'deleted',
      entityType: 'categories',
      entityId: CAT,
    })
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('returns the database error and refuses a non-admin', async () => {
    override('request:categories.update', { data: null, error: { message: 'boom' } })
    expect(await softDeleteCategory(CAT)).toEqual({ error: 'boom' })
    expect(writeAuditLog).not.toHaveBeenCalled()

    requireAdminSession.mockRejectedValue(new Error('no'))
    calls.length = 0
    expect(await softDeleteCategory(CAT)).toEqual({ error: 'אין הרשאה' })
    expect(calls).toHaveLength(0)
  })
})

describe('deleteCategory', () => {
  it('hard-deletes the row and marks the audit as a hard delete', async () => {
    expect(await deleteCategory(CAT)).toEqual({})
    const del = calls.find((c) => c.table === 'request:categories' && c.op === 'delete')
    expect(del?.chain).toContainEqual(['eq', ['id', CAT]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'deleted',
      entityId: CAT,
      metadata: { hard_delete: true },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/categories')
  })

  it('returns the database error and refuses a non-admin', async () => {
    override('request:categories.delete', { data: null, error: { message: 'fk violation' } })
    expect(await deleteCategory(CAT)).toEqual({ error: 'fk violation' })
    expect(writeAuditLog).not.toHaveBeenCalled()

    requireAdminSession.mockRejectedValue(new Error('no'))
    calls.length = 0
    expect(await deleteCategory(CAT)).toEqual({ error: 'אין הרשאה' })
    expect(calls).toHaveLength(0)
  })
})

describe('updateCategorySortOrder', () => {
  it('writes only sort_order and audits the new value', async () => {
    expect(await updateCategorySortOrder(CAT, 7)).toEqual({})
    const update = calls.find((c) => c.table === 'request:categories' && c.op === 'update')
    expect(update?.payload).toEqual({ sort_order: 7 })
    expect(update?.chain).toContainEqual(['eq', ['id', CAT]])
    expect(writeAuditLog.mock.calls[0]?.[0]).toMatchObject({
      action: 'updated',
      entityId: CAT,
      changes: { sort_order: 7 },
    })
    expect(updateTag).toHaveBeenCalledWith('catalogue')
  })

  it('returns the database error and refuses a non-admin', async () => {
    override('request:categories.update', { data: null, error: { message: 'nope' } })
    expect(await updateCategorySortOrder(CAT, 1)).toEqual({ error: 'nope' })

    requireAdminSession.mockRejectedValue(new Error('no'))
    calls.length = 0
    expect(await updateCategorySortOrder(CAT, 1)).toEqual({ error: 'אין הרשאה' })
    expect(calls).toHaveLength(0)
  })
})
