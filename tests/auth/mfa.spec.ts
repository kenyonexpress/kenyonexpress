import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * G6 contract suite: the staff MFA gate for the three forced roles, backup
 * codes (issue, redeem, consume), and the /api/auth/mfa transport. The
 * Supabase clients are mocked at the module boundary; the policy, hashing and
 * route logic are the real code.
 */

// ── mocks ────────────────────────────────────────────────────────────────────
const user = {
  id: 'user-1',
  email: 'admin@example.test',
  app_metadata: {} as Record<string, unknown>,
}
const session = {
  factors: [] as { id: string; factor_type: string; status: string }[],
  levels: { currentLevel: 'aal1', nextLevel: 'aal1' },
  verifyOk: true,
}
const adminUser = { app_metadata: {} as Record<string, unknown> }
const deleteFactor = vi.fn(async () => ({ error: null }))
const updateUserById = vi.fn(
  async (_id: string, attrs: { app_metadata: Record<string, unknown> }) => {
    adminUser.app_metadata = attrs.app_metadata
    return { error: null }
  },
)

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { ...user, app_metadata: adminUser.app_metadata } } }),
      mfa: {
        listFactors: async () => ({
          data: {
            all: session.factors,
            totp: session.factors.filter((f) => f.factor_type === 'totp'),
          },
        }),
        getAuthenticatorAssuranceLevel: async () => ({ data: session.levels }),
        unenroll: async () => ({ error: null }),
        enroll: async () => ({
          data: { id: 'factor-new', totp: { qr_code: '<svg/>', secret: 'JBSWY3DPEHPK3PXP' } },
          error: null,
        }),
        challenge: async () => ({ data: { id: 'challenge-1' }, error: null }),
        verify: async () => ({ error: session.verifyOk ? null : { message: 'bad' } }),
      },
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { ...user, app_metadata: adminUser.app_metadata } },
          error: null,
        }),
        updateUserById: (...a: unknown[]) =>
          updateUserById(...(a as [string, { app_metadata: Record<string, unknown> }])),
        mfa: { deleteFactor: (...a: unknown[]) => deleteFactor(...(a as [])) },
      },
    },
  }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: async () => true,
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: async () => ({
    allowed: true,
    limit: 60,
    windowSeconds: 900,
    remaining: 59,
    resetAtMs: null,
    backend: 'postgres',
  }),
  rateLimitHeaders: () => new Headers(),
}))
const alert = vi.fn(async () => true)
vi.mock('@/server/auth/security-alert-send', () => ({
  trySendSecurityAlert: (...a: unknown[]) => alert(...(a as [])),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/with-request-log', () => ({
  withRequestLog: (_route: string, handler: (...a: unknown[]) => unknown) => handler,
}))

import { GET as mfaGET, POST as mfaPOST } from '@/app/api/auth/mfa/route'
import { staffMfaGate } from '@/lib/admin/mfa-gate'
import { issueBackupCodes, mfaStatus, redeemBackupCode } from '@/server/mfa/service'

function post(body: unknown, origin = 'https://www.kenyonexpress.co.il'): NextRequest {
  return new NextRequest('https://www.kenyonexpress.co.il/api/auth/mfa', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', origin, host: 'www.kenyonexpress.co.il' },
  })
}

beforeEach(() => {
  session.factors = []
  session.levels = { currentLevel: 'aal1', nextLevel: 'aal1' }
  session.verifyOk = true
  adminUser.app_metadata = {}
  deleteFactor.mockClear()
  updateUserById.mockClear()
  alert.mockClear()
})
afterEach(() => vi.restoreAllMocks())

// ── 1. gate ──────────────────────────────────────────────────────────────────
describe('challenge: the gate on admin routes', () => {
  it('forces admin, super_admin and content_uploader to aal2 and leaves support alone', () => {
    for (const role of ['admin', 'super_admin', 'content_uploader'] as const) {
      expect(staffMfaGate(role, 'aal1', 'aal1')).toBe('enrol')
      expect(staffMfaGate(role, 'aal1', 'aal2')).toBe('challenge')
      expect(staffMfaGate(role, 'aal2', 'aal2')).toBe('ok')
    }
    expect(staffMfaGate('support', 'aal1', 'aal1')).toBe('ok')
    expect(staffMfaGate('customer', null, null)).toBe('ok')
  })
})

