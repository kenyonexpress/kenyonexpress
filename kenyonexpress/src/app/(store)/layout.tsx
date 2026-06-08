import SiteFooter from '@/components/layout/SiteFooter'
import SiteHeader from '@/components/layout/SiteHeader'
import TopBar from '@/components/layout/TopBar'
import CategoryNav from '@/components/store/CategoryNav'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <TopBar />
      <SiteHeader />
      <CategoryNav />
      <main className="flex-1 w-full">{children}</main>
      <SiteFooter />
    </div>
  )
}
