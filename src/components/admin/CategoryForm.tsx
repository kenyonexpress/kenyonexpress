'use client'

import CategoryGuideFields from '@/components/admin/CategoryGuideFields'
import ImageUploader from '@/components/admin/ImageUploader'
import type { AdminCategoryGuide } from '@/lib/category-guides/admin-read'
import { type CategoryFormState, upsertCategory } from '@/server/actions/admin/categories'
import type { Category } from '@/types/database'
import Link from 'next/link'
import { useActionState, useState } from 'react'

interface Props {
  category?: Category
  parentOptions: Pick<Category, 'id' | 'name_he'>[]
  /**
   * The buyer guide (STEP 65), loaded by the page for the category being
   * edited. Absent when the list page's dialog picked a category
   * client-side, in which case the form points at the full edit page.
   */
  guide?: AdminCategoryGuide
}

const INITIAL_STATE: CategoryFormState = null

export default function CategoryForm({ category, parentOptions, guide }: Props) {
  const [state, action, pending] = useActionState(upsertCategory, INITIAL_STATE)
  const [iconUrl, setIconUrl] = useState<string[]>(category?.icon_url ? [category.icon_url] : [])

  const error = state && 'error' in state ? state.error : null

  return (
    <form action={action} className="space-y-5 bg-white border border-gray-200 rounded-xl p-6">
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="icon_url" value={iconUrl[0] ?? ''} />

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}

      {/* Name Hebrew */}
      <div>
        <label htmlFor="name_he" className="block text-sm font-medium text-gray-700 mb-1">
          שם בעברית *
        </label>
        <input
          id="name_he"
          name="name_he"
          defaultValue={category?.name_he}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Name English */}
      <div>
        <label htmlFor="name_en" className="block text-sm font-medium text-gray-700 mb-1">
          שם באנגלית *
        </label>
        <input
          id="name_en"
          name="name_en"
          defaultValue={category?.name_en}
          required
          dir="ltr"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Slug */}
      <div>
        <label htmlFor="cat-slug" className="block text-sm font-medium text-gray-700 mb-1">
          מזהה (slug) *
        </label>
        <input
          id="cat-slug"
          name="slug"
          defaultValue={category?.slug}
          required
          dir="ltr"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description_he" className="block text-sm font-medium text-gray-700 mb-1">
          תיאור
        </label>
        <textarea
          id="description_he"
          name="description_he"
          defaultValue={category?.description_he ?? ''}
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
        />
      </div>

      {/* Parent + Sort */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="parent_id" className="block text-sm font-medium text-gray-700 mb-1">
            קטגוריית אב
          </label>
          <select
            id="parent_id"
            name="parent_id"
            defaultValue={category?.parent_id ?? ''}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">ראשית (ללא אב)</option>
            {parentOptions
              .filter((p) => p.id !== category?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_he}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="sort_order" className="block text-sm font-medium text-gray-700 mb-1">
            סדר מיון
          </label>
          <input
            id="sort_order"
            name="sort_order"
            type="number"
            min="0"
            defaultValue={category?.sort_order ?? 0}
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* Active */}
      <div className="flex items-center gap-3">
        <input
          id="is_active"
          name="is_active"
          type="checkbox"
          value="true"
          defaultChecked={category?.is_active ?? true}
          className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
        />
        <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
          קטגוריה פעילה
        </label>
      </div>

      {/* Icon */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">אייקון קטגוריה</p>
        <ImageUploader
          bucket="category-icons"
          folder="categories"
          value={iconUrl}
          onChange={(urls) => setIconUrl(urls.slice(-1))}
          maxFiles={1}
          altKind="category"
          // Uncontrolled name field; see VendorForm.
          altSubject={category?.name_he ?? null}
        />
      </div>

      {/* Buyer guide (STEP 65) */}
      {guide ? (
        <CategoryGuideFields
          key={category?.id ?? 'new'}
          guide={guide}
          categoryName={category?.name_he ?? null}
        />
      ) : category ? (
        <p className="text-xs text-gray-500 border-t border-gray-200 pt-4">
          מדריך הקנייה של הקטגוריה נערך{' '}
          <Link href={`/admin/categories/${category.id}`} className="underline">
            בעמוד העריכה המלא
          </Link>
          .
        </p>
      ) : null}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand hover:bg-brand-primary-hover disabled:opacity-60 text-brand-dark font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors"
        >
          {pending ? 'שומר...' : category ? 'עדכון קטגוריה' : 'יצירת קטגוריה'}
        </button>
        <a href="/admin/categories" className="text-sm text-gray-500 hover:underline">
          ביטול
        </a>
      </div>
    </form>
  )
}
