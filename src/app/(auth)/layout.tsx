import Link from 'next/link'

// Sign-in, sign-up and MFA screens have nothing to rank for. Without this they
// inherit the root canonical (the home page) and get indexed as duplicates of it.
export const metadata = {
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-screen focus:outline-none flex items-center justify-center px-4 py-12 bg-gray-50"
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-3xl font-bold text-heading">KenyonExpress</h1>
          </Link>
          <p className="text-sm text-gray-500 mt-1">קופונים, מבצעים ומוצרים</p>
        </div>
        {children}
      </div>
    </main>
  )
}
