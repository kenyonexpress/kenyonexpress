import OrderTrackingTimeline from '@/components/orders/OrderTrackingTimeline'
import { t } from '@/lib/i18n/messages'
import { verifyOrderTrackingToken } from '@/lib/orders/tracking-token'
import { getTrackedOrder } from '@/server/queries/order-tracking'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

/**
 * "Where is my order", without a login.
 *
 * The link in the shipping email carries a signed token
 * (lib/orders/tracking-token.ts). The customer reading that mail on a phone is
 * usually signed out -- they checked out as a guest, or the session expired --
 * and sending them to `/account/orders` puts a login wall between them and one
 * line of information.
 *
 * `noindex`, for the same reason the gift claim page is: the URL is the
 * credential, and a crawler that reaches one is holding a working link.
 *
 * A BAD TOKEN IS NOT A 404
 *
 * `notFound()` here would tell the holder of an expired link that their order
 * does not exist, which is both false and alarming. The page says the link
 * expired and points at the account page, where the same order is waiting
 * behind a login. It also never distinguishes "wrong signature" from "no such
 * order": doing so would turn this page into an oracle for which order ids
 * exist.
 *
 * THE COPY IS IN THE CATALOG, NOT IN THE FILE
 *
 * `messages/he.json` under `orderTracking`. This is a customer-facing store
 * page, so it is in scope for the i18n ratchet (scripts/hebrew-literal-scan.mjs)
 * -- a new page's worth of literals would have raised a number the ratchet
 * exists to make fall.
 */
export const metadata: Metadata = {
  title: t('orderTracking.title'),
  robots: { index: false, follow: false },
}

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string }>
}

export default function OrderTrackingPage(props: Props) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-10">
      <div className="mx-auto max-w-xl rounded-2xl border border-heading/15 bg-white p-6 shadow-sm">
        {/* Everything below reads per-request data, which under cacheComponents
            must sit inside a boundary or the build fails. */}
        <Suspense
          fallback={<p className="text-sm text-heading/75">{t('orderTracking.loading')}</p>}
        >
          <TrackingContent {...props} />
        </Suspense>
      </div>
    </main>
  )
}

function LinkProblem({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <h1 className="text-xl font-bold text-heading">{title}</h1>
      <p className="mt-2 text-sm text-heading/75">{body}</p>
      <Link
        href="/account/orders"
        className="mt-5 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-heading"
      >
        {t('orderTracking.ordersCta')}
      </Link>
    </div>
  )
}

async function TrackingContent({ params, searchParams }: Props) {
  const { id } = await params
  const { t: token } = await searchParams

  const verdict = verifyOrderTrackingToken(token, id)
  if (!verdict.ok) {
    return verdict.reason === 'expired' ? (
      <LinkProblem title={t('orderTracking.expiredTitle')} body={t('orderTracking.expiredBody')} />
    ) : (
      <LinkProblem title={t('orderTracking.invalidTitle')} body={t('orderTracking.invalidBody')} />
    )
  }

  const order = await getTrackedOrder(verdict.orderId)
  if (!order) {
    return (
      <LinkProblem title={t('orderTracking.invalidTitle')} body={t('orderTracking.missingBody')} />
    )
  }

  const physical = order.lines.filter((line) => line.isPhysical)
  const parcels = physical.filter((line) => line.tracking !== null)

  return (
    <div>
      <p className="text-sm text-heading/70">{t('orderTracking.orderLabel')}</p>
      <h1 className="text-xl font-bold text-heading">
        <span dir="ltr">{order.reference}</span>
      </h1>

      {order.timeline.physicalLines === 0 ? (
        <p className="mt-4 text-sm text-heading/80">{t('orderTracking.noPhysical')}</p>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="sr-only">{t('orderTracking.stepsHeading')}</h2>
            <OrderTrackingTimeline steps={order.timeline.steps} />
          </section>

          {order.estimate && (
            <p className="mt-6 rounded-xl bg-heading/5 px-4 py-3 text-sm text-heading/85">
              {order.estimate.overdue ? (
                <>
                  {t('orderTracking.overduePrefix')} {order.estimate.labelHe}{' '}
                  {t('orderTracking.overdueSuffix')}{' '}
                  <Link href="/contact" className="underline underline-offset-2">
                    {t('orderTracking.overdueCta')}
                  </Link>{' '}
                  {t('orderTracking.overdueTail')}
                </>
              ) : (
                <>
                  {t('orderTracking.estimatePrefix')} {order.estimate.labelHe}.{' '}
                  {t('orderTracking.estimateSuffix')}
                </>
              )}
            </p>
          )}

          {parcels.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold text-heading">
                {t('orderTracking.shipmentsHeading')}
              </h2>
              <ul className="mt-2 space-y-3">
                {parcels.map((line) => (
                  <li key={line.id} className="rounded-xl border border-heading/10 px-4 py-3">
                    <p className="text-sm text-heading">{line.productName}</p>
                    <p className="mt-1 text-xs text-heading/75">
                      {line.tracking?.carrierLabel}
                      {line.tracking?.trackingNumber ? (
                        <>
                          {line.tracking.carrierLabel ? ' · ' : ''}
                          {/* The number is isolated: a Latin string inside an
                              RTL sentence renders in a plausible but wrong
                              order, and a wrong tracking number sends the
                              customer to a courier who says it does not exist. */}
                          <span dir="ltr">{line.tracking.trackingNumber}</span>
                        </>
                      ) : null}
                    </p>
                    {line.tracking?.url && (
                      <a
                        href={line.tracking.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-heading underline underline-offset-2"
                      >
                        {t('orderTracking.carrierLink')}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-6">
            <h2 className="text-sm font-semibold text-heading">
              {t('orderTracking.itemsHeading')}
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-heading/80">
              {physical.map((line) => (
                <li key={line.id}>
                  {line.productName}
                  {line.quantity > 1 ? ` × ${line.quantity}` : ''}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <p className="mt-8 border-t border-heading/10 pt-4 text-xs text-heading/60">
        {t('orderTracking.privacyNote')}{' '}
        <Link href="/account/orders" className="underline underline-offset-2">
          {t('orderTracking.ordersCta')}
        </Link>
      </p>
    </div>
  )
}
