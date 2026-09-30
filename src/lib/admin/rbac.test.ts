import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The four guards and the section gate. The policy tables (roles.ts,
 * permissions.ts, mfa-gate.ts) have their own tests; what only fails here is
 * the plumbing: which redirect each guard issues for each role, and that a
 * super_admin without aal2 is sent to the MFA page before any page renders.
 */

type Result = { data: unknown; error: unknown }

const state = {
  user: null as { id: string } | null,
  profile: null as Result | null,
  aal: { currentLevel: null as string | null, nextLevel: null as string | null },
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

function signedInAs(role: string) {
  state.user = { id: USER }
  state.profile = { data: { role }, error: null }
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
  selectCalls.length = 0
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

  it('returns the session for an admin without asking about MFA', async () => {
    signedInAs('admin')
    expect(await requireAdminSession()).toEqual({ userId: USER, role: 'admin' })
  })

  it('sends a super_admin with no factor to enrol, and one with a factor to challenge', async () => {
    signedInAs('super_admin')
    state.aal = { currentLevel: 'aal1', nextLevel: 'aal1' }
    expect(await redirectOf(requireAdminSession)).toBe('/admin-mfa?mode=enrol')

    state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
    expect(await redirectOf(requireAdminSession)).toBe('/admin-mfa?mode=challenge')

    // A remembered device (STEP 18) stands in for the challenge only, and is
    // asked about with this user's id.
    isTrustedDevice.mockResolvedValueOnce(true)
    state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
    expect(await requireAdminSession()).toEqual({ userId: USER, role: 'super_admin' })
    expect(isTrustedDevice).toHaveBeenCalledWith(USER)
    isTrustedDevice.mockResolvedValue(true)
    state.aal = { currentLevel: 'aal1', nextLevel: 'aal1' }
    expect(await redirectOf(requireAdminSession)).toBe('/admin-mfa?mode=enrol')
    isTrustedDevice.mockResolvedValue(false)

    // An unrecognised level reads as no level: closed, not open.
    state.aal = { currentLevel: 'aal9', nextLevel: 'aal9' }
    expect(await redirectOf(requireAdminSession)).toBe('/admin-mfa?mode=enrol')
  })

  it('lets a super_admin through at aal2', async () => {
    signedInAs('super_admin')
    state.aal = { currentLevel: 'aal2', nextLevel: 'aal2' }
    expect(await requireAdminSession()).toEqual({ userId: USER, role: 'super_admin' })
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

  it('still gates a super_admin on MFA', async () => {
    signedInAs('super_admin')
    expect(await redirectOf(requireStaffSession)).toBe('/admin-mfa?mode=enrol')
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

  it('admits admins, with the MFA gate for super_admin', async () => {
    signedInAs('admin')
    expect(await requireAdminPage()).toMatchObject({ role: 'admin' })
    signedInAs('super_admin')
    state.aal = { currentLevel: 'aal2', nextLevel: 'aal2' }
    expect(await requireAdminPage()).toMatchObject({ role: 'super_admin' })
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

  it('gates a super_admin on MFA', async () => {
    signedInAs('super_admin')
    expect(await redirectOf(requirePanelSession)).toBe('/admin-mfa?mode=enrol')
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

describe('re-exports', () => {
  it('exposes the role helpers so callers need one import', () => {
    expect(isAdminRole('admin')).toBe(true)
    expect(isAdminRole('support')).toBe(false)
    expect(ROLE_ORDER).toContain('super_admin')
  })
})
