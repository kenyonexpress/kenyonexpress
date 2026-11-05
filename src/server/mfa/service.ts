import {
  type BackupCodeStore,
  generateBackupCodes as issueCodes,
  parseBackupCodeStore,
  redeemFromStore,
} from '@/lib/auth/backup-codes'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { trySendSecurityAlert } from '@/server/auth/security-alert-send'

/**
 * The staff MFA ceremonies as plain results, shared by the server actions in
 * `server/actions/mfa.ts` (which redirect) and `/api/auth/mfa` (which answers
 * JSON). One implementation, two transports; G6, 05.11.2026.
 *
 * Every function reads the caller from the cookie session. Nothing here takes
 * a user id as input: a backup-code reset for "some user" is exactly the
 * primitive an attacker would want.
 */

export const MFA_ERRORS = {
  NOT_SIGNED_IN: 'צריך להתחבר כדי להגדיר אימות דו-שלבי',
  RATE_LIMITED: 'יותר מדי ניסיונות, נסו שוב בעוד שעה',
  ENROL_FAILED: 'הגדרת האימות הדו-שלבי נכשלה, נסו שוב',
  BAD_CODE: 'הקוד שגוי או שפג תוקפו, נסו שוב',
  NEEDS_AAL2: 'כדי להנפיק קודי גיבוי צריך לאמת קודם עם אפליקציית האימות',
  NO_FACTOR: 'אין אימות דו-שלבי פעיל בחשבון הזה',
  BAD_BACKUP_CODE: 'קוד הגיבוי שגוי או שכבר נוצל',
  NO_BACKUP_CODES: 'לא הונפקו קודי גיבוי לחשבון הזה',
} as const

type Fail = { ok: false; error: string }

async function currentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export type MfaStatus = {
  signedIn: boolean
  totp: { verified: boolean; factorId: string | null }
  currentLevel: string | null
  nextLevel: string | null
  backupCodesRemaining: number
  backupCodesIssuedAt: string | null
}

export async function mfaStatus(): Promise<MfaStatus> {
  const { supabase, user } = await currentUser()
  if (!user) {
    return {
      signedIn: false,
      totp: { verified: false, factorId: null },
      currentLevel: null,
      nextLevel: null,
      backupCodesRemaining: 0,
      backupCodesIssuedAt: null,
    }
  }
  const [{ data: factors }, { data: levels }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  const verified = (factors?.totp ?? []).find((f) => f.status === 'verified') ?? null
  const store = parseBackupCodeStore(
    (user.app_metadata as Record<string, unknown> | undefined)?.mfa_backup,
  )
  return {
    signedIn: true,
    totp: { verified: verified !== null, factorId: verified?.id ?? null },
    currentLevel: levels?.currentLevel ?? null,
    nextLevel: levels?.nextLevel ?? null,
    backupCodesRemaining: store?.hashes.length ?? 0,
    backupCodesIssuedAt: store?.issued_at || null,
  }
}

export type EnrolResult = { ok: true; factorId: string; qrSvg: string; secret: string } | Fail

/**
 * Creates an unverified TOTP factor and hands back what the authenticator app
 * needs. Abandoned factors from earlier attempts are removed first: Supabase
 * keeps every enroll() as a row, and a pile of unverified factors turns
 * listFactors into noise.
 */
export async function enrolTotp(): Promise<EnrolResult> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: MFA_ERRORS.NOT_SIGNED_IN }

  const allowed = await checkRateLimit(`mfa-enrol:${user.id}`, 10, 3600)
  if (!allowed) return { ok: false, error: MFA_ERRORS.RATE_LIMITED }

  const { data: factors } = await supabase.auth.mfa.listFactors()
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'KenyonExpress admin',
  })
  if (error || !data) {
    log.warn('mfa.enrol_failed', { reason: error?.message ?? 'no data' })
    return { ok: false, error: MFA_ERRORS.ENROL_FAILED }
  }
  return { ok: true, factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret }
}

export type VerifyResult = { ok: true; enrolled: boolean } | Fail

/**
 * Verifies a 6-digit code against a factor: the enrolment finish (factor was
 * unverified) and the login challenge (factor verified, session still aal1)
 * are the same ceremony to GoTrue. Success upgrades the session cookie to aal2.
 */
export async function verifyTotp(input: { factorId: string; code: string }): Promise<VerifyResult> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: MFA_ERRORS.NOT_SIGNED_IN }

  // TOTP has a million-code space; without a limit, six digits are brute
  // forceable inside a window. Keyed by user AND ip so a distributed guesser
  // still hits the per-account bound.
  const ip = await getClientIp()
  const [userAllowed, ipAllowed] = await Promise.all([
    checkRateLimit(`mfa-verify:${user.id}`, 10, 900),
    checkRateLimit(`mfa-verify-ip:${ip}`, 30, 900),
  ])
  if (!userAllowed || !ipAllowed) return { ok: false, error: MFA_ERRORS.RATE_LIMITED }

  const code = input.code.trim()
  const factorId = input.factorId
  if (!/^\d{6}$/.test(code) || !factorId) return { ok: false, error: MFA_ERRORS.BAD_CODE }

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const enrolling = (factors?.all ?? []).some(
    (factor) => factor.id === factorId && factor.status === 'unverified',
  )

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId,
  })
  if (challengeError || !challenge) {
    log.warn('mfa.challenge_failed', { reason: challengeError?.message ?? 'no data' })
    return { ok: false, error: MFA_ERRORS.BAD_CODE }
  }
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  })
  if (verifyError) {
    log.warn('mfa.verify_failed', { reason: verifyError.message })
    return { ok: false, error: MFA_ERRORS.BAD_CODE }
  }
  if (enrolling) {
    await trySendSecurityAlert({ email: user.email, event: 'totp_enabled', userId: user.id })
  }
  return { ok: true, enrolled: enrolling }
}

