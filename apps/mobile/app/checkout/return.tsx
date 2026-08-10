import { supabase } from '@/lib/supabase'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

/**
 * What the customer sees after the payment sheet closes.
 *
 * IT DOES NOT BELIEVE THE `status` PARAM. That value came off a redirect URL
 * and is worth nothing: the order becomes `paid` when the webhook, or the
 * server's own `GetLpResult` verification, says so. So this screen polls the
 * order row and reports what the DATABASE holds.
 *
 * POLLING, AND WHY IT IS BOUNDED. The webhook usually lands before the sheet
 * closes, but "usually" is not a guarantee and a customer staring at a spinner
 * needs an end. Ten tries, two seconds apart, then a screen that says the
 * payment is still being verified and sends them to their orders - which is
 * true, and better than a spinner that never stops.
 */

const MAX_POLLS = 10
const POLL_MS = 2000

type OrderState = 'checking' | 'paid' | 'failed' | 'unknown'

export default function CheckoutReturnScreen() {
  const params = useLocalSearchParams<{ order_id?: string; status?: string }>()
  const orderId = typeof params.order_id === 'string' ? params.order_id : ''
  const [state, setState] = useState<OrderState>(
    // A failed redirect is still verified, because a card can decline on the
    // redirect and settle on the webhook seconds later. But the customer is
    // told the truthful "still checking" rather than a premature "paid".
    orderId ? 'checking' : 'unknown',
  )

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    let attempts = 0

    async function poll() {
      if (cancelled) return
      attempts += 1

      const { data } = await supabase
        .from('orders')
        .select('id, status, paid_at')
        .eq('id', orderId)
        .maybeSingle()

      if (cancelled) return

      if (data?.paid_at) {
        setState('paid')
        return
      }
      if (data?.status === 'cancelled' || data?.status === 'failed') {
        setState('failed')
        return
      }
      if (attempts >= MAX_POLLS) {
        setState('unknown')
        return
      }
      setTimeout(poll, POLL_MS)
    }

    poll()
    return () => {
      cancelled = true
    }
  }, [orderId])

  const goToCoupons = useCallback(() => router.replace('/coupons' as never), [])
  const goHome = useCallback(() => router.replace('/' as never), [])

  if (state === 'checking') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.title}>מאמתים את התשלום...</Text>
        <Text style={styles.body}>ההזמנה נקלטה ואנחנו ממתינים לאישור הסליקה.</Text>
      </View>
    )
  }

  if (state === 'paid') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>התשלום התקבל</Text>
        <Text style={styles.body}>הקופונים שלך מוכנים.</Text>
        <Pressable style={styles.button} onPress={goToCoupons}>
          <Text style={styles.buttonText}>לקופונים שלי</Text>
        </Pressable>
      </View>
    )
  }

  if (state === 'failed') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>התשלום לא הושלם</Text>
        <Text style={styles.body}>לא חויבת. אפשר לנסות שוב עם אמצעי תשלום אחר.</Text>
        <Pressable style={styles.button} onPress={goHome}>
          <Text style={styles.buttonText}>חזרה</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.center}>
      <Text style={styles.title}>עדיין מאמתים</Text>
      <Text style={styles.body}>
        האישור מהסליקה מתעכב. ברגע שיתקבל נעדכן אותך, והקופונים יופיעו באזור האישי.
      </Text>
      <Pressable style={styles.button} onPress={goToCoupons}>
        <Text style={styles.buttonText}>לקופונים שלי</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', writingDirection: 'rtl' },
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: '#4b5563',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  button: {
    marginTop: 10,
    backgroundColor: '#f5c518',
    paddingVertical: 13,
    paddingHorizontal: 26,
    borderRadius: 10,
  },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
})
