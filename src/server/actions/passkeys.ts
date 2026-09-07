'use server'

import {
  PASSKEY_CHALLENGE_COOKIE,
  PASSKEY_CHALLENGE_TTL_MS,
  newChallenge,
  openChallenge,
  sealChallenge,
} from '@/lib/auth/passkeys/challenge'
import { passkeyChallengeSecret, passkeyRpConfig } from '@/lib/auth/passkeys/config'
import {
  type PasskeyRow,
  type PasskeySummary,
  isMissingPasskeyRelation,
  passkeyTable,
} from '@/lib/auth/passkeys/store'
import { safeNextPath } from '@/lib/auth/safe-next'
import { GUEST_SESSION_COOKIE, getGuestSessionId } from '@/lib/cart/guest-session'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { mergeGuestCart } from '@/server/actions/cart'
import { claimReferralOnce } from '@/server/referrals/claim'
import {
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Passkey (WebAuthn) ceremonies. Each flow is two actions: a `begin` that
 * issues challenge options (challenge sealed into an httpOnly cookie, see
 * lib/auth/passkeys/challenge.ts) and a `finish` that verifies what the
 * authenticator signed. Credentials live in `webauthn_credentials`, written
 * only here, only after verification, only with the service role: migration
 * 178 grants no INSERT or UPDATE policy on purpose.
 *
 * SESSION MINTING. Supabase has no "sign in with WebAuthn", so a verified
 * assertion becomes a session the way the docs' custom-auth path does:
 * `admin.generateLink({ type: 'magiclink' })` for the credential's owner, and
 * the returned `hashed_token` is consumed server-side by `verifyOtp` on the
 * SSR client. The link never travels and no mail is sent; what comes out is
 * an ordinary Supabase session in the ordinary cookies, with the same
 * access-token refresh and rotation every other login path gets.
 */

export type PasskeyBeginState =
  | { options: PublicKeyCredentialCreationOptionsJSON }
  | { error: string }
export type PasskeyLoginBeginState =
  | { options: PublicKeyCredentialRequestOptionsJSON }
  | { error: string }
export type PasskeyFinishState = { success: string } | { error: string } | null

const NOT_AVAILABLE = 'כניסה עם טביעת אצבע או Face ID עדיין לא זמינה, נסו דרך אחרת'
const TRY_AGAIN = 'אימות המפתח נכשל, נסו שוב'
const RATE_LIMITED = 'יותר מדי ניסיונות, נסו שוב בעוד שעה'

/** The one Hebrew sentence a failed ceremony ever shows; the reason is logged. */
function fail(event: string, reason: string, message: string = TRY_AGAIN): { error: string } {
  log.warn(event, { reason })
  return { error: message }
}

async function setChallengeCookie(sealed: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(PASSKEY_CHALLENGE_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(PASSKEY_CHALLENGE_TTL_MS / 1000),
  })
}

/** Reads AND deletes: a challenge authorises exactly one verification. */
async function takeChallengeCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(PASSKEY_CHALLENGE_COOKIE)?.value ?? null
  if (value !== null) cookieStore.delete(PASSKEY_CHALLENGE_COOKIE)
  return value
}

// ──────────────────────────────────────────────
// Registration (requires a session)
// ──────────────────────────────────────────────

async function runBeginPasskeyRegistration(): Promise<PasskeyBeginState> {
  const secret = passkeyChallengeSecret()
  if (!secret) return { error: NOT_AVAILABLE }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'יש להתחבר תחילה' }

  const ip = await getClientIp()
  const allowed = await checkRateLimit(`passkey-register:${ip}`, 10, 3600)
  if (!allowed) return { error: RATE_LIMITED }

  // Existing credentials are excluded so the browser refuses to re-enrol an
  // authenticator that is already on the account instead of storing a twin.
  const admin = createAdminClient()
  const { data: existing, error } = await admin
    .from(passkeyTable())
    .select('id, transports')
    .eq('user_id', user.id)
  if (error) {
    if (isMissingPasskeyRelation(error)) return { error: NOT_AVAILABLE }
    return fail('passkey.register_begin_failed', error.message)
  }

  const { rpID, rpName } = passkeyRpConfig()
  const challenge = newChallenge()
  const options = await generateRegistrationOptions({
    rpID,
    rpName,
    userName: user.email ?? user.phone ?? user.id,
    userID: new TextEncoder().encode(user.id),
    challenge,
    attestationType: 'none',
    excludeCredentials: (existing as Pick<PasskeyRow, 'id' | 'transports'>[]).map((row) => ({
      id: row.id,
      transports: row.transports,
    })),
    authenticatorSelection: {
      // Discoverable and verified: the login flow is usernameless, and the
      // whole point of a passkey here is that the device checks the face or
      // finger, so both are required rather than preferred.
      residentKey: 'required',
      userVerification: 'required',
    },
  })

  await setChallengeCookie(
    sealChallenge(
      {
        challenge: options.challenge,
        type: 'registration',
        userId: user.id,
        expiresAt: Date.now() + PASSKEY_CHALLENGE_TTL_MS,
      },
      secret,
    ),
  )
  return { options }
}

