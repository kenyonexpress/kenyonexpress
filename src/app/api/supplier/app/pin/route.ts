import { withRequestLog } from '@/lib/observability/with-request-log'
import { identityScopedClient } from '@/lib/supabase/bearer'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Identifies which member of staff is at the till.
 *
 * IT IS NOT A LOGIN. The device is already authenticated as the supplier before
 * this is called, and a wrong PIN denies nothing the device could not otherwise
 * do - the scanner still works, the scan is simply recorded with no name on it.
 * What the PIN buys is an answerable audit trail, which is what matters when a
 * business asks who redeemed a voucher that the customer disputes.
 *
 * WHY A ROUTE AT ALL WHEN THE RPC IS GRANTED TO `authenticated`. The rate
 * limit. `verify_supplier_staff_pin` is deliberately callable directly, so the
 * portal can use it, but a four-digit PIN against an unlimited endpoint is ten
 * thousand tries. Here it is fifteen an hour per member: far above a cashier
 * who fat-fingered it twice, far below enumeration. bcrypt makes each attempt
 * cost real time on top of that, and the per-staff lockout in 115 catches the
 * case where one person's PIN is being probed specifically.
 *
 * The supplier is never taken from the request. The RPC derives it from
 * `auth.uid()`'s membership, so a device cannot probe PINs at a business it
 * does not work for.
 */

const bodySchema = z.object({
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/),
})

type StaffRow = { staff_id: string; display_name: string; locked: boolean }

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const scoped = await identityScopedClient(request)
  if (!scoped) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const allowed = await checkRateLimit(`staff-pin:${scoped.identity.user.id}`, 15, 3600)
  if (!allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    // Same shape as a wrong PIN on purpose. Telling a caller that six digits
    // were "malformed" while five were "wrong" narrows the search for them.
    return NextResponse.json({ ok: false, error: 'invalid_pin' }, { status: 401 })
  }

  const { data, error } = await scoped.client.rpc('verify_supplier_staff_pin', {
    p_pin: parsed.data.pin,
  })

  if (error) return NextResponse.json({ ok: false, error: 'invalid_pin' }, { status: 401 })

  const row = (data as StaffRow[] | null)?.[0]
  if (!row) return NextResponse.json({ ok: false, error: 'invalid_pin' }, { status: 401 })
  if (row.locked) {
    return NextResponse.json({ ok: false, error: 'locked' }, { status: 423 })
  }

  return NextResponse.json({
    ok: true,
    staff: { id: row.staff_id, display_name: row.display_name },
  })
}

export const POST = withRequestLog('/api/supplier/app/pin', handlePOST)
