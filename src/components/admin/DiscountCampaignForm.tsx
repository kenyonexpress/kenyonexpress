'use client'

import { type DiscountActionState, saveDiscountCampaign } from '@/server/actions/admin/discounts'
import { useActionState, useState } from 'react'

type Initial = {
  id?: string
  code?: string
  name?: string
  description?: string | null
  kind?: 'percent' | 'fixed'
  percent_bp?: number | null
  amount_agorot?: number | null
  max_discount_agorot?: number | null
  min_order_agorot?: number
  starts_at?: string | null
  expires_at?: string | null
  max_uses?: number | null
  max_uses_per_user?: number
  allow_stacking?: boolean
  is_active?: boolean
}

const EMPTY: DiscountActionState = { ok: false }

/** Agorot in the database, shekels in the form. Inverse of toAgorot in the action. */
const toIls = (agorot: number | null | undefined) =>
  agorot === null || agorot === undefined ? '' : String(agorot / 100)

/** timestamptz to the value a datetime-local input accepts. */
const toLocal = (iso: string | null | undefined) => (iso ? iso.slice(0, 16) : '')

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm'

/**
 * Label and control associated explicitly by id, not by wrapping.
 *
 * A wrapping label is announced inconsistently, and a hint or an error that is
 * merely nearby is not announced with the field at all unless it is referenced
 * by aria-describedby. LEG-03 makes accessibility a launch blocker, so this is
 * the shape every field takes.
 */
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

