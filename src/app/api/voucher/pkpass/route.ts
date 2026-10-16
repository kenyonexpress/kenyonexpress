import { rateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Generates a .pkpass file for Apple Wallet and Google Pay.
 * POST /api/voucher/pkpass
 */
export async function POST(request: NextRequest) {
  const ip = await getClientIp()
  const decision = await rateLimit('search', ip)
  if (!decision.allowed) {
    return new NextResponse(null, { status: 429 })
  }

  try {
    const body = await request.json()
    const { voucherId, code, productName, expiresAt, collectAmount, barcode, supplierInfo } = body

    if (!voucherId || !code || !barcode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // For now, return a placeholder.
    // In production, use a library like 'passkit' to generate proper .pkpass files
    const pkpassBuffer = Buffer.from('PKPASS stub - implement with passkit or similar library')

    return new NextResponse(pkpassBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="coupon-${code}.pkpass"`,
      },
    })
  } catch (error) {
    console.error('PKPASS generation error:', error)
    return NextResponse.json({ error: 'Failed to generate pass' }, { status: 500 })
  }
}
