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
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { mintSessionFor } from '@/server/auth/mint-session'
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Signs in with a passkey (rc5 F15). `options` issues a discoverable-credential
 * challenge in a signed cookie; `verify` finds the credential the browser
 * used, checks the assertion and the signature counter, and signs that
 * credential's owner in on this response.
 */
async function handlePOST(request: NextRequest): Promise<NextResponse> {
  if (!passkeysEnabled())
    return NextResponse.json({ ok: false, error: 'disabled' }, { status: 404 })
  const ip = await getClientIp()
  if (!(await checkRateLimit(`passkey-auth:${ip}`, 30, 600))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }
  const body = (await request.json().catch(() => null)) as {
    step?: string
    response?: { id?: unknown }
  } | null
  const { rpID, origin } = relyingParty()

  if (body?.step === 'options') {
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' })
    const sealed = sealChallenge({ c: options.challenge, p: 'authenticate', u: null })
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

  if (body?.step !== 'verify' || typeof body.response?.id !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_step' }, { status: 400 })
  }
  const claims = openChallenge(request.cookies.get(CHALLENGE_COOKIE)?.value, 'authenticate')
  if (!claims) return NextResponse.json({ ok: false, error: 'challenge_expired' }, { status: 400 })

  const admin = createAdminClient()
  const { data: credential, error: credentialError } = await admin
    .from('webauthn_credentials')
    .select('id, user_id, public_key, counter, transports')
    .eq('id', body.response.id)
    .maybeSingle()
  if (credentialError) {
    log.error('passkey.credential_lookup_failed', { reason: credentialError.message })
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
  if (!credential) {
    return NextResponse.json({ ok: false, error: 'unknown_passkey' }, { status: 400 })
  }

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    verification = await verifyAuthenticationResponse({
      // The library validates the JSON shape itself and throws on a bad one.
      response: body.response as unknown as AuthenticationResponseJSON,
      expectedChallenge: claims.c,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: credential.id as string,
        publicKey: isoBase64URL.toBuffer(credential.public_key as string),
        counter: Number(credential.counter),
        transports: (credential.transports ?? []) as AuthenticatorTransport[],
      },
    })
  } catch (err) {
    log.warn('passkey.auth_verify_failed', {
      reason: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ ok: false, error: 'verification_failed' }, { status: 400 })
  }
  if (!verification.verified) {
    return NextResponse.json({ ok: false, error: 'verification_failed' }, { status: 400 })
  }

  await admin
    .from('webauthn_credentials')
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', credential.id)

  const session = await mintSessionFor(credential.user_id as string)
  if (!session.ok) {
    return NextResponse.json(
      { ok: false, error: session.reason === 'no_email' ? 'no_email' : 'session_failed' },
      { status: session.reason === 'no_email' ? 409 : 500 },
    )
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.delete({ name: CHALLENGE_COOKIE, path: '/api/auth/passkey' })
  return res
}

export const POST = withRequestLog('/api/auth/passkey/authenticate', handlePOST)
