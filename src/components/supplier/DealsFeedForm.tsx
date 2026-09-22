'use client'

import { t } from '@/lib/i18n/messages'
import { updateFeedConfig } from '@/server/actions/supplier/deals-feed'
import { useState, useTransition } from 'react'

/**
 * A supplier points the automated deals pipeline at their own feed. See
 * migrations/pending/237_deals_autopilot.sql and docs/DEALS-PIPELINE.md:
 * every row this fetch produces still waits for an admin before it is
 * anything a shopper can see.
 */
export default function DealsFeedForm({
  current,
}: {
  current: { feedUrl: string | null; feedFormat: string | null }
}) {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        startTransition(async () => {
          const result = await updateFeedConfig(formData)
          setState({
            ok: result.ok,
            text: result.ok
              ? (result.message ?? t('supplier.dealsFeedSaved'))
              : (result.error ?? ''),
          })
        })
      }}
    >
      <p className="text-sm text-gray-500">{t('supplier.dealsFeedNote')}</p>
      <div>
        <label className="block text-xs text-gray-600" htmlFor="deals-feed-url">
          {t('supplier.dealsFeedUrlLabel')}
        </label>
        <input
          id="deals-feed-url"
          name="feed_url"
          type="url"
          dir="ltr"
          placeholder="https://"
          defaultValue={current.feedUrl ?? ''}
          className="mt-1 w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600" htmlFor="deals-feed-format">
          {t('supplier.dealsFeedFormatLabel')}
        </label>
        <select
          id="deals-feed-format"
          name="feed_format"
          defaultValue={current.feedFormat ?? ''}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">—</option>
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-full bg-heading px-5 text-sm font-bold text-white disabled:opacity-60"
      >
        {t('supplier.dealsFeedSave')}
      </button>
      {state ? (
        <p className={`text-sm ${state.ok ? 'text-green-700' : 'text-red-600'}`}>{state.text}</p>
      ) : null}
    </form>
  )
}
