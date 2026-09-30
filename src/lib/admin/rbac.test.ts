import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The four guards and the section gate. The policy tables (roles.ts,
 * permissions.ts, mfa-gate.ts, ip-allowlist.ts) have their own tests; what
 * only fails here is the plumbing: which redirect each guard issues for each
 * role, that the admin tier without aal2 is sent to the MFA page before any
 * page renders (super_admin since 181, admin since STEP 19), and that a
 * configured IP allowlist is met behind the proxy as well as in it.
 */

type Result = { data: unknown; error: unknown }

const state = {
  user: null as { id: string } | null,
  profile: null as Result | null,
  aal: { currentLevel: null as string | null, nextLevel: null as string | null },
  headers: new Headers(),
}

const selectCalls: { table: string; column: string; eq: [string, unknown] }[] = []

const requestClient = {
  auth: {
    getUser: async () => ({ data: { user: state.user }, error: null }),
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({ data: state.aal, error: null }),
    },
  },
  from: (table: string) => ({
    select: (column: string) => ({
      eq: (col: string, value: unknown) => ({
        single: async () => {
          selectCalls.push({ table, column, eq: [col, value] })
          return state.profile ?? { data: null, error: null }
        },
      }),
    }),
  }),
}

class RedirectSignal extends Error {
  constructor(readonly to: string) {
    super(`NEXT_REDIRECT ${to}`)
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => requestClient }))
const isTrustedDevice = vi.fn(async (_userId: string) => false)
vi.mock('@/server/auth/trusted-device', () => ({
  isTrustedDevice: (userId: string) => isTrustedDevice(userId),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to)
  },
}))
vi.mock('next/headers', () => ({ headers: async () => state.headers }))
const warn = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: (...args: unknown[]) => warn(...args),
    error: vi.fn(),
  },
}))

const {
  ROLE_ORDER,
  getSessionWithRole,
  isAdminRole,
  requireAdminPage,
  requireAdminSession,
  requirePanelSession,
  requireSection,
  requireStaffSession,
} = await import('./rbac')

const USER = '11111111-1111-4111-8111-111111111111'

/**
 * Signs in with the role, at aal2 by default so the admin tier passes the MFA
 * gate and the test can look at what the guard does next. `verified: false`
 * is a password-only session with no factor enrolled.
 */
function signedInAs(role: string, verified = true) {
  state.user = { id: USER }
  state.profile = { data: { role }, error: null }
  state.aal = verified
    ? { currentLevel: 'aal2', nextLevel: 'aal2' }
    : { currentLevel: 'aal1', nextLevel: 'aal1' }
}

async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    if (error instanceof RedirectSignal) return error.to
    throw error
  }
}

beforeEach(() => {
  state.user = null
  state.profile = null
  state.aal = { currentLevel: null, nextLevel: null }
  state.headers = new Headers()
  selectCalls.length = 0
  warn.mockClear()
})

// vi.stubEnv rather than assignment: `process.env.X = undefined` stores the
// string "undefined", which the allowlist would read as a configured list.
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getSessionWithRole', () => {
  it('is null with no signed-in user, and reads no profile', async () => {
    expect(await getSessionWithRole()).toBeNull()
    expect(selectCalls).toEqual([])
  })

  it('is null when the user has no profile row', async () => {
    state.user = { id: USER }
    state.profile = { data: null, error: { code: 'PGRST116' } }
    expect(await getSessionWithRole()).toBeNull()
  })

  it('reads the role off the profile keyed by the auth user id', async () => {
    signedInAs('support')
    expect(await getSessionWithRole()).toEqual({ userId: USER, role: 'support' })
    expect(selectCalls).toEqual([{ table: 'profiles', column: 'role', eq: ['id', USER] }])
  })
})

