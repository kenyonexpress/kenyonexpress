'use client'

import { GIFT_WRAP_FEE_AGOROT, giftDateInputBounds } from '@/lib/gifts/wrap'
import { t } from '@/lib/i18n/messages'
import { shekelsRounded } from '@/lib/money-format'
import { type GiftPurchaseState, startGiftPurchase } from '@/server/actions/gift-purchase'
import { useActionState, useEffect, useState } from 'react'

/**
 * The gift form on /gift/[product] (S22).
 *
 * It collects exactly the fields the checkout gift block has, under the same
 * names, and nothing is charged here: the action adds the coupon to the cart
 * and opens /checkout with these values already filled in.
 */
export default function GiftPurchaseForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState<GiftPurchaseState, FormData>(
    startGiftPurchase,
    null,
  )

  // Set after mount, for the reason CheckoutForm gives: the bounds read the
  // clock, and a server/browser disagreement about the day is a hydration
  // mismatch. The server re-checks the date either way.
  const [bounds, setBounds] = useState<{ min?: string; max?: string }>({})
  useEffect(() => {
    setBounds(giftDateInputBounds())
  }, [])

  const field = 'flex flex-col gap-1 text-start'
  const label = 'text-sm font-medium text-heading'
  const input =
    'min-h-11 rounded-lg border border-heading/20 bg-white px-3 py-2 text-base text-heading'

  return (
    <form action={formAction} className="mt-6 grid gap-4">
      <input type="hidden" name="product_id" value={productId} />

      <div className={field}>
        <label htmlFor="gift-email" className={label}>
          {t('gift.purchase.emailLabel')} <span aria-hidden="true">*</span>
        </label>
        <input
          id="gift-email"
          name="gift_recipient_email"
          type="email"
          required
          maxLength={200}
          dir="ltr"
          autoComplete="off"
          placeholder="name@example.com"
          className={input}
        />
      </div>

      <div className={field}>
        <label htmlFor="gift-name" className={label}>
          {t('gift.purchase.nameLabel')}
        </label>
        <input id="gift-name" name="gift_recipient_name" maxLength={80} className={input} />
      </div>

      <div className={field}>
        <label htmlFor="gift-message" className={label}>
          {t('gift.purchase.messageLabel')}
        </label>
        <textarea
          id="gift-message"
          name="gift_message"
          maxLength={500}
          rows={4}
          placeholder={t('gift.purchase.messagePlaceholder')}
          className={input}
        />
      </div>

      <div className={field}>
        <label htmlFor="gift-deliver-at" className={label}>
          {t('gift.deliverLabel')}
        </label>
        <input
          id="gift-deliver-at"
          name="gift_deliver_at"
          type="date"
          dir="ltr"
          min={bounds.min}
          max={bounds.max}
          className={input}
        />
        <span className="text-xs text-heading/75">{t('gift.deliverHint')}</span>
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm text-heading">
        <input type="checkbox" name="gift_wrap" className="size-5" />
        <span>
          {t('gift.wrapLabel')} ({shekelsRounded(GIFT_WRAP_FEE_AGOROT)})
        </span>
      </label>

      <p className="text-xs text-heading/75">{t('gift.purchase.cartNote')}</p>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-brand px-6 py-3 font-semibold text-brand-dark transition-colors hover:bg-brand-primary-hover disabled:opacity-60"
      >
        {pending ? t('gift.purchase.pending') : t('gift.purchase.submit')}
      </button>
    </form>
  )
}
