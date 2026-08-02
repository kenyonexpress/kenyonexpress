import AnalyticsProvider from '@/components/analytics/AnalyticsProvider'
import ConsentBanner from '@/components/analytics/ConsentBanner'
import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'
/**
 * Merged into the root CSS chunk so the homepage does not pay three extra
 * render-blocking stylesheet round-trips (ARCHITECTURE-PERFORMANCE Lighthouse).
 * Selectors are page-scoped BEM; unused routes match nothing.
 */
import '@/styles/product-card-deals.css'

const heebo = Heebo({
  variable: '--font-heebo',
  subsets: ['latin', 'hebrew'],
  display: 'swap',
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
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <AnalyticsProvider />
        <ConsentBanner />
      </body>
    </html>
  )
}
