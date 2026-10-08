'use client'

import HelpForm from '@/components/help/HelpForm'
import OrderHelpCard from '@/components/help/OrderHelpCard'
import { parseHelpSearchParams } from '@/lib/help/order-links'
import { useSearchParams } from 'next/navigation'

/**
 * The part of `/help` that depends on the URL.
 *
 * The page itself is static; `?order=` and `?topic=` are read here, in the
 * browser, under a Suspense boundary, so a deep link from an order page lands
 * on a pre-filled form without making the whole page dynamic. An unknown topic
 * or a malformed order id is simply ignored, never echoed.
 */
export default function HelpContext() {
  const params = useSearchParams()
  const { orderRef, topic } = parseHelpSearchParams(params)

  return (
    <>
      {orderRef && <OrderHelpCard orderRef={orderRef} />}
      <section aria-labelledby="help-form-title" className="max-w-3xl">
        <h2 id="help-form-title" className="text-xl font-bold text-heading">
          לא מצאתם תשובה? כתבו לנו
        </h2>
        <p className="mt-2 mb-5 text-base leading-relaxed text-heading/80">
          הפנייה מגיעה ישירות לתיבה של בעל האתר, ונחזור אליכם למייל שתשאירו.
        </p>
        <HelpForm defaultTopic={topic ?? (orderRef ? 'orders' : null)} defaultOrderRef={orderRef} />
      </section>
    </>
  )
}
