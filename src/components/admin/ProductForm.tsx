'use client'

import ImageUploader from '@/components/admin/ImageUploader'
import { supplierReadiness } from '@/lib/admin/supplier-form'
import {
  commissionTypeOf,
  completeSplitPair,
  deriveDiscountPercent,
  normalizeIls,
  normalizePercent,
  previewProductMoney,
} from '@/lib/commerce/product-money'
import { slugify } from '@/lib/utils/slugify'
import { type ProductFormState, upsertProduct } from '@/server/actions/admin/products'
import type { Category, Product, ProductVariant } from '@/types/database'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { useActionState, useState } from 'react'

/** Only the identity fields the publish gate and the product page need. */
export interface SupplierOption {
  id: string
  name: string
  contact_phone: string | null
  address: string | null
  logo_url: string | null
  status: string
}

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
  suppliers?: SupplierOption[]
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

export default function ProductForm({
  product,
  variants: initVariants = [],
  categories,
  suppliers = [],
}: Props) {
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
  const [supplierSplit, setSupplierSplit] = useState(
    product?.supplier_split_percent != null ? String(product.supplier_split_percent) : '',
  )
  const [productType, setProductType] = useState<'physical' | 'coupon'>(
    product?.type === 'coupon' ? 'coupon' : 'physical',
  )
  const [kenyonPrice, setKenyonPrice] = useState(
    product?.kenyon_price != null ? String(product.kenyon_price) : '',
  )
  const [couponPrice, setCouponPrice] = useState(
    product?.coupon_price_ils != null ? String(product.coupon_price_ils) : '',
  )
  const [discountPercent, setDiscountPercent] = useState(
    product?.discount_percent != null ? String(product.discount_percent) : '',
  )
  const [supplierId, setSupplierId] = useState(product?.supplier_id ?? '')

  const error = state && 'error' in state ? state.error : null

  const isCouponProduct = productType === 'coupon'
  // Derived from the type, never stored: see commissionTypeOf and
  // docs/CONTRADICTIONS.md C2.
  const commissionType = commissionTypeOf(productType)

  const selectedSupplier = suppliers.find((s) => s.id === supplierId)
  const supplierGap = selectedSupplier
    ? supplierReadiness(selectedSupplier)
    : { ready: false, missing: [], missingLabels: [] }

  /**
   * The consequence of the four knobs, computed with the same pure functions the
   * server action and checkout use. Three separate implementations of this
   * arithmetic is how the page once quoted a customer one number while checkout
   * billed another (see lib/commerce/coupon-offer.ts).
   */
  const preview = (() => {
    const price = normalizeIls(kenyonPrice)
    const split = completeSplitPair({
      platformPercent,
      supplierSplitPercent: supplierSplit,
    })
    if (price === null || !split.ok) return null
    if (isCouponProduct && normalizeIls(couponPrice) === null) return null
    return previewProductMoney({
      type: productType,
      priceIls: price,
      platformPercent: split.pair.platformPercent,
      couponPriceIls: normalizeIls(couponPrice),
      discountPercent: normalizePercent(discountPercent),
    })
  })()

  // On a coupon the badge is derived from the prices, never typed, so the page
  // cannot advertise a saving the checkout will not honour (section 3.2).
  const couponBadgePercent = deriveDiscountPercent(
    normalizeIls(kenyonPrice),
    normalizeIls(couponPrice),
  )

  /** Either half determines the other; 100 minus a number is not a default. */
  function handlePlatformPercent(value: string) {
    setPlatformPercent(value)
    const parsed = normalizePercent(value)
    setSupplierSplit(parsed === null ? '' : String(Math.round((100 - parsed) * 100) / 100))
  }

  function handleSupplierSplit(value: string) {
    setSupplierSplit(value)
    const parsed = normalizePercent(value)
    setPlatformPercent(parsed === null ? '' : String(Math.round((100 - parsed) * 100) / 100))
  }

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
            value={productType}
            onChange={(e) => setProductType(e.target.value as 'physical' | 'coupon')}
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

      {/* Supplier */}
      <div className="border-t border-gray-100 pt-5 space-y-3">
        <p className="text-sm font-semibold text-gray-700">ספק</p>
        <div>
          <label htmlFor="supplier_id" className="block text-xs font-medium text-gray-700 mb-1">
            ספק משויך *
          </label>
          <select
            id="supplier_id"
            name="supplier_id"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">ללא ספק</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {supplierReadiness(s).ready ? '' : ' (חסרים פרטים)'}
              </option>
            ))}
          </select>
          {supplierId && !supplierGap.ready && (
            <p className="mt-1 flex items-start gap-1 text-xs text-amber-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                {supplierGap.missingLabels.length > 0
                  ? `לספק חסרים: ${supplierGap.missingLabels.join(', ')}. `
                  : 'הספק אינו פעיל. '}
                המוצר לא יוכל לעבור לסטטוס פעיל עד שיושלמו.{' '}
                <a href={`/admin/suppliers/${supplierId}`} className="underline">
                  השלמה בעמוד הספק
                </a>
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Money: the four per-product knobs. No default exists for any of them. */}
      <div className="border-t border-gray-100 pt-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-700">מחירים ועמלות</p>
          <p className="text-xs text-gray-500 mt-0.5">
            כל הערכים נקבעים למוצר הזה בלבד. אין ברירת מחדל ואין אחוז קבוע במערכת. שינוי כאן חל על
            הזמנות עתידיות בלבד.
          </p>
          <p className="mt-2 text-xs text-gray-600">
            <span className="font-medium">סוג העמלה: {commissionType.label}</span>{' '}
            <span className="text-gray-500">
              נקבע לפי סוג המוצר, לא נבחר בנפרד. עמלת הפלטפורמה חלה על {commissionType.baseLabel}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="kenyon_price" className="block text-xs font-medium text-gray-700 mb-1">
              מחיר רגיל (₪) *
            </label>
            <input
              id="kenyon_price"
              name="kenyon_price"
              type="number"
              min="0"
              step="0.01"
              value={kenyonPrice}
              onChange={(e) => setKenyonPrice(e.target.value)}
              required
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-gray-500">מחיר המחירון של בית העסק</p>
          </div>
          <div>
            <label htmlFor="full_price" className="block text-xs font-medium text-gray-700 mb-1">
              מחיר לפני הנחה (₪)
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
            <p className="mt-1 text-xs text-gray-500">מוצג מחוק בעמוד המוצר</p>
          </div>
          <div>
            <label
              htmlFor="stock_quantity"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
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

        <div className="grid grid-cols-2 gap-4">
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
              onChange={(e) => handlePlatformPercent(e.target.value)}
              required
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label
              htmlFor="supplier_split_percent"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              אחוז לספק (%) *
            </label>
            <input
              id="supplier_split_percent"
              name="supplier_split_percent"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={supplierSplit}
              onChange={(e) => handleSupplierSplit(e.target.value)}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-2">
          שני החצאים נשמרים ומצטרפים תמיד ל-100%. עדכון אחד מעדכן את השני.{' '}
          {isCouponProduct
            ? 'החלוקה חלה על הסכום שמשולם באתר בלבד, לא על היתרה שנגבית בבית העסק.'
            : 'החלוקה חלה על מלוא הסכום שמשולם באתר.'}
        </p>

        {isCouponProduct ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="coupon_price_ils"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                מחיר הקופון באתר (₪) *
              </label>
              <input
                id="coupon_price_ils"
                name="coupon_price_ils"
                type="number"
                min="0.01"
                step="0.01"
                value={couponPrice}
                onChange={(e) => setCouponPrice(e.target.value)}
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <p className="mt-1 text-xs text-gray-500">סכום מוחלט, לא אחוז</p>
            </div>
            <div>
              <label
                htmlFor="coupon_expiry_days"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                תוקף השובר (ימים) *
              </label>
              <input
                id="coupon_expiry_days"
                name="coupon_expiry_days"
                type="number"
                min="1"
                step="1"
                defaultValue={product?.coupon_expiry_days ?? ''}
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <p className="mt-1 text-xs text-gray-500">מיום הרכישה</p>
            </div>
            <div>
              <span className="block text-xs font-medium text-gray-700 mb-1">
                אחוז ההנחה לתצוגה
              </span>
              <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
                {couponBadgePercent === null ? '-' : `${couponBadgePercent}%`}
              </div>
              <p className="mt-1 text-xs text-gray-500">מחושב מהמחירים, לא נקבע ידנית</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="discount_percent"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                אחוז הנחה (%) *
              </label>
              <input
                id="discount_percent"
                name="discount_percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <p className="mt-1 text-xs text-gray-500">מקטין בפועל את הסכום שנגבה באתר</p>
            </div>
            <div>
              <label
                htmlFor="offer_valid_until"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                המבצע בתוקף עד
              </label>
              <input
                id="offer_valid_until"
                name="offer_valid_until"
                type="date"
                defaultValue={product?.offer_valid_until?.slice(0, 10) ?? ''}
                dir="ltr"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>
        )}

        {isCouponProduct && (
          <div>
            <label
              htmlFor="offer_valid_until"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              המבצע בתוקף עד
            </label>
            <input
              id="offer_valid_until"
              name="offer_valid_until"
              type="date"
              defaultValue={product?.offer_valid_until?.slice(0, 10) ?? ''}
              dir="ltr"
              className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        )}

        {/* Consequence of the numbers above, before saving them. */}
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">מה יקרה בפועל ליחידה אחת</p>
          {preview === null ? (
            <p className="text-xs text-gray-500">
              השלימו מחיר, עמלה{isCouponProduct ? ' ומחיר קופון' : ''} כדי לראות את החלוקה.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              <Row label="הלקוח משלם באתר" value={preview.paidOnlineIls} />
              {isCouponProduct && (
                <Row label="הלקוח משלים בבית העסק" value={preview.balanceAtBusinessIls} />
              )}
              <Row label="הפלטפורמה שומרת" value={preview.platformKeepsIls} />
              <Row label="הספק מקבל" value={preview.supplierGetsIls} />
              <div className="col-span-2 mt-1 text-gray-500">
                אחוז ההנחה שיוצג: {preview.discountPercent}%
              </div>
            </dl>
          )}
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

/** One line of the money preview. Shekels, he-IL, never agorot in the UI. */
function Row({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-end font-medium text-gray-900" dir="ltr">
        ₪
        {value.toLocaleString('he-IL', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </dd>
    </>
  )
}
