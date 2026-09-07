import { superAdminMfaGate } from '@/lib/admin/mfa-gate'
import type { AppRole } from '@/lib/admin/roles'
import { describe, expect, it } from 'vitest'

describe('superAdminMfaGate', () => {
  it.each<AppRole>(['customer', 'vendor', 'content_uploader', 'support', 'read_only', 'admin'])(
    'never gates %s, whatever the session proved',
    (role) => {
      expect(superAdminMfaGate(role, null, null)).toBe('ok')
      expect(superAdminMfaGate(role, 'aal1', 'aal1')).toBe('ok')
      expect(superAdminMfaGate(role, 'aal1', 'aal2')).toBe('ok')
    },
  )

  it('passes a super_admin whose session already proved aal2', () => {
    expect(superAdminMfaGate('super_admin', 'aal2', 'aal2')).toBe('ok')
  })

  it('sends a super_admin with a verified factor but an aal1 session to the challenge', () => {
    expect(superAdminMfaGate('super_admin', 'aal1', 'aal2')).toBe('challenge')
  })

  it('sends a super_admin with no verified factor to enrolment', () => {
    expect(superAdminMfaGate('super_admin', 'aal1', 'aal1')).toBe('enrol')
  })

  it('fails closed when the levels are unknown', () => {
    // A failed getAuthenticatorAssuranceLevel call must not wave the one
    // gated role through.
    expect(superAdminMfaGate('super_admin', null, null)).toBe('enrol')
  })
})
