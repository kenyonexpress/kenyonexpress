import { createClient } from '@/lib/supabase/server'
import InfoBar from '@/components/InfoBar'
import SiteHeader from '@/components/SiteHeader'
import RightSidebar from '@/components/RightSidebar'
import LeftSidebar from '@/components/LeftSidebar'
import SiteFooter from '@/components/SiteFooter'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen flex flex-col">
      <InfoBar />
      <SiteHeader user={user} />
      <div className="flex-1 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="grid grid-cols-[200px_1fr_250px] gap-4 items-start">
            <RightSidebar />
            <main className="min-w-0 space-y-4">{children}</main>
            <LeftSidebar />
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}
