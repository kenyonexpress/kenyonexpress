'use client'

import ImageUploader from '@/components/admin/ImageUploader'
import { type ProductFormState, upsertProduct } from '@/server/actions/admin/products'
import type { Category, Product, Vendor } from '@/types/database'
import { useActionState, useState } from 'react'

interface Props {
  product?: Product
  vendors: Pick<Vendor, 'id' | 'business_name'>[]
  categories: Pick<Category, 'id' | 'name_he'>[]
}

const INITIAL_STATE: ProductFormState = null

export default function ProductForm({ product, vendors, categories }: Props) {
  const [state, action, pending] = useActionState(upsertProduct, INITIAL_STATE)
  const [images, setImages] = useState<string[]>(
    Array.isArray(product?.images) ? (product.images as string[]) : [],
  )

  const error = state && 'error' in state ? state.error : null

  return (
    <form action={action} className="space-y-5 bg-white border border-gray-200 rounded-xl p-6">
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="images" value={JSON.stringify(images)} />

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}

      {/* Name */}
      <div>
        <label htmlFor="name_he" className="block text-sm font-medium text-gray-700 mb-1">
          שם מוצר *
        </label>
        <input
          id="name_he"
          name="name_he"
          defaultValue={product?.name_he}
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Slug */}
      <div>
        <label htmlFor="prod-slug" className="block text-sm font-medium text-gray-700 mb-1">
          קישור (slug) *
          <span className="text-gray-400 font-normal mr-1">— אותיות לועזיות ומקפים בלבד</span>
        </label>
        <input
          id="prod-slug"
          name="slug"
          defaultValue={product?.slug}
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
          defaultValue={product?.description_he ?? ''}
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
        />
      </div>

      {/* Vendor + Category */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="vendor_id" className="block text-sm font-medium text-gray-700 mb-1">
            ספק *
          </label>
          <select
            id="vendor_id"
            name="vendor_id"
            defaultValue={product?.vendor_id ?? ''}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">בחרו ספק</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.business_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="category_id" className="block text-sm font-medium text-gray-700 mb-1">
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
      </div>

      {/* Type + Status */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="prod-type" className="block text-sm font-medium text-gray-700 mb-1">
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
          <label htmlFor="prod-status" className="block text-sm font-medium text-gray-700 mb-1">
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
          <label htmlFor="base_price" className="block text-sm font-medium text-gray-700 mb-1">
            מחיר בסיס (₪) *
          </label>
          <input
            id="base_price"
            name="base_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product?.base_price}
            required
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="sale_price" className="block text-sm font-medium text-gray-700 mb-1">
            מחיר מבצע (₪)
          </label>
          <input
            id="sale_price"
            name="sale_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={product?.sale_price ?? ''}
            dir="ltr"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="stock_quantity" className="block text-sm font-medium text-gray-700 mb-1">
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

      {/* Images */}
      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">תמונות</p>
        <ImageUploader
          bucket="product-images"
          folder="products"
          value={images}
          onChange={setImages}
          maxFiles={8}
        />
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand hover:bg-brand-dark disabled:opacity-60 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors"
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
