'use client'

import type { AdminBundle, BundleProductOption } from '@/lib/bundles/admin-read'
import { type BundleActionState, saveBundle } from '@/server/actions/admin/bundles'
import { useActionState, useId, useMemo, useState } from 'react'

/**
 * The bundle composer (STEP 60): a name, a fixed saving in shekels, a window,
 * and the list of member products with a quantity each.
 *
 * The rows live in component state and are serialised into one hidden
 * `items_json` field on submit: a FormData of repeated inputs loses which
 * quantity belongs to which product once a row is removed from the middle,
 * and the action parses one array instead of guessing at pairs.
 *
 * The running "worth" line is the shopper's view of the rule: the members'
 * current prices added up, the saving, and what is left. It is advisory
 * (prices move; the cart recomputes) and it is what stops an admin from
 * typing ₪300 off a ₪40 set, which the pricer would cap and the shopper
 * would never see.
 */

type Row = { product_id: string; quantity: number }

const EMPTY: BundleActionState = { ok: false }
const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm'

const toIls = (agorot: number | null | undefined) =>
  agorot === null || agorot === undefined ? '' : String(agorot / 100)
const toLocal = (iso: string | null | undefined) => (iso ? iso.slice(0, 16) : '')
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

export default function BundleForm({
  initial,
  products,
}: {
  initial?: AdminBundle
  products: BundleProductOption[]
}) {
  const [state, action, pending] = useActionState(saveBundle, EMPTY)
  const [rows, setRows] = useState<Row[]>(
    () => initial?.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })) ?? [],
  )
  const [discountIls, setDiscountIls] = useState(toIls(initial?.discount_agorot))
  const pickerId = useId()
  const err = state.fieldErrors ?? {}

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  // Products already in the bundle leave the picker: one row per product.
  const choices = products.filter((p) => !rows.some((r) => r.product_id === p.id))

  const worthIls = rows.reduce((sum, row) => {
    const price = byId.get(row.product_id)?.kenyon_price
    return sum + (price ?? 0) * row.quantity
  }, 0)
  const savingIls = Number(discountIls) > 0 ? Number(discountIls) : 0
  const units = rows.reduce((sum, row) => sum + row.quantity, 0)

  const addRow = (productId: string) => {
    if (!productId || rows.some((r) => r.product_id === productId)) return
    setRows((prev) => [...prev, { product_id: productId, quantity: 1 }])
  }
  const setQuantity = (productId: string, quantity: number) => {
    const next = Math.min(99, Math.max(1, Math.trunc(quantity) || 1))
    setRows((prev) => prev.map((r) => (r.product_id === productId ? { ...r, quantity: next } : r)))
  }
  const removeRow = (productId: string) =>
    setRows((prev) => prev.filter((r) => r.product_id !== productId))

  const describedBy = (id: string, hasHint: boolean) =>
    [hasHint ? `${id}-hint` : null, err[id]?.length ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <form action={action} dir="rtl" className="max-w-2xl space-y-6">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="items_json" value={JSON.stringify(rows)} />

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.ok && (
        <output className="block rounded-lg bg-green-50 p-3 text-sm text-green-800">
          החבילה נשמרה.
        </output>
      )}

      <Field
        id="name_he"
        label="שם החבילה"
        hint="מה שהלקוח רואה בעגלה ליד החיסכון"
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

      <Field id="description_he" label="תיאור (לא חובה)" errors={err.description_he}>
        <textarea
          id="description_he"
          name="description_he"
          rows={2}
          maxLength={600}
          defaultValue={initial?.description_he ?? ''}
          aria-describedby={describedBy('description_he', false)}
          className={INPUT}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="discount_ils"
          label="חיסכון לחבילה (₪)"
          hint="סכום קבוע שיורד מהתשלום באתר על כל סט שלם. נשמר באגורות."
          errors={err.discount_ils}
        >
          <input
            id="discount_ils"
            name="discount_ils"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            value={discountIls}
            onChange={(e) => setDiscountIls(e.target.value)}
            aria-describedby={describedBy('discount_ils', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
        <Field id="starts_at" label="תחילת תוקף (לא חובה)" errors={err.starts_at}>
          <input
            id="starts_at"
            name="starts_at"
            type="datetime-local"
            defaultValue={toLocal(initial?.starts_at)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
        <Field id="expires_at" label="סיום תוקף (לא חובה)" errors={err.expires_at}>
          <input
            id="expires_at"
            name="expires_at"
            type="datetime-local"
            defaultValue={toLocal(initial?.expires_at)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">המוצרים בחבילה</legend>

        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">עוד לא נבחרו מוצרים.</p>
        ) : (
          <ul className="divide-y" data-testid="bundle-rows">
            {rows.map((row) => {
              const product = byId.get(row.product_id)
              const qtyId = `qty-${row.product_id}`
              return (
                <li key={row.product_id} className="flex items-center gap-3 py-2">
                  <span className="flex-1 text-sm">
                    {product?.name_he ?? 'מוצר שאינו פעיל'}
                    {product?.kenyon_price != null && (
                      <span className="ms-2 text-xs text-gray-500">
                        <bdi>{ils(product.kenyon_price)}</bdi>
                      </span>
                    )}
                  </span>
                  <label htmlFor={qtyId} className="text-xs text-gray-600">
                    כמות
                  </label>
                  <input
                    id={qtyId}
                    type="number"
                    min={1}
                    max={99}
                    value={row.quantity}
                    onChange={(e) => setQuantity(row.product_id, Number(e.target.value))}
                    className="w-20 rounded-lg border px-2 py-1 text-sm"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.product_id)}
                    className="text-xs text-red-700 underline"
                    aria-label={`הסרת ${product?.name_he ?? 'המוצר'} מהחבילה`}
                  >
                    הסרה
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor={pickerId} className="block text-xs text-gray-600">
              הוספת מוצר
            </label>
            <select
              id={pickerId}
              value=""
              onChange={(e) => addRow(e.target.value)}
              className={INPUT}
              disabled={choices.length === 0}
            >
              <option value="">{choices.length === 0 ? 'אין מוצרים להוספה' : 'בחרו מוצר…'}</option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_he}
                  {p.kenyon_price != null ? ` (${ils(p.kenyon_price)})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {err.items?.map((e) => (
          <span key={e} role="alert" className="block text-xs text-red-700">
            {e}
          </span>
        ))}

        {rows.length > 0 && (
          <p className="text-sm text-gray-700" data-testid="bundle-worth">
            <bdi>{units}</bdi> יחידות, שווי נוכחי <bdi>{ils(worthIls)}</bdi>
            {savingIls > 0 && (
              <>
                , חיסכון <bdi>{ils(savingIls)}</bdi>, הלקוח משלם{' '}
                <bdi>{ils(Math.max(0, worthIls - savingIls))}</bdi>
              </>
            )}
            {savingIls > worthIls && worthIls > 0 && (
              <span className="block text-amber-800">
                החיסכון גדול משווי החבילה; העגלה תגביל אותו לשווי המוצרים.
              </span>
            )}
          </p>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_active" defaultChecked={initial?.is_active ?? true} />
        פעילה
      </label>

      <button
        type="submit"
        disabled={pending || rows.length === 0}
        className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'שומר...' : 'שמירה'}
      </button>
    </form>
  )
}
