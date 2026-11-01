import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The manual refresh action has four outcomes worth pinning: no session means
 * no RPC call at all, a missing function names the pending migration instead
 * of pretending to fail, a database error fails loudly, and a success writes
 * an audit row. The database re-checks is_admin() inside the RPC either way;
 * these tests are about the action's half of the contract.
 */

let sessionResult: { userId: string; role: string } | null = { userId: 'admin-1', role: 'admin' }
vi.mock('@/lib/admin/rbac', () => ({
  requireAdminSession: async () => {
    if (!sessionResult) throw new Error('no session')
    return sessionResult
  },
}))

const auditCalls: unknown[] = []
vi.mock('@/lib/admin/audit', () => ({
  writeAuditLog: async (entry: unknown) => {
    auditCalls.push(entry)
  },
}))

vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: <T>(_name: string, run: () => T) => run(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }
let rpcResult: RpcResult = { data: '2026-09-04T01:30:00Z', error: null }
const rpcCalls: string[] = []
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: (fn: string) => {
      rpcCalls.push(fn)
      return Promise.resolve({ ...rpcResult })
    },
  }),
}))

const logError = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const { refreshReports } = await import('./reports')

beforeEach(() => {
  sessionResult = { userId: 'admin-1', role: 'admin' }
  rpcResult = { data: '2026-09-04T01:30:00Z', error: null }
  rpcCalls.length = 0
  auditCalls.length = 0
  logError.mockClear()
})

describe('refreshReports', () => {
  it('refuses without an admin session, before any RPC', async () => {
    sessionResult = null
    const result = await refreshReports()
    expect(result).toEqual({ error: 'אין הרשאה' })
    expect(rpcCalls).toHaveLength(0)
  })

  it('calls admin_refresh_reports and writes an audit row on success', async () => {
    const result = await refreshReports()
    expect(rpcCalls).toEqual(['admin_refresh_reports'])
    expect(result).toEqual({ success: 'הדוחות רועננו' })
    expect(auditCalls).toHaveLength(1)
    expect(auditCalls[0]).toMatchObject({
      actorId: 'admin-1',
      action: 'updated',
      entityType: 'report_tables',
    })
  })

  it('names the pending migration when the function does not exist', async () => {
    rpcResult = { data: null, error: { code: 'PGRST202', message: 'not in schema cache' } }
    const result = await refreshReports()
    expect(result).toMatchObject({ error: expect.stringContaining('170') })
    expect(auditCalls).toHaveLength(0)
  })

  it('fails loudly on a real error and does not audit a refresh that did not happen', async () => {
    rpcResult = { data: null, error: { code: '57014', message: 'statement timeout' } }
    const result = await refreshReports()
    expect(result).toEqual({ error: 'רענון הדוחות נכשל. נסה שוב.' })
    expect(auditCalls).toHaveLength(0)
    expect(logError).toHaveBeenCalled()
  })
})
