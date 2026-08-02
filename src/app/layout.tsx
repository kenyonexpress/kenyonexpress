import AnalyticsProvider from '@/components/analytics/AnalyticsProvider'
import ConsentBanner from '@/components/analytics/ConsentBanner'
import { CONSENT_PREPAINT_SCRIPT } from '@/lib/analytics/consent'
import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'
// The header cart is in the masthead on every route, so its styles load here
// rather than with the /cart page. See the note at the top of the file.
import '@/styles/mini-cart.css'
/**
 * The three below are imported HERE, not by the segment that uses them, and the
 * reason is the number of requests rather than the number of bytes.
 *
 * A stylesheet imported by a route segment gets its own chunk, and every chunk
 * is a render-blocking <link>. The homepage was shipping four: the root bundle
 * (84707 B) plus cart-page (5776), product-card-deals (2763) and home-handheld
 * (125). Lighthouse mobile charged 454ms for the first and 304ms for EACH of
 * the other three - 870ms total to deliver 8.6KB. Merged into the root bundle
 * they cost one request and no extra round trip.
 *
 * This is only safe because all three are page-scoped BEM (`.cart-page__*`,
 * `.jet-listing-grid-deals*`, `.hero-copy-column`): loading them on a route
 * that has none of those elements matches nothing. A file with bare element or
 * utility selectors does NOT belong here - it would now apply site-wide.
 */
import '@/styles/cart-page.css'
import '@/styles/home-handheld.css'
import '@/styles/product-card-deals.css'

// Heebo drives ALL text site-wide (Hebrew + Latin). Exposed as --font-heebo and
// wired to --font-sans in globals.css.
const heebo = Heebo({
  variable: '--font-heebo',
  subsets: ['latin', 'hebrew'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'KenyonExpress',
    template: '%s | KenyonExpress',
  },
  description: 'קופונים, מבצעים ומוצרים במחיר הכי טוב',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'),
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/*
          First thing in the body, not next/script, and not next to the banner
          it governs. It has to run BEFORE the parser reaches the banner markup
          at the end of the body, or a visitor who already decided sees it flash;
          a plain inline script is the only form with that ordering guarantee.
          `beforeInteractive` is about running before Next's own modules, which
          is a different and later moment. Allowed by CSP: script-src carries
          'unsafe-inline' (src/lib/security/frame-policy.ts).
        */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: fixed string built from two module constants, no input reaches it */}
        <script dangerouslySetInnerHTML={{ __html: CONSENT_PREPAINT_SCRIPT }} />
        {/*
          The decision lives in a cookie that only script can read, so with
          script off nobody can be identified as having answered and the banner
          would show on every page with two buttons that do nothing. There is
          also nothing to consent TO: the analytics it gates is itself script.
          Caught by the E2E run, not by reading - the JS-disabled test asserted
          the opposite and failed.
        */}
        <noscript>
          <style>{'[data-consent-banner]{display:none}'}</style>
        </noscript>
        {children}
        {/*
          `AnalyticsProvider` calls `usePathname`, which under `cacheComponents`
          is runtime data on any route carrying a dynamic param. Unwrapped, it
          pulls /product/[slug], /category/[slug] and every [id] route in the
          admin and account areas out of the static shell - from the root
          layout, so there is no route it does not reach.

          It renders null, so the fallback is exact rather than approximate.
        */}
        <Suspense fallback={null}>
          <AnalyticsProvider />
        </Suspense>
        <ConsentBanner />
      </body>
    </html>
  )
}
