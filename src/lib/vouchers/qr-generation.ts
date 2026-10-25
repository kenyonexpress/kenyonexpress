import { createHmac } from 'node:crypto'

/**
 * Voucher QR generation with signed JWT payload.
 * F55: Server-side QR with signed JWT {voucher_id, user_id, expiry}
 */

interface VoucherQRPayload {
  voucher_id: string
  user_id: string
  expiry: Date
}

/**
 * Generate signed JWT for voucher QR code.
 * Format: base64(header).base64(payload).signature
 */
export function generateSignedJWT(payload: VoucherQRPayload): string {
  const secret = process.env.VOUCHER_QR_SECRET
  if (!secret) {
    throw new Error('VOUCHER_QR_SECRET environment variable not set')
  }

  // JWT header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  }

  // JWT payload
  const jwtPayload = {
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
    throw new Error('VOUCHER_QR_SECRET environment variable not set')
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
      voucher_id: payload.voucher_id,
      user_id: payload.user_id,
      expiry: new Date(payload.exp * 1000),
    }
  } catch (error) {
    console.error('JWT verification error:', error)
    return null
  }
}

/**
 * Generate voucher QR code URL with signed JWT.
 * Stores QR image and returns public URL for orders.voucher_qr_url.
 */
export async function generateVoucherQR(payload: VoucherQRPayload): Promise<string> {
  const secret = process.env.VOUCHER_QR_SECRET
  if (!secret) {
    throw new Error('VOUCHER_QR_SECRET environment variable not set')
  }

  // Generate signed JWT token
  const jwt = generateSignedJWT(payload)

  // In production, this would generate QR image and upload to storage
  // For now, return the JWT as a data URL that can be rendered as QR
  const qrDataUrl = `data:text/plain;base64,${Buffer.from(jwt, 'utf-8').toString('base64')}`

  return qrDataUrl
}
