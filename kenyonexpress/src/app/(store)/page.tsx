import type { Product } from '@/components/ProductCard'
import BenefitsBar from '@/components/home/BenefitsBar'
import HeroSection from '@/components/home/HeroSection'
import CategoryProductSection from '@/components/store/CategoryProductSection'
import CategoryStrip from '@/components/store/CategoryStrip'
import DealsSection from '@/components/store/DealsSection'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'קניון EXPRESS — מסדרים לך בילוי',
  description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
}

const CATEGORY_SECTIONS = [
  { slug: 'restaurants-cafes', title: 'מסעדות ובתי קפה' },
  { slug: 'beauty-health', title: 'יופי בריאות וטיפוח' },
  { slug: 'vacation', title: 'צימרים ובתי מלון' },
  { slug: 'baby-kids', title: 'תינוקות וילדים' },
  { slug: 'phones-computers', title: 'טלפונים מחשבים ואביזרים' },
] as const

function groupByCategorySlug(products: Product[]): Map<string, Product[]> {
  const map = new Map<string, Product[]>()
  for (const product of products) {
    const slug = product.category?.slug
    if (!slug) continue
    const list = map.get(slug) ?? []
    list.push(product)
    map.set(slug, list)
  }
  return map
}

export default async function HomePage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select('id, slug, name_he, kenyon_price, full_price, images, stock_quantity, categories(name_he, slug)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(48)

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

  const byCategory = groupByCategorySlug(products)
  const dealProducts = products.slice(0, 8)

  return (
    <>
      <HeroSection />
      <BenefitsBar />
      <CategoryStrip />
      <DealsSection products={dealProducts} />
      {CATEGORY_SECTIONS.map(({ slug, title }) => (
        <CategoryProductSection
          key={slug}
          title={title}
          categoryHref={`/category/${slug}`}
          products={byCategory.get(slug) ?? []}
        />
      ))}
    </>
  )
}
