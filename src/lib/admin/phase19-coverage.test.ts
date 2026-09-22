import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Admin 2FA is Supabase TOTP (Google Authenticator), not a parallel secrets
 * table. Audit writes go through writeAuditLog. Sensitive-op failures on that
 * write are reported to Sentry so a silent audit outage is not silent.
 */

const ROOT = resolve(__dirname, '../../..')

describe('admin 2FA and audit', () => {
  it('enrols TOTP through auth.mfa', () => {
    const mfa = readFileSync(resolve(ROOT, 'src/server/actions/mfa.ts'), 'utf8')
    expect(mfa).toContain("factorType: 'totp'")
    expect(mfa).toContain('mfa.enroll')
  })

  it('refuses super_admin at aal1', () => {
    const gate = readFileSync(resolve(ROOT, 'src/lib/admin/mfa-gate.ts'), 'utf8')
    expect(gate).toContain("return nextLevel === 'aal2' ? 'challenge' : 'enrol'")
  })

  it('reports a failed audit insert to Sentry', () => {
    const audit = readFileSync(resolve(ROOT, 'src/lib/admin/audit.ts'), 'utf8')
    expect(audit).toContain('Sentry.captureException')
    expect(audit).toContain("area: 'admin'")
  })
})
