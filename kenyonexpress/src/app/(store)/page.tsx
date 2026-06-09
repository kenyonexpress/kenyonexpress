import type { Product } from '@/components/ProductCard'
import InfoBar from '@/components/layout/InfoBar'
import CategoryStrip from '@/components/store/CategoryStrip'
import DealsSection from '@/components/store/DealsSection'
import HomeHeroSection from '@/components/store/HomeHeroSection'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'קניון EXPRESS — מסדרים לך בילוי',
  description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
}

export default async function HomePage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select('id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories(name_he, slug)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(24)

  const products: Product[] = (data ?? []).map((p) => {
    const cat = Array.isArray(p.categories) ? (p.categories[0] ?? null) : p.categories
    return {
      id: p.id,
      slug: p.slug,
      name_he: p.name_he,
      kenyon_price: p.kenyon_price,
      full_price: p.full_price,
      images: p.images,
      stock_quantity: p.stock_quantity,
      category: cat,
    }
  })

  return (
    <>
      <HomeHeroSection />
      <CategoryStrip />
      <DealsSection products={products} />
      <InfoBar />
    </>
  )
}
