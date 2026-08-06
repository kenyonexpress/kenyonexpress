'use client'

import { claimGift } from '@/server/actions/gifts'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/**
 * The claim button.
 *
 * A button and not an automatic claim on page load, deliberately: claiming
 * moves ownership of something somebody paid for, and a GET that transfers
 * property is a link a mail scanner or a link preview bot can fire. It has to
 * be a deliberate act by the person reading the page.
 */
export default function GiftClaimForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await claimGift(token)
            if (result.ok) {
              router.push('/account/coupons')
              return
            }
            setError(result.error)
          })
        }
        className="inline-block rounded-lg bg-brand px-6 py-3 font-semibold text-brand-dark transition-colors hover:bg-brand-primary-hover disabled:opacity-60"
      >
        {pending ? 'מעביר את הקופון...' : 'קבלת הקופון לחשבון שלי'}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
