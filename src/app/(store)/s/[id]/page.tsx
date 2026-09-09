import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard from '@/components/category/CategoryProductCard'
import Pagination from '@/components/category/Pagination'
import SupplierStorefrontHeader from '@/components/storefront/SupplierStorefrontHeader'
import { buildSupplierJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { siteUrl } from '@/lib/site-url'
import {
  SUPPLIER_PAGE_SIZE,
  isSupplierId,
  listSupplierIdsForPrerender,
  loadSupplierStorefrontCached,
  loadSupplierStorefrontProductsCached,
} from '@/lib/supplier-storefront'
import { attachRatings, getSupplierRating } from '@/server/queries/reviews'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import '@/styles/category-page.css'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string | string[] }>
}

function parsePage(raw: string | string[] | undefined): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : 1
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export async function generateStaticParams() {
  const ids = await listSupplierIdsForPrerender()
  return ids.map((id) => ({ id }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  if (!isSupplierId(id)) {
    return { title: 'ספק לא נמצא', robots: { index: false, follow: true } }
  }
  const supplier = await loadSupplierStorefrontCached(id)
  if (!supplier) {
    return {
      title: 'ספק לא נמצא',
      description: 'הספק לא נמצא או שאינו פעיל בקניון אקספרס.',
      robots: { index: false, follow: true },
    }
  }
  const title = supplier.name
  const city = supplier.city ? ` ב${supplier.city}` : ''
  const description = `${supplier.name}${city} בקניון אקספרס. קופונים, מבצעים ומוצרים.`
  const path = `/s/${id}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, locale: 'he_IL', type: 'website' },
  }
}

export default async function SupplierStorefrontPage({ params, searchParams }: Props) {
  const { id } = await params
  if (!isSupplierId(id)) notFound()

  const supplier = await loadSupplierStorefrontCached(id)
  if (!supplier) notFound()

  /**
   * The supplier as a business search engines can place.
   *
   * `LocalBusiness`, not `Organization`: these are spas, restaurants and cabins
   * with an address a customer drives to. This page had NO structured data at
   * all, while every product page has had a `Product` node with an
   * `aggregateRating` since 154 -- so the business behind the products was
   * invisible to a map result.
   *
   * The rating folds every approved review across this supplier's products,
   * which is the honest aggregate for a BUSINESS: a shopper judging a spa does
   * not care which of its three treatments a review was left on. It is omitted
   * entirely below one review, and `reviews` holds 0 rows in production, so
   * today it is always omitted.
   */
  const supplierRating = await getSupplierRating(id)
  const jsonLd = buildSupplierJsonLd({
    name: supplier.name,
    url: `/s/${id}`,
    city: supplier.city ?? null,
    address: supplier.address ?? null,
    phone: supplier.contactPhone ?? null,
    logoUrl: supplier.logoUrl ?? null,
    description: null,
    rating: supplierRating,
    siteUrl: siteUrl(),
  })

  return (
    <div className="category-page mx-auto max-w-6xl px-4 py-8">
      {/* eslint-disable-next-line react/no-danger -- jsonLdScript, allowlisted */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: jsonLdScript is the allowlisted serialiser
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <SupplierStorefrontHeader supplier={supplier} />

      <Suspense fallback={<CategoryGridSkeleton count={SUPPLIER_PAGE_SIZE} />}>
        <SupplierProductGrid id={id} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function SupplierProductGrid({
  id,
  searchParams,
}: {
  id: string
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const raw = await searchParams
  const page = parsePage(raw.page)
  const { items, total } = await loadSupplierStorefrontProductsCached(id, page)
  const totalPages = Math.max(1, Math.ceil(total / SUPPLIER_PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const from = total === 0 ? 0 : (current - 1) * SUPPLIER_PAGE_SIZE + 1
  const to = Math.min(current * SUPPLIER_PAGE_SIZE, total)

  // The star row on each card. One query for the whole page of results, under
  // the same CATALOGUE_TAG the grid is cached by, so an approval and the stars
  // it produces invalidate together.
  const rated = await attachRatings(items)

  return (
    <>
      <p className="mb-4 text-sm text-black/60">
        {total === 0
          ? 'אין מוצרים פעילים לספק הזה כרגע.'
          : total === 1
            ? 'מציג תוצאה יחידה'
            : `מציג ${from}–${to} מתוך ${total} תוצאות`}
      </p>

      {items.length > 0 ? (
        <ul className="category-grid grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {rated.map((product) => (
            <li key={product.id}>
              <CategoryProductCard product={product} />
            </li>
          ))}
        </ul>
      ) : null}

      {totalPages > 1 ? (
        <Pagination
          pathname={`/s/${id}`}
          params={{}}
          currentPage={current}
          totalPages={totalPages}
        />
      ) : null}
    </>
  )
}
