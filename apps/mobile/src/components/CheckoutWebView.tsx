import { APP_RETURN_PATH, siteUrl } from '@/lib/config'
import { bridgeSessionToWeb } from '@/lib/supabase'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewNavigation } from 'react-native-webview'

/**
 * The checkout, running on our own site, inside the app.
 *
 * WHY THE WHOLE CHECKOUT AND NOT JUST CARDCOM'S PAGE. Loading only the Cardcom
 * Low Profile URL would mean the app first had to build the order itself: cart
 * validation, the wallet split, the address, the settlement snapshot,
 * idempotency. That is a second implementation of the money path. Instead the
 * app loads `/checkout?channel=app`, which is the same page and the same server
 * action the website uses, and Cardcom's hosted page appears inside it exactly
 * as it does in a desktop browser. D10: the commerce is not rebuilt.
 *
 * HOW IT COMES BACK. `channel=app` makes the server hand Cardcom
 * `/checkout/app-return` as its redirect target instead of the web iframe stub.
 * `onShouldStartLoadWithRequest` sees that navigation START and closes the
 * sheet before the page is ever painted. If the flow left the WebView for a
 * 3-D Secure step in the system browser, nobody is watching - and that is what
 * the deep link on the app-return page itself recovers.
 *
 * `sharedCookiesEnabled` IS LOAD-BEARING. Without it the WebView gets a private
 * cookie jar, the session bridge writes into the app's jar, and the checkout
 * renders logged out.
 */

export type CheckoutOutcome = { orderId: string; status: 'success' | 'failed' | 'cancelled' }

export default function CheckoutWebView({
  onDone,
  onCancel,
}: {
  onDone: (outcome: CheckoutOutcome) => void
  onCancel: () => void
}) {
  const [ready, setReady] = useState(false)
  const [bridgeFailed, setBridgeFailed] = useState(false)
  // A guard, not state: two navigations can race into the return path and
  // `onDone` must fire once.
  const finished = useRef(false)

  useEffect(() => {
    let cancelled = false
    bridgeSessionToWeb().then((ok) => {
      if (cancelled) return
      // Mount the WebView either way. Without the cookie the page shows its own
      // sign-in prompt, which is a better failure than a blank screen.
      if (!ok) setBridgeFailed(true)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function handleNavigation(event: WebViewNavigation): boolean {
    const url = event.url ?? ''
    if (!url.includes(APP_RETURN_PATH)) return true
    if (finished.current) return false
    finished.current = true

    // Parsed off the URL for the transition only. The order's real state is
    // read back from the server on the next screen; nothing here is trusted.
    const orderId = /[?&]order_id=([^&]+)/.exec(url)?.[1]
    const rawStatus = /[?&]status=([^&]+)/.exec(url)?.[1]
    const status =
      rawStatus === 'success' ? 'success' : rawStatus === 'cancelled' ? 'cancelled' : 'failed'

    onDone({ orderId: orderId ? decodeURIComponent(orderId) : '', status })
    // Stop the navigation: the page it would render is only a redirect stub.
    return false
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.hint}>מכינים את התשלום...</Text>
      </View>
    )
  }

  return (
    <View style={styles.fill}>
      {bridgeFailed ? <Text style={styles.warn}>לא הצלחנו להעביר את ההתחברות. ייתכן שתתבקשו להתחבר שוב.</Text> : null}
      <WebView
        source={{ uri: siteUrl('/checkout?channel=app') }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onShouldStartLoadWithRequest={handleNavigation}
        // Cardcom's hosted page posts a form to itself; without this the POST
        // is treated as a new top-level navigation and dropped.
        originWhitelist={['https://*', 'kenyonexpress://']}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        onError={onCancel}
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  hint: { fontSize: 15, color: '#4b5563' },
  warn: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    padding: 10,
    fontSize: 13,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
})
