'use client'

import { REFERRAL_SETTINGS_LABELS } from '@/lib/admin/referral-settings'
import {
  type SettingsActionState,
  updateReferralSettings,
} from '@/server/actions/admin/referral-settings'
import { useActionState } from 'react'

interface Props {
  /** Shekel strings for the money fields, already formatted from agorot. */
  values: {
    is_active: boolean
    referrer_bonus_ils: string
    referred_bonus_ils: string
    min_order_ils: string
    qualify_window_days: number
    max_per_referrer_month: number
    max_per_referrer_year: number
    require_manual_approval: boolean
  }
  readOnly: boolean
}

const INITIAL: SettingsActionState = null

const input =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:bg-gray-50'

export default function ReferralSettingsForm({ values, readOnly }: Props) {
  const [state, action, pending] = useActionState(updateReferralSettings, INITIAL)

  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={readOnly || pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="is_active" defaultChecked={values.is_active} />
          {REFERRAL_SETTINGS_LABELS.is_active}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">
            {REFERRAL_SETTINGS_LABELS.referrer_bonus_agorot}
          </span>
          <input
            name="referrer_bonus_agorot"
            inputMode="decimal"
            defaultValue={values.referrer_bonus_ils}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">
            {REFERRAL_SETTINGS_LABELS.referred_bonus_agorot}
          </span>
          <input
            name="referred_bonus_agorot"
            inputMode="decimal"
            defaultValue={values.referred_bonus_ils}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">
            {REFERRAL_SETTINGS_LABELS.min_order_agorot}
          </span>
          <input
            name="min_order_agorot"
            inputMode="decimal"
            defaultValue={values.min_order_ils}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">
            {REFERRAL_SETTINGS_LABELS.qualify_window_days}
          </span>
          <input
            name="qualify_window_days"
            type="number"
            min={1}
            max={365}
            defaultValue={values.qualify_window_days}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">
            {REFERRAL_SETTINGS_LABELS.max_per_referrer_month}
          </span>
          <input
            name="max_per_referrer_month"
            type="number"
            min={1}
            max={1000}
            defaultValue={values.max_per_referrer_month}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-600">
            {REFERRAL_SETTINGS_LABELS.max_per_referrer_year}
          </span>
          <input
            name="max_per_referrer_year"
            type="number"
            min={1}
            max={10000}
            defaultValue={values.max_per_referrer_year}
            className={input}
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="require_manual_approval"
            defaultChecked={values.require_manual_approval}
          />
          {REFERRAL_SETTINGS_LABELS.require_manual_approval}
        </label>
      </fieldset>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-primary-hover disabled:opacity-60"
          >
            {pending ? 'שומר...' : 'שמירה'}
          </button>
          {state && 'error' in state && <span className="text-sm text-red-600">{state.error}</span>}
          {state && 'success' in state && (
            <span className="text-sm text-green-700">{state.success}</span>
          )}
        </div>
      )}
    </form>
  )
}
