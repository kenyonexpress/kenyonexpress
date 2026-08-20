import { describe, expect, it } from 'vitest'
import { type Actor, type AppRole, actorSatisfies } from './require-role'

function actor(over: Partial<Actor> = {}): Actor {
  return { userId: 'u1', profileRole: null, supplierIds: [], ...over }
}

const ALL: AppRole[] = ['admin', 'content_uploader', 'supplier', 'customer']

describe('actorSatisfies', () => {
  it('admits any signed-in user to the customer gate', () => {
    expect(actorSatisfies(actor(), 'customer')).toBe(true)
    expect(actorSatisfies(actor({ profileRole: 'vendor' }), 'customer')).toBe(true)
  })

  it('admits admin and super_admin to the admin gate, nobody else', () => {
    expect(actorSatisfies(actor({ profileRole: 'admin' }), 'admin')).toBe(true)
    expect(actorSatisfies(actor({ profileRole: 'super_admin' }), 'admin')).toBe(true)
    for (const role of ['customer', 'vendor', 'content_uploader', 'support'] as const) {
      expect(actorSatisfies(actor({ profileRole: role }), 'admin')).toBe(false)
    }
  })

  /**
   * The naming trap this gate exists to avoid: `content_uploader` is the LEAST
   * role that passes, not the only one. A gate an admin fails is a gate someone
   * removes.
   */
  it('lets an admin through the content_uploader gate', () => {
    expect(actorSatisfies(actor({ profileRole: 'content_uploader' }), 'content_uploader')).toBe(
      true,
    )
    expect(actorSatisfies(actor({ profileRole: 'admin' }), 'content_uploader')).toBe(true)
    expect(actorSatisfies(actor({ profileRole: 'super_admin' }), 'content_uploader')).toBe(true)
  })

  /**
   * support reads through the section matrix in @/lib/admin/permissions, which
   * is finer than any of these. It must fail every role gate rather than being
   * quietly folded into the catalog tier.
   */
  it('refuses support at every gate except customer', () => {
    for (const gate of ALL) {
      expect(actorSatisfies(actor({ profileRole: 'support' }), gate)).toBe(gate === 'customer')
    }
  })

  /**
   * ARCHITECTURE-SUPPLIER-PORTAL.md section 1: membership is the authorization
   * signal, profiles.role is a routing hint. Production holds both halves of
   * this disagreement -- a deactivated member keeps role 'vendor' -- so reading
   * the role here would re-open the portal to someone who was removed from it.
   */
  it('gates supplier on membership, never on profiles.role', () => {
    expect(actorSatisfies(actor({ profileRole: 'vendor' }), 'supplier')).toBe(false)
    expect(actorSatisfies(actor({ supplierIds: ['s1'] }), 'supplier')).toBe(true)
    expect(actorSatisfies(actor({ profileRole: 'admin' }), 'supplier')).toBe(false)
  })

  it('refuses every gate but customer to a signed-in user with nothing', () => {
    for (const gate of ALL) {
      expect(actorSatisfies(actor(), gate)).toBe(gate === 'customer')
    }
  })
})