async function readStore(userId: string): Promise<{
  store: BackupCodeStore | null
  appMetadata: Record<string, unknown>
}> {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data.user) throw new Error(error?.message ?? 'user not found')
  const appMetadata = (data.user.app_metadata ?? {}) as Record<string, unknown>
  return { store: parseBackupCodeStore(appMetadata.mfa_backup), appMetadata }
}

async function writeStore(
  userId: string,
  appMetadata: Record<string, unknown>,
  store: BackupCodeStore,
): Promise<void> {
  const admin = createAdminClient()
  // The whole object is sent back: GoTrue merges app_metadata shallowly, and
  // sending only the new key would be fine today and wrong the day the merge
  // semantics change. Explicit beats relying on it.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...appMetadata, mfa_backup: store },
  })
  if (error) throw new Error(error.message)
}

export type BackupCodesResult = { ok: true; codes: string[]; issuedAt: string } | Fail

/**
 * Issues a fresh set of eight codes, replacing any earlier set. Requires an
 * aal2 session with a verified factor: codes are a recovery for a factor, so
 * an account without one has nothing to recover, and a session that has not
 * proven the factor must not be able to mint a bypass for it.
 */
export async function issueBackupCodes(): Promise<BackupCodesResult> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: MFA_ERRORS.NOT_SIGNED_IN }
  const [{ data: factors }, { data: levels }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  const hasVerified = (factors?.totp ?? []).some((f) => f.status === 'verified')
  if (!hasVerified) return { ok: false, error: MFA_ERRORS.NO_FACTOR }
  if (levels?.currentLevel !== 'aal2') return { ok: false, error: MFA_ERRORS.NEEDS_AAL2 }

  const allowed = await checkRateLimit(`mfa-backup-issue:${user.id}`, 5, 3600)
  if (!allowed) return { ok: false, error: MFA_ERRORS.RATE_LIMITED }

  const { codes, store } = issueCodes()
  const { appMetadata } = await readStore(user.id)
  await writeStore(user.id, appMetadata, store)
  log.info('mfa.backup_codes_issued', { user_id: user.id, count: codes.length })
  return { ok: true, codes, issuedAt: store.issued_at }
}

export type RedeemResult = { ok: true; remaining: number } | Fail

/**
 * The recovery: a valid unused code removes EVERY TOTP factor on the account,
 * so the next admin guard sends the person to enrol a fresh one. The session
 * stays aal1 throughout; nothing here signs anyone in.
 */
export async function redeemBackupCode(input: { code: string }): Promise<RedeemResult> {
  const { supabase, user } = await currentUser()
  if (!user) return { ok: false, error: MFA_ERRORS.NOT_SIGNED_IN }

  const ip = await getClientIp()
  const [userAllowed, ipAllowed] = await Promise.all([
    checkRateLimit(`mfa-backup-redeem:${user.id}`, 5, 900),
    checkRateLimit(`mfa-backup-redeem-ip:${ip}`, 15, 900),
  ])
  if (!userAllowed || !ipAllowed) return { ok: false, error: MFA_ERRORS.RATE_LIMITED }

  const { store, appMetadata } = await readStore(user.id)
  const result = redeemFromStore(store, input.code)
  if (!result.ok) {
    log.warn('mfa.backup_code_refused', { user_id: user.id, reason: result.reason })
    return {
      ok: false,
      error: result.reason === 'no_codes' ? MFA_ERRORS.NO_BACKUP_CODES : MFA_ERRORS.BAD_BACKUP_CODE,
    }
  }
  // Consume first, then remove the factors: a crash between the two leaves a
  // spent code and a still-enrolled factor, which is the safe side.
  await writeStore(user.id, appMetadata, result.store)

  const admin = createAdminClient()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type !== 'totp') continue
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id })
    if (error) log.error('mfa.backup_reset_delete_factor_failed', { reason: error.message })
  }
  log.warn('mfa.totp_reset_by_backup_code', { user_id: user.id, remaining: result.remaining })
  // The existing alert copy says a factor was enrolled; the reset that
  // precedes a re-enrolment is the same security event from the reader's
  // chair ("someone changed the second factor on your account").
  await trySendSecurityAlert({ email: user.email, event: 'totp_enabled', userId: user.id })
  return { ok: true, remaining: result.remaining }
}
