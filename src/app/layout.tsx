import ScrollRestoration from '@/components/ScrollRestoration'
import ThemeProvider from '@/components/ThemeProvider'
import ViewTransitionsNavigationWrapper from '@/components/ViewTransitionsNavigationWrapper'
import SkipLink from '@/components/a11y/SkipLink'
import AnalyticsProvider from '@/components/analytics/AnalyticsProvider'
import ConsentBanner from '@/components/analytics/ConsentBanner'
import PostHogReplay from '@/components/analytics/PostHogReplay'
import ThirdPartyTags from '@/components/analytics/ThirdPartyTags'
import SentryUserSync from '@/components/observability/SentryUserSync'
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
/**
 * ONE stylesheet import, on purpose. Every root-level sheet (globals, the
 * masthead cart, the page-scoped BEM files for the cart page, the deals grid
 * and the handheld hero) is pulled in by app.css with @import, so the bundler
 * sees one CSS module and emits one chunk, which is one render-blocking
 * <link>. Seven separate imports here gave three chunks on the homepage, and
 * every chunk is a round trip: Lighthouse mobile charged 304ms for EACH extra
 * one to deliver 8.6KB. The rule for what may go in app.css is in app.css.
 */
import './app.css'
import { BRAND_DEFAULT_TITLE, BRAND_DISPLAY_NAME, BRAND_TITLE_TEMPLATE } from '@/lib/brand'

const heebo = Heebo({
  variable: '--font-heebo',
  subsets: ['latin', 'hebrew'],
  weight: ['300', '400', '500', '700', '900'],
  display: 'swap',
  // LCP paragraph is Arial on purpose ([24]); do not preload Heebo onto that path.
  preload: false,
})

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: BRAND_DEFAULT_TITLE,
    template: BRAND_TITLE_TEMPLATE,
  },
  description: 'קופונים, מבצעים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: BRAND_DISPLAY_NAME,
    title: BRAND_DEFAULT_TITLE,
    description: 'קופונים, מבצעים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_DEFAULT_TITLE,
    description: 'קופונים, מבצעים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
  },
  alternates: {
    canonical: '/',
    /**
     * Self-referencing, and that is all it can honestly be: the site exists in
     * one language. Google requires a self-reference from any page that carries
     * hreflang at all, so a single `he-IL` entry is the correct shape rather
     * than a stub for a translation that does not exist. It states the language
     * AND the region, which is the part `<html lang="he">` alone leaves open --
     * Hebrew is spoken in one country but a search engine still has to be told
     * which market this catalogue prices for, and every price on it is in ILS.
     *
     * It does NOT create alternates. The day a second language exists, this map
     * gains a row per language and an `x-default`; until then adding either
     * would point at a page that answers in Hebrew.
     */
    languages: {
      'he-IL': '/',
    },
    // How a reader finds the feed at all. `robots.txt` advertises the sitemap
    // and has no field for a feed, and nothing on the page links to one, so
    // without this tag `/feed.xml` exists and is undiscoverable. Deliberately
    // NOT the Merchant feed: that one is pulled by a URL configured inside
    // Merchant Center and has no business being offered to browsers.
    types: {
      'application/rss+xml': [{ url: '/feed.xml', title: `${BRAND_DISPLAY_NAME} — דילים חדשים` }],
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
/**
 * NO `viewportFit`, AND THAT IS WHY THERE IS NO `env(safe-area-inset-*)`
 * ANYWHERE. The two go together, and only together.
 *
 * STEP 09 asks for safe-area handling. Checked 2026-09-08: this project has
 * zero `safe-area-inset` declarations, and that is correct rather than missing.
 * Without `viewport-fit=cover` a browser uses `contain`, which letterboxes the
 * viewport so `position: fixed; inset: 0` already stops at the safe area. The
 * notch and the home indicator are avoided by the browser, and padding them
 * again would push content away from an edge it never reached.
 *
 * THE TRAP IS ADDING ONE WITHOUT THE OTHER. `viewportFit: 'cover'` is the
 * ordinary thing to reach for when a PWA should render edge to edge, and the
 * moment it appears the two fixed elements in this app land in the unsafe area:
 * the consent banner is `fixed bottom-0` with its two buttons at the bottom
 * edge - globals.css already records a Pixel 5 measurement where it made a
 * control unclickable - and `.checkout-frame` is `inset: 0` with 24px of
 * padding, which is less than the ~47px notch.
 *
 * `src/__tests__/safe-area-pairing.test.ts` fails if `cover` is ever added
 * without the insets, so the pair cannot come apart.
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
      <body className="m-0 min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
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
          {/*
            The skip link has to be the FIRST Tab stop, and the consent banner
            below is first in the body for LCP, so the link lives here rather
            than in the route-group layouts that own the <main id="main-content">
            it targets. With it in those layouts the banner's two buttons were the
            first two Tab stops on every page (keyboard-navigation.spec, both
            projects, every run). On a page without that target the link is a
            harmless no-op; the store and legal layouts carry it.
          */}
          <SkipLink />
          <ConsentBanner />
          <ViewTransitionsNavigationWrapper>{children}</ViewTransitionsNavigationWrapper>
        </ThemeProvider>
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
          Sentry's user tag, id only. Renders null, subscribes to the auth
          state Supabase already holds in memory, and makes no request of its
          own - see the component for why it sits outside the consent gate.
        */}
        <SentryUserSync />
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
        <ScrollRestoration />
        {/*
          Session replay for support debugging. Same consent gate as the tags
          above; without NEXT_PUBLIC_POSTHOG_KEY or before Accept it downloads
          nothing at all. Event capture stays on the SDK-free fetch path in
          lib/observability/posthog.ts; this mounts only the DOM recorder.
        */}
        <PostHogReplay />
        {/*
          Vercel's own two. First-party by design - they are served from this
          origin through Vercel's rewrite, so no third-party request leaves the
          page and no cookie is set, which is why they sit outside the consent
          gate that GA4 and Meta are behind.

          Only loaded in production - the scripts rely on Vercel's platform
          infrastructure and produce console errors on localhost.
        */}
        {process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' && (
          <>
            <VercelAnalytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  )
}
