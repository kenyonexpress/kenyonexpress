import CheckoutWebView, { type CheckoutOutcome } from '@/components/CheckoutWebView'
import { router } from 'expo-router'
import { useCallback } from 'react'

/**
 * The checkout sheet. Presented modally so dismissing it is an obvious
 * "not now" rather than a back-navigation into a half-built order.
 */
export default function CheckoutScreen() {
  const onDone = useCallback((outcome: CheckoutOutcome) => {
    // `replace`, not `push`: the payment sheet must not be reachable by
    // swiping back from the confirmation, where a second submit would try to
    // resume an order that is already paid.
    router.replace({
      pathname: '/checkout/return',
      params: { order_id: outcome.orderId, status: outcome.status },
    } as never)
  }, [])

  const onCancel = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/' as never)
  }, [])

  return <CheckoutWebView onDone={onDone} onCancel={onCancel} />
}
