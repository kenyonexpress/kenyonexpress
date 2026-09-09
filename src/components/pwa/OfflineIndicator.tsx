'use client'

import { t } from '@/lib/i18n/messages'
import { useEffect, useState } from 'react'

/**
 * The strip that says the connection is gone.
 *
 * WHY THIS EXISTS AT ALL. `public/sw.js` keeps the last catalogue pages a
 * shopper looked at and serves them when the network fails, which is the
 * feature -- and which is also exactly what makes an indicator necessary. A
 * page that renders normally from cache is indistinguishable from a page that
 * loaded, so without this a shopper taps a product, gets nothing, and concludes
 * the shop is broken. The worst version of an offline mode is a silent one.
 *
 * `navigator.onLine` IS ONLY TRUSTED IN ONE DIRECTION, and that is the whole
 * design. `false` means the device has no network interface at all and is
 * reliable. `true` means it has one, and says nothing about whether anything is
 * reachable through it -- a captive wifi portal reports `true`. So this
 * component treats `false` as "show it" and `true` as "show nothing", which is
 * the direction where the signal is sound. It never claims to be online.
 *
 * THE FIRST RENDER IS ALWAYS "ONLINE", AND NOT BECAUSE THAT IS OPTIMISTIC.
 * The server has no `navigator`, so any other initial value is a hydration
 * mismatch on every page load. The real reading happens in the effect, one
 * frame later, which is imperceptible next to the event it reports.
 *
 * IT RENDERS NOTHING WHEN ONLINE, deliberately: the header is under the pixel
 * parity gate at 380, 768 and 1440, and a strip that occupied a row would move
 * every measurement below it on every page for a state almost nobody is in. The
 * cost is a layout shift at the moment the network drops, for the visitors it
 * drops for, and that is the right place to spend it -- an indicator that
 * overlays the page would cover the first product card instead.
 *
 * THE ROLE IS `status`, NOT `alert`. Losing signal is not an emergency and does
 * not warrant interrupting a screen reader mid-sentence; `status` is polite and
 * is announced when the user is between utterances. It is carried by an
 * `<output>` element, which has that role implicitly.
 */
export default function OfflineIndicator() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    // Read once on mount as well as subscribing: a visitor can arrive on a
    // cached page ALREADY offline, in which case neither event ever fires and
    // subscribing alone would leave the strip hidden for the whole visit.
    const read = () => setOffline(navigator.onLine === false)
    read()

    window.addEventListener('online', read)
    window.addEventListener('offline', read)
    return () => {
      window.removeEventListener('online', read)
      window.removeEventListener('offline', read)
    }
  }, [])

  if (!offline) return null

  return (
    // `<output>` and not a div with role="status": the element carries that
    // role implicitly, which is what the a11y lint asks for. `aria-live` stays
    // written out even though it is also implicit, because the politeness is
    // the deliberate half of the decision and an implicit attribute is not
    // something the next reader can see.
    <output
      dir="rtl"
      aria-live="polite"
      className="flex w-full items-center justify-center gap-2 bg-heading px-gutter py-1.5 text-center font-bold text-white text-xs"
    >
      <span aria-hidden="true">●</span>
      <span>{t('common.offline')}</span>
    </output>
  )
}
