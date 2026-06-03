import type { Product } from '@/components/ProductCard'
import CategoryRing from '@/components/storefront/CategoryRing'
import CategorySidebar from '@/components/storefront/CategorySidebar'
import DealsSection from '@/components/storefront/DealsSection'
import FeatureBar from '@/components/storefront/FeatureBar'
import Hero from '@/components/storefront/Hero'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'קניון EXPRESS — מסדרים לך בילוי',
  description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
}

export default async function HomePage() {
  const supabase = await createClient()

  const { data: rawProducts } = await supabase
    .from('products')
    .select('id, slug, name_he, kenyon_price, full_price, images, stock_quantity')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(8)

  const products = (rawProducts ?? []) as (Product & { full_price?: number | null })[]

  return (
    <div className="space-y-0 -mx-4 -mt-4">
      {/* 1. Hero row — dir="ltr" forces sidebar-left visual order (per design spec) */}
      <div dir="ltr" className="flex items-stretch border-b border-gray-200">
        <CategorySidebar />
        <Hero />
      </div>

      {/* 2. Category ring strip */}
      <div className="bg-white border-b border-gray-200 px-4">
        <CategoryRing />
      </div>

      {/* 3. Deals section */}
      <div className="px-4 py-4">
        <DealsSection products={products} />
      </div>

      {/* 4. Feature bar */}
      <FeatureBar />
    </div>
  )
}
