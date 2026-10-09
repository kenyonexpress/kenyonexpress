import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PURGED_ROWS, RETAINED_FOR_LAW, anonymizedEmail, runAnonymizationCascade } from './deletion'

/**
 * The cascade's promise is structural: money and accounting rows are never in
 * the purge list, PII rows are all handled, and one failing table does not
 * shield the others. The fake below records every write the way the stubs in
 * the webhook tests do; there is no database here on purpose.
 */

type Write = {
  table: string
  op: 'delete' | 'update' | 'insert'
  values?: unknown
  filters: Array<{ method: string; column?: string; value?: unknown }>
}

function fakeAdmin(failTables: Set<string> = new Set(), failAuth = false) {
  const writes: Write[] = []
  const authCalls: Array<{ userId: string; attributes: Record<string, unknown> }> = []

  function chain(write: Write) {
    const self: Record<string, unknown> = {
      eq: (column: string, value: unknown) => {
        write.filters.push({ method: 'eq', column, value })
        return self
      },
      in: (column: string, value: unknown) => {
        write.filters.push({ method: 'in', column, value })
        return self
      },
      // biome-ignore lint/suspicious/noThenProperty: the Supabase query builder IS a thenable; the stub must be awaitable mid-chain like the real one.
      then: (resolve: (result: { error: { message: string } | null }) => unknown) =>
        Promise.resolve({
          error: failTables.has(write.table) ? { message: `${write.table} boom` } : null,
        }).then(resolve),
    }
    return self
  }

  const admin = {
    from: (table: string) => ({
      delete: () => {
        const write: Write = { table, op: 'delete', filters: [] }
        writes.push(write)
        return chain(write)
      },
      update: (values: unknown) => {
        const write: Write = { table, op: 'update', values, filters: [] }
        writes.push(write)
        return chain(write)
      },
      insert: (values: unknown) => {
        const write: Write = { table, op: 'insert', values, filters: [] }
        writes.push(write)
        return chain(write)
      },
    }),
    auth: {
      admin: {
        updateUserById: vi.fn(async (userId: string, attributes: Record<string, unknown>) => {
          authCalls.push({ userId, attributes })
          return { data: {}, error: failAuth ? { message: 'auth boom' } : null }
        }),
      },
    },
  }

  return { admin: admin as never, writes, authCalls }
}

const USER = '00000000-0000-4000-8000-000000000001'

describe('the deletion plan itself', () => {
  it('never purges a table the law says to retain', () => {
    const purged = new Set(PURGED_ROWS.map((row) => row.table))
    for (const table of RETAINED_FOR_LAW) {
      expect(purged.has(table), `${table} is accounting data and must not be purged`).toBe(false)
    }
  })

  it('lists every purged table once', () => {
    const tables = PURGED_ROWS.map((row) => row.table)
    expect(new Set(tables).size).toBe(tables.length)
  })

  it('keeps the money ledger on the retained list', () => {
    for (const table of ['orders', 'wallet_transactions', 'vouchers', 'audit_log']) {
      expect(RETAINED_FOR_LAW).toContain(table)
    }
  })
})

describe('runAnonymizationCascade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes every purge target keyed by its own column and the user id', async () => {
    const { admin, writes } = fakeAdmin()
    const result = await runAnonymizationCascade(admin, USER)

    expect(result.failed).toEqual([])
    expect(result.criticalFailed).toEqual([])
    for (const target of PURGED_ROWS) {
      const write = writes.find((w) => w.table === target.table && w.op === 'delete')
      expect(write, `${target.table} was not purged`).toBeTruthy()
      expect(write?.filters).toEqual([{ method: 'eq', column: target.column, value: USER }])
    }
  })

  it('scrubs the profile to the tombstone email and nulls the PII', async () => {
    const { admin, writes } = fakeAdmin()
    await runAnonymizationCascade(admin, USER)

    const profile = writes.find((w) => w.table === 'profiles' && w.op === 'update')
    expect(profile?.values).toMatchObject({
      email: anonymizedEmail(USER),
      full_name: null,
      phone: null,
      avatar_url: null,
    })
  })

  it('scrubs addresses in place instead of deleting them (orders resolve address_id)', async () => {
    const { admin, writes } = fakeAdmin()
    await runAnonymizationCascade(admin, USER)

    const address = writes.find((w) => w.table === 'user_addresses')
    expect(address?.op).toBe('update')
    const values = address?.values as Record<string, unknown>
    expect(values.deleted_at).toBeTruthy()
    for (const key of ['full_name', 'phone', 'street', 'city']) {
      expect(String(values[key])).not.toContain('@')
      expect(values[key]).not.toBeNull()
    }
  })

  it('cancels only the subscriptions that could still charge', async () => {
    const { admin, writes } = fakeAdmin()
    await runAnonymizationCascade(admin, USER)

    const sub = writes.find((w) => w.table === 'subscriptions')
    expect(sub?.values).toMatchObject({ status: 'canceled', cancel_reason: 'account_deleted' })
    expect(sub?.filters).toContainEqual({
      method: 'in',
      column: 'status',
      value: ['active', 'past_due', 'paused'],
    })
  })

  it('bans the auth user under the tombstone email, then clears the phone separately', async () => {
    const { admin, authCalls } = fakeAdmin()
    await runAnonymizationCascade(admin, USER)

    expect(authCalls[0]).toEqual({
      userId: USER,
      attributes: {
        email: anonymizedEmail(USER),
        user_metadata: {},
        ban_duration: '87600h',
      },
    })
    expect(authCalls[1]).toEqual({ userId: USER, attributes: { phone: '' } })
  })

  it('writes the erasure proof to the audit log', async () => {
    const { admin, writes } = fakeAdmin()
    await runAnonymizationCascade(admin, USER)

    const audit = writes.find((w) => w.table === 'audit_log')
    expect(audit?.op).toBe('insert')
    expect(audit?.values).toMatchObject({
      action: 'deleted',
      entity_type: 'account',
      entity_id: USER,
      actor_id: USER,
    })
  })

  it('keeps going when one table fails, and reports it by name', async () => {
    const { admin, writes } = fakeAdmin(new Set(['reviews']))
    const result = await runAnonymizationCascade(admin, USER)

    expect(result.failed).toContain('reviews')
    expect(result.criticalFailed).toEqual([])
    // The tables after reviews in the plan still ran.
    expect(writes.some((w) => w.table === 'newsletter_subscribers')).toBe(true)
    expect(writes.some((w) => w.table === 'profiles')).toBe(true)
  })

  it('reports a surviving profile as critical', async () => {
    const { admin } = fakeAdmin(new Set(['profiles']))
    const result = await runAnonymizationCascade(admin, USER)
    expect(result.criticalFailed).toContain('profiles')
  })

  it('reports a failed auth scrub as critical and skips the phone follow-up', async () => {
    const { admin, authCalls } = fakeAdmin(new Set(), true)
    const result = await runAnonymizationCascade(admin, USER)
    expect(result.criticalFailed).toContain('auth')
    expect(authCalls).toHaveLength(1)
  })
})
