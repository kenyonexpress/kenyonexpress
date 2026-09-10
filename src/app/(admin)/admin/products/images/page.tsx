import BulkImageMatchClient from '@/components/admin/BulkImageMatchClient'
import { requireSection } from '@/lib/admin/rbac'
import Link from 'next/link'

export const metadata = { title: 'העלאת תמונות קבוצתית' }

/**
 * Bulk image upload with filename-to-product matching (SECTIONS 30).
 *
 * `requireSection('catalog', 'write')` and not the admin tier: attaching a
 * photograph to a product is catalogue content, which is exactly what
 * `content_uploader` exists to do. It touches no price and no status, so the
 * argument that raised `rollbackLastBulkOperation` to admin does not apply
 * here.
 */
export default async function BulkProductImagesPage() {
  await requireSection('catalog', 'write')

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-heading">העלאת תמונות קבוצתית</h1>
          <p className="mt-1 text-sm text-black/50">
            העלאת תיקיית תמונות בבת אחת, כשכל קובץ משויך למוצר לפי שמו.
          </p>
        </div>
        <Link
          href="/admin/products"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-black/[0.04]"
        >
          חזרה למוצרים
        </Link>
      </header>

      {/*
        THE SECTION ASKS FOR SKU MATCHING. ONE PRODUCT HAS A SKU.

        Measured against production on 2026-09-10: 80 products, one with a
        non-empty `sku`, and 43 of the 44 active ones with none. Matching on SKU
        alone would have shipped a screen that can attach an image to exactly
        one row in the live catalogue. So the SKU is tried first, as asked, and
        the slug is the fallback - every product has one, it is unique among
        active products, and it is the string an operator can read off the URL
        they are already looking at.
      */}
      <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
        השיוך מנסה קודם את המק"ט של המוצר, ואם אין - את ה-slug. כרגע כמעט לכל המוצרים בקטלוג אין
        מק"ט, ולכן ברוב המקרים שם הקובץ צריך להיות ה-slug.
      </p>

      <BulkImageMatchClient />
    </div>
  )
}
