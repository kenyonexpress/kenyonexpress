import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The allowlist is two call sites, not one: the proxy (edge, before the
 * session is read) and the guards in rbac.ts (behind it). The proxy is not
 * unit-testable in isolation (it constructs a Supabase client from the
 * environment at module load), so this pins its source the way
 * same-origin.test.ts does for the cross-site gate, and rbac.test.ts covers
 * the guard behaviour for real.
 */

const proxy = readFileSync(resolve(process.cwd(), 'src/proxy.ts'), 'utf8')
const rbac = readFileSync(resolve(process.cwd(), 'src/lib/admin/rbac.ts'), 'utf8')

describe('src/proxy.ts wires the admin IP allowlist', () => {
  it('imports the decision and the path predicate from the one module', () => {
    expect(proxy).toMatch(
      /import \{ adminAllowlistDecision, isAdminPerimeterPath \} from '@\/lib\/admin\/ip-allowlist'/,
    )
  })

  it('decides on the edge client address and the environment variable', () => {
    expect(proxy).toContain('if (isAdminPerimeterPath(pathname)) {')
    expect(proxy).toContain('const address = edgeClientAddress(request.headers)')
    expect(proxy).toContain(
      "adminAllowlistDecision(address, process.env.ADMIN_IP_ALLOWLIST) === 'deny'",
    )
  })

  it('answers 403 with the request id, and does so before the role is read', () => {
    const perimeter = proxy.indexOf('if (isAdminPerimeterPath(pathname)) {')
    const roleGate = proxy.indexOf("if (pathname.startsWith('/admin')) {")
    const profileRead = proxy.indexOf(".from('profiles')")
    expect(perimeter).toBeGreaterThan(-1)
    expect(perimeter).toBeLessThan(roleGate)
    expect(perimeter).toBeLessThan(profileRead)
    const block = proxy.slice(perimeter, roleGate)
    expect(block).toContain('status: 403')
    expect(block).toContain('withRequestId(')
    expect(block).toContain("'cache-control': 'no-store'")
  })

  it('reads the panel roles off lib/admin/roles.ts rather than an inline list', () => {
    expect(proxy).toMatch(/import \{ isPanelRole \} from '@\/lib\/admin\/roles'/)
    expect(proxy).toContain('if (!isPanelRole(profile?.role)) {')
    expect(proxy).not.toContain("profile?.role === 'content_uploader'")
  })
})

describe('src/lib/admin/rbac.ts repeats the check behind the proxy', () => {
  it('every guard runs the perimeter, and the perimeter runs the allowlist before MFA', () => {
    const perimeter = rbac.slice(
      rbac.indexOf('async function enforceAdminPerimeter'),
      rbac.indexOf('export async function requireAdminSession'),
    )
    const allowlistAt = perimeter.indexOf('enforceAdminIpAllowlist(session)')
    const mfaAt = perimeter.indexOf('enforceAdminMfa(session)')
    expect(allowlistAt).toBeGreaterThan(-1)
    expect(mfaAt).toBeGreaterThan(allowlistAt)
    const guards = [
      'requireAdminSession',
      'requireStaffSession',
      'requireAdminPage',
      'requirePanelSession',
    ]
    for (const guard of guards) {
      const start = rbac.indexOf(`export async function ${guard}`)
      const end = rbac.indexOf('\n}\n', start)
      expect(rbac.slice(start, end), guard).toContain('await enforceAdminPerimeter(session)')
    }
    expect(rbac).not.toContain('enforceSuperAdminMfa')
  })
})