describe('requireAdminSession', () => {
  it('sends anonymous, customers and staff who are not admins to /login', async () => {
    expect(await redirectOf(requireAdminSession)).toBe('/login')
    for (const role of ['customer', 'vendor', 'content_uploader', 'support', 'read_only']) {
      signedInAs(role)
      expect(await redirectOf(requireAdminSession), role).toBe('/login')
    }
  })

  it.each(['admin', 'super_admin'])(
    'sends a %s with no factor to enrol, and one with a factor to challenge',
    async (role) => {
      signedInAs(role, false)
      expect(await redirectOf(requireAdminSession)).toBe('/admin-mfa?mode=enrol')

      state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
      expect(await redirectOf(requireAdminSession)).toBe('/admin-mfa?mode=challenge')

      // A remembered device (STEP 18) stands in for the challenge only, and is
      // asked about with this user's id.
      isTrustedDevice.mockResolvedValueOnce(true)
      state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
      expect(await requireAdminSession()).toEqual({ userId: USER, role })
      expect(isTrustedDevice).toHaveBeenCalledWith(USER)
      isTrustedDevice.mockResolvedValue(true)
      state.aal = { currentLevel: 'aal1', nextLevel: 'aal1' }
      expect(await redirectOf(requireAdminSession)).toBe('/admin-mfa?mode=enrol')
      isTrustedDevice.mockResolvedValue(false)

      // An unrecognised level reads as no level: closed, not open.
      state.aal = { currentLevel: 'aal9', nextLevel: 'aal9' }
      expect(await redirectOf(requireAdminSession)).toBe('/admin-mfa?mode=enrol')
    },
  )

  it.each(['admin', 'super_admin'])('lets a %s through at aal2', async (role) => {
    signedInAs(role)
    expect(await requireAdminSession()).toEqual({ userId: USER, role })
  })
})

describe('requireStaffSession', () => {
  it('admits catalogue writers only', async () => {
    signedInAs('content_uploader')
    expect(await requireStaffSession()).toEqual({ userId: USER, role: 'content_uploader' })
    signedInAs('admin')
    expect(await requireStaffSession()).toMatchObject({ role: 'admin' })
    for (const role of ['support', 'read_only', 'customer']) {
      signedInAs(role)
      expect(await redirectOf(requireStaffSession), role).toBe('/login')
    }
    state.user = null
    expect(await redirectOf(requireStaffSession)).toBe('/login')
  })

  it('still gates the admin tier on MFA, and a content_uploader never', async () => {
    signedInAs('super_admin', false)
    expect(await redirectOf(requireStaffSession)).toBe('/admin-mfa?mode=enrol')
    signedInAs('admin', false)
    expect(await redirectOf(requireStaffSession)).toBe('/admin-mfa?mode=enrol')
    signedInAs('content_uploader', false)
    expect(await requireStaffSession()).toMatchObject({ role: 'content_uploader' })
  })
})

describe('requireAdminPage', () => {
  it('bounces non-staff to /login and staff who are not admins into the catalogue', async () => {
    expect(await redirectOf(requireAdminPage)).toBe('/login')
    signedInAs('support')
    expect(await redirectOf(requireAdminPage)).toBe('/login')
    signedInAs('content_uploader')
    expect(await redirectOf(requireAdminPage)).toBe('/admin/products')
  })

  it('admits admins, with the MFA gate for the whole tier', async () => {
    signedInAs('admin')
    expect(await requireAdminPage()).toMatchObject({ role: 'admin' })
    signedInAs('super_admin')
    expect(await requireAdminPage()).toMatchObject({ role: 'super_admin' })
    state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
    expect(await redirectOf(requireAdminPage)).toBe('/admin-mfa?mode=challenge')
    signedInAs('admin')
    state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
    expect(await redirectOf(requireAdminPage)).toBe('/admin-mfa?mode=challenge')
  })
})

describe('requirePanelSession', () => {
  it('admits every panel role and refuses customers, vendors and anonymous', async () => {
    for (const role of ['content_uploader', 'support', 'read_only', 'admin']) {
      signedInAs(role)
      expect(await requirePanelSession(), role).toEqual({ userId: USER, role })
    }
    for (const role of ['customer', 'vendor']) {
      signedInAs(role)
      expect(await redirectOf(requirePanelSession), role).toBe('/login')
    }
    state.user = null
    expect(await redirectOf(requirePanelSession)).toBe('/login')
  })

  it('gates the admin tier on MFA and the roles below it never', async () => {
    signedInAs('super_admin', false)
    expect(await redirectOf(requirePanelSession)).toBe('/admin-mfa?mode=enrol')
    signedInAs('admin', false)
    expect(await redirectOf(requirePanelSession)).toBe('/admin-mfa?mode=enrol')
    for (const role of ['content_uploader', 'support', 'read_only']) {
      signedInAs(role, false)
      expect(await requirePanelSession(), role).toEqual({ userId: USER, role })
    }
  })
})

