import { writeAuditLog } from '@/lib/admin/audit'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const inserted: Array<Record<string, unknown>> = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, ...row })
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

let requestId: string | null = null
vi.mock('@/lib/observability/request-context', () => ({
  getRequestId: () => requestId,
}))

const requestHeaders = new Map<string, string>()
vi.mock('next/headers', () => ({
  headers: () =>
    Promise.resolve({ get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null }),
}))

beforeEach(() => {
  inserted.length = 0
  requestHeaders.clear()
  requestId = null
})

const entry = {
  actorId: '00000000-0000-0000-0000-000000000001',
  actorRole: 'admin',
  action: 'updated',
  entityType: 'orders',
  entityId: '00000000-0000-0000-0000-000000000002',
} as Parameters<typeof writeAuditLog>[0]

describe('writeAuditLog request correlation (169)', () => {
  it('stamps the ambient request id on the row', async () => {
    requestId = 'req-from-context'
    await writeAuditLog(entry)
    expect(inserted[0]?.request_id).toBe('req-from-context')
  })

  it('records null outside a request rather than inventing one', async () => {
    await writeAuditLog(entry)
    expect(inserted[0]).toHaveProperty('request_id', null)
  })

  it('still takes ip and user agent from the request headers', async () => {
    requestHeaders.set('x-forwarded-for', '203.0.113.9, 10.0.0.1')
    requestHeaders.set('user-agent', 'test-agent')
    await writeAuditLog(entry)
    expect(inserted[0]?.ip_address).toBe('203.0.113.9')
    expect(inserted[0]?.user_agent).toBe('test-agent')
  })
})
