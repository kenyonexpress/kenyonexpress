import { getAllCategories } from '@/lib/category-page'
import { alternatesFor } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * The category index, which the bottom navigation on phones has pointed at
 * since MobileNavBar was written ("קטגוריות" -> /category) without a route
 * ever answering it: the tab was a 404 on every phone, and home.spec recorded
 * it as such from run 1. Live has no such page either (its menu opens a
 * drawer), so this is the smallest honest target: every active category, in
 * menu order, one link each. The data read is the cached catalogue read the
 * category archive already uses, so the page prerenders.
 */
export const metadata: Metadata = {
  title: 'קטגוריות',
  description: 'כל הקטגוריות בקניון Express: מסעדות, יופי ובריאות, טלפונים, נופש, אופנה ועוד.',
  alternates: alternatesFor('/category'),
}

export default async function CategoryIndexPage() {
  const categories = await getAllCategories()
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-heading">כל הקטגוריות</h1>
      {categories.length === 0 ? (
        <p className="text-sm text-muted">אין קטגוריות פעילות כרגע.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/category/${category.slug}`}
                className="block min-h-11 rounded-lg border border-border px-4 py-3 text-sm font-semibold text-heading transition-colors hover:bg-surface-hover"
              >
                {category.name_he}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
