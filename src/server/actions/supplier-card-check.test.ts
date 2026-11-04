import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The action around the 1 ILS hook. The provider is the REAL shared sandbox
 * (`@/lib/payments` is not mocked); only the session and the database are.
 */

const getUser = vi.fn()
const appRow = vi.fn()
const checkInsert = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'supplier_applications') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => appRow() }) }),
        }
      }
      if (table === 'supplier_application_card_checks') {
        return { insert: async (row: unknown) => checkInsert(row) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit: async () => true }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { getSharedMockCardcom } from '@/lib/payments'
import { startSupplierCardCheck } from './supplier-card-check'

const APP = '11111111-2222-3333-4444-555555555555'

function form(id = APP): FormData {
  const fd = new FormData()
  fd.set('application_id', id)
  return fd
}

describe('startSupplierCardCheck', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    getSharedMockCardcom().reset()
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } })
    appRow
      .mockReset()
      .mockReturnValue({ data: { id: APP, user_id: 'user-1', status: 'submitted' }, error: null })
    checkInsert.mockReset().mockReturnValue({ error: null })
    logError.mockReset()
  })

  it('verifies on the sandbox and records 100 agorot, charged and voided, with last four only', async () => {
    const result = await startSupplierCardCheck({ ok: false }, form())
    expect(result.ok).toBe(true)
    expect(checkInsert).toHaveBeenCalledTimes(1)
    const row = checkInsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row).toMatchObject({
      application_id: APP,
      user_id: 'user-1',
      amount_agorot: 100,
      provider: 'mock',
      status: 'verified',
      card_last4: '4242',
      failure_code: null,
    })
    expect(row.transaction_id).toBeTruthy()
    expect(row.void_transaction_id).toBeTruthy()
  })

  it("refuses someone else's application with the same words as a missing one", async () => {
    appRow.mockReturnValue({
      data: { id: APP, user_id: 'user-2', status: 'submitted' },
      error: null,
    })
    const result = await startSupplierCardCheck({ ok: false }, form())
    expect(result).toEqual({ ok: false, error: 'הבקשה לא נמצאה' })
    expect(checkInsert).not.toHaveBeenCalled()
  })

  it('refuses without a session', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await startSupplierCardCheck({ ok: false }, form())).ok).toBe(false)
    expect(checkInsert).not.toHaveBeenCalled()
  })

  it('records a decline as failed and tells the applicant', async () => {
    getSharedMockCardcom().failNext()
    const result = await startSupplierCardCheck({ ok: false }, form())
    expect(result.ok).toBe(false)
    expect(checkInsert.mock.calls[0]?.[0]).toMatchObject({
      status: 'failed',
      failure_code: 'DECLINED',
    })
  })

  it('refuses on a production deployment that fell back to the sandbox, before any read', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CARDCOM_USE_MOCK', '')
    vi.stubEnv('CARDCOM_TERMINAL_NUMBER', '')
    const result = await startSupplierCardCheck({ ok: false }, form())
    expect(result.ok).toBe(false)
    expect(appRow).not.toHaveBeenCalled()
    expect(checkInsert).not.toHaveBeenCalled()
  })
})
