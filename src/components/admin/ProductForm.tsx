'use client'

import ImageUploader from '@/components/admin/ImageUploader'
import { slugify } from '@/lib/utils/slugify'
import { type ProductFormState, upsertProduct } from '@/server/actions/admin/products'
import type { Category, Product, ProductVariant } from '@/types/database'
import { Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'

interface VariantDraft {
  _key: string
  id?: string
  name_he: string
  sku: string
  price: string
  price_modifier: string
  stock_quantity: string
  is_active: boolean
}

interface Props {
  product?: Product
  variants?: ProductVariant[]
  categories: Pick<Category, 'id' | 'name_he'>[]
}

const INITIAL_STATE: ProductFormState = null

function variantToFormData(v: ProductVariant): VariantDraft {
  return {
    _key: v.id,
    id: v.id,
    name_he: v.name_he ?? '',
    sku: v.sku ?? '',
    price: v.price != null ? String(v.price) : '',
    price_modifier: String(v.price_modifier),
    stock_quantity: v.stock_quantity != null ? String(v.stock_quantity) : '',
    is_active: v.is_active,
  }
}

export default function ProductForm({ product, variants: initVariants = [], categories }: Props) {
  const [state, action, pending] = useActionState(upsertProduct, INITIAL_STATE)
  const [images, setImages] = useState<string[]>(
    Array.isArray(product?.images) ? (product.images as string[]) : [],
  )
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>(
    initVariants.filter((v) => !v.deleted_at).map(variantToFormData),
  )
  const [nameHe, setNameHe] = useState(product?.name_he ?? '')
  const [slugVal, setSlugVal] = useState(product?.slug ?? '')
  const [platformPercent, setPlatformPercent] = useState(
    product?.platform_percent != null ? String(product.platform_percent) : '',
  )

  const error = state && 'error' in state ? state.error : null

  const isCouponProduct = product?.type === 'coupon' || product?.is_coupon_enabled === true

  /**
   * The supplier's share is shown, never stored. Keeping a second column that
   * has to stay at 100 minus this one invites a row where the two disagree and
   * the money owed has no single answer. Deriving it costs nothing and cannot
   * drift.
   *
   * What it applies to differs by type: a physical line splits the full charge,
   * a coupon splits only the amount paid on site, since the balance is collected
   * in cash at the business and never reaches us.
   */
  const supplierSplitLabel = (() => {
    const value = Number(platformPercent)
    if (platformPercent === '' || Number.isNaN(value) || value < 0 || value > 100) {
      return 'לספק: הזינו עמלה בין 0 ל-100'
    }
    return `לספק: ${Number((100 - value).toFixed(2))}%`
  })()

  function handleNameHe(val: string) {
    setNameHe(val)
    if (!product) setSlugVal(slugify(val))
  }

  function addVariant() {
    setVariantDrafts((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        name_he: '',
        sku: '',
        price: '',
        price_modifier: '0',
        stock_quantity: '',
        is_active: true,
      },
    ])
  }

  function removeVariant(idx: number) {
    setVariantDrafts((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateVariant(idx: number, field: keyof VariantDraft, value: string | boolean) {
    setVariantDrafts((prev) => prev.map((v, i) => (i === idx ? { ...v, [field]: value } : v)))
  }

  const variantsJson = JSON.stringify(
    variantDrafts.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      name_he: v.name_he,
      sku: v.sku,
      price: v.price !== '' ? Number(v.price) : null,
      price_modifier: Number(v.price_modifier) || 0,
      stock_quantity: v.stock_quantity !== '' ? Number(v.stock_quantity) : null,
      is_active: v.is_active,
    })),
  )

  return (
    <form action={action} className="space-y-6 bg-white border border-gray-200 rounded-xl p-6">
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="images" value={JSON.stringify(images)} />
      <input type="hidden" name="variants" value={variantsJson} />

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}

      {/* Names */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="name_he" className="block text-xs font-medium text-gray-700 mb-1">
            שם בעברית *
          </label>
          <input
            id="name_he"
            name="name_he"
            value={nameHe}
            onChange={(e) => handleNameHe(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="name_en" className="block text-xs font-medium text-gray-700 mb-1">
            שם באנגלית
          </label>
          <input
            id="name_en"
            name="name_en"
            defaultValue={product?.name_en ?? ''}
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* Slug + SKU */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="prod-slug" className="block text-xs font-medium text-gray-700 mb-1">
            Slug *
          </label>
          <input
            id="prod-slug"
            name="slug"
            value={slugVal}
            onChange={(e) => setSlugVal(e.target.value)}
            required
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="prod-sku" className="block text-xs font-medium text-gray-700 mb-1">
            SKU
          </label>
          <input
            id="prod-sku"
            name="sku"
            defaultValue={product?.sku ?? ''}
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description_he" className="block text-xs font-medium text-gray-700 mb-1">
          תיאור
        </label>
        <textarea
          id="description_he"
          name="description_he"
          defaultValue={product?.description_he ?? ''}
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
        />
      </div>

      {/* Category */}
      <div>
        <label htmlFor="category_id" className="block text-xs font-medium text-gray-700 mb-1">
          קטגוריה
        </label>
        <select
          id="category_id"
          name="category_id"
          defaultValue={product?.category_id ?? ''}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">ללא קטגוריה</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_he}
            </option>
          ))}
        </select>
      </div>

      {/* Type + Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="prod-type" className="block text-xs font-medium text-gray-700 mb-1">
            סוג *
          </label>
          <select
            id="prod-type"
            name="type"
            defaultValue={product?.type ?? 'physical'}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="physical">פיזי</option>
            <option value="coupon">קופון</option>
          </select>
        </div>
        <div>
          <label htmlFor="prod-status" className="block text-xs font-medium text-gray-700 mb-1">
            סטטוס *
          </label>
          <select
            id="prod-status"
            name="status"
            defaultValue={product?.status ?? 'draft'}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="draft">טיוטה</option>
            <option value="active">פעיל</option>
            <option value="paused">מושהה</option>
            <option value="archived">ארכיון</option>
          </select>
        </div>
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="kenyon_price" className="block text-xs font-medium text-gray-700 mb-1">
            מחיר בקניון (₪) *
          </label>
          <input
            id="kenyon_price"
            name="kenyon_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product?.kenyon_price ?? ''}
            required
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="full_price" className="block text-xs font-medium text-gray-700 mb-1">
            מחיר מלא (₪)
          </label>
          <input
            id="full_price"
            name="full_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product?.full_price ?? ''}
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label
            htmlFor="platform_percent"
            className="block text-xs font-medium text-gray-700 mb-1"
          >
            עמלת פלטפורמה (%) *
          </label>
          <input
            id="platform_percent"
            name="platform_percent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={platformPercent}
            onChange={(e) => setPlatformPercent(e.target.value)}
            required
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <p className="mt-1 text-xs text-gray-500">
            {supplierSplitLabel}
            {isCouponProduct ? ' · נגזר מהסכום ששולם באתר' : ' · נגזר מהמחיר המלא'}
          </p>
        </div>
        <div>
          <label htmlFor="stock_quantity" className="block text-xs font-medium text-gray-700 mb-1">
            מלאי
          </label>
          <input
            id="stock_quantity"
            name="stock_quantity"
            type="number"
            min="0"
            step="1"
            defaultValue={product?.stock_quantity ?? ''}
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* Featured + Coupon toggles */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <input
            id="is_featured"
            name="is_featured"
            type="checkbox"
            value="true"
            defaultChecked={product?.is_featured ?? false}
            className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
          />
          <label htmlFor="is_featured" className="text-sm font-medium text-gray-700">
            מוצר מומלץ
          </label>
        </div>
        <div className="flex items-center gap-3">
          <input
            id="is_coupon_enabled"
            name="is_coupon_enabled"
            type="checkbox"
            value="true"
            defaultChecked={product?.is_coupon_enabled ?? false}
            className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
          />
          <label htmlFor="is_coupon_enabled" className="text-sm font-medium text-gray-700">
            ניתן לרכישה כקופון
          </label>
          <span className="text-xs text-gray-400">
            (הלקוח משלם באתר את מחיר הקופון שתגדיר, והיתרה נגבית בבית העסק)
          </span>
        </div>
      </div>

      {/* Marketing content (048) */}
      <div className="border-t border-gray-100 pt-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700">תוכן שיווקי</p>
        <div>
          <label
            htmlFor="short_description_he"
            className="block text-xs font-medium text-gray-700 mb-1"
          >
            תיאור קצר (עד 300 תווים)
          </label>
          <textarea
            id="short_description_he"
            name="short_description_he"
            defaultValue={product?.short_description_he ?? ''}
            rows={2}
            maxLength={300}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
        </div>
        <div>
          <label htmlFor="highlights" className="block text-xs font-medium text-gray-700 mb-1">
            נקודות מכירה (שורה לכל נקודה)
          </label>
          <textarea
            id="highlights"
            name="highlights"
            defaultValue={
              Array.isArray(product?.highlights) ? (product.highlights as string[]).join('\n') : ''
            }
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="brand" className="block text-xs font-medium text-gray-700 mb-1">
              מותג
            </label>
            <input
              id="brand"
              name="brand"
              defaultValue={product?.brand ?? ''}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="video_url" className="block text-xs font-medium text-gray-700 mb-1">
              קישור וידאו
            </label>
            <input
              id="video_url"
              name="video_url"
              type="url"
              defaultValue={product?.video_url ?? ''}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="barcode" className="block text-xs font-medium text-gray-700 mb-1">
              ברקוד
            </label>
            <input
              id="barcode"
              name="barcode"
              defaultValue={product?.barcode ?? ''}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      </div>

      {/* Coupon details (048) */}
      <div className="border-t border-gray-100 pt-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700">פרטי קופון</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="coupon_terms_he"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              תנאי הקופון
            </label>
            <textarea
              id="coupon_terms_he"
              name="coupon_terms_he"
              defaultValue={product?.coupon_terms_he ?? ''}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>
          <div>
            <label
              htmlFor="redemption_instructions_he"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              הוראות מימוש בעסק
            </label>
            <textarea
              id="redemption_instructions_he"
              name="redemption_instructions_he"
              defaultValue={product?.redemption_instructions_he ?? ''}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="min_purchase_ils"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              מינימום רכישה בעסק (₪)
            </label>
            <input
              id="min_purchase_ils"
              name="min_purchase_ils"
              type="number"
              min="0"
              step="0.01"
              defaultValue={product?.min_purchase_ils ?? ''}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      </div>

      {/* Inventory + logistics (048) */}
      <div className="border-t border-gray-100 pt-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700">מלאי ולוגיסטיקה</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="low_stock_threshold"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              סף מלאי נמוך
            </label>
            <input
              id="low_stock_threshold"
              name="low_stock_threshold"
              type="number"
              min="0"
              step="1"
              defaultValue={product?.low_stock_threshold ?? 5}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="max_per_order" className="block text-xs font-medium text-gray-700 mb-1">
              מקסימום ליחידת הזמנה
            </label>
            <input
              id="max_per_order"
              name="max_per_order"
              type="number"
              min="1"
              step="1"
              defaultValue={product?.max_per_order ?? ''}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="condition" className="block text-xs font-medium text-gray-700 mb-1">
              מצב המוצר
            </label>
            <select
              id="condition"
              name="condition"
              defaultValue={product?.condition ?? ''}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">לא צוין</option>
              <option value="new">חדש</option>
              <option value="refurbished">מחודש</option>
              <option value="used">משומש</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            id="requires_shipping"
            name="requires_shipping"
            type="checkbox"
            value="true"
            defaultChecked={product?.requires_shipping ?? true}
            className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand"
          />
          <label htmlFor="requires_shipping" className="text-sm font-medium text-gray-700">
            דורש משלוח פיזי
          </label>
        </div>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <label htmlFor="weight_grams" className="block text-xs font-medium text-gray-700 mb-1">
              משקל (גרם)
            </label>
            <input
              id="weight_grams"
              name="weight_grams"
              type="number"
              min="0"
              step="1"
              defaultValue={product?.weight_grams ?? ''}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="length_cm" className="block text-xs font-medium text-gray-700 mb-1">
              אורך (ס"מ)
            </label>
            <input
              id="length_cm"
              name="length_cm"
              type="number"
              min="0"
              step="0.1"
              defaultValue={product?.length_cm ?? ''}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="width_cm" className="block text-xs font-medium text-gray-700 mb-1">
              רוחב (ס"מ)
            </label>
            <input
              id="width_cm"
              name="width_cm"
              type="number"
              min="0"
              step="0.1"
              defaultValue={product?.width_cm ?? ''}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="height_cm" className="block text-xs font-medium text-gray-700 mb-1">
              גובה (ס"מ)
            </label>
            <input
              id="height_cm"
              name="height_cm"
              type="number"
              min="0"
              step="0.1"
              defaultValue={product?.height_cm ?? ''}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label
              htmlFor="warranty_months"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              אחריות (חודשים)
            </label>
            <input
              id="warranty_months"
              name="warranty_months"
              type="number"
              min="0"
              step="1"
              defaultValue={product?.warranty_months ?? ''}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      </div>

      {/* SEO (048) */}
      <div className="border-t border-gray-100 pt-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700">SEO</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="seo_title" className="block text-xs font-medium text-gray-700 mb-1">
              כותרת SEO (עד 70 תווים)
            </label>
            <input
              id="seo_title"
              name="seo_title"
              maxLength={70}
              defaultValue={product?.seo_title ?? ''}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="seo_keywords" className="block text-xs font-medium text-gray-700 mb-1">
              מילות מפתח (מופרדות בפסיק)
            </label>
            <input
              id="seo_keywords"
              name="seo_keywords"
              defaultValue={product?.seo_keywords ?? ''}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <div>
          <label htmlFor="seo_description" className="block text-xs font-medium text-gray-700 mb-1">
            תיאור SEO (עד 170 תווים)
          </label>
          <textarea
            id="seo_description"
            name="seo_description"
            defaultValue={product?.seo_description ?? ''}
            rows={2}
            maxLength={170}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
        </div>
      </div>

      {/* Variants */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">גרסאות מוצר</p>
          <button
            type="button"
            onClick={addVariant}
            className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
          >
            <Plus size={13} />
            הוסף גרסה
          </button>
        </div>
        {variantDrafts.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500 border-b border-gray-200 text-right">
                  <th className="px-3 py-2 font-medium">שם</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">מחיר (₪)</th>
                  <th className="px-3 py-2 font-medium">מלאי</th>
                  <th className="px-3 py-2 font-medium">פעיל</th>
                  <th className="px-3 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {variantDrafts.map((v, idx) => (
                  <tr key={v._key}>
                    <td className="px-3 py-2">
                      <input
                        value={v.name_he}
                        onChange={(e) => updateVariant(idx, 'name_he', e.target.value)}
                        placeholder="צבע, גודל..."
                        className="w-full border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={v.sku}
                        onChange={(e) => updateVariant(idx, 'sku', e.target.value)}
                        dir="ltr"
                        className="w-full border border-gray-200 rounded px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={v.price}
                        onChange={(e) => updateVariant(idx, 'price', e.target.value)}
                        dir="ltr"
                        placeholder="כבסיס"
                        className="w-24 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={v.stock_quantity}
                        onChange={(e) => updateVariant(idx, 'stock_quantity', e.target.value)}
                        dir="ltr"
                        className="w-20 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={v.is_active}
                        onChange={(e) => updateVariant(idx, 'is_active', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeVariant(idx)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Images */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">תמונות (עד 8)</p>
        <ImageUploader
          bucket="product-images"
          folder="products"
          value={images}
          onChange={setImages}
          maxFiles={8}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand hover:bg-brand-primary-hover disabled:opacity-60 text-brand-dark font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors"
        >
          {pending ? 'שומר...' : product ? 'עדכון מוצר' : 'יצירת מוצר'}
        </button>
        <a href="/admin/products" className="text-sm text-gray-500 hover:underline">
          ביטול
        </a>
      </div>
    </form>
  )
}