async function runFinishPasskeyRegistration(
  response: RegistrationResponseJSON,
  friendlyName?: string,
): Promise<PasskeyFinishState> {
  const secret = passkeyChallengeSecret()
  if (!secret) return { error: NOT_AVAILABLE }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'יש להתחבר תחילה' }

  const sealed = await takeChallengeCookie()
  const payload = sealed ? openChallenge(sealed, secret) : null
  // The challenge was bound to the session that asked for it; a mismatch means
  // this response answers a ceremony some other session started.
  if (!payload || payload.type !== 'registration' || payload.userId !== user.id) {
    return fail('passkey.register_challenge_invalid', payload ? 'user mismatch' : 'missing/expired')
  }

  const { rpID, origin } = passkeyRpConfig()
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: payload.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
  } catch (cause) {
    return fail(
      'passkey.register_verify_failed',
      cause instanceof Error ? cause.message : String(cause),
    )
  }
  if (!verification.verified) return fail('passkey.register_verify_failed', 'not verified')

  const { credential, credentialDeviceType, credentialBackedUp, aaguid } =
    verification.registrationInfo
  const name = friendlyName?.trim().slice(0, 64) || null

  const admin = createAdminClient()
  const { error } = await admin.from(passkeyTable()).insert({
    id: credential.id,
    user_id: user.id,
    public_key: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp,
    aaguid,
    friendly_name: name,
  } as never)
  if (error) {
    if (isMissingPasskeyRelation(error)) return { error: NOT_AVAILABLE }
    return fail('passkey.register_store_failed', error.message)
  }

  return { success: 'המפתח נשמר, מעכשיו אפשר להתחבר עם טביעת אצבע או Face ID' }
}

// ──────────────────────────────────────────────
// Login (public entry point)
// ──────────────────────────────────────────────

async function runBeginPasskeyLogin(): Promise<PasskeyLoginBeginState> {
  const secret = passkeyChallengeSecret()
  if (!secret) return { error: NOT_AVAILABLE }

  const ip = await getClientIp()
  const allowed = await checkRateLimit(`passkey-login:${ip}`, 30, 3600)
  if (!allowed) return { error: RATE_LIMITED }

  const { rpID } = passkeyRpConfig()
  const options = await generateAuthenticationOptions({
    rpID,
    // Usernameless: empty allowCredentials lets the browser offer whatever
    // discoverable credentials it holds for this rpID.
    allowCredentials: [],
    userVerification: 'required',
  })

  await setChallengeCookie(
    sealChallenge(
      {
        challenge: options.challenge,
        type: 'authentication',
        userId: null,
        expiresAt: Date.now() + PASSKEY_CHALLENGE_TTL_MS,
      },
      secret,
    ),
  )
  return { options }
}

