import { createHmac } from 'node:crypto'
import { log } from '@/lib/observability/log'

/**
 * Voucher QR generation with signed JWT payload.
 * F55: Server-side QR with signed JWT {voucher_id, user_id, expiry}
 */

interface VoucherQRPayload {
  v: 1
  voucher_id: string
  user_id: string
  expiry: Date
}

/**
 * Generate signed JWT for voucher QR code.
 * Format: base64(header).base64(payload).signature
 */
export function generateSignedJWT(payload: Omit<VoucherQRPayload, 'v'> & { v?: 1 }): string | null {
  const secret = process.env.VOUCHER_QR_SECRET
  if (!secret) {
    return null
  }

  // JWT header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }

  // JWT payload with version
  const jwtPayload = {
    v: 1,
    voucher_id: payload.voucher_id,
    user_id: payload.user_id,
    exp: Math.floor(payload.expiry.getTime() / 1000), // Unix timestamp
    iat: Math.floor(Date.now() / 1000),
  }

  // Base64 encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
  const encodedPayload = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url')

  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`
  const signature = createHmac('sha256', secret).update(signatureInput).digest('base64url')

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

/**
 * Verify JWT signature and extract payload.
 * Returns null if signature invalid or token expired.
 */
export function verifySignedJWT(token: string): VoucherQRPayload | null {
  const secret = process.env.VOUCHER_QR_SECRET
  if (!secret) {
    return null
  }

  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [encodedHeader, encodedPayload, signature] = parts

    if (!encodedHeader || !encodedPayload || !signature) {
      return null
    }

    // Verify signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`
    const expectedSignature = createHmac('sha256', secret)
      .update(signatureInput)
      .digest('base64url')

    if (signature !== expectedSignature) {
      return null
    }

    // Decode payload
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString())

    // Check expiry
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return null
    }

    return {
      v: 1,
      voucher_id: payload.voucher_id,
      user_id: payload.user_id,
      expiry: new Date(payload.exp * 1000),
    }
  } catch (error) {
    log.error('jwt_verification_error', { err: error })
    return null
  }
}

/**
 * Generate voucher QR code with signed JWT.
 * Returns the JWT directly (not a data URL) for storage in orders.voucher_qr_url.
 * The JWT can be rendered as a QR code on the frontend.
 */
export async function generateVoucherQR(
  payload: Omit<VoucherQRPayload, 'v'>,
): Promise<string | null> {
  return generateSignedJWT(payload)
}
