import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const checkRateLimit = vi.hoisted(() => vi.fn())
const cookieGet = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }))

import { GET } from './route'

/**
 * The export is a legal right, so what is tested is the contract of the file:
 * closed to strangers, throttled, downloadable (attachment + no-store), and
 * honest about a section it could not read instead of quietly dropping it.
 */

const USER = {
  id: '00000000-0000-4000-8000-000000000007',
  email: 'ofira@example.com',
  phone: '',
  created_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: '2026-09-01T00:00:00Z',
}

let tableData: Record<string, unknown>
let errorTables: Set<string>
let selectedColumns: Record<string, string>

function supabaseStub() {
  return {
    auth: { getUser },
    from: (table: string) => ({
      select: (columns: string) => {
        selectedColumns[table] = columns
        const result = () =>
          errorTables.has(table)
            ? { data: null, error: { message: `${table} boom` } }
            : { data: tableData[table] ?? [], error: null }
        const thenable = {
          order: () => thenable,
          maybeSingle: async () => result(),
          // biome-ignore lint/suspicious/noThenProperty: the Supabase query builder IS a thenable; the stub must be awaitable mid-chain like the real one.
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        }
        return thenable
      },
    }),
  }
}

function request(): NextRequest {
  return new NextRequest('http://localhost/api/account/export')
}

describe('GET /api/account/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tableData = {}
    errorTables = new Set()
    selectedColumns = {}
    getUser.mockResolvedValue({ data: { user: USER } })
    createClient.mockImplementation(async () => supabaseStub())
    checkRateLimit.mockResolvedValue(true)
    cookieGet.mockReturnValue({ value: 'granted.2' })
  })

  it('is closed without a session', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const response = await GET(request())
    expect(response.status).toBe(401)
  })

  it('throttles per user', async () => {
    checkRateLimit.mockResolvedValue(false)
    const response = await GET(request())
    expect(response.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith(`data-export:${USER.id}`, 5, 3600)
  })

  it('answers as a JSON download that no cache may keep', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="kenyonexpress-data-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('carries the account identity, the consent state and every section', async () => {
    tableData.profiles = { email: 'ofira@example.com', full_name: 'א' }
    tableData.orders = [{ id: 'o1' }]
    const response = await GET(request())
    const body = await response.json()

    expect(body.format).toBe('kenyonexpress-data-export/1')
    expect(body.account).toMatchObject({ id: USER.id, email: USER.email })
    expect(body.analytics_consent).toEqual({ decision: 'granted', wordingVersion: 2 })
    for (const section of [
      'profile',
      'addresses',
      'orders',
      'payment_methods',
      'wallet_accounts',
      'wallet_transactions',
      'vouchers',
      'referrals',
    ]) {
      expect(body, `missing section ${section}`).toHaveProperty(section)
    }
    expect(body.sections_unavailable).toEqual([])
  })

  it('never selects the raw Cardcom token into the file', async () => {
    await GET(request())
    expect(selectedColumns.payment_tokens).toContain('last_4')
    expect(selectedColumns.payment_tokens).not.toContain('cardcom_token')
  })

  it('names a section it could not read instead of dropping it or failing whole', async () => {
    errorTables.add('vouchers')
    const response = await GET(request())
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.sections_unavailable).toEqual(['vouchers'])
    expect(body.vouchers).toBeNull()
  })
})
