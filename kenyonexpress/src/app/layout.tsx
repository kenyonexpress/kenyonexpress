import type { Metadata } from 'next'
import { Rubik } from 'next/font/google'
import './globals.css'

const rubik = Rubik({
  variable: '--font-rubik',
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
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  )
}
