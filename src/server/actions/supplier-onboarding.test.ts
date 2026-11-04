import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CONTRACT_TEXT, CONTRACT_VERSION, contractHash } from '@/lib/suppliers/contract'

/**
 * The click-wrap record. Three things have to be true of every acceptance row
 * or the record proves nothing in a dispute: the hash is of the text this
 * server serves (never a value the form sent), the address is the caller's as
 * the platform saw it, and the timestamp is written by the database, not by
 * the browser's clock. Each is pinned here separately.
 */

const getUser = vi.fn()
const rpc = vi.fn()
const applicationInsert = vi.fn()
const acceptanceInsert = vi.fn()
const agreementInsert = vi.fn()
const requestHeaders = new Map<string, string>()
const getClientIp = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc,
    from: (table: string) => {
      if (table === 'supplier_applications') {
        return {
          insert: (row: unknown) => {
            applicationInsert(row)
            return {
              select: () => ({
                single: async () => ({ data: { id: 'app-1' }, error: null }),
              }),
            }
          },
        }
      }
      if (table === 'supplier_contract_acceptances') {
        return { insert: (row: unknown) => acceptanceInsert(row) }
      }
      if (table === 'agreement_acceptances') {
        return { insert: (row: unknown) => agreementInsert(row) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: async () => true,
  getClientIp: () => getClientIp(),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { error: (...args: unknown[]) => logError(...args), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/lib/storage/r2-service', () => ({
  isR2StorageConfigured: () => false,
  createR2SignedUploadUrl: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const cookieJar = new Map<string, string>()
const cookieSet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) as string } : undefined,
    set: (...args: unknown[]) => cookieSet(...args),
  }),
  headers: async () => ({ get: (name: string) => requestHeaders.get(name) ?? null }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))

import { TURNSTILE_PASS_COOKIE, issueTurnstilePass } from '@/lib/turnstile/verify'
import { passSupplierApplyChallenge, submitSupplierApplication } from './supplier-onboarding'

