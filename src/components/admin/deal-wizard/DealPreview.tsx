'use client'

import {
  type DealTemplate,
  type RawValues,
  type TemplateField,
  displayValue,
  validateField,
} from '@/lib/deal-templates/common'
import { type Agorot, formatAgorot } from '@/lib/money'

/** A field's value as the product page would show it, or '' while invalid/empty. */
function shown(field: TemplateField, values: RawValues): string {
  const [v, err] = validateField({ ...field, required: false }, values[field.key])
  return err ? '' : displayValue(field, v)
}

function money(values: RawValues, key: string): Agorot | null {
  const [v, err] = validateField({ key, label: key, type: 'money' }, values[key])
  return err || v == null ? null : (v as Agorot)
}

/**
 * Live preview of the storefront product page, in the Electro v7 product
 * layout tokens (yellow CTA, red price, whole shekels). Read-only: it renders
 * the form state, nothing is fetched.
 */
export default function DealPreview({
  template,
  values,
  images,
  categoryName,
}: {
  template: DealTemplate
  values: RawValues
  images: string[]
  categoryName: string
}) {
  const price = money(values, 'price')
  const compare = money(values, 'compare_at_price')
  const shipping = money(values, 'shipping_price')
  const discount =
    price != null && compare != null && compare > price
      ? Math.round(((compare - price) * 100) / compare)
      : null
  const details = template.fields
    .map((f) => ({ label: f.label, value: shown(f, values) }))
    .filter((d) => d.value !== '')
  const text = (k: string) => (typeof values[k] === 'string' ? (values[k] as string).trim() : '')

  return (
    <article
      dir="rtl"
      className="overflow-hidden rounded-xl border border-gray-200 bg-white text-start"
      aria-label="תצוגה מקדימה"
    >
      <div className="aspect-[4/3] bg-gray-100">
        {images[0] ? (
          <img src={images[0]} alt={text('title')} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            תמונה ראשית
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-1 p-2">
          {images.slice(1, 6).map((src) => (
            <img key={src} src={src} alt="" className="h-12 w-12 rounded object-cover" />
          ))}
        </div>
      )}
      <div className="space-y-3 p-4">
        {categoryName && <p className="text-xs text-link">{categoryName}</p>}
        <h3 className="text-lg font-bold leading-snug text-gray-900">
          {text('title') || 'כותרת הדיל'}
        </h3>
        {text('short_description') && (
          <p className="text-sm text-gray-600">{text('short_description')}</p>
        )}
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold text-price">
            {price != null ? formatAgorot(price) : '₪-'}
          </span>
          {compare != null && compare > (price ?? 0) && (
            <span className="text-sm text-gray-500 line-through">{formatAgorot(compare)}</span>
          )}
          {discount != null && discount > 0 && (
            <span className="rounded bg-price px-2 py-0.5 text-xs font-bold text-white">
              {discount}%-
            </span>
          )}
        </div>
        {compare != null && text('original_price_source') && (
          <p className="text-xs text-gray-500">מחיר להשוואה: {text('original_price_source')}</p>
        )}
        <p className="text-xs text-gray-700">
          {template.product_type === 'coupon'
            ? `שובר בתוקף ${text('validity_days') || '90'} ימים מיום הרכישה`
            : shipping == null || shipping === 0
              ? 'משלוח חינם'
              : `משלוח ${formatAgorot(shipping)}`}
        </p>
        <button
          type="button"
          disabled
          className="w-full rounded-full bg-brand-primary py-2.5 text-sm font-bold text-gray-900"
        >
          {template.product_type === 'coupon' ? 'לרכישת השובר' : 'הוספה לסל'}
        </button>

        {details.length > 0 && (
          <section>
            <h4 className="mb-1 text-sm font-bold text-gray-900">פרטי הדיל</h4>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {details.map((d) => (
                <div key={d.label} className="contents">
                  <dt className="text-gray-500">{d.label}</dt>
                  <dd className="text-gray-900">{d.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {text('description') && (
          <p className="whitespace-pre-line text-sm text-gray-700">{text('description')}</p>
        )}

        {(text('supplier_name') || text('supplier_city')) && (
          <section className="rounded-lg bg-gray-50 p-3 text-sm">
            <h4 className="font-bold text-gray-900">{text('supplier_name')}</h4>
            <p className="text-gray-600">
              {[text('supplier_address'), text('supplier_city')].filter(Boolean).join(', ')}
            </p>
            {text('supplier_phone') && (
              <p dir="ltr" className="text-end text-gray-600">
                {text('supplier_phone')}
              </p>
            )}
            {text('supplier_hours') && (
              <p className="whitespace-pre-line text-gray-600">{text('supplier_hours')}</p>
            )}
            {text('supplier_waze') && <p className="text-link">ניווט ב-Waze</p>}
          </section>
        )}

        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer font-semibold text-gray-800">
            תנאים, ביטול וגילוי נאות
          </summary>
          <p className="mt-1">
            המוכר: {text('seller_legal_name')} · ח.פ {text('seller_business_id')}
          </p>
          {text('cancellation_policy') && (
            <p className="mt-1 whitespace-pre-line">{text('cancellation_policy')}</p>
          )}
          {template.product_type === 'physical' && text('returns_policy') && (
            <p className="mt-1 whitespace-pre-line">{text('returns_policy')}</p>
          )}
          {template.product_type === 'physical' && text('delivery_days') && (
            <p className="mt-1">מועד אספקה: עד {text('delivery_days')} ימי עסקים</p>
          )}
          {text('fine_print') && <p className="mt-1 whitespace-pre-line">{text('fine_print')}</p>}
          {values.price_includes_vat === true && <p className="mt-1">המחיר כולל מע״מ</p>}
        </details>
      </div>
    </article>
  )
}
