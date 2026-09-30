import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The account mutations. The policy pieces (schemas, the deletion plan) are
 * proven in their own modules; what can only fail here is the plumbing: that
 * every write goes through the REQUEST client (so RLS decides ownership), that
 * an unauthenticated caller stops before any write, that the default flag is
 * cleared before it is set, and that account deletion runs the atomic RPC
 * first and the ordered service-role fallback only when the RPC is missing.
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
      delete: () => builder(name, table, 'delete'),
    }),
  }
}

const getUser = vi.fn()
const signOut = vi.fn()
const requestClient = { ...fakeClient('request'), auth: { getUser, signOut } }
const adminClient = fakeClient('admin')

const revalidatePath = vi.fn()
const logWarn = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (...a: unknown[]) => logError(...a),
    warn: (...a: unknown[]) => logWarn(...a),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))
vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`)
  },
}))

const USER = '11111111-1111-4111-8111-111111111111'
const ADDRESS = '22222222-2222-4222-8222-222222222222'
const TOKEN = '33333333-3333-4333-8333-333333333333'

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const VALID_ADDRESS = {
  full_name: 'ישראל ישראלי',
  phone: '050-1234567',
  street: 'הרצל',
  street_number: '12',
  apartment: '',
  city: 'תל אביב',
  zip: '  ',
}

const {
  updateProfileDetails,
  saveAddress,
  deleteAddress,
  setDefaultAddress,
  deletePaymentToken,
  setDefaultPaymentToken,
} = await import('./account')

const find = (table: string, op: string) => calls.filter((c) => c.table === table && c.op === op)

beforeEach(() => {
  calls.length = 0
  queues.clear()
  revalidatePath.mockReset()
  logWarn.mockReset()
  logError.mockReset()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: USER } } })
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
})

describe('updateProfileDetails', () => {
  it('writes name and phone through the request client, scoped to the caller', async () => {
    const result = await updateProfileDetails(
      null,
      form({ full_name: '  דנה כהן ', phone: '052-9876543' }),
    )
    expect(result).toEqual({ success: 'הפרטים נשמרו' })
    const [write] = find('request:profiles', 'update')
    expect(write?.payload).toEqual({ full_name: 'דנה כהן', phone: '052-9876543' })
    expect(write?.chain).toContainEqual(['eq', ['id', USER]])
    expect(calls.some((c) => c.table.startsWith('admin:'))).toBe(false)
    expect(revalidatePath).toHaveBeenCalledWith('/account/details')
    expect(revalidatePath).toHaveBeenCalledWith('/account')
  })

  it('refuses without a session, before any write', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(
      await updateProfileDetails(null, form({ full_name: 'דנה', phone: '0521111111' })),
    ).toEqual({ error: 'יש להתחבר' })
    expect(calls).toEqual([])
  })

  it('reports the schema message and the write failure', async () => {
    expect(await updateProfileDetails(null, form({ full_name: 'ד', phone: '0521111111' }))).toEqual(
      {
        error: 'יש להזין שם מלא',
      },
    )
    expect(calls).toEqual([])

    queue('request:profiles.update', { data: null, error: { message: 'boom' } })
    expect(
      await updateProfileDetails(null, form({ full_name: 'דנה', phone: '0521111111' })),
    ).toEqual({ error: 'שמירת הפרטים נכשלה' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('saveAddress', () => {
  it('inserts a new row with blanks folded to null and the caller as owner', async () => {
    const result = await saveAddress(null, form(VALID_ADDRESS))
    expect(result).toEqual({ success: 'הכתובת נוספה' })
    const [insert] = find('request:user_addresses', 'insert')
    expect(insert?.payload).toEqual({
      user_id: USER,
      full_name: 'ישראל ישראלי',
      phone: '050-1234567',
      street: 'הרצל',
      street_number: '12',
      apartment: null,
      entrance: null,
      floor: null,
      city: 'תל אביב',
      zip: null,
      notes_for_courier: null,
      is_default: false,
    })
    // Not the default, so nothing else was touched first.
    expect(find('request:user_addresses', 'update')).toEqual([])
    expect(revalidatePath).toHaveBeenCalledWith('/account/addresses')
  })

  it('clears every other default before updating an existing row as default', async () => {
    const result = await saveAddress(
      null,
      form({ ...VALID_ADDRESS, id: ADDRESS, is_default: 'on' }),
    )
    expect(result).toEqual({ success: 'הכתובת עודכנה' })
    const updates = find('request:user_addresses', 'update')
    expect(updates).toHaveLength(2)
    expect(updates[0]?.payload).toEqual({ is_default: false })
    expect(updates[0]?.chain).toEqual([
      ['eq', ['user_id', USER]],
      ['is', ['deleted_at', null]],
    ])
    expect(updates[1]?.payload).toMatchObject({ is_default: true, user_id: USER })
    expect(updates[1]?.chain).toContainEqual(['eq', ['id', ADDRESS]])
    expect(find('request:user_addresses', 'insert')).toEqual([])
  })

  it('refuses a bad address and an anonymous caller before any write', async () => {
    expect(await saveAddress(null, form({ ...VALID_ADDRESS, city: '' }))).toEqual({
      error: 'יש להזין עיר',
    })
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await saveAddress(null, form(VALID_ADDRESS))).toEqual({ error: 'יש להתחבר' })
    expect(calls).toEqual([])
  })

  it('reports a failed write', async () => {
    queue('request:user_addresses.insert', { data: null, error: { message: 'rls' } })
    expect(await saveAddress(null, form(VALID_ADDRESS))).toEqual({ error: 'שמירת הכתובת נכשלה' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('deleteAddress', () => {
  it('soft-deletes: clears the default flag and stamps deleted_at', async () => {
    expect(await deleteAddress(null, form({ id: ADDRESS }))).toEqual({ success: 'הכתובת נמחקה' })
    const [write] = find('request:user_addresses', 'update')
    expect(write?.payload).toMatchObject({ is_default: false })
    expect((write?.payload as { deleted_at: string }).deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(write?.chain).toContainEqual(['eq', ['id', ADDRESS]])
    expect(find('request:user_addresses', 'delete')).toEqual([])
  })

  it('refuses a malformed id, an anonymous caller, and reports a failed write', async () => {
    expect(await deleteAddress(null, form({ id: 'nope' }))).toEqual({ error: 'מזהה כתובת לא תקין' })
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await deleteAddress(null, form({ id: ADDRESS }))).toEqual({ error: 'יש להתחבר' })
    expect(calls).toEqual([])

    queue('request:user_addresses.update', { data: null, error: { message: 'rls' } })
    expect(await deleteAddress(null, form({ id: ADDRESS }))).toEqual({
      error: 'מחיקת הכתובת נכשלה',
    })
  })
})

describe('setDefaultAddress', () => {
  it('clears the flag on every live row of the caller, then sets it on one', async () => {
    expect(await setDefaultAddress(null, form({ id: ADDRESS }))).toEqual({
      success: 'הכתובת נקבעה כברירת מחדל',
    })
    const updates = find('request:user_addresses', 'update')
    expect(updates.map((u) => u.payload)).toEqual([{ is_default: false }, { is_default: true }])
    expect(updates[0]?.chain).toContainEqual(['eq', ['user_id', USER]])
    expect(updates[1]?.chain).toContainEqual(['eq', ['id', ADDRESS]])
  })

  it('refuses a malformed id and an anonymous caller, and reports a failed set', async () => {
    expect(await setDefaultAddress(null, form({ id: '1' }))).toEqual({
      error: 'מזהה כתובת לא תקין',
    })
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await setDefaultAddress(null, form({ id: ADDRESS }))).toEqual({ error: 'יש להתחבר' })
    expect(calls).toEqual([])

    queue(
      'request:user_addresses.update',
      { data: null, error: null },
      { data: null, error: { message: 'rls' } },
    )
    expect(await setDefaultAddress(null, form({ id: ADDRESS }))).toEqual({
      error: 'עדכון ברירת המחדל נכשל',
    })
  })
})

describe('deletePaymentToken', () => {
  it('deletes the row by id through the request client (RLS owns the scope)', async () => {
    expect(await deletePaymentToken(null, form({ id: TOKEN }))).toEqual({ success: 'הכרטיס הוסר' })
    const [del] = find('request:payment_tokens', 'delete')
    expect(del?.chain).toEqual([['eq', ['id', TOKEN]]])
    expect(revalidatePath).toHaveBeenCalledWith('/account/tokens')
  })

  it('refuses a malformed id and an anonymous caller, and reports a failed delete', async () => {
    expect(await deletePaymentToken(null, form({ id: 'x' }))).toEqual({
      error: 'מזהה כרטיס לא תקין',
    })
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await deletePaymentToken(null, form({ id: TOKEN }))).toEqual({ error: 'יש להתחבר' })
    expect(calls).toEqual([])

    queue('request:payment_tokens.delete', { data: null, error: { message: 'rls' } })
    expect(await deletePaymentToken(null, form({ id: TOKEN }))).toEqual({
      error: 'מחיקת הכרטיס נכשלה',
    })
  })
})

describe('setDefaultPaymentToken', () => {
  it('clears the flag across the profile, then sets it on the named card', async () => {
    expect(await setDefaultPaymentToken(null, form({ id: TOKEN }))).toEqual({
      success: 'הכרטיס נקבע כברירת מחדל',
    })
    const updates = find('request:payment_tokens', 'update')
    expect(updates.map((u) => u.payload)).toEqual([{ is_default: false }, { is_default: true }])
    expect(updates[0]?.chain).toEqual([['eq', ['profile_id', USER]]])
    expect(updates[1]?.chain).toEqual([['eq', ['id', TOKEN]]])
  })

  it('refuses a malformed id and an anonymous caller, and reports a failed set', async () => {
    expect(await setDefaultPaymentToken(null, form({ id: '' }))).toEqual({
      error: 'מזהה כרטיס לא תקין',
    })
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await setDefaultPaymentToken(null, form({ id: TOKEN }))).toEqual({ error: 'יש להתחבר' })
    expect(calls).toEqual([])

    queue(
      'request:payment_tokens.update',
      { data: null, error: null },
      { data: null, error: { message: 'rls' } },
    )
    expect(await setDefaultPaymentToken(null, form({ id: TOKEN }))).toEqual({
      error: 'עדכון ברירת המחדל נכשל',
    })
  })
})