function validForm(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  const fields: Record<string, string> = {
    business_name: 'צימר לדוגמה',
    business_id: '512345679',
    legal_form: 'company',
    contact_name: 'ישראל ישראלי',
    email: 'owner@example.co.il',
    phone: '0501234567',
    city: 'צפת',
    bank_code: '12',
    bank_branch: '123',
    bank_account: '123456',
    bank_holder: 'צימר לדוגמה בע"מ',
    contract_version: CONTRACT_VERSION,
    accept_contract: 'on',
    ...overrides,
  }
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('submitSupplierApplication, the acceptance record', () => {
  beforeEach(() => {
    getUser.mockReset()
    rpc.mockReset()
    applicationInsert.mockReset()
    acceptanceInsert.mockReset()
    getClientIp.mockReset()
    logError.mockReset()
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    rpc.mockResolvedValue({ data: 'secret-uuid', error: null })
    acceptanceInsert.mockResolvedValue({ error: null })
    agreementInsert.mockReset()
    agreementInsert.mockResolvedValue({ error: null })
    requestHeaders.clear()
    requestHeaders.set('user-agent', 'Mozilla/5.0 probe')
    getClientIp.mockResolvedValue('203.0.113.9')
  })

  it('stores the server-side hash of the served text, the version and the caller IP', async () => {
    const result = await submitSupplierApplication({ ok: false }, validForm())
    expect(result.ok).toBe(true)
    expect(result.applicationId).toBe('app-1')

    expect(acceptanceInsert).toHaveBeenCalledTimes(1)
    const row = acceptanceInsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row).toEqual({
      application_id: 'app-1',
      accepted_by: 'user-1',
      contract_version: CONTRACT_VERSION,
      contract_sha256: contractHash(CONTRACT_TEXT),
      client_ip: '203.0.113.9',
    })
    expect(row.contract_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ignores a hash the browser tries to supply', async () => {
    const forged = 'f'.repeat(64)
    await submitSupplierApplication({ ok: false }, validForm({ contract_sha256: forged }))
    const row = acceptanceInsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row.contract_sha256).toBe(contractHash())
    expect(row.contract_sha256).not.toBe(forged)
  })

  it('leaves the timestamp to the database and never sends one from the form', async () => {
    await submitSupplierApplication(
      { ok: false },
      validForm({ accepted_at: '1999-01-01T00:00:00.000Z' }),
    )
    const row = acceptanceInsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row).not.toHaveProperty('accepted_at')
  })

  it('writes NULL, not the string "unknown", when no address reached the server', async () => {
    getClientIp.mockResolvedValue('unknown')
    await submitSupplierApplication({ ok: false }, validForm())
    const row = acceptanceInsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row.client_ip).toBeNull()
  })

  it('refuses a stale contract version before anything is written', async () => {
    const result = await submitSupplierApplication(
      { ok: false },
      validForm({ contract_version: 'v0-2020-01-01' }),
    )
    expect(result.ok).toBe(false)
    expect(result.field).toBe('accept_contract')
    expect(rpc).not.toHaveBeenCalled()
    expect(applicationInsert).not.toHaveBeenCalled()
    expect(acceptanceInsert).not.toHaveBeenCalled()
  })

  it('refuses an unticked box before anything is written', async () => {
    const fd = validForm()
    fd.delete('accept_contract')
    const result = await submitSupplierApplication({ ok: false }, fd)
    expect(result.ok).toBe(false)
    expect(result.field).toBe('accept_contract')
    expect(applicationInsert).not.toHaveBeenCalled()
    expect(acceptanceInsert).not.toHaveBeenCalled()
  })

  it('writes the click-wrap row to agreement_acceptances: version, server hash, IP, user agent', async () => {
    await submitSupplierApplication({ ok: false }, validForm({ sha256: 'f'.repeat(64) }))
    expect(agreementInsert).toHaveBeenCalledTimes(1)
    expect(agreementInsert.mock.calls[0]?.[0]).toEqual({
      agreement: 'supplier_contract',
      version: CONTRACT_VERSION,
      sha256: contractHash(CONTRACT_TEXT),
      user_id: 'user-1',
      subject_type: 'supplier_application',
      subject_id: 'app-1',
      client_ip: '203.0.113.9',
      user_agent: 'Mozilla/5.0 probe',
    })
  })

  it('caps the user agent at 512 characters, the column CHECK', async () => {
    requestHeaders.set('user-agent', 'x'.repeat(2000))
    await submitSupplierApplication({ ok: false }, validForm())
    const row = agreementInsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect((row.user_agent as string).length).toBe(512)
  })

  it('writes no agreement row for an unticked box', async () => {
    const fd = validForm()
    fd.delete('accept_contract')
    await submitSupplierApplication({ ok: false }, fd)
    expect(agreementInsert).not.toHaveBeenCalled()
  })

  it('keeps the application when the agreement log fails, and says so in the log', async () => {
    agreementInsert.mockResolvedValue({ error: { message: 'down' } })
    const result = await submitSupplierApplication({ ok: false }, validForm())
    expect(result.ok).toBe(true)
    expect(logError).toHaveBeenCalledWith(
      'supplier_onboarding.agreement_log_failed',
      expect.objectContaining({ applicationId: 'app-1', reason: 'down' }),
    )
  })

  it('keeps the submitted application when the acceptance log fails, and says so in the log', async () => {
    acceptanceInsert.mockResolvedValue({ error: { message: 'boom' } })
    const result = await submitSupplierApplication({ ok: false }, validForm())
    expect(result.ok).toBe(true)
    expect(logError).toHaveBeenCalledWith(
      'supplier_onboarding.contract_log_failed',
      expect.objectContaining({ applicationId: 'app-1', reason: 'boom' }),
    )
  })
})

describe('migration 257, agreement_acceptances', () => {
  const sql = readFileSync(
    join(process.cwd(), 'migrations/pending/257_agreement_acceptances.sql'),
    'utf8',
  )

  it('stores version, a 64-hex hash, a server timestamp and the IP as inet', () => {
    expect(sql).toMatch(/sha256\s+text NOT NULL CHECK \(sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/)
    expect(sql).toMatch(/accepted_at\s+timestamptz NOT NULL DEFAULT now\(\)/)
    expect(sql).toMatch(/client_ip\s+inet/)
  })

  it('refuses UPDATE and DELETE by trigger, for every role', () => {
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.agreement_acceptances/)
  })
})

