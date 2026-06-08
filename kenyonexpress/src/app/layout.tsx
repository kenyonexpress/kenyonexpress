import type { Metadata } from 'next'
import { Heebo, Inter } from 'next/font/google'
import './globals.css'

// Latin UI font. Exposed as --font-inter; drives Latin text, Heebo covers Hebrew.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

// Hebrew-first variable font. Exposed as --font-heebo and wired to --font-sans in globals.css.
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
    <html lang="he" dir="rtl" className={`${inter.variable} ${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  )
}