describe('requireSection', () => {
  it('reads default to read access and bounce into the panel root, not /login', async () => {
    signedInAs('support')
    expect(await requireSection('orders')).toMatchObject({ role: 'support' })
    expect(await redirectOf(() => requireSection('payments'))).toBe('/admin')
  })

  it('write access is checked separately from read', async () => {
    signedInAs('support')
    expect(await redirectOf(() => requireSection('orders', 'write'))).toBe('/admin')
    signedInAs('content_uploader')
    expect(await requireSection('catalog', 'write')).toMatchObject({ role: 'content_uploader' })
    signedInAs('read_only')
    expect(await requireSection('payments', 'read')).toMatchObject({ role: 'read_only' })
    expect(await redirectOf(() => requireSection('payments', 'write'))).toBe('/admin')
  })

  it('still sends a non-panel role to /login first', async () => {
    signedInAs('customer')
    expect(await redirectOf(() => requireSection('dashboard'))).toBe('/login')
  })
})

describe('IP allowlist (STEP 19, guard layer)', () => {
  it('is inert while ADMIN_IP_ALLOWLIST is unset, even with no client address', async () => {
    signedInAs('admin')
    expect(await requireAdminSession()).toMatchObject({ role: 'admin' })
    expect(warn).not.toHaveBeenCalled()
  })

  it('admits a listed address on every guard', async () => {
    vi.stubEnv('ADMIN_IP_ALLOWLIST', '203.0.113.0/24, 2001:db8::/32')
    state.headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
    signedInAs('admin')
    expect(await requireAdminSession()).toMatchObject({ role: 'admin' })
    expect(await requireStaffSession()).toMatchObject({ role: 'admin' })
    expect(await requireAdminPage()).toMatchObject({ role: 'admin' })
    expect(await requirePanelSession()).toMatchObject({ role: 'admin' })
    expect(await requireSection('orders')).toMatchObject({ role: 'admin' })
    state.headers = new Headers({ 'x-forwarded-for': '2001:db8:1::9' })
    signedInAs('support')
    expect(await requirePanelSession()).toMatchObject({ role: 'support' })
    expect(warn).not.toHaveBeenCalled()
  })

  it('sends an unlisted address to the storefront, whatever the role, and says so', async () => {
    vi.stubEnv('ADMIN_IP_ALLOWLIST', '203.0.113.0/24')
    state.headers = new Headers({ 'x-forwarded-for': '198.51.100.4' })
    for (const role of ['admin', 'super_admin', 'content_uploader', 'support', 'read_only']) {
      signedInAs(role)
      expect(await redirectOf(requirePanelSession), role).toBe('/')
    }
    expect(warn).toHaveBeenCalledWith(
      'admin.ip_allowlist_denied',
      expect.objectContaining({ userId: USER, ip: '198.51.100.4', layer: 'guard' }),
    )
  })

  it('fails closed with no client address and on a list that parses to nothing', async () => {
    vi.stubEnv('ADMIN_IP_ALLOWLIST', '203.0.113.0/24')
    signedInAs('admin')
    expect(await redirectOf(requireAdminSession)).toBe('/')

    vi.stubEnv('ADMIN_IP_ALLOWLIST', 'office')
    state.headers = new Headers({ 'x-forwarded-for': '203.0.113.7' })
    expect(await redirectOf(requireAdminSession)).toBe('/')
  })

  it('runs before the MFA gate: a denied address never reaches the MFA page', async () => {
    vi.stubEnv('ADMIN_IP_ALLOWLIST', '203.0.113.0/24')
    state.headers = new Headers({ 'x-forwarded-for': '198.51.100.4' })
    signedInAs('admin', false)
    expect(await redirectOf(requireAdminSession)).toBe('/')
  })

  it('does not apply to the non-redirecting session read', async () => {
    vi.stubEnv('ADMIN_IP_ALLOWLIST', '203.0.113.0/24')
    signedInAs('admin')
    expect(await getSessionWithRole()).toEqual({ userId: USER, role: 'admin' })
  })
})

describe('re-exports', () => {
  it('exposes the role helpers so callers need one import', () => {
    expect(isAdminRole('admin')).toBe(true)
    expect(isAdminRole('support')).toBe(false)
    expect(ROLE_ORDER).toContain('super_admin')
  })
})
