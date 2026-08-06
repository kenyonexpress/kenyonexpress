import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { readAppleWalletConfig } from '@/lib/wallet/config'
import { passImages } from '@/lib/wallet/pass-images'
import { buildApplePass } from '@/lib/wallet/pass-model'
import { buildPkpass } from '@/lib/wallet/pkpass'
import { getCustomerVoucher } from '@/server/queries/vouchers'
import { NextResponse } from 'next/server'

/**
 * The `.pkpass` download for one voucher.
 *
 * The id in the path is a voucher UUID and NOT a capability: `getCustomerVoucher`
 * reads through the user-scoped client, so RLS decides, and somebody else's id
 * is indistinguishable here from one that does not exist. That is the same rule
 * `/coupon/[id]` follows, and it has to be the same rule — this endpoint hands
 * out the QR payload the counter accepts.
 *
 * Not configured is 404 and not 500. A deployment without Apple credentials has
 * no pass to serve; the coupon page does not render the button in that case, so
 * a request arriving here is either a stale tab or a probe, and neither should
 * be told an error occurred.
 *
 * `no-store`, unconditionally. The body contains a live voucher payload and the
 * response varies by session.
 */
async function handleGET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const config = readAppleWalletConfig()
  if (!config) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 404 })

  const { id } = await context.params
  const voucher = await getCustomerVoucher(id)
  if (!voucher) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? ''

  try {
    const archive = buildPkpass(
      {
        pass: buildApplePass(voucher, {
          passTypeIdentifier: config.passTypeIdentifier,
          teamIdentifier: config.teamIdentifier,
          organizationName: config.organizationName,
          origin,
        }),
        images: await passImages(),
      },
      config,
    )

    return new NextResponse(new Uint8Array(archive), {
      headers: {
        'content-type': 'application/vnd.apple.pkpass',
        'content-disposition': `attachment; filename="kenyon-${voucher.code}.pkpass"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (error) {
    // Signing and image work are the two things that can fail here, and both
    // fail the same way from the customer's side: a download that does nothing.
    // Named in the log, because "the Wallet button is broken" is otherwise a
    // report with no thread to pull.
    log.error('wallet.pkpass_build_failed', {
      voucher_id: id,
      err: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: false, error: 'build_failed' }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/wallet/apple/[id]', handleGET)
