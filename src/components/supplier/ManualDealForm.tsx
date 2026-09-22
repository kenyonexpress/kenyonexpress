'use client'

import { t } from '@/lib/i18n/messages'
import { submitManualDeal } from '@/server/actions/supplier/deals-feed'
import { useRef, useState, useTransition } from 'react'

/** One deal submitted by hand, no feed required. Reviewed the same way a fetched one is. */
export default function ManualDealForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        startTransition(async () => {
          const result = await submitManualDeal(formData)
          setState({
            ok: result.ok,
            text: result.ok
              ? (result.message ?? t('supplier.dealsManualSubmitted'))
              : (result.error ?? ''),
          })
          if (result.ok) formRef.current?.reset()
        })
      }}
    >
      <div>
        <label className="block text-xs text-gray-600" htmlFor="deal-name">
          {t('supplier.dealsManualName')}
        </label>
        <input
          id="deal-name"
          name="name_he"
          required
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-600" htmlFor="deal-price">
            {t('supplier.dealsManualPrice')}
          </label>
          <input
            id="deal-price"
            name="price_ils"
            type="number"
            min="0.01"
            step="0.01"
            required
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600" htmlFor="deal-full-price">
            {t('supplier.dealsManualFullPrice')}
          </label>
          <input
            id="deal-full-price"
            name="full_price_ils"
            type="number"
            min="0.01"
            step="0.01"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-600" htmlFor="deal-category">
          {t('supplier.dealsManualCategory')}
        </label>
        <input
          id="deal-category"
          name="category_text"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600" htmlFor="deal-link">
          {t('supplier.dealsManualLink')}
        </label>
        <input
          id="deal-link"
          name="link_url"
          type="url"
          dir="ltr"
          placeholder="https://"
          required
          className="mt-1 w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600" htmlFor="deal-image">
          {t('supplier.dealsManualImage')}
        </label>
        <input
          id="deal-image"
          name="image_url"
          type="url"
          dir="ltr"
          placeholder="https://"
          className="mt-1 w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-full bg-heading px-5 text-sm font-bold text-white disabled:opacity-60"
      >
        {t('supplier.dealsManualSubmit')}
      </button>
      {state ? (
        <p className={`text-sm ${state.ok ? 'text-green-700' : 'text-red-600'}`}>{state.text}</p>
      ) : null}
    </form>
  )
}
