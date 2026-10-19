import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/utils/rate-limit'
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server'
import { type NextRequest, NextResponse } from 'next/server'

const RP_ID = process.env.NEXT_PUBLIC_APP_URL?.split('://')[1]?.split(':')[0] || 'localhost'
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function handlePOST(req: NextRequest) {
  const clientIp = await getClientIp()
  const body = await req.json()
  const { step, credential, challengeFromSession } = body

  if (step === 'options') {
    // Rate limit: 30 challenge issuances per hour per IP
    const decision = await rateLimit('passkey-login', clientIp)
    if (!decision.allowed) {
      return tooManyRequests(decision)
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      timeout: 60000,
      allowCredentials: [],
      userVerification: 'preferred',
    })

    return NextResponse.json(options)
  }

  if (step === 'verify') {
    // Rate limit: 20 assertion verifications per hour per IP
    const decision = await rateLimit('passkey-login-finish', clientIp)
    if (!decision.allowed) {
      return tooManyRequests(decision)
    }

    const supabase = await createClient()

    try {
      const { data: passkeys, error: dbError } = await supabase
        .from('passkeys')
        .select('*')
        .eq('credential_id', credential.id)
        .limit(1)
        .single()

      if (dbError || !passkeys) {
        return NextResponse.json({ error: 'Passkey not found' }, { status: 404 })
      }

      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challengeFromSession,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: passkeys.credential_id,
          publicKey: new Uint8Array(Buffer.from(passkeys.public_key, 'base64url')),
          counter: passkeys.counter,
          transports: passkeys.transports,
        },
      })

      if (!verification.verified) {
        // Fallback to magic link on authentication failure
        return NextResponse.json(
          {
            error: 'Authentication failed',
            fallbackToMagicLink: true,
          },
          { status: 401 },
        )
      }

      const { error: updateError } = await supabase
        .from('passkeys')
        .update({ counter: verification.authenticationInfo.newCounter })
        .eq('id', passkeys.id)

      if (updateError) {
        console.error('Error updating counter:', updateError)
      }

      return NextResponse.json({
        verified: true,
        userId: passkeys.user_id,
      })
    } catch (error) {
      console.error('Authentication verification error:', error)
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
    }
  }

  return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
}

export const POST = withRequestLog('/api/auth/passkey/authenticate', handlePOST)
