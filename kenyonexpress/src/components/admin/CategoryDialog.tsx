'use client'

import ImageUploader from '@/components/admin/ImageUploader'
import { slugify } from '@/lib/utils/slugify'
import { type CategoryFormState, upsertCategory } from '@/server/actions/admin/categories'
import type { Category } from '@/types/database'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useActionState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  category?: Category
  parentOptions: Pick<Category, 'id' | 'name_he' | 'parent_id'>[]
}

const MAX_DEPTH = 3

function getDepth(
  id: string | null | undefined,
  options: Pick<Category, 'id' | 'name_he' | 'parent_id'>[],
  depth = 0,
): number {
  if (!id || depth > MAX_DEPTH) return depth
  const parent = options.find((c) => c.id === id)
  return parent ? getDepth(parent.parent_id, options, depth + 1) : depth
}

const INITIAL: CategoryFormState = null

export default function CategoryDialog({ open, onClose, category, parentOptions }: Props) {
  const [state, action, pending] = useActionState(upsertCategory, INITIAL)
  const [iconUrl, setIconUrl] = useState<string[]>(category?.icon_url ? [category.icon_url] : [])
  const [slugVal, setSlugVal] = useState(category?.slug ?? '')
  const [nameHe, setNameHe] = useState(category?.name_he ?? '')
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!category) {
      setIconUrl([])
      setSlugVal('')
      setNameHe('')
    } else {
      setIconUrl(category.icon_url ? [category.icon_url] : [])
      setSlugVal(category.slug)
      setNameHe(category.name_he)
    }
  }, [category])

  useEffect(() => {
    if (state && 'success' in state) {
      onClose()
      formRef.current?.reset()
    }
  }, [state, onClose])

  function handleNameHe(val: string) {
    setNameHe(val)
    if (!category) setSlugVal(slugify(val))
  }

  const allowedParents = parentOptions.filter((p) => {
    if (category && p.id === category.id) return false
    const depth = getDepth(p.id, parentOptions)
    return depth < MAX_DEPTH - 1
  })

  const error = state && 'error' in state ? state.error : null

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content
          dir="rtl"
          className="fixed right-1/2 top-1/2 -translate-y-1/2 translate-x-1/2 z-50 w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-bold text-gray-900">
              {category ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="text-gray-400 hover:text-gray-700 transition-colors">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
          )}

          <form ref={formRef} action={action} className="space-y-4">
            {category && <input type="hidden" name="id" value={category.id} />}
            <input type="hidden" name="icon_url" value={iconUrl[0] ?? ''} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="cd-name-he"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  שם בעברית *
                </label>
                <input
                  id="cd-name-he"
                  name="name_he"
                  value={nameHe}
                  onChange={(e) => handleNameHe(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label
                  htmlFor="cd-name-en"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  שם באנגלית *
                </label>
                <input
                  id="cd-name-en"
                  name="name_en"
                  defaultValue={category?.name_en}
                  required
                  dir="ltr"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </div>

            <div>
              <label htmlFor="cd-slug" className="block text-xs font-medium text-gray-700 mb-1">
                מזהה (slug) *
              </label>
              <input
                id="cd-slug"
                name="slug"
                value={slugVal}
                onChange={(e) => setSlugVal(e.target.value)}
                required
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            <div>
              <label htmlFor="cd-desc" className="block text-xs font-medium text-gray-700 mb-1">
                תיאור
              </label>
              <textarea
                id="cd-desc"
                name="description_he"
                defaultValue={category?.description_he ?? ''}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="cd-parent" className="block text-xs font-medium text-gray-700 mb-1">
                  קטגוריית אב (מקס׳ {MAX_DEPTH} רמות)
                </label>
                <select
                  id="cd-parent"
                  name="parent_id"
                  defaultValue={category?.parent_id ?? ''}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="">ראשית</option>
                  {allowedParents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name_he}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cd-sort" className="block text-xs font-medium text-gray-700 mb-1">
                  סדר מיון
                </label>
                <input
                  id="cd-sort"
                  name="sort_order"
                  type="number"
                  min="0"
                  defaultValue={category?.sort_order ?? 0}
                  dir="ltr"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="cd-active"
                name="is_active"
                type="checkbox"
                value="true"
                defaultChecked={category?.is_active ?? true}
                className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
              />
              <label htmlFor="cd-active" className="text-sm font-medium text-gray-700">
                קטגוריה פעילה
              </label>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-700 mb-2">אייקון</p>
              <ImageUploader
                bucket="category-icons"
                folder="categories"
                value={iconUrl}
                onChange={(urls) => setIconUrl(urls.slice(-1))}
                maxFiles={1}
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={pending}
                className="bg-brand hover:bg-brand-dark disabled:opacity-60 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors"
              >
                {pending ? 'שומר...' : category ? 'עדכון' : 'יצירה'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-gray-500 hover:underline"
              >
                ביטול
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
