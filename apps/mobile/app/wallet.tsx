import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

/**
 * The wallet balance, read from the balances view rather than summed here.
 *
 * The ledger is the truth and the view is its authorised reading; adding the
 * entries up on a phone would be a second implementation of the balance, and
 * the first time the two disagreed the customer would believe the phone.
 */
export default function WalletScreen() {
  const [balanceAgorot, setBalanceAgorot] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    supabase
      .from('wallet_balances')
      .select('balance_ils')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) {
          setFailed(true)
          return
        }
        // The column is still the pre-integer name. Rounding at the boundary is
        // the only float this path ever touches, and it never goes back.
        setBalanceAgorot(Math.round(Number((data as { balance_ils: number }).balance_ils) * 100))
      })
  }, [])

  if (failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>לא הצלחנו לטעון את היתרה כרגע.</Text>
      </View>
    )
  }

  if (balanceAgorot === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  const whole = Math.trunc(balanceAgorot / 100)
  const fraction = balanceAgorot % 100

  return (
    <View style={styles.center}>
      <Text style={styles.label}>היתרה שלך</Text>
      <Text style={styles.amount}>
        ₪{whole.toLocaleString('he-IL')}
        {fraction === 0 ? '' : `.${String(fraction).padStart(2, '0')}`}
      </Text>
      <Text style={styles.body}>אפשר להשתמש ביתרה בקנייה הבאה.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
  label: { fontSize: 15, color: '#6b7280' },
  amount: { fontSize: 40, fontWeight: '800' },
  body: { fontSize: 14, color: '#4b5563', textAlign: 'center', writingDirection: 'rtl' },
})
