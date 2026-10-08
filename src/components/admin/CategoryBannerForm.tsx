'use client'

import ImageUploader from '@/components/admin/ImageUploader'
import type { AdminCategoryBanner, CategoryOption } from '@/lib/category-banners/admin-read'
import { isInternalHref } from '@/lib/category-banners/rules'
import {
  type CategoryBannerActionState,
  saveCategoryBanner,
} from '@/server/actions/admin/category-banners'
import Image from 'next/image'
import { useActionState, useState } from 'react'

/**
 * The category-banner composer (STEP 62): one category, a headline, an
 * optional second line, one image with Hebrew alt text, an optional call to
 * action (label plus an internal path), the text colour, the window and a
 * priority.
 *
 * The window is open on both ends and the form says what each empty field
 * means, because "no end" and "forgot to set an end" look the same in a
 * date input. The preview under the fields is the shopper's view of the
 * copy and the colour, on the image as uploaded, so an admin sees white text
 * on a white sky before the shopper does.
 */

const EMPTY: CategoryBannerActionState = { ok: false }
const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm'

/** An ISO instant to the `datetime-local` value in the admin's own zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

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

export default function CategoryBannerForm({
  initial,
  categories,
}: {
  initial?: AdminCategoryBanner
  categories: CategoryOption[]
}) {
  const [state, action, pending] = useActionState(saveCategoryBanner, EMPTY)
  const [imageUrl, setImageUrl] = useState<string[]>(initial?.image_url ? [initial.image_url] : [])
  const [title, setTitle] = useState(initial?.title_he ?? '')
  const [subtitle, setSubtitle] = useState(initial?.subtitle_he ?? '')
  const [ctaLabel, setCtaLabel] = useState(initial?.cta_label_he ?? '')
  const [ctaHref, setCtaHref] = useState(initial?.cta_href ?? '')
  const [theme, setTheme] = useState<'light' | 'dark'>(initial?.theme ?? 'light')
  const err = state.fieldErrors ?? {}

  const image = imageUrl[0] ?? ''
  const ctaMismatch = (ctaLabel.trim() === '') !== (ctaHref.trim() === '')
  const ctaExternal = ctaHref.trim() !== '' && !isInternalHref(ctaHref.trim())

  const describedBy = (id: string, hasHint: boolean) =>
    [hasHint ? `${id}-hint` : null, err[id]?.length ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <form action={action} dir="rtl" className="max-w-2xl space-y-6">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="image_url" value={image} />

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.ok && (
        <output className="block rounded-lg bg-green-50 p-3 text-sm text-green-800">
          הבאנר נשמר.
        </output>
      )}

      <Field id="category_id" label="הקטגוריה" errors={err.category_id}>
        <select
          id="category_id"
          name="category_id"
          required
          defaultValue={initial?.category_id ?? ''}
          aria-describedby={describedBy('category_id', false)}
          className={INPUT}
        >
          <option value="">בחרו קטגוריה…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_he}
            </option>
          ))}
        </select>
      </Field>

      <Field id="title_he" label="כותרת" hint="מה שהלקוח רואה גדול על התמונה" errors={err.title_he}>
        <input
          id="title_he"
          name="title_he"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-describedby={describedBy('title_he', true)}
          className={INPUT}
        />
      </Field>

      <Field id="subtitle_he" label="שורת משנה (לא חובה)" errors={err.subtitle_he}>
        <input
          id="subtitle_he"
          name="subtitle_he"
          maxLength={240}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          aria-describedby={describedBy('subtitle_he', false)}
          className={INPUT}
        />
      </Field>

      <div className="space-y-1">
        <span className="block text-sm font-medium">תמונת הבאנר</span>
        <ImageUploader
          bucket="category-icons"
          folder="category-banners"
          value={imageUrl}
          onChange={(urls) => setImageUrl(urls.slice(-1))}
          maxFiles={1}
          altKind="category"
          altSubject={title || null}
        />
        <span className="block text-xs text-gray-500">
          תמונה רחבה, לפחות 1170 פיקסלים לרוחב. הטקסט יוצב מעליה בצד ימין.
        </span>
        {err.image_url?.map((e) => (
          <span key={e} role="alert" className="block text-xs text-red-700">
            {e}
          </span>
        ))}
      </div>

      <Field
        id="image_alt_he"
        label="טקסט חלופי לתמונה"
        hint="מה שקורא מסך מקריא במקום התמונה"
        errors={err.image_alt_he}
      >
        <input
          id="image_alt_he"
          name="image_alt_he"
          required
          maxLength={200}
          defaultValue={initial?.image_alt_he}
          aria-describedby={describedBy('image_alt_he', true)}
          className={INPUT}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cta_label_he" label="טקסט הכפתור (לא חובה)" errors={err.cta_label_he}>
          <input
            id="cta_label_he"
            name="cta_label_he"
            maxLength={60}
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            aria-describedby={describedBy('cta_label_he', false)}
            className={INPUT}
          />
        </Field>
        <Field
          id="cta_href"
          label="קישור הכפתור"
          hint="נתיב פנימי בלבד, למשל /category/hot-deals"
          errors={err.cta_href}
        >
          <input
            id="cta_href"
            name="cta_href"
            maxLength={500}
            value={ctaHref}
            onChange={(e) => setCtaHref(e.target.value)}
            aria-describedby={describedBy('cta_href', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
      </div>
      {ctaMismatch && (
        <p className="m-0 text-sm text-amber-800" data-testid="cta-warning">
          כפתור צריך גם טקסט וגם קישור. בלי שניהם הבאנר יוצג ללא כפתור.
        </p>
      )}
      {ctaExternal && (
        <p className="m-0 text-sm text-amber-800" data-testid="cta-warning">
          הקישור חייב להיות נתיב פנימי שמתחיל ב-/.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="theme" label="צבע הטקסט" errors={err.theme}>
          <select
            id="theme"
            name="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value === 'dark' ? 'dark' : 'light')}
            aria-describedby={describedBy('theme', false)}
            className={INPUT}
          >
            <option value="light">לבן (על תמונה כהה)</option>
            <option value="dark">כהה (על תמונה בהירה)</option>
          </select>
        </Field>
        <Field
          id="priority"
          label="עדיפות"
          hint="כשיש כמה באנרים פעילים, הגבוה מנצח"
          errors={err.priority}
        >
          <input
            id="priority"
            name="priority"
            type="number"
            inputMode="numeric"
            min={-1000}
            max={1000}
            defaultValue={initial?.priority ?? 0}
            aria-describedby={describedBy('priority', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={initial?.is_active ?? true} />
            <span>פעיל</span>
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="starts_at" label="תחילת ההצגה" hint="ריק = מיד עם השמירה" errors={err.starts_at}>
          <input
            id="starts_at"
            name="starts_at"
            type="datetime-local"
            defaultValue={toLocalInput(initial?.starts_at)}
            aria-describedby={describedBy('starts_at', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
        <Field id="ends_at" label="סיום ההצגה" hint="ריק = עד שיכובה" errors={err.ends_at}>
          <input
            id="ends_at"
            name="ends_at"
            type="datetime-local"
            defaultValue={toLocalInput(initial?.ends_at)}
            aria-describedby={describedBy('ends_at', true)}
            className={INPUT}
            dir="ltr"
          />
        </Field>
      </div>

      <section aria-label="תצוגה מקדימה" className="space-y-1">
        <span className="block text-sm font-medium">תצוגה מקדימה</span>
        <div
          data-testid="banner-preview"
          className="relative h-44 overflow-hidden rounded-lg bg-gray-200"
        >
          {image && <Image src={image} alt="" fill unoptimized className="object-cover" />}
          {theme === 'light' && (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-l from-black/60 via-black/30 to-transparent"
            />
          )}
          <div
            className={`absolute inset-0 flex flex-col items-start justify-center gap-2 p-5 ${
              theme === 'light' ? 'text-white' : 'text-gray-900'
            }`}
          >
            <p className="m-0 text-xl font-bold leading-tight">{title || 'הכותרת תופיע כאן'}</p>
            {subtitle && <p className="m-0 text-sm">{subtitle}</p>}
            {ctaLabel && ctaHref && (
              <span
                className={`mt-1 inline-flex rounded px-4 py-2 text-sm font-bold ${
                  theme === 'light' ? 'bg-amber-400 text-gray-900' : 'bg-gray-900 text-white'
                }`}
              >
                {ctaLabel}
              </span>
            )}
          </div>
        </div>
      </section>

      <button
        type="submit"
        disabled={pending || !image}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'שומר…' : 'שמירה'}
      </button>
    </form>
  )
}
