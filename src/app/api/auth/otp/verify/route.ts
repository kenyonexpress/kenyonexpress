import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

function normalizeTelephoneNumber(tel: string): string {
  const cleaned = tel.replace(/\D/g, '')
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `+972${cleaned.slice(1)}`
  }
  if (!cleaned.startsWith('972') && cleaned.length === 9) {
    return `+972${cleaned}`
  }
  if (!cleaned.startsWith('+')) {
    return `+${cleaned}`
  }
  return tel
}

async function handlePOST(req: NextRequest) {
  try {
    const { phone, code } = await req.json()

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    if (!code || typeof code !== 'string' || code.length !== 6) {
      return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 })
    }

    const normalizedPhone = normalizeTelephoneNumber(phone)

    // Rate limit: 5 attempts per phone per hour (phone-otp-number policy)
    const decision = await rateLimit('phone-otp-number', normalizedPhone)
    if (!decision.allowed) {
      return tooManyRequests(decision)
    }

    const supabase = await createClient()

    // Find the most recent OTP session for this phone
    const { data: otpSession, error: queryError } = await supabase
      .from('otp_sessions')
      .select('*')
      .eq('phone', normalizedPhone)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (queryError || !otpSession) {
      return NextResponse.json({ error: 'No active OTP session found' }, { status: 400 })
    }

    // Check if OTP has expired
    if (new Date(otpSession.expires_at) < new Date()) {
      return NextResponse.json({ error: 'OTP has expired' }, { status: 400 })
    }

    // Check if max attempts exceeded
    if (otpSession.attempts >= otpSession.max_attempts) {
      return NextResponse.json({ error: 'Maximum attempts exceeded' }, { status: 400 })
    }

    // Verify OTP code
    if (otpSession.code !== code) {
      // Increment attempts
      await supabase
        .from('otp_sessions')
        .update({ attempts: otpSession.attempts + 1 })
        .eq('id', otpSession.id)

      return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 })
    }

    // Mark as verified
    const { error: updateError } = await supabase
      .from('otp_sessions')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', otpSession.id)

    if (updateError) {
      log.error('otp.mark_verified_failed', { reason: updateError.message })
      return NextResponse.json({ error: 'Failed to verify OTP' }, { status: 500 })
    }

    // Get authenticated user to update metadata
    const { data: user, error: userError } = await supabase.auth.getUser()

    if (!user?.user && !userError) {
      // Not authenticated yet - user is in registration flow
      return NextResponse.json({
        success: true,
        phone: normalizedPhone,
        message: 'Phone verified successfully',
      })
    }

    if (user?.user) {
      // Update user's verified_phone in auth.users via user_metadata
      const { error: updateAuthError } = await supabase.auth.updateUser({
        data: {
          verified_phone: normalizedPhone,
          verified_phone_at: new Date().toISOString(),
        },
      })

      if (updateAuthError) {
        log.error('otp.update_auth_user_failed', { reason: updateAuthError.message })
        return NextResponse.json({ error: 'Failed to update user metadata' }, { status: 500 })
      }

      // Also update profiles for backward compatibility
      await supabase
        .from('profiles')
        .update({
          verified_phone: normalizedPhone,
          verified_phone_at: new Date().toISOString(),
        })
        .eq('id', user.user.id)
    }

    return NextResponse.json({
      success: true,
      phone: normalizedPhone,
      message: 'Phone verified successfully',
    })
  } catch (error) {
    log.error('otp.verify_failed', { reason: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ error: 'Failed to verify OTP' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/auth/otp/verify', handlePOST)
