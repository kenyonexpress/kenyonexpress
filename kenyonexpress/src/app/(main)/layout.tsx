import LeftSidebar from '@/components/LeftSidebar'
import RightSidebar from '@/components/RightSidebar'
import SiteFooter from '@/components/SiteFooter'
import MainHeader from '@/components/layout/MainHeader'
import TopBar from '@/components/layout/TopBar'
import { createClient } from '@/lib/supabase/server'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <MainHeader user={user} />
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
