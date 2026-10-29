import {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_S,
  openChallenge,
  sealChallenge,
} from '@/lib/auth/challenge-cookie'
import { passkeysEnabled } from '@/lib/auth/passkeys-flag'
import { relyingParty } from '@/lib/auth/webauthn-config'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Adds a passkey to the signed-in account (rc5 F15). Two steps on one route:
 * `options` issues a challenge in a signed cookie, `verify` checks the
 * browser's attestation against it and stores the credential in
 * public.webauthn_credentials (service role: the table lets a user read and
 * delete their own rows, not insert).
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
  if (!passkeysEnabled())
    return NextResponse.json({ ok: false, error: 'disabled' }, { status: 404 })
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!(await checkRateLimit(`passkey-register:${user.id}`, 20, 3600))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as {
    step?: string
    response?: unknown
    name?: unknown
  } | null
  const { rpID, rpName, origin } = relyingParty()
  const admin = createAdminClient()

  if (body?.step === 'options') {
    const { data: existing, error: existingError } = await admin
      .from('webauthn_credentials')
      .select('id, transports')
      .eq('user_id', user.id)
    // Without the list the new passkey could be registered twice on one device.
    if (existingError) {
      log.error('passkey.existing_lookup_failed', { reason: existingError.message })
      return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
    }
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email ?? user.phone ?? user.id,
      userID: isoUint8Array.fromUTF8String(user.id),
      attestationType: 'none',
      excludeCredentials: (existing ?? []).map((c) => ({
        id: c.id as string,
        transports: (c.transports ?? []) as AuthenticatorTransport[],
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    })
    const sealed = sealChallenge({ c: options.challenge, p: 'register', u: user.id })
    if (!sealed) return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 })
    const res = NextResponse.json({ ok: true, options })
    res.cookies.set(CHALLENGE_COOKIE, sealed, {
      httpOnly: true,
      sameSite: 'strict',
      secure: origin.startsWith('https'),
      maxAge: CHALLENGE_TTL_S,
      path: '/api/auth/passkey',
    })
    return res
  }

  if (body?.step !== 'verify') {
    return NextResponse.json({ ok: false, error: 'invalid_step' }, { status: 400 })
  }
  const claims = openChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, 'register')
  if (!claims || claims.u !== user.id) {
    return NextResponse.json({ ok: false, error: 'challenge_expired' }, { status: 400 })
  }

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    verification = await verifyRegistrationResponse({
      // The library validates the JSON shape itself and throws on a bad one.
      response: body.response as unknown as RegistrationResponseJSON,
      expectedChallenge: claims.c,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    })
  } catch (err) {
    log.warn('passkey.register_verify_failed', {
      reason: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ ok: false, error: 'verification_failed' }, { status: 400 })
  }
  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ ok: false, error: 'verification_failed' }, { status: 400 })
  }

  const info = verification.registrationInfo
  const name =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : null
  const { error } = await admin.from('webauthn_credentials').insert({
    id: info.credential.id,
    user_id: user.id,
    public_key: isoBase64URL.fromBuffer(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
    device_type: info.credentialDeviceType,
    backed_up: info.credentialBackedUp,
    friendly_name: name,
  })
  if (error) {
    log.error('passkey.store_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: 'store_failed' }, { status: 500 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.delete({ name: CHALLENGE_COOKIE, path: '/api/auth/passkey' })
  return res
}

export const POST = withRequestLog('/api/auth/passkey/register', handlePOST)
