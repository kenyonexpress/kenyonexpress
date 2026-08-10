import AnalyticsProvider from '@/components/analytics/AnalyticsProvider'
import ConsentBanner from '@/components/analytics/ConsentBanner'
import ThirdPartyTags from '@/components/analytics/ThirdPartyTags'
import InstallPrompt from '@/components/pwa/InstallPrompt'
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar'
import { CONSENT_PREPAINT_SCRIPT } from '@/lib/analytics/consent'
import { readThirdPartyConfig, validatedConfig } from '@/lib/analytics/third-party'
import { SITE } from '@/styles/tokens'
import { Analytics as VercelAnalytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata, Viewport } from 'next'
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

const heebo = Heebo({
  variable: '--font-heebo',
  subsets: ['latin', 'hebrew'],
  display: 'swap',
  // LCP paragraph is Arial on purpose ([24]); do not preload Heebo onto that path.
  preload: false,
})

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'קניון אקספרס | קופונים ומבצעים',
    template: '%s | קניון אקספרס',
  },
  description: 'קופונים, מבצעים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: 'קניון אקספרס',
    title: 'קניון אקספרס | קופונים ומבצעים',
    description: 'קופונים, מבצעים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'קניון אקספרס | קופונים ומבצעים',
    description: 'קופונים, מבצעים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
  },
  alternates: {
    canonical: '/',
    // How a reader finds the feed at all. `robots.txt` advertises the sitemap
    // and has no field for a feed, and nothing on the page links to one, so
    // without this tag `/feed.xml` exists and is undiscoverable. Deliberately
    // NOT the Merchant feed: that one is pulled by a URL configured inside
    // Merchant Center and has no business being offered to browsers.
    types: {
      'application/rss+xml': [{ url: '/feed.xml', title: 'קניון אקספרס — דילים חדשים' }],
    },
  },
  // iOS reads none of the manifest's icons and looks only for this link tag.
  // Without it Safari screenshots the page and uses that as the home-screen
  // icon, which on this site is a yellow banner.
  appleWebApp: {
    capable: true,
    title: 'Kenyon',
    statusBarStyle: 'default',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

/**
 * Separate from `metadata` because Next 16 rejects `themeColor` inside it.
 *
 * Read from `SITE.brand.primary` rather than written as a literal: the raw-hex
 * sweep in tokens.test.ts rejects a literal here, and rightly so -- this value
 * has to stay equal to `theme_color` in app/manifest.ts and to
 * --color-brand-primary. If the three drift, the splash screen flashes one
 * colour and the browser chrome settles on another.
 */
export const viewport: Viewport = {
  themeColor: SITE.brand.primary,
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
        {/*
          Before `{children}` on purpose ([24]): the banner is the phone LCP
          element and used to ship after the whole homepage HTML. With inline
          fixed positioning it can paint as soon as the parser reaches it,
          without waiting for the rest of the document or the big stylesheet.
        */}
        <ConsentBanner />
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
        {/*
          Both are client components that render nothing until the browser
          says so, and both are last in the body for the same reason the
          analytics provider is: nothing here may compete with the LCP paint
          that [15]-[21] spent five goals recovering.
        */}
        <ServiceWorkerRegistrar />
        <InstallPrompt />
        {/*
          GA4 and the Meta Pixel, and they render NOTHING until the visitor has
          agreed - no script tag, no stub, no consent-mode-denied bootstrap. See
          `lib/analytics/third-party.ts` for why that is stricter than Google's
          own recommended pattern and why the stricter version is the one that
          can be checked in a network log.

          The config is read on the SERVER and passed down, so a misconfigured
          id disables the tag rather than loading a Tag Manager container that
          reports nothing.
        */}
        <ThirdPartyTags config={validatedConfig(readThirdPartyConfig())} />
        {/*
          Vercel's own two. First-party by design - they are served from this
          origin through Vercel's rewrite, so no third-party request leaves the
          page and no cookie is set, which is why they sit outside the consent
          gate that GA4 and Meta are behind.
        */}
        <VercelAnalytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
