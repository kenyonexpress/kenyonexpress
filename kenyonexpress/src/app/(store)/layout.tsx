import StorefrontFooter from '@/components/storefront/Footer'
import StorefrontHeader from '@/components/storefront/Header'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <StorefrontHeader />
      <main className="flex-1 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-4">{children}</div>
      </main>
      <StorefrontFooter />
    </div>
  )
}
