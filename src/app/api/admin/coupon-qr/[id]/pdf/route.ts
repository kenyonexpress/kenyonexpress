import { canReadSection } from '@/lib/admin/permissions'
import { getSessionWithRole } from '@/lib/admin/rbac'
import { buildCouponQrPdf } from '@/lib/coupons/qr-pdf'
import { growthClient } from '@/lib/growth/client'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { resolveVoucherOrigin } from '@/lib/vouchers/qr-image'
import type { NextRequest } from 'next/server'

/**
 * The printable PDF for one QR coupon batch.
 *
 * A ROUTE AND NOT A SERVER ACTION for the same reason the reports CSV is: the
 * browser has to be handed a file, and an <a href> to a route is the whole
 * feature. THE GUARD IS RE-CHECKED HERE, NOT INHERITED FROM THE PAGE: this is
 * a plain GET at a guessable URL and behind it sits every unspent coupon in
 * the batch, each one platform money. `requireSection` is not used because it
 * redirect()s, and a 307 to /login in answer to a download reaches the user as
 * a file called `login`. 403 with a body that says so is the honest answer.
 *
 * The QR URLs point at the public origin the vouchers use
 * (`resolveVoucherOrigin`), so a sheet downloaded from a dev server scans
 * against that dev server instead of production.
 */

async function handleGET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const session = await getSessionWithRole()
  if (!session || !canReadSection(session.role, 'discounts')) {
    log.warn('coupon_qr.pdf_denied', { batchId: id, role: session?.role ?? null })
    return new Response('אין הרשאה', { status: 403 })
  }

  const growth = growthClient()
  const { data: batch } = await growth.qrBatches().byId(id)
  if (!batch) return new Response('לא נמצא', { status: 404 })

  const { data: codes, error } = await growth.qrBatches().codesForBatch(id)
  if (error || !codes || codes.length === 0) {
    // A childless batch is the recorded outcome of a failed generation (see
    // coupon-qr.ts); an empty PDF would print as a blank page somebody hands
    // to a distributor.
    return new Response('אין קודים בקבוצה הזו', { status: 404 })
  }

  const bytes = await buildCouponQrPdf({
    campaignCode: batch.campaign.code,
    origin: await resolveVoucherOrigin(),
    codes: codes.map((row) => row.code),
  })

  log.info('coupon_qr.pdf_downloaded', { batchId: id, codes: codes.length })

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      // ASCII fallback plus RFC 5987 for the Hebrew batch label, so the file
      // is named after what the batch is for, not after a uuid.
      'Content-Disposition': `attachment; filename="coupon-qr-${batch.campaign.code}.pdf"; filename*=UTF-8''${encodeURIComponent(`${batch.label}.pdf`)}`,
      'Cache-Control': 'no-store',
    },
  })
}

export const GET = withRequestLog('/api/admin/coupon-qr/[id]/pdf', handleGET)
