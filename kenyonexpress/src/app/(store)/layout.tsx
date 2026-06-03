import SiteFooter from '@/components/SiteFooter'
import Header from '@/components/layout/Header'
import { createClient } from '@/lib/supabase/server'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen flex flex-col">
      <Header user={user} />
      <main className="flex-1 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-6">{children}</div>
      </main>
      <SiteFooter />
    </div>
  )
}
