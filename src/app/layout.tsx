import AnalyticsProvider from '@/components/analytics/AnalyticsProvider'
import ConsentBanner from '@/components/analytics/ConsentBanner'
import { CONSENT_PREPAINT_SCRIPT } from '@/lib/analytics/consent'
import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'
// The header cart is in the masthead on every route, so its styles load here
// rather than with the /cart page. See the note at the top of the file.
import '@/styles/mini-cart.css'

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
        {children}
        <AnalyticsProvider />
        <ConsentBanner />
      </body>
    </html>
  )
}
