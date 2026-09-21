'use client'

import { t } from '@/lib/i18n/messages'
import { MAX_PROPOSAL_NOTE_LENGTH } from '@/lib/supplier/price-proposals'
import { proposePrice } from '@/server/actions/supplier/price-proposal'
import { useState, useTransition } from 'react'

/**
 * One product's "propose a new price" box. Shekels in, and the server does
 * the only conversion to agorot; the client never touches money arithmetic.
 */
export default function PriceProposalForm({ productId }: { productId: string }) {
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const priceId = `price-${productId}`
  const noteId = `price-note-${productId}`

  return (
    <form
      className="mt-3 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(async () => {
          const result = await proposePrice(productId, price, note)
          setState({
            ok: result.ok,
            text: result.ok ? (result.message ?? '') : (result.error ?? ''),
          })
          if (result.ok) {
            setPrice('')
            setNote('')
          }
        })
      }}
    >
      <p className="text-sm font-semibold text-heading">{t('supplier.proposePriceHeading')}</p>
      <label className="block text-xs text-gray-600" htmlFor={priceId}>
        {t('supplier.proposePriceLabel')}
      </label>
      <input
        id={priceId}
        name="price_ils"
        inputMode="decimal"
        dir="ltr"
        required
        value={price}
        onChange={(event) => setPrice(event.target.value)}
        className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm"
      />
      <label className="block text-xs text-gray-600" htmlFor={noteId}>
        {t('supplier.proposePriceNote')}
      </label>
      <textarea
        id={noteId}
        name="note"
        maxLength={MAX_PROPOSAL_NOTE_LENGTH}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-bold text-white disabled:opacity-60"
      >
        {t('supplier.proposePriceSubmit')}
      </button>
      {state ? (
        <output className={`block text-xs ${state.ok ? 'text-green-700' : 'text-red-700'}`}>
          {state.text}
        </output>
      ) : null}
    </form>
  )
}
