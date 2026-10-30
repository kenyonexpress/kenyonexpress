import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || '+14155238886'

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

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function handlePOST(req: NextRequest) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: 'OTP service not configured' }, { status: 503 })
  }

  try {
    const { phone } = await req.json()

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    const normalizedPhone = normalizeTelephoneNumber(phone)

    // Rate limit: 5 attempts per phone per hour
    const decision = await rateLimit('phone-otp-number', normalizedPhone)
    if (!decision.allowed) {
      return tooManyRequests(decision)
    }

    // Generate 6-digit OTP
    const code = generateOTP()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store OTP in database
    const supabase = await createClient()
    const { error: insertError } = await supabase.from('otp_sessions').insert({
      phone: normalizedPhone,
      code,
      expires_at: expiresAt.toISOString(),
    })

    if (insertError) {
      log.error('otp.store_failed', { reason: insertError.message })
      return NextResponse.json({ error: 'Failed to create OTP session' }, { status: 500 })
    }

    // Send via Twilio WhatsApp
    const twilioCli = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    const message = `קוד האימות שלך לקניון אקספרס ${code.split('').join(' ')}`

    const result = await twilioCli.messages.create({
      from: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
      to: `whatsapp:${normalizedPhone}`,
      body: message,
    })

    return NextResponse.json({
      success: true,
      sessionId: null,
      messageId: result.sid,
    })
  } catch (error) {
    log.error('otp.send_failed', { reason: error instanceof Error ? error.message : 'unknown' })
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/auth/otp/send', handlePOST)
