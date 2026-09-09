'use client'

import { t } from '@/lib/i18n/messages'
import { vapidPublicKey } from '@/lib/push/vapid'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * The one moment worth asking for notification permission in.
 *
 * WHY HERE AND NOWHERE ELSE. A permission prompt on a landing page is asked of
 * somebody who has not decided they want anything from this shop yet, and the
 * answer is "Block" -- which is not a "no, thanks", it is PERMANENT. A blocked
 * origin cannot ask again; the customer has to find site settings in their
 * browser and undo it by hand. There is exactly one chance and this is the
 * moment to spend it: the order just went through, the customer is waiting for
 * a coupon or a parcel, and "tell me when it moves" is a thing they want rather
 * than a thing being asked of them.
 *
 * IT DOES NOT CALL `Notification.requestPermission()`. This is a link to the
 * notifications page, where `PushOptIn` asks off an explicit button press. The
 * indirection is the point: a browser dialog appearing on the confirmation
 * screen, on top of the coupon codes, is exactly the unprompted interruption
 * that produces a Block. What this component spends is a suggestion.
 *
 * ONCE, AND NEVER FOR SOMEBODY WHO ALREADY DECIDED. It is not shown when
 * permission is already granted or denied, when notifications are unsupported,
 * when there is no VAPID key to subscribe with, or when it has been shown
 * before. `localStorage` and not a cookie: the state is per device, which is
 * what a notification permission is.
 */

const SHOWN_KEY = 'ke:push-invite-shown'

export default function PostPurchasePushPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Server-rendered as nothing and decided here, because every input to the
    // decision -- the permission state, the stored flag, whether the browser
    // has a PushManager at all -- exists only on the client.
    // The VALUE and not just the key. `'PushManager' in window` is true for a
    // window where something declared the name and left it undefined, which is
    // what a polyfill shim and a locked-down browser extension both look like;
    // offering to enable push there produces a failure the customer cannot act
    // on.
    if (!('Notification' in window) || !window.PushManager) return
    if (!vapidPublicKey()) return
    // `granted` and `denied` are both answers. Asking again adds nothing to the
    // first and cannot change the second.
    if (Notification.permission !== 'default') return

    try {
      if (localStorage.getItem(SHOWN_KEY) === '1') return
      localStorage.setItem(SHOWN_KEY, '1')
    } catch {
      // Private mode, or storage blocked. Showing it is the better failure:
      // the worst case is being asked twice, and the alternative is a customer
      // who can never be told their parcel shipped.
    }

    setVisible(true)
  }, [])

  if (!visible) return null

  return (
    <section
      dir="rtl"
      aria-label={t('common.push_invite.label')}
      className="mx-auto mt-6 flex max-w-xl items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-start"
    >
      <span aria-hidden="true" className="text-2xl">
        🔔
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-heading text-sm">{t('common.push_invite.title')}</p>
        <p className="mt-1 text-gray-500 text-xs leading-relaxed">{t('common.push_invite.body')}</p>
      </div>
      <Link
        href="/account/notifications"
        className="min-h-touch-min shrink-0 rounded-xl bg-brand-primary px-4 py-2 font-bold text-heading text-xs transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-brand-dark focus-visible:outline-offset-2"
      >
        {t('common.push_invite.cta')}
      </Link>
    </section>
  )
}
