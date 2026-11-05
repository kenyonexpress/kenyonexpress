import {
  MFA_FORCED_ROLES,
  isMfaForcedRole,
  staffMfaGate,
  superAdminMfaGate,
} from '@/lib/admin/mfa-gate'
import type { AppRole } from '@/lib/admin/roles'
import { describe, expect, it } from 'vitest'

describe('staffMfaGate', () => {
  it.each<AppRole>(['customer', 'vendor', 'support', 'read_only'])(
    'never gates %s, whatever the session proved',
    (role) => {
      expect(staffMfaGate(role, null, null)).toBe('ok')
      expect(staffMfaGate(role, 'aal1', 'aal1')).toBe('ok')
      expect(staffMfaGate(role, 'aal1', 'aal2')).toBe('ok')
    },
  )

  it.each<AppRole>(['super_admin', 'admin', 'content_uploader'])(
    'passes %s only once the session proved aal2',
    (role) => {
      expect(staffMfaGate(role, 'aal2', 'aal2')).toBe('ok')
    },
  )

  it.each<AppRole>(['super_admin', 'admin', 'content_uploader'])(
    'sends %s with a verified factor but an aal1 session to the challenge',
    (role) => {
      expect(staffMfaGate(role, 'aal1', 'aal2')).toBe('challenge')
    },
  )

  it.each<AppRole>(['super_admin', 'admin', 'content_uploader'])(
    'sends %s with no verified factor to enrolment',
    (role) => {
      expect(staffMfaGate(role, 'aal1', 'aal1')).toBe('enrol')
      expect(staffMfaGate(role, 'aal1', null)).toBe('enrol')
    },
  )

  it('fails closed when the levels are unknown', () => {
    expect(staffMfaGate('admin', null, null)).toBe('enrol')
    expect(staffMfaGate('super_admin', null, 'aal2')).toBe('challenge')
  })

  it('names exactly the three forced roles', () => {
    expect([...MFA_FORCED_ROLES].sort()).toEqual(['admin', 'content_uploader', 'super_admin'])
    expect(isMfaForcedRole('support')).toBe(false)
    expect(isMfaForcedRole(null)).toBe(false)
  })

  it('keeps the old name as the same function', () => {
    expect(superAdminMfaGate).toBe(staffMfaGate)
  })
})
