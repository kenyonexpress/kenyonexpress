import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server'
import { type NextRequest, NextResponse } from 'next/server'

const RP_ID = process.env.NEXT_PUBLIC_APP_URL?.split('://')[1]?.split(':')[0] || 'localhost'
const RP_NAME = 'Kenyon Express'
const ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function handlePOST(req: NextRequest) {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()

  if (!userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { step, credential, challengeFromSession } = body

  if (step === 'options') {
    const options = await generateRegistrationOptions({
      rpID: RP_ID,
      rpName: RP_NAME,
      userID: Buffer.from(userData.user.id),
      userName: userData.user.email || userData.user.user_metadata?.email || 'user',
      userDisplayName: userData.user.user_metadata?.name || userData.user.email || 'User',
      attestationType: 'direct',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
      },
    })

    return NextResponse.json(options)
  }

  if (step === 'verify') {
    try {
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challengeFromSession,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
      })

      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json({ error: 'Registration failed' }, { status: 400 })
      }

      const { credential: cred } = verification.registrationInfo
      const transports = credential.response?.transports || []

      const { error } = await supabase.from('passkeys').insert([
        {
          user_id: userData.user.id,
          credential_id: cred.id,
          public_key: Buffer.from(cred.publicKey).toString('base64url'),
          counter: cred.counter,
          transports: transports,
        },
      ])

      if (error) {
        console.error('Error storing passkey:', error)
        return NextResponse.json({ error: 'Failed to store passkey' }, { status: 500 })
      }

      return NextResponse.json({ verified: true })
    } catch (error) {
      console.error('Registration verification error:', error)
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 })
    }
  }

  return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
}

export const POST = withRequestLog('/api/auth/passkey/register', handlePOST)
