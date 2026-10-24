import { withRequestLog } from '@/lib/observability/with-request-log'
import { requestOrderRefund } from '@/server/actions/payments/request-refund'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/**
 * The customer's cancel-and-refund notice as an HTTP endpoint (Consumer
 * Protection Law section 14ג, distance-sale cancellation).
 *
 * A thin door onto `requestOrderRefund`, which owns every rule: ownership by
 * RLS, paid-only, the statutory 14 days, the migration 185 per-product window
 * (`cancellation_window_days`, inside which the refund is whole and goes to the
 * wallet), the fee `min(5%, 100 ILS)` inside the statutory window, the
 * one-open-request-per-order index and the auto-approval budget. Nothing is
 * decided here, and no money moves: an approved row is an adjudication, the
 * card credit stays behind the admin refund.
 *
 * THE GROUND IS NOT THE CALLER'S. This is the customer's own button, so the
 * ground is always `distance_sale_14d` and the action re-files it by date. A
 * body field naming `defect` (fee waived by statute) or `goodwill` would let a
 * customer pick a fee-free ground the server cannot verify, so the body is read
 * for `reason` and nothing else.
 *
 * `Content-Type: application/json` is required: it is not a CORS-safelisted
 * type, so a cross-site form post cannot ride the session cookie to this route.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_REASON_LENGTH = 500
const NO_STORE = { 'cache-control': 'no-store' }

const STATUS_BY_CODE = {
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  NOT_PAID: 409,
  ALREADY_OPEN: 409,
  NOTHING_REFUNDABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const

function fail(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ ok: false, code, error }, { status, headers: NO_STORE })
}

async function handlePOST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  if (!UUID.test(id)) return fail(404, 'NOT_FOUND', 'הזמנה לא נמצאה.')

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return fail(415, 'BAD_REQUEST', 'סוג הבקשה לא נתמך.')
  }

  let reasonHe: string | undefined
  try {
    const body: unknown = await request.json()
    const reason = (body as { reason?: unknown } | null)?.reason
    if (reason !== undefined && reason !== null) {
      if (typeof reason !== 'string' || reason.length > MAX_REASON_LENGTH) {
        return fail(400, 'BAD_REQUEST', 'סיבת הביטול ארוכה מדי.')
      }
      reasonHe = reason.trim() || undefined
    }
  } catch {
    return fail(400, 'BAD_REQUEST', 'גוף הבקשה אינו JSON תקין.')
  }

  const outcome = await requestOrderRefund({
    orderId: id,
    ground: 'distance_sale_14d',
    reasonHe,
  })

  if (!outcome.ok) return fail(STATUS_BY_CODE[outcome.code], outcome.code, outcome.error)

  // `manualReviewReasons` is the operator's, not the customer's.
  return NextResponse.json(
    {
      ok: true,
      refundId: outcome.refundId,
      state: outcome.state,
      autoApproved: outcome.autoApproved,
      messageHe: outcome.messageHe,
    },
    { status: 201, headers: NO_STORE },
  )
}

export const POST = withRequestLog('/api/orders/[id]/cancel', handlePOST)
