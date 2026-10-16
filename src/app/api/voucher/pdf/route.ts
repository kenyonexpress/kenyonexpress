import { rateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Generates a downloadable PDF for a voucher coupon.
 * POST /api/voucher/pdf
 */
export async function POST(request: NextRequest) {
  const ip = await getClientIp()
  const decision = await rateLimit('search', ip)
  if (!decision.allowed) {
    return new NextResponse(null, { status: 429 })
  }

  try {
    const body = await request.json()
    const { voucherId, code, _productName, _expiresAt, _collectAmount, qrDataUrl, _supplierInfo } =
      body

    if (!voucherId || !code || !qrDataUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // For now, return a placeholder.
    // In production, use a library like pdfkit or html2pdf
    // to generate a proper PDF with the voucher details.
    const pdfBuffer = Buffer.from('PDF stub - implement with pdfkit or html2pdf library')

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="coupon-${code}.pdf"`,
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