// ── 2. enrol + verify through the route ──────────────────────────────────────
describe('enrol: /api/auth/mfa', () => {
  it('refuses a cross-origin write before touching the session', async () => {
    const res = await mfaPOST(post({ action: 'enroll' }, 'https://evil.example'))
    expect(res.status).toBe(403)
  })

  it('enrolls and hands back the QR and secret, then verify marks it enrolled', async () => {
    const enrol = await mfaPOST(post({ action: 'enroll' }))
    expect(enrol.status).toBe(200)
    const body = (await enrol.json()) as { factorId: string; secret: string; qrSvg: string }
    expect(body.factorId).toBe('factor-new')
    expect(body.secret).toBe('JBSWY3DPEHPK3PXP')

    session.factors = [{ id: 'factor-new', factor_type: 'totp', status: 'unverified' }]
    const verify = await mfaPOST(post({ action: 'verify', factorId: 'factor-new', code: '123456' }))
    expect(verify.status).toBe(200)
    expect(await verify.json()).toEqual({ ok: true, enrolled: true })
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ event: 'totp_enabled' }))
  })

  it('refuses a malformed or wrong code', async () => {
    session.factors = [{ id: 'f', factor_type: 'totp', status: 'verified' }]
    expect((await mfaPOST(post({ action: 'verify', factorId: 'f', code: '12' }))).status).toBe(400)
    session.verifyOk = false
    expect((await mfaPOST(post({ action: 'verify', factorId: 'f', code: '123456' }))).status).toBe(
      400,
    )
  })

  it('GET reports the status, 401 when signed out is covered by the service contract', async () => {
    session.factors = [{ id: 'f', factor_type: 'totp', status: 'verified' }]
    session.levels = { currentLevel: 'aal2', nextLevel: 'aal2' }
    const res = await mfaGET(new NextRequest('https://www.kenyonexpress.co.il/api/auth/mfa'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { totp: { verified: boolean }; backupCodesRemaining: number }
    expect(body.totp.verified).toBe(true)
    expect(body.backupCodesRemaining).toBe(0)
  })
})

// ── 3. backup codes ──────────────────────────────────────────────────────────
describe('backup codes: issue and redeem', () => {
  it('refuses to issue without a verified factor, and at aal1', async () => {
    expect(await issueBackupCodes()).toEqual({
      ok: false,
      error: expect.stringContaining('אין אימות'),
    })
    session.factors = [{ id: 'f', factor_type: 'totp', status: 'verified' }]
    session.levels = { currentLevel: 'aal1', nextLevel: 'aal2' }
    const r = await issueBackupCodes()
    expect(r.ok).toBe(false)
    expect(updateUserById).not.toHaveBeenCalled()
  })

  it('issues eight codes at aal2, stores only hashes in app_metadata, and a redeem resets the factor', async () => {
    session.factors = [{ id: 'f', factor_type: 'totp', status: 'verified' }]
    session.levels = { currentLevel: 'aal2', nextLevel: 'aal2' }
    const issued = await issueBackupCodes()
    expect(issued.ok).toBe(true)
    if (!issued.ok) return
    expect(issued.codes).toHaveLength(8)
    const stored = adminUser.app_metadata.mfa_backup as { hashes: string[]; salt: string }
    expect(stored.hashes).toHaveLength(8)
    for (const code of issued.codes)
      expect(JSON.stringify(stored)).not.toContain(code.replace('-', ''))
    expect((await mfaStatus()).backupCodesRemaining).toBe(8)

    // Lost the app: back at aal1 with the factor still verified.
    session.levels = { currentLevel: 'aal1', nextLevel: 'aal2' }
    const wrong = await redeemBackupCode({ code: 'ABCDE-FGHJK' })
    expect(wrong.ok).toBe(false)
    expect(deleteFactor).not.toHaveBeenCalled()

    const right = await redeemBackupCode({ code: (issued.codes[0] as string).toLowerCase() })
    expect(right).toEqual({ ok: true, remaining: 7 })
    expect(deleteFactor).toHaveBeenCalledWith({ id: 'f', userId: 'user-1' })
    expect((adminUser.app_metadata.mfa_backup as { hashes: string[] }).hashes).toHaveLength(7)

    // The same code a second time is spent.
    const again = await redeemBackupCode({ code: issued.codes[0] as string })
    expect(again.ok).toBe(false)
  })

  it('answers the redeem through the route too', async () => {
    session.factors = [{ id: 'f', factor_type: 'totp', status: 'verified' }]
    session.levels = { currentLevel: 'aal2', nextLevel: 'aal2' }
    const issued = await mfaPOST(post({ action: 'backup_codes' }))
    expect(issued.status).toBe(200)
    const { codes } = (await issued.json()) as { codes: string[] }
    const res = await mfaPOST(post({ action: 'redeem', code: codes[3] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, remaining: 7 })
    const noCodes = await mfaPOST(post({ action: 'redeem', code: 'ZZZZZ-ZZZZZ' }))
    expect(noCodes.status).toBe(400)
  })
})
