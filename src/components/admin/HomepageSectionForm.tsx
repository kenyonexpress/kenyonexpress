'use client'

import { RAIL_SOURCE_LABELS, SECTION_KIND_LABELS, type SectionKind } from '@/lib/homepage/sections'
import { type HomepageActionState, saveHomepageSection } from '@/server/actions/admin/homepage'
import { useActionState, useState } from 'react'

/**
 * Add or edit one home page section.
 *
 * THE CONFIG IS A JSON BOX WITH ITS KEYS PRINTED BESIDE IT, not four separate
 * forms. Four kinds take configuration and each takes two or three keys; four
 * bespoke forms would be four places to add the fifth kind, and the one that
 * gets forgotten is the one an operator then cannot configure at all. The
 * schema is enforced on the way in by `SECTION_CONFIG_SCHEMAS` and the error
 * names the offending field, so the box is checked rather than trusted.
 *
 * THE KIND SELECT LISTS ONLY THE KINDS THAT RENDER. `featured`, `city_deals`
 * and `banner_row` are in the database CHECK and have no component - 127
 * created them and nothing was ever built. Offering them would let an operator
 * add a section that is stored, active, scheduled and invisible.
 */

const INITIAL: HomepageActionState = null

const LABEL = 'block text-sm font-medium text-gray-700 mb-1'
const INPUT =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand'

/** The kinds a person may choose. See the header on the three that are absent. */
const CHOOSABLE: SectionKind[] = [
  'benefits',
  'deals',
  'product_rail',
  'category_spotlight',
  'supplier_spotlight',
  'countdown',
]

const CONFIG_HINT: Partial<Record<SectionKind, string>> = {
  product_rail: `{"source":"biggest_discount","limit":4}  |  {"source":"manual","productIds":["<uuid>"],"limit":4}`,
  category_spotlight: `{"categorySlug":"hot-deals","limit":4}`,
  supplier_spotlight: `{"supplierId":"<uuid>","limit":4}`,
  countdown: `{"deadline":"2026-12-31T21:00:00+02:00","linkUrl":"/products","ctaLabelHe":"לדילים"}`,
}

export type SectionFormValues = {
  id?: string
  kind: SectionKind
  titleHe: string
  subtitleHe: string
  position: number
  isActive: boolean
  startsAt: string
  endsAt: string
  config: string
}

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` with no zone and no seconds. */
function forInput(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function HomepageSectionForm({
  initial,
  ruleCounts,
}: {
  initial?: SectionFormValues
  ruleCounts: {
    poolSize: number
    poolLimit: number
    biggest_discount: number
    newest: number
    ending_soon: number
  }
}) {
  const [state, action, pending] = useActionState(saveHomepageSection, INITIAL)
  const [kind, setKind] = useState<SectionKind>(initial?.kind ?? 'product_rail')

  const error = state && 'error' in state ? state.error : null
  const success = state && 'success' in state ? state.success : null

  return (
    <form action={action} className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      {error && <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {success && (
        <div className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">{success}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="kind" className={LABEL}>
            סוג הסעיף *
          </label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as SectionKind)}
            className={INPUT}
          >
            {CHOOSABLE.map((value) => (
              <option key={value} value={value}>
                {SECTION_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="position" className={LABEL}>
            מיקום
          </label>
          <input
            id="position"
            name="position"
            type="number"
            min={0}
            defaultValue={initial?.position ?? 100}
            className={INPUT}
          />
          <p className="mt-1 text-xs text-gray-500">מספר קטן יותר = גבוה יותר בעמוד.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="titleHe" className={LABEL}>
            כותרת
          </label>
          <input id="titleHe" name="titleHe" defaultValue={initial?.titleHe} className={INPUT} />
        </div>
        <div>
          <label htmlFor="subtitleHe" className={LABEL}>
            כותרת משנה
          </label>
          <input
            id="subtitleHe"
            name="subtitleHe"
            defaultValue={initial?.subtitleHe}
            className={INPUT}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="startsAt" className={LABEL}>
            מתחיל
          </label>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={forInput(initial?.startsAt ?? '')}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="endsAt" className={LABEL}>
            מסתיים
          </label>
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            defaultValue={forInput(initial?.endsAt ?? '')}
            className={INPUT}
          />
          <p className="mt-1 text-xs text-gray-500">
            חייב להיות אחרי מועד ההתחלה. חלון הפוך הוא סעיף שלא יופיע אף פעם.
          </p>
        </div>
      </div>

      {CONFIG_HINT[kind] && (
        <div>
          <label htmlFor="config" className={LABEL}>
            הגדרות (JSON) *
          </label>
          <textarea
            id="config"
            name="config"
            rows={4}
            defaultValue={initial?.config ?? ''}
            dir="ltr"
            className={`${INPUT} text-start font-mono`}
            placeholder={CONFIG_HINT[kind]}
          />
          <p className="mt-1 text-xs text-gray-500" dir="ltr">
            {CONFIG_HINT[kind]}
          </p>
          {kind === 'product_rail' && (
            <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <p className="font-medium">כמה מוצרים כל כלל מוצא כרגע:</p>
              <ul className="mt-1 space-y-0.5">
                <li>
                  {RAIL_SOURCE_LABELS.biggest_discount}: {ruleCounts.biggest_discount}
                </li>
                <li>
                  {RAIL_SOURCE_LABELS.newest}: {ruleCounts.newest}
                </li>
                <li>
                  {RAIL_SOURCE_LABELS.ending_soon}: {ruleCounts.ending_soon}
                </li>
              </ul>
              <p className="mt-2">
                כלל שמוצא 0 מוצרים אינו מרנדר כלום בעמוד. מאגר הדירוג: {ruleCounts.poolSize} מתוך{' '}
                {ruleCounts.poolLimit} לכל היותר.
              </p>
            </div>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="h-4 w-4"
        />
        פעיל
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-heading disabled:opacity-50"
      >
        שמירה
      </button>
    </form>
  )
}
