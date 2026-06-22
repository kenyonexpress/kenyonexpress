import LeftSidebar from '@/components/LeftSidebar'
import RightSidebar from '@/components/RightSidebar'
import SiteFooter from '@/components/SiteFooter'
import Header from '@/components/layout/Header'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
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
