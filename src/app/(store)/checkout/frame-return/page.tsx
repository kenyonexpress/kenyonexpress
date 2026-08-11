import type { Metadata } from 'next'
import { Suspense } from 'react'
import FrameReturnBreakout from './FrameReturnBreakout'

export const metadata: Metadata = {
  title: 'מעבד תשלום',
  // Nothing here is worth indexing, and it carries an order id in the query.
  robots: { index: false, follow: false },
}

/**
 * Where Cardcom returns into the payment iframe.
 *
 * This page holds no session and shows no order. That is the entire design:
 * the navigation Cardcom performs into our iframe is cross-site, so the
 * browser withholds the `SameSite=Lax` Supabase cookie, and any page that
 * needed a session here would render a login form inside the payment box of a
 * shopper who has just paid. So this one needs none. It reads an order id,
 * validates its shape, and moves the TOP window to the real confirmation —
 * a top-level navigation, where the session cookie is sent normally.
 *
 * It is also the only path in the app that `frame-ancestors 'self'` applies to
 * (see lib/security/frame-policy.ts). Being framable is a privilege, and this
 * is the page that has the least to lose by holding it: an attacker who framed
 * it from our own origin would be looking at an order id they supplied.
 *
 * The outcome is not decided here and must not be. Payment truth comes from the
 * webhook's server-to-server verify and from `reconcileOrderReturn` on the
 * confirmation page. This is a signpost.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default function CheckoutFrameReturnPage(props: {
  searchParams: Promise<{ order_id?: string; status?: string }>
}) {
  return (
    // The "מעבד את התשלום..." line is the whole visible page, so it is the
    // shell: a shopper who has just paid sees it at once, and the breakout
    // script arrives with the resolved target a moment later.
    <Suspense
      fallback={
        <div className="checkout-page">
          <div className="checkout-pending">
            <p>מעבד את התשלום...</p>
          </div>
        </div>
      }
    >
      <FrameReturnBody {...props} />
    </Suspense>
  )
}

async function FrameReturnBody({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string; status?: string }>
}) {
  const { order_id: orderId, status } = await searchParams

  // Anything that is not an order id becomes the cart rather than a redirect
  // target. This value is interpolated into a URL the top window is sent to,
  // so it is checked rather than trusted.
  const target =
    orderId && UUID_RE.test(orderId)
      ? status === 'failed'
        ? `/checkout/failed?order_id=${orderId}`
        : `/checkout/return?order_id=${orderId}`
      : '/cart'

  return (
    <div className="checkout-page">
      <FrameReturnBreakout target={target} />
      <div className="checkout-pending">
        <p>מעבד את התשלום...</p>
        <noscript>
          {/* Without scripting the breakout cannot run, so the link is the way
              out. It is a plain link and not a meta refresh because a refresh
              would navigate the frame again rather than the tab. */}
          <a href={target} target="_top">
            המשך לאישור ההזמנה
          </a>
        </noscript>
      </div>
    </div>
  )
}
