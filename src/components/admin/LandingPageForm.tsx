'use client'

import type { LandingPage } from '@/lib/landing/blocks'
import { landingPath } from '@/lib/landing/slug'
import { LANDING_PREVIEW_PARAM, LANDING_VARIANT_PARAM, variantKeys } from '@/lib/landing/variant'
import { type LandingActionState, saveLandingPage } from '@/server/actions/admin/landing-pages'
import { useActionState } from 'react'

const EMPTY: LandingActionState = { ok: false }
const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm'

/** timestamptz to the value a datetime-local input accepts. */
const toLocal = (iso: string | null | undefined) => (iso ? iso.slice(0, 16) : '')

/**
 * A starting body for a new page: one of each common block, so an editor
 * edits text rather than remembers the shape. Every href is internal.
 */
export const BLOCKS_TEMPLATE = JSON.stringify(
  [
    {
      kind: 'hero',
      headline: 'כותרת הקמפיין',
      subheadline: 'משפט אחד על ההצעה',
      cta: { label: 'לכל המבצעים', href: '/products' },
    },
    {
      kind: 'benefits',
      title: 'למה כדאי',
      items: [
        { title: 'יתרון ראשון', text: 'משפט קצר.' },
        { title: 'יתרון שני', text: 'משפט קצר.' },
      ],
    },
    { kind: 'products', title: 'המבצעים', slugs: [], limit: 8 },
    { kind: 'cta', label: 'לכל המבצעים', href: '/products' },
  ],
  null,
  2,
)

export const VARIANTS_TEMPLATE = JSON.stringify(
  [
    { key: 'control', weight: 50 },
    {
      key: 'b',
      weight: 50,
      blocks: [
        {
          kind: 'hero',
          headline: 'כותרת חלופית',
          cta: { label: 'לכל המבצעים', href: '/products' },
        },
      ],
    },
  ],
  null,
  2,
)

/**
 * Label and control associated by id, the shape every admin form here takes
 * (see DiscountCampaignForm for why: a hint or an error that is merely
 * nearby is not announced with the field).
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

/**
 * The landing page editor (STEP 55).
 *
 * The body and the variants are JSON textareas, validated by the same
 * schema the storefront applies, with one Hebrew line per problem and the
 * JSON path in front of it. A block editor with a form per block kind is
 * the obvious next step; this ships the system with the shape pinned and
 * the validation in one place, so that editor cannot save what the page
 * cannot render.
 *
 * Preview links open `/lp/<slug>?preview=1&v=<key>` per arm: a draft, an
 * out-of-window page and a specific variant are all visible to a signed-in
 * panel user and to nobody else.
 */
