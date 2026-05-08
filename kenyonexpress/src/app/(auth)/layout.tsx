export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand">KenyonExpress</h1>
          <p className="text-sm text-gray-500 mt-1">קופונים, מבצעים ומוצרים</p>
        </div>
        {children}
      </div>
    </main>
  )
}
