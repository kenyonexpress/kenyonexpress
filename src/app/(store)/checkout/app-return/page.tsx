import { appReturnDeepLink, parseReturnStatus } from '@/lib/app/deep-links'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: 'חוזרים לאפליקציה',
  robots: { index: false, follow: false },
}

type Props = {
  searchParams: Promise<{ order_id?: string; status?: string }>
}

/**
 * The landing pad for a payment made inside the app's WebView.
 *
 * WHY THIS PAGE EXISTS AT ALL. Cardcom redirects its own hosted page to
 * whatever URL we hand it. A `kenyonexpress://` redirect issued BY a
 * third-party page is refused outright by iOS WKWebView and shown as an error
 * by Chrome Custom Tabs, so the return address must be an ordinary https URL on
 * our own origin. This is that URL.
 *
 * TWO WAYS BACK, AND NEITHER IS SPARE.
 *
 *  1. The app's WebView watches for this path as a PREFIX and closes the sheet
 *     the moment it sees the navigation start. That is the fast path and it is
 *     what happens in the ordinary case; this page's HTML is usually never
 *     painted.
 *  2. If the flow left the WebView - a 3-D Secure step that bounced the user
 *     into the system browser, most often - nobody is watching, so the page
 *     itself navigates to the scheme link. iOS allows that here because it is a
 *     same-origin page the user arrived at, not a cross-origin redirect.
 *
 * IT DECIDES NOTHING ABOUT MONEY. `status` comes off the query string and is
 * cosmetic: the order's real outcome is settled by the webhook and by the
 * server-side `GetLpResult` verification in `reconcileOrderReturn`, and the app
 * re-reads the order from the server after it is dismissed. Nothing here is
 * trusted, which is also why it needs no session and holds no secret.
 */
/**
 * `searchParams` is uncached data, and under `cacheComponents` a route that
 * awaits it at the top level is refused by `next build` with "Uncached data was
 * accessed outside of <Suspense>". The fallback is the same reassurance the
 * body shows, so a shopper who arrives mid-stream never sees a blank page with
 * money already taken - which is the one moment this page exists for.
 *
 * Measured, not assumed: the first version of this file had no boundary and
 * failed the production build on exactly this page.
 */
export default function AppReturnPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div dir="rtl" className="flex min-h-[60vh] items-center justify-center p-6 text-center">
          <p className="text-body-lg leading-relaxed text-muted">חוזרים לאפליקציה...</p>
        </div>
      }
    >
      <AppReturnBody {...props} />
    </Suspense>
  )
}

async function AppReturnBody({ searchParams }: Props) {
  const sp = await searchParams
  const orderId = sp.order_id
  if (!orderId) notFound()

  const status = parseReturnStatus(sp.status)
  const deepLink = appReturnDeepLink(orderId, status)

  const heading = status === 'success' ? 'התשלום התקבל' : 'חוזרים לאפליקציה'
  const message =
    status === 'success'
      ? 'מיד נחזיר אותך לאפליקציה כדי להשלים את ההזמנה.'
      : 'התשלום לא הושלם. מיד נחזיר אותך לאפליקציה.'

  return (
    <div dir="rtl" className="flex min-h-[60vh] items-center justify-center p-6 text-center">
      {/*
        A meta refresh rather than a script: this page is reached by a redirect
        from a payment provider, and the app's WebView may have JavaScript
        restricted on navigations it did not originate. The refresh fires
        without one.
      */}
      <meta httpEquiv="refresh" content={`0;url=${deepLink}`} />
      <div className="max-w-app-return-card">
        <h1 className="mb-2.5 text-xl font-extrabold text-heading">{heading}</h1>
        <p className="text-body-lg leading-relaxed text-muted">{message}</p>
        {/*
          The manual escape hatch. A user whose phone blocked both the
          interception and the refresh is otherwise stranded on a blank page
          with money already taken.
        */}
        <a
          href={deepLink}
          className="mt-4.5 inline-block rounded-cta bg-brand-primary px-5.5 py-3 font-bold text-brand-dark no-underline"
        >
          חזרה לאפליקציה
        </a>
        <div className="mt-3.5 text-small">
          <Link href={`/checkout/return?order_id=${encodeURIComponent(orderId)}`}>
            להמשך באתר במקום
          </Link>
        </div>
      </div>
    </div>
  )
}