export default function LandingPageForm({ initial }: { initial?: LandingPage }) {
  const [state, action, pending] = useActionState(saveLandingPage, EMPTY)
  const err = state.fieldErrors ?? {}
  const describedBy = (id: string, hasHint: boolean) =>
    [hasHint ? `${id}-hint` : null, err[id]?.length ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined

  const isRow = initial?.source === 'database'
  const slugForPreview = state.slug ?? initial?.slug
  const previewKeys = initial ? variantKeys(initial.variants) : []

  return (
    <form action={action} dir="rtl" className="max-w-3xl space-y-6">
      {isRow && <input type="hidden" name="id" value={initial.id} />}

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.ok && (
        <output className="block rounded-lg bg-green-50 p-3 text-sm text-green-800">
          הדף נשמר.{' '}
          {slugForPreview && (
            <a
              href={`${landingPath(slugForPreview)}?${LANDING_PREVIEW_PARAM}=1`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              לתצוגה מקדימה
            </a>
          )}
        </output>
      )}
      {initial && !isRow && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          זהו דף מובנה בקוד (מיגרציה 262 עוד לא הוחלה). שמירה תיצור שורה חדשה באותה כתובת כשהטבלה
          תהיה קיימת.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="slug"
          label="כתובת"
          hint="הסיומת אחרי /lp/. אותיות לועזיות קטנות, ספרות ומקפים."
          errors={err.slug}
        >
          <input
            id="slug"
            name="slug"
            required
            defaultValue={initial?.slug}
            aria-describedby={describedBy('slug', true)}
            className={`${INPUT} font-mono`}
            dir="ltr"
            placeholder="summer-deals"
          />
        </Field>

        <Field
          id="title_he"
          label="כותרת הדף"
          hint="גם כותרת החלון וגם כותרת לשיתוף."
          errors={err.title_he}
        >
          <input
            id="title_he"
            name="title_he"
            required
            defaultValue={initial?.titleHe}
            aria-describedby={describedBy('title_he', true)}
            className={INPUT}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            id="description_he"
            label="תיאור קצר"
            hint="עד 400 תווים, לתגית התיאור."
            errors={err.description_he}
          >
            <textarea
              id="description_he"
              name="description_he"
              rows={2}
              defaultValue={initial?.descriptionHe ?? ''}
              aria-describedby={describedBy('description_he', true)}
              className={INPUT}
            />
          </Field>
        </div>

        <Field id="status" label="מצב" errors={err.status}>
          <select
            id="status"
            name="status"
            defaultValue={initial?.status ?? 'draft'}
            className={INPUT}
            aria-describedby={describedBy('status', false)}
          >
            <option value="draft">טיוטה</option>
            <option value="published">מפורסם</option>
            <option value="archived">בארכיון</option>
          </select>
        </Field>

        <Field
          id="campaign"
          label="שם קמפיין (utm_campaign)"
          hint="נכתב על קישורי הדף כשהגולש הגיע בלי utm. ריק = הכתובת."
          errors={err.campaign}
        >
          <input
            id="campaign"
            name="campaign"
            defaultValue={initial?.campaign ?? ''}
            aria-describedby={describedBy('campaign', true)}
            className={`${INPUT} font-mono`}
            dir="ltr"
          />
        </Field>

        <Field id="starts_at" label="תחילת הצגה" hint="ריק = מיד." errors={err.starts_at}>
          <input
            id="starts_at"
            name="starts_at"
            type="datetime-local"
            defaultValue={toLocal(initial?.startsAt)}
            aria-describedby={describedBy('starts_at', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>

        <Field id="ends_at" label="סיום הצגה" hint="ריק = ללא סיום." errors={err.ends_at}>
          <input
            id="ends_at"
            name="ends_at"
            type="datetime-local"
            defaultValue={toLocal(initial?.endsAt)}
            aria-describedby={describedBy('ends_at', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>

        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            id="indexable"
            name="indexable"
            type="checkbox"
            defaultChecked={initial?.indexable ?? false}
            className="h-4 w-4"
          />
          <label htmlFor="indexable" className="text-sm">
            לאפשר למנועי חיפוש לאנדקס את הדף (ברירת המחדל: לא, כדי לא להתחרות בדפי הקטלוג)
          </label>
        </div>
      </div>

      <Field
        id="blocks_json"
        label="תוכן הדף (JSON)"
        hint="מערך של בלוקים: hero, text, benefits, products, faq, countdown, cta. קישורים חייבים להיות פנימיים."
        errors={err.blocks_json}
      >
        <textarea
          id="blocks_json"
          name="blocks_json"
          rows={18}
          defaultValue={initial ? JSON.stringify(initial.blocks, null, 2) : BLOCKS_TEMPLATE}
          aria-describedby={describedBy('blocks_json', true)}
          className={`${INPUT} font-mono text-xs`}
          dir="ltr"
          spellCheck={false}
        />
      </Field>

      <Field
        id="hypothesis_he"
        label="השערת הניסוי"
        hint="מה הגרסה החלופית אמורה לשפר. מוצג בדוח ניסויי A/B."
        errors={err.hypothesis_he}
      >
        <input
          id="hypothesis_he"
          name="hypothesis_he"
          defaultValue={initial?.hypothesisHe ?? ''}
          aria-describedby={describedBy('hypothesis_he', true)}
          className={INPUT}
        />
      </Field>

      <Field
        id="variants_json"
        label="גרסאות A/B (JSON)"
        hint="מערך של { key, weight, blocks? }. הראשונה היא הבקרה; גרסה בלי blocks מציגה את תוכן הדף. ריק = בלי ניסוי."
        errors={err.variants_json}
      >
        <textarea
          id="variants_json"
          name="variants_json"
          rows={10}
          defaultValue={initial ? JSON.stringify(initial.variants, null, 2) : ''}
          placeholder={VARIANTS_TEMPLATE}
          aria-describedby={describedBy('variants_json', true)}
          className={`${INPUT} font-mono text-xs`}
          dir="ltr"
          spellCheck={false}
        />
      </Field>

      {slugForPreview && previewKeys.length > 0 && (
        <p className="text-sm text-gray-600">
          תצוגה מקדימה לפי גרסה:{' '}
          {previewKeys.map((key) => (
            <a
              key={key}
              href={`${landingPath(slugForPreview)}?${LANDING_PREVIEW_PARAM}=1&${LANDING_VARIANT_PARAM}=${key}`}
              target="_blank"
              rel="noreferrer"
              className="me-3 font-mono underline"
              dir="ltr"
            >
              {key}
            </a>
          ))}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'שומר…' : 'שמירה'}
      </button>
    </form>
  )
}
