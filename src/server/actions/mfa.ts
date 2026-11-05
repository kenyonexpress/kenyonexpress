'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'
import {
  enrolTotp,
  issueBackupCodes,
  redeemBackupCode as redeemBackupCodeService,
  verifyTotp,
} from '@/server/mfa/service'
import { redirect } from 'next/navigation'

/**
 * Staff MFA as React server actions: the thin, redirecting transport over
 * `server/mfa/service.ts`. The policy (which roles are forced) lives in
 * lib/admin/mfa-gate.ts, enforced by lib/admin/rbac.ts (enforceStaffMfa) and
 * by the proxy on /admin paths.
 */

export type MfaEnrolState =
  | { factorId: string; qrSvg: string; secret: string }
  | { error: string }
  | null

export type MfaVerifyState = { error: string } | null

const NOT_SIGNED_IN = 'צריך להתחבר כדי להגדיר אימות דו-שלבי'

/**
 * The session check, stated in this file. The service re-reads the user on
 * every call (it never takes a user id as input), so this is not what keeps
 * the ceremonies safe; it is what makes the guard visible at the action
 * boundary, which `auth-coverage.test.ts` audits file by file, and it turns
 * an anonymous call into a refusal before any work starts.
 */
async function requireUser(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { id: user.id } : null
}

export async function startTotpEnrolment(): Promise<MfaEnrolState> {
  return withActionContext('mfa.enrol_start', async () => {
    if (!(await requireUser())) return { error: NOT_SIGNED_IN }
    const result = await enrolTotp()
    return result.ok
      ? { factorId: result.factorId, qrSvg: result.qrSvg, secret: result.secret }
      : { error: result.error }
  })
}

/** The enrolment finish and the login challenge: success lands in the panel. */
export async function verifyTotpCode(
  _prev: MfaVerifyState,
  formData: FormData,
): Promise<MfaVerifyState> {
  if (!(await requireUser())) return { error: NOT_SIGNED_IN }
  const outcome = await withActionContext('mfa.verify', () =>
    verifyTotp({
      factorId: String(formData.get('factor_id') ?? ''),
      code: String(formData.get('code') ?? ''),
    }),
  )
  if (!outcome.ok) return { error: outcome.error }
  redirect(String(formData.get('next') ?? '') || '/admin')
}

export type BackupCodesState = { codes: string[]; issuedAt: string } | { error: string } | null

/** Eight fresh one-time codes, shown once. Needs an aal2 session. */
export async function generateBackupCodes(): Promise<BackupCodesState> {
  return withActionContext('mfa.backup_codes_issue', async () => {
    if (!(await requireUser())) return { error: NOT_SIGNED_IN }
    const result = await issueBackupCodes()
    return result.ok ? { codes: result.codes, issuedAt: result.issuedAt } : { error: result.error }
  })
}

export type RedeemBackupState = { error: string } | null

/**
 * Lost authenticator: a valid code resets the factor and lands on the
 * enrolment ceremony. The session stays aal1; the gate does the rest.
 */
export async function redeemBackupCode(
  _prev: RedeemBackupState,
  formData: FormData,
): Promise<RedeemBackupState> {
  if (!(await requireUser())) return { error: NOT_SIGNED_IN }
  const outcome = await withActionContext('mfa.backup_code_redeem', () =>
    redeemBackupCodeService({ code: String(formData.get('backup_code') ?? '') }),
  )
  if (!outcome.ok) return { error: outcome.error }
  redirect('/admin-mfa?mode=enrol&reset=1')
}
