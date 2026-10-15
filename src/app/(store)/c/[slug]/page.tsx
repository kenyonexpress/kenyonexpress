import CategoryBreadcrumb from '@/components/category/CategoryBreadcrumb'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import { CITIES, cityBySlugName } from '@/data/cities'
import { getCityProducts } from '@/lib/city-page'
import { alternatesFor } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import '@/styles/category-page.css'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return CITIES.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const city = cityBySlugName(slug)
  if (!city) return {}
  return {
    title: `דילים ב${city.name}`,
    description: `קופונים ומבצעים מבתי עסק ב${city.name}. כל שובר נסרק פעם אחת, והתוקף מוצג לפני הרכישה.`,
    alternates: alternatesFor(`/c/${city.slug}`),
  }
}

export default async function CityDealsPage({ params }: Props) {
  const { slug } = await params
  const city = cityBySlugName(slug)
  if (!city) notFound()

  const products = await getCityProducts(city.name)

  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb
          items={[{ label: 'בית', href: '/' }, { label: 'ערים', href: '/c' }, { label: city.name }]}
        />
        <header className="category-page__header">
          <h1 className="category-page__title">דילים ב{city.name}</h1>
        </header>
        {products.length === 0 ? (
          <div className="category-page__empty">
            <p>עדיין אין דילים ב{city.name}.</p>
          </div>
        ) : (
          <ul className="category-products">
            {products.map((product) => (
              <li key={product.id} className="category-products__item">
                <CategoryProductCard product={product as unknown as CategoryProduct} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