describe('migration 204, the columns the record depends on', () => {
  const sql = readFileSync(
    join(process.cwd(), 'migrations/pending/204_supplier_onboarding.sql'),
    'utf8',
  )
  const table = sql.slice(sql.indexOf('supplier_contract_acceptances ('))

  it('timestamps the acceptance on the server with a NOT NULL default', () => {
    expect(table).toMatch(/accepted_at\s+timestamptz NOT NULL DEFAULT now\(\)/)
  })

  it('stores the address as inet and the hash as 64 lowercase hex', () => {
    expect(table).toMatch(/client_ip\s+inet/)
    expect(table).toMatch(/contract_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/)
  })
})

describe('submitSupplierApplication, the Turnstile pass', () => {
  beforeEach(() => {
    cookieJar.clear()
    cookieSet.mockReset()
    applicationInsert.mockReset()
    acceptanceInsert.mockReset()
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    rpc.mockResolvedValue({ data: 'secret-uuid', error: null })
    acceptanceInsert.mockResolvedValue({ error: null })
    agreementInsert.mockResolvedValue({ error: null })
    requestHeaders.clear()
    getClientIp.mockResolvedValue('203.0.113.9')
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA')
    vi.stubEnv('TURNSTILE_SECRET_KEY', '1x0000000000000000000000000000000AA')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('refuses a submit with no pass when configured, and writes nothing', async () => {
    const result = await submitSupplierApplication({ ok: false }, validForm())
    expect(result).toEqual({ ok: false, error: 'אימות האבטחה נכשל. רעננו את העמוד ונסו שוב.' })
    expect(applicationInsert).not.toHaveBeenCalled()
  })

  it("refuses another user's pass", async () => {
    cookieJar.set(TURNSTILE_PASS_COOKIE, issueTurnstilePass('user-2') as string)
    const result = await submitSupplierApplication({ ok: false }, validForm())
    expect(result.ok).toBe(false)
    expect(applicationInsert).not.toHaveBeenCalled()
  })

  it('accepts a live pass for the caller', async () => {
    cookieJar.set(TURNSTILE_PASS_COOKIE, issueTurnstilePass('user-1') as string)
    const result = await submitSupplierApplication({ ok: false }, validForm())
    expect(result.ok).toBe(true)
    expect(applicationInsert).toHaveBeenCalledTimes(1)
  })

  it('the gate refuses a missing token and sets no cookie', async () => {
    const result = await passSupplierApplyChallenge({}, new FormData())
    expect(result).toEqual({ error: 'אימות האבטחה נכשל. רעננו את העמוד ונסו שוב.' })
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('the gate turns a verified token into a pass bound to the user, then redirects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    )
    const data = new FormData()
    data.set('cf-turnstile-response', 'good')
    await expect(passSupplierApplyChallenge({}, data)).rejects.toThrow(
      'NEXT_REDIRECT /suppliers/apply',
    )
    expect(cookieSet).toHaveBeenCalledTimes(1)
    const [name, value, options] = cookieSet.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(name).toBe(TURNSTILE_PASS_COOKIE)
    expect(value.startsWith('user-1.')).toBe(true)
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
  })

  it('the gate sends a solver on /supplier/apply back to /supplier/apply', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    )
    requestHeaders.set('referer', 'https://kenyonexpress.co.il/supplier/apply')
    const data = new FormData()
    data.set('cf-turnstile-response', 'good')
    await expect(passSupplierApplyChallenge({}, data)).rejects.toThrow(
      'NEXT_REDIRECT /supplier/apply',
    )
  })

  it('the gate ignores a foreign referer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    )
    requestHeaders.set('referer', 'https://evil.example/supplier/apply-x')
    const data = new FormData()
    data.set('cf-turnstile-response', 'good')
    await expect(passSupplierApplyChallenge({}, data)).rejects.toThrow(
      'NEXT_REDIRECT /suppliers/apply',
    )
  })
})
