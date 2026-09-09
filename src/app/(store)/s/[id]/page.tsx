import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard from '@/components/category/CategoryProductCard'
import Pagination from '@/components/category/Pagination'
import {
  SUPPLIER_PAGE_SIZE,
  isSupplierId,
  listSupplierIdsForPrerender,
  loadSupplierStorefrontCached,
  loadSupplierStorefrontProductsCached,
} from '@/lib/supplier-storefront'
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

  return (
    <div className="category-page mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 space-y-2">
        <p className="text-sm text-black/50">ספק</p>
        <h1 className="text-2xl font-bold text-heading">{supplier.name}</h1>
        {supplier.city ? <p className="text-sm text-black/60">{supplier.city}</p> : null}
        {supplier.address ? <p className="text-sm text-black/60">{supplier.address}</p> : null}
      </header>

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
          {items.map((product) => (
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
