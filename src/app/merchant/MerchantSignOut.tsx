'use client'

import { clearQueue, readQueue } from '@/lib/vouchers/merchant-scan-queue'
import { signOut } from '@/server/actions/auth'
import { LogOut } from 'lucide-react'

/**
 * Sign-out for the till. The queue is cleared on the way out, as the native
 * app does: a queued scan holds a voucher code, and the next person to hold
 * this phone is not entitled to it. A queue that still has items is announced
 * before it is lost, because losing it means a customer's coupon was never
 * burned, and the fix is one tap on "sync" first.
 */
export default function MerchantSignOut() {
  return (
    <form
      action={signOut}
      onSubmit={(event) => {
        const pending = readQueue(window.localStorage).length
        if (pending > 0) {
          const proceed = window.confirm(
            `יש ${pending} סריקות שטרם סונכרנו. יציאה תמחק אותן. להמשיך?`,
          )
          if (!proceed) {
            event.preventDefault()
            return
          }
        }
        clearQueue(window.localStorage)
      }}
    >
      <button
        type="submit"
        className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-gray-500 transition-colors hover:text-gray-900"
      >
        <LogOut size={15} aria-hidden="true" />
        יציאה
      </button>
    </form>
  )
}
