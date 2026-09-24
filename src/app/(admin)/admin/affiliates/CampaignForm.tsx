'use client'

import { CAMPAIGN_LABELS, isoToLocalDateTime } from '@/lib/admin/affiliate-campaigns'
import {
  type CampaignActionState,
  saveAffiliateCampaign,
} from '@/server/actions/admin/affiliate-campaigns'
import { useActionState } from 'react'

export interface CampaignFormValues {
  id: string | null
  name: string
  /** Percent as text ("12.5"), already derived from basis points. */
  commission_percent: string
  /** Shekel strings, already formatted from agorot. */
  min_order_ils: string
  max_commission_ils: string
  budget_ils: string
  max_conversions_per_day: number
  require_manual_approval: boolean
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  category_id: string | null
  product_id: string | null
}

const INITIAL: CampaignActionState = null

const input =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50'

/**
 * Create or edit one campaign. Money is typed in shekels and percent, and
 * parsed once on the server (parseCampaignForm) into integer agorot and basis
 * points; the form itself holds nothing but text.
 */
export default function CampaignForm({
  values,
  readOnly,
  categories,
}: {
  values: CampaignFormValues
  readOnly: boolean
  categories: Array<{ id: string; name: string }>
}) {
  const [state, action, pending] = useActionState(saveAffiliateCampaign, INITIAL)

  return (
    <form action={action} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <fieldset disabled={readOnly || pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-xs text-gray-600">{CAMPAIGN_LABELS.name}</span>
          <input name="name" defaultValue={values.name} className={input} maxLength={80} required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">{CAMPAIGN_LABELS.commission_bp}</span>
          <input
            name="commission_bp"
            inputMode="decimal"
            dir="ltr"
            defaultValue={values.commission_percent}
            className={input}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">
            {CAMPAIGN_LABELS.min_order_agorot}
          </span>
          <input
            name="min_order_agorot"
            inputMode="decimal"
            dir="ltr"
            defaultValue={values.min_order_ils}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">
            {CAMPAIGN_LABELS.max_commission_agorot}
          </span>
          <input
            name="max_commission_agorot"
            inputMode="decimal"
            dir="ltr"
            defaultValue={values.max_commission_ils}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">{CAMPAIGN_LABELS.budget_agorot}</span>
          <input
            name="budget_agorot"
            inputMode="decimal"
            dir="ltr"
            defaultValue={values.budget_ils}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">
            {CAMPAIGN_LABELS.max_conversions_per_day}
          </span>
          <input
            name="max_conversions_per_day"
            type="number"
            min={1}
            max={1000}
            dir="ltr"
            defaultValue={values.max_conversions_per_day}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">{CAMPAIGN_LABELS.category_id}</span>
          <select name="category_id" defaultValue={values.category_id ?? ''} className={input}>
            <option value="">הכל</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">{CAMPAIGN_LABELS.product_id}</span>
          <input
            name="product_id"
            dir="ltr"
            defaultValue={values.product_id ?? ''}
            className={`${input} font-mono text-xs`}
            placeholder="uuid של המוצר"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">{CAMPAIGN_LABELS.starts_at}</span>
          <input
            name="starts_at"
            type="datetime-local"
            dir="ltr"
            defaultValue={isoToLocalDateTime(values.starts_at)}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">{CAMPAIGN_LABELS.ends_at}</span>
          <input
            name="ends_at"
            type="datetime-local"
            dir="ltr"
            defaultValue={isoToLocalDateTime(values.ends_at)}
            className={input}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="require_manual_approval"
            defaultChecked={values.require_manual_approval}
          />
          {CAMPAIGN_LABELS.require_manual_approval}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={values.is_active} />
          {CAMPAIGN_LABELS.is_active}
        </label>
      </fieldset>

      {state && 'error' in state && <p className="text-sm text-red-600">{state.error}</p>}
      {state && 'success' in state && <p className="text-sm text-green-600">{state.success}</p>}

      {!readOnly && (
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-dark transition-colors hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'שומר...' : values.id ? 'עדכון הקמפיין' : 'יצירת קמפיין'}
        </button>
      )}
    </form>
  )
}