export default function DiscountCampaignForm({ initial = {} }: { initial?: Initial }) {
  const [state, action, pending] = useActionState(saveDiscountCampaign, EMPTY)
  const [kind, setKind] = useState<'percent' | 'fixed'>(initial.kind ?? 'percent')
  const err = state.fieldErrors ?? {}

  const describedBy = (id: string, hasHint: boolean) =>
    [hasHint ? `${id}-hint` : null, err[id]?.length ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <form action={action} dir="rtl" className="max-w-2xl space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.ok && (
        <output className="block rounded-lg bg-green-50 p-3 text-sm text-green-800">
          הקמפיין נשמר.
        </output>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="code"
          label="קוד"
          hint="אותיות לועזיות בלבד. נשמר באותיות גדולות, והלקוח יכול להקליד אותו איך שירצה."
          errors={err.code}
        >
          <input
            id="code"
            name="code"
            required
            defaultValue={initial.code}
            aria-describedby={describedBy('code', true)}
            className={`${INPUT} font-mono`}
            dir="ltr"
            placeholder="SUMMER25"
          />
        </Field>

        <Field
          id="name"
          label="שם הקמפיין"
          hint="לשימוש פנימי בלבד. הלקוח לא רואה אותו."
          errors={err.name}
        >
          <input
            id="name"
            name="name"
            required
            defaultValue={initial.name}
            aria-describedby={describedBy('name', true)}
            className={INPUT}
          />
        </Field>
      </div>

      <Field id="description" label="תיאור" errors={err.description}>
        <textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={initial.description ?? ''}
          aria-describedby={describedBy('description', false)}
          className={INPUT}
        />
      </Field>

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-2 text-sm font-medium">ההנחה</legend>

        <div className="flex gap-4">
          {(['percent', 'fixed'] as const).map((k) => (
            <label key={k} htmlFor={`kind-${k}`} className="flex items-center gap-2 text-sm">
              <input
                id={`kind-${k}`}
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              {k === 'percent' ? 'אחוז' : 'סכום קבוע'}
            </label>
          ))}
        </div>

        {kind === 'percent' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="percent"
              label="אחוז הנחה"
              hint="אפשר עשרוני, למשל 12.5"
              errors={err.percent}
            >
              <input
                id="percent"
                name="percent"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                defaultValue={initial.percent_bp ? initial.percent_bp / 100 : ''}
                aria-describedby={describedBy('percent', true)}
                className={INPUT}
                dir="ltr"
              />
            </Field>
            <Field
              id="max_discount_ils"
              label="תקרת הנחה (₪)"
              hint="אופציונלי. בלעדיה, אחוז על עגלה גדולה עלול לעבור את העמלה שממנה ההנחה ממומנת."
              errors={err.max_discount_ils}
            >
              <input
                id="max_discount_ils"
                name="max_discount_ils"
                type="number"
                step="0.01"
                min="0"
                defaultValue={toIls(initial.max_discount_agorot)}
                aria-describedby={describedBy('max_discount_ils', true)}
                className={INPUT}
                dir="ltr"
              />
            </Field>
          </div>
        ) : (
          <Field id="amount_ils" label="סכום ההנחה (₪)" errors={err.amount_ils}>
            <input
              id="amount_ils"
              name="amount_ils"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={toIls(initial.amount_agorot)}
              aria-describedby={describedBy('amount_ils', false)}
              className={INPUT}
              dir="ltr"
            />
          </Field>
        )}

        <Field id="min_order_ils" label="מינימום להזמנה (₪)" errors={err.min_order_ils}>
          <input
            id="min_order_ils"
            name="min_order_ils"
            type="number"
            step="0.01"
            min="0"
            defaultValue={toIls(initial.min_order_agorot ?? 0)}
            aria-describedby={describedBy('min_order_ils', false)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border p-4">
        <legend className="px-2 text-sm font-medium">חלון ומגבלות</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="starts_at" label="תחילת תוקף" errors={err.starts_at}>
            <input
              id="starts_at"
              name="starts_at"
              type="datetime-local"
              defaultValue={toLocal(initial.starts_at)}
              aria-describedby={describedBy('starts_at', false)}
              className={INPUT}
              dir="ltr"
            />
          </Field>
          <Field id="expires_at" label="סיום תוקף" errors={err.expires_at}>
            <input
              id="expires_at"
              name="expires_at"
              type="datetime-local"
              defaultValue={toLocal(initial.expires_at)}
              aria-describedby={describedBy('expires_at', false)}
              className={INPUT}
              dir="ltr"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="max_uses" label="מקסימום שימושים" hint="ריק = ללא הגבלה" errors={err.max_uses}>
            <input
              id="max_uses"
              name="max_uses"
              type="number"
              min="1"
              step="1"
              defaultValue={initial.max_uses ?? ''}
              aria-describedby={describedBy('max_uses', true)}
              className={INPUT}
              dir="ltr"
            />
          </Field>
          <Field
            id="max_uses_per_user"
            label="מקסימום למשתמש"
            hint="נאכף רק על לקוח מחובר. לאורח אין למי לשייך את המגבלה."
            errors={err.max_uses_per_user}
          >
            <input
              id="max_uses_per_user"
              name="max_uses_per_user"
              type="number"
              min="1"
              step="1"
              defaultValue={initial.max_uses_per_user ?? 1}
              aria-describedby={describedBy('max_uses_per_user', true)}
              className={INPUT}
              dir="ltr"
            />
          </Field>
        </div>
      </fieldset>

      <div className="space-y-3 rounded-lg border p-4">
        <label htmlFor="allow_stacking" className="flex items-start gap-3 text-sm">
          <input
            id="allow_stacking"
            type="checkbox"
            name="allow_stacking"
            defaultChecked={initial.allow_stacking ?? false}
            className="mt-1"
          />
          <span>
            <span className="font-medium">אפשר צבירה עם קוד אחר</span>
            <span className="block text-xs text-gray-500">
              כבוי כברירת מחדל. זו ההגדרה שהופכת קוד 20% וקוד 30% לקוד 50%.
            </span>
          </span>
        </label>

        <label htmlFor="is_active" className="flex items-center gap-3 text-sm">
          <input
            id="is_active"
            type="checkbox"
            name="is_active"
            defaultChecked={initial.is_active ?? true}
          />
          <span className="font-medium">פעיל</span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'שומר...' : 'שמירה'}
      </button>
    </form>
  )
}
