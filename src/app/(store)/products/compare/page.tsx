import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CompareTable from '@/components/compare/CompareTable'
import type { Metadata } from 'next'
import '@/styles/category-page.css'

const TITLE = 'השוואת מוצרים'

export const metadata: Metadata = {
  title: TITLE,
  description: 'השוואה בין המוצרים שבחרתם בקניון אקספרס: מחיר, חיסכון, זמינות ותוקף.',
  // The table is built from one browser's own picks. There is nothing here
  // for a crawler to index, and every visitor's copy is different.
  robots: { index: false, follow: true },
}

/**
 * A static frame around a table that only exists in the browser.
 *
 * The picks live in `localStorage` (`lib/compare/storage.ts`), so the server
 * renders the heading and the table fills itself in after mount. Nothing on
 * this page reads a request, which keeps it prerendered like the cart.
 *
 * AT /products/compare, NOT /compare. `/compare` was a page on the old
 * WordPress site and `data/legacy/redirect-map.json` answers it 410 Gone. A
 * new page there would be shadowed by that answer on production, and
 * resurrecting a URL the site has told crawlers is gone is its own problem.
 */
export default function ComparePage() {
  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb items={[defaultHomeCrumb(), { label: TITLE }]} />
        <header className="category-page__header">
          <h1 className="category-page__title">{TITLE}</h1>
        </header>
        <CompareTable />
      </div>
    </div>
  )
}
