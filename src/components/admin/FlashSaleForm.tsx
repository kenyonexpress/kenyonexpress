'use client'

import type { BundleProductOption } from '@/lib/bundles/admin-read'
import type { AdminFlashSale } from '@/lib/flash-sales/admin-read'
import { type FlashSaleActionState, saveFlashSale } from '@/server/actions/admin/flash-sales'
import { useActionState, useState } from 'react'

/**
 * The flash-sale composer (STEP 61): one product, a flash price in shekels,
 * an optional "was" price, the window, how many units, how many per shopper,
 * and how long a hold lasts.
 *
 * The running line under the prices is the shopper's view of the rule: the
 * product's current price, the flash price, and the percentage off. It is
 * advisory (the catalogue price moves; the sale row carries its own
 * reference) and it is what stops an admin from typing a flash price ABOVE
 * the product's price, which the database would accept and the shopper
 * would laugh at.
 */

const EMPTY: FlashSaleActionState = { ok: false }
const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm'

const toIls = (agorot: number | null | undefined) =>
  agorot === null || agorot === undefined ? '' : String(agorot / 100)

/** An ISO instant to the `datetime-local` value in the admin's own zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

const ils = (value: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(value)

function Field({
  id,
  label,
  hint,
  errors,
  children,
}: {
  id: string
  label: string
  hint?: string
  errors?: string[]
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <span id={`${id}-hint`} className="block text-xs text-gray-500">
          {hint}
        </span>
      )}
      {errors?.map((e) => (
        <span key={e} id={`${id}-error`} role="alert" className="block text-xs text-red-700">
          {e}
        </span>
      ))}
    </div>
  )
}

export default function FlashSaleForm({
  initial,
  products,
}: {
  initial?: AdminFlashSale
  products: BundleProductOption[]
}) {
  const [state, action, pending] = useActionState(saveFlashSale, EMPTY)
  const [productId, setProductId] = useState(initial?.product_id ?? '')
  const [priceIls, setPriceIls] = useState(toIls(initial?.price_agorot))
  const err = state.fieldErrors ?? {}

  const product = products.find((p) => p.id === productId) ?? null
  const currentIls = product?.kenyon_price ?? initial?.product_kenyon_price ?? null
  const flashIls = Number(priceIls) > 0 ? Number(priceIls) : null
  const aboveCurrent = currentIls !== null && flashIls !== null && flashIls >= currentIls
  const offPercent =
    currentIls !== null && flashIls !== null && currentIls > 0 && flashIls < currentIls
      ? Math.round(((currentIls - flashIls) / currentIls) * 100)
      : null

  const describedBy = (id: string, hasHint: boolean) =>
    [hasHint ? `${id}-hint` : null, err[id]?.length ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <form action={action} dir="rtl" className="max-w-2xl space-y-6">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.ok && (
        <output className="block rounded-lg bg-green-50 p-3 text-sm text-green-800">
          המבצע נשמר.
        </output>
      )}

      <Field
        id="name_he"
        label="שם המבצע"
        hint="מה שהלקוח רואה בבאנר ובעמוד המבצע"
        errors={err.name_he}
      >
        <input
          id="name_he"
          name="name_he"
          required
          maxLength={120}
          defaultValue={initial?.name_he}
          aria-describedby={describedBy('name_he', true)}
          className={INPUT}
        />
      </Field>

      <Field id="product_id" label="המוצר" errors={err.product_id}>
        <select
          id="product_id"
          name="product_id"
          required
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          aria-describedby={describedBy('product_id', false)}
          className={INPUT}
        >
          <option value="">בחרו מוצר…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name_he}
              {p.kenyon_price != null ? ` (${ils(p.kenyon_price)})` : ''}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="price_ils"
          label="מחיר הבזק (₪)"
          hint="המחיר ליחידה למי שתפס יחידה. נשמר באגורות."
          errors={err.price_ils}
        >
          <input
            id="price_ils"
            name="price_ils"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            value={priceIls}
            onChange={(e) => setPriceIls(e.target.value)}
            aria-describedby={describedBy('price_ils', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
        <Field
          id="reference_ils"
          label='מחיר "לפני" (₪, לא חובה)'
          hint="ריק = המחיר הרגיל של המוצר"
          errors={err.reference_ils}
        >
          <input
            id="reference_ils"
            name="reference_ils"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            defaultValue={toIls(initial?.reference_agorot)}
            aria-describedby={describedBy('reference_ils', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
      </div>

      <p className="m-0 text-sm text-gray-700" data-testid="flash-worth">
        {currentIls === null
          ? 'בחרו מוצר כדי לראות את המחיר הרגיל שלו.'
          : flashIls === null
            ? `המחיר הרגיל: ${ils(currentIls)}.`
            : aboveCurrent
              ? `שימו לב: מחיר הבזק ${ils(flashIls)} אינו נמוך מהמחיר הרגיל ${ils(currentIls)}.`
              : `${ils(currentIls)} ← ${ils(flashIls)}, ${offPercent}% הנחה.`}
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="allocation"
          label="יחידות במבצע"
          hint="כמה יחידות נמכרות במחיר הבזק"
          errors={err.allocation}
        >
          <input
            id="allocation"
            name="allocation"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            required
            defaultValue={initial?.allocation ?? 10}
            aria-describedby={describedBy('allocation', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
        <Field id="max_per_claim" label="מקסימום לקונה" errors={err.max_per_claim}>
          <input
            id="max_per_claim"
            name="max_per_claim"
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            defaultValue={initial?.max_per_claim ?? 1}
            aria-describedby={describedBy('max_per_claim', false)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
        <Field
          id="hold_minutes"
          label="זמן החזקה (דקות)"
          hint="כמה זמן יחידה שנתפסה שמורה לקונה"
          errors={err.hold_minutes}
        >
          <input
            id="hold_minutes"
            name="hold_minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            defaultValue={initial?.hold_minutes ?? 10}
            aria-describedby={describedBy('hold_minutes', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="starts_at" label="תחילת המבצע" errors={err.starts_at}>
          <input
            id="starts_at"
            name="starts_at"
            type="datetime-local"
            required
            defaultValue={toLocalInput(initial?.starts_at)}
            aria-describedby={describedBy('starts_at', false)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
        <Field id="ends_at" label="סיום המבצע" errors={err.ends_at}>
          <input
            id="ends_at"
            name="ends_at"
            type="datetime-local"
            required
            defaultValue={toLocalInput(initial?.ends_at)}
            aria-describedby={describedBy('ends_at', false)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={initial?.is_active ?? true} />
        <span>פעיל (כבוי = לא מופיע באתר, וחדר ההמתנה מתרוקן)</span>
      </label>

      <button
        type="submit"
        disabled={pending || !productId}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'שומר…' : 'שמירה'}
      </button>
    </form>
  )
}
