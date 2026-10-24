import ChipFilteredCityGrid from '@/components/catalog/ChipFilteredCityGrid'
import DealChips from '@/components/catalog/DealChips'
import CategoryBreadcrumb from '@/components/category/CategoryBreadcrumb'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import { CITIES, cityBySlugName } from '@/data/cities'
import type { ChipFilterable } from '@/lib/catalog/deal-chips'
import { getCategoryBySlug } from '@/lib/category-page'
import { getCityProducts } from '@/lib/city-page'
import { alternatesFor } from '@/lib/seo/alternates'
import { buildBreadcrumbJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { siteUrl } from '@/lib/site-url'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import '@/styles/category-page.css'

type Props = { params: Promise<{ slug: string }> }

/**
 * Combined city and category slugs.
 * Cities are preferred over categories with the same slug.
 */
export function generateStaticParams() {
  return CITIES.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  // Try city first
  const city = cityBySlugName(slug)
  if (city) {
    return {
      title: `דילים ב${city.name}`,
      description: `קופונים ומבצעים מבתי עסק ב${city.name}. כל שובר נסרק פעם אחת, והתוקף מוצג לפני הרכישה.`,
      alternates: alternatesFor(`/c/${city.slug}`),
    }
  }

  // Try category
  const category = await getCategoryBySlug(slug)
  if (category) {
    return {
      title: category.name_he,
      description: category.description_he || `מבצעים בקטגוריית ${category.name_he}`,
      alternates: alternatesFor(`/c/${encodeURIComponent(category.slug)}`),
    }
  }

  return {}
}

export default async function CombinedSlugPage({ params }: Props) {
  const { slug } = await params

  // Try city first
  const city = cityBySlugName(slug)
  if (city) {
    const products = await getCityProducts(city.name)
    const base = siteUrl()
    const breadcrumbLd = buildBreadcrumbJsonLd(
      [
        { name: 'בית', path: '/' },
        { name: 'ערים', path: '/c' },
        { name: city.name, path: `/c/${city.slug}` },
      ],
      base,
    )
    const itemListLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `דילים ב${city.name}`,
      url: `${base}/c/${city.slug}`,
    }

    return (
      <div className="category-page">
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point, and jsonLdScript escapes every angle bracket.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }}
        />
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point, and jsonLdScript escapes every angle bracket.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListLd) }}
        />
        <div className="category-page__inner">
          <CategoryBreadcrumb
            items={[
              { label: 'בית', href: '/' },
              { label: 'ערים', href: '/c' },
              { label: city.name },
            ]}
          />
          <header className="category-page__header">
            <h1 className="category-page__title">דילים ב{city.name}</h1>
          </header>
          <Suspense fallback={null}>
            <DealChips />
          </Suspense>
          <Suspense
            fallback={
              <ul className="category-products">
                {products.map((product) => (
                  <li key={product.id} className="category-products__item">
                    <CategoryProductCard product={product as unknown as CategoryProduct} />
                  </li>
                ))}
              </ul>
            }
          >
            <ChipFilteredCityGrid
              products={products as unknown as (CategoryProduct & ChipFilterable)[]}
              cityName={city.name}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  // Try category
  const category = await getCategoryBySlug(slug)
  if (category) {
    // Redirect to the canonical category route
    redirect(`/category/${encodeURIComponent(category.slug)}`)
  }

  // Neither city nor category
  notFound()
}
