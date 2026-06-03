import ProductCard, { type Product } from '@/components/ProductCard'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('name_he, description_he')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  return {
    title: data?.name_he ?? 'קטגוריה',
    description: data?.description_he ?? undefined,
  }
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: category } = await supabase
    .from('categories')
    .select('id, slug, name_he, description_he, icon_url')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!category) notFound()

  const { data: products } = await supabase
    .from('products')
    .select('id, slug, name_he, kenyon_price, images, stock_quantity')
    .eq('category_id', category.id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const items = (products ?? []) as Product[]

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 flex items-center gap-1" aria-label="נתיב ניווט">
        <Link href="/" className="hover:text-brand">
          בית
        </Link>
        <span>/</span>
        <Link href="/categories" className="hover:text-brand">
          קטגוריות
        </Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{category.name_he}</span>
      </nav>

      {/* Category header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
        {category.icon_url ? (
          <img
            src={category.icon_url}
            alt=""
            aria-hidden="true"
            className="w-14 h-14 object-contain"
          />
        ) : (
          <span className="text-5xl" aria-hidden="true">
            🏷️
          </span>
        )}
        <div>
          <h1 className="text-2xl font-black text-gray-900">{category.name_he}</h1>
          {category.description_he && (
            <p className="text-sm text-gray-500 mt-1">{category.description_he}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{items.length} מוצרים</p>
        </div>
      </div>

      {/* Product grid */}
      {items.length > 0 ? (
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <p className="text-5xl mb-3">📦</p>
          <p className="font-semibold text-gray-600">אין מוצרים בקטגוריה זו עדיין</p>
          <p className="text-sm mt-1">בקרוב יתווספו מוצרים חדשים</p>
        </div>
      )}
    </div>
  )
}
