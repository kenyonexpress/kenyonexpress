import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50">
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
