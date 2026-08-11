import { type SupplierContext, loadSupplierContext } from '@/lib/supplier/api'
import { pendingCount } from '@/lib/supplier/queue'
import { Link } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

/**
 * The supplier mode's front door, and the gate in front of it.
 *
 * THREE REFUSALS, EACH SAYING SOMETHING DIFFERENT. "You are not a supplier",
 * "your business has not enabled app scanning", and "nobody has been set up to
 * scan yet" are three separate situations with three separate fixes, and
 * collapsing them into one "not available" screen means a support call for each.
 *
 * The gate is a courtesy, not the enforcement. Every refusal here is also
 * enforced server-side: `redeem_voucher` derives the supplier from membership
 * and refuses a caller who has none, whatever this screen chose to render.
 */
export default function SupplierHome() {
  const [context, setContext] = useState<SupplierContext | null | 'none'>(null)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    loadSupplierContext().then((result) => setContext(result ?? 'none'))
    pendingCount().then(setPending)
  }, [])

  if (context === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  if (context === 'none') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>אין הרשאת ספק</Text>
        <Text style={styles.body}>
          החשבון הזה אינו משויך לבית עסק. אם זו טעות, בעל העסק יכול להוסיף אותך מאזור הספקים באתר.
        </Text>
      </View>
    )
  }

  if (!context.scanning_enabled) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>סריקה באפליקציה כבויה</Text>
        <Text style={styles.body}>
          {`הסריקה דרך האפליקציה עדיין לא הופעלה עבור ${context.supplier_name}. אפשר להמשיך לממש שוברים מאזור הספקים באתר.`}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <Text style={styles.title}>{context.supplier_name}</Text>

      {context.staff_count === 0 ? (
        <Text style={styles.notice}>
          עדיין לא הוגדרו עובדים. אפשר לסרוק, והסריקות יירשמו בלי שם עובד.
        </Text>
      ) : null}

      {pending > 0 ? (
        <Text style={styles.notice}>{`${pending} סריקות ממתינות לסנכרון.`}</Text>
      ) : null}

      <Link href="/supplier/scan" asChild>
        <Pressable style={styles.buttonPrimary}>
          <Text style={styles.buttonPrimaryText}>סריקת שובר</Text>
        </Pressable>
      </Link>

      <Link href="/supplier/history" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>הסריקות של היום</Text>
        </Pressable>
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 24, gap: 14, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', writingDirection: 'rtl' },
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: '#4b5563',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  notice: {
    fontSize: 14,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 10,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  buttonPrimary: {
    backgroundColor: '#f5c518',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPrimaryText: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  button: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
})