async function runFinishPasskeyLogin(
  response: AuthenticationResponseJSON,
  next?: unknown,
): Promise<PasskeyFinishState> {
  const secret = passkeyChallengeSecret()
  if (!secret) return { error: NOT_AVAILABLE }

  const ip = await getClientIp()
  // Tighter than begin: each finish is a signature check plus admin calls,
  // and a real customer needs exactly one per login.
  const allowed = await checkRateLimit(`passkey-login-finish:${ip}`, 20, 3600)
  if (!allowed) return { error: RATE_LIMITED }

  const sealed = await takeChallengeCookie()
  const payload = sealed ? openChallenge(sealed, secret) : null
  if (!payload || payload.type !== 'authentication') {
    return fail('passkey.login_challenge_invalid', 'missing/expired')
  }

  if (typeof response?.id !== 'string' || response.id.length === 0) {
    return fail('passkey.login_bad_response', 'no credential id')
  }

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from(passkeyTable())
    .select('*')
    .eq('id', response.id)
    .limit(1)
  if (error) {
    if (isMissingPasskeyRelation(error)) return { error: NOT_AVAILABLE }
    return fail('passkey.login_lookup_failed', error.message)
  }
  const row = (rows as PasskeyRow[])[0]
  // Deliberately the same sentence as a failed verification: "this credential
  // is not registered" told to whoever presents it is an enumeration oracle.
  if (!row) return fail('passkey.login_unknown_credential', response.id)

  const { rpID, origin } = passkeyRpConfig()
  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: payload.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(Buffer.from(row.public_key, 'base64url')),
        counter: row.counter,
        transports: row.transports as never,
      },
    })
  } catch (cause) {
    return fail(
      'passkey.login_verify_failed',
      cause instanceof Error ? cause.message : String(cause),
    )
  }
  if (!verification.verified) return fail('passkey.login_verify_failed', 'not verified')

  // The counter moves forward before the session exists: a cloned
  // authenticator replaying an old counter must not get a session first.
  const { error: counterError } = await admin
    .from(passkeyTable())
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    } as never)
    .eq('id', row.id)
  if (counterError) return fail('passkey.login_counter_failed', counterError.message)

  // The proof of possession is done; now turn "we know who this is" into a
  // Supabase session. See the module header for why generateLink.
  const { data: found, error: userError } = await admin.auth.admin.getUserById(row.user_id)
  if (userError || !found?.user) {
    return fail('passkey.login_user_missing', userError?.message ?? row.user_id)
  }
  if (!found.user.email) {
    // A phone-only account: generateLink needs an address. Real but rare, and
    // the honest answer names the way in that does work.
    return { error: 'לחשבון הזה אין אימייל, התחברו עם קוד ב-SMS' }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: found.user.email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    return fail('passkey.login_link_failed', linkError?.message ?? 'no hashed_token')
  }

  const supabase = await createClient()
  const { data: session, error: otpError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })
  if (otpError || !session.user) {
    return fail('passkey.login_session_failed', otpError?.message ?? 'no user')
  }

  const sessionId = await getGuestSessionId()
  if (sessionId) {
    // Gated on the return value, same as every other login path: clearing the
    // cookie after a merge that did not run orphans the guest cart.
    const merged = await mergeGuestCart(supabase, session.user.id, sessionId)
    if (merged) {
      const cookieStore = await cookies()
      cookieStore.delete(GUEST_SESSION_COOKIE)
    }
  }

  // Like verifyOtp for phone, this path never reaches /auth/callback, so the
  // referral claim the callback makes has to be made here. Best-effort.
  await claimReferralOnce(session.user.id, sessionId)

  redirect(safeNextPath(typeof next === 'string' ? next : null))
}

// ──────────────────────────────────────────────
// Management (account security page)
// ──────────────────────────────────────────────

export type PasskeyListState =
  | { available: true; passkeys: PasskeySummary[] }
  | { available: false }
  | { error: string }

async function runListPasskeys(): Promise<PasskeyListState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'יש להתחבר תחילה' }

  // The caller's own client, through RLS: the SELECT-own policy in 178 is the
  // authorisation, no admin key involved in a read.
  const { data, error } = await supabase
    .from(passkeyTable())
    .select('id, friendly_name, device_type, backed_up, last_used_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingPasskeyRelation(error)) return { available: false }
    return fail('passkey.list_failed', error.message)
  }
  return { available: true, passkeys: (data ?? []) as PasskeySummary[] }
}

async function runDeletePasskey(credentialId: unknown): Promise<PasskeyFinishState> {
  if (typeof credentialId !== 'string' || credentialId.length === 0) {
    return { error: 'מפתח לא תקין' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'יש להתחבר תחילה' }

  // RLS scopes the delete to the caller's rows; the explicit eq is belt and
  // braces, and makes the intent readable here rather than only in 178.
  const { error } = await supabase
    .from(passkeyTable())
    .delete()
    .eq('id', credentialId)
    .eq('user_id', user.id)
  if (error) {
    if (isMissingPasskeyRelation(error)) return { error: NOT_AVAILABLE }
    return fail('passkey.delete_failed', error.message)
  }
  return { success: 'המפתח הוסר' }
}

export async function beginPasskeyRegistration(): Promise<PasskeyBeginState> {
  return withActionContext('passkey.register_begin', () => runBeginPasskeyRegistration())
}

export async function finishPasskeyRegistration(
  response: RegistrationResponseJSON,
  friendlyName?: string,
): Promise<PasskeyFinishState> {
  return withActionContext('passkey.register_finish', () =>
    runFinishPasskeyRegistration(response, friendlyName),
  )
}

export async function beginPasskeyLogin(): Promise<PasskeyLoginBeginState> {
  return withActionContext('passkey.login_begin', () => runBeginPasskeyLogin())
}

export async function finishPasskeyLogin(
  response: AuthenticationResponseJSON,
  next?: unknown,
): Promise<PasskeyFinishState> {
  return withActionContext('passkey.login_finish', () => runFinishPasskeyLogin(response, next))
}

export async function listPasskeys(): Promise<PasskeyListState> {
  return withActionContext('passkey.list', () => runListPasskeys())
}

export async function deletePasskey(credentialId: unknown): Promise<PasskeyFinishState> {
  return withActionContext('passkey.delete', () => runDeletePasskey(credentialId))
}
