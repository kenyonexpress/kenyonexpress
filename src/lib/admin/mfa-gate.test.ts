import { adminMfaGate, isMfaRequiredRole } from '@/lib/admin/mfa-gate'
import type { UserRole } from '@/lib/admin/roles'
import { describe, expect, it } from 'vitest'

describe('adminMfaGate', () => {
  it.each<UserRole>(['customer', 'vendor', 'content_uploader', 'support', 'read_only'])(
    'never gates %s, whatever the session proved',
    (role) => {
      expect(adminMfaGate(role, null, null)).toBe('ok')
      expect(adminMfaGate(role, 'aal1', 'aal1')).toBe('ok')
      expect(adminMfaGate(role, 'aal1', 'aal2')).toBe('ok')
      expect(isMfaRequiredRole(role)).toBe(false)
    },
  )

  describe.each<UserRole>(['admin', 'super_admin'])(
    '%s (STEP 19: the whole admin tier)',
    (role) => {
      it('is a gated role', () => {
        expect(isMfaRequiredRole(role)).toBe(true)
      })

      it('passes a session that already proved aal2', () => {
        expect(adminMfaGate(role, 'aal2', 'aal2')).toBe('ok')
      })

      it('sends a verified factor with an aal1 session to the challenge', () => {
        expect(adminMfaGate(role, 'aal1', 'aal2')).toBe('challenge')
      })

      it('sends an account with no verified factor to enrolment', () => {
        expect(adminMfaGate(role, 'aal1', 'aal1')).toBe('enrol')
      })

      it('fails closed when the levels are unknown', () => {
        // A failed getAuthenticatorAssuranceLevel call must not wave a gated
        // role through.
        expect(adminMfaGate(role, null, null)).toBe('enrol')
      })
    },
  )
})
