import { siteUrl } from '@/lib/config'
import { supabase } from '@/lib/supabase'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native'

type VoucherRow = {
  id: string
  code: string
  status: string
  expires_at: string | null
  qr_payload: string | null
}

/**
 * A single coupon.
 *
 * THE QR IS NOT RENDERED HERE YET, AND THAT IS SAID RATHER THAN FAKED. Drawing
 * it needs `react-native-qrcode-svg` plus `react-native-svg`, which are native
 * modules that must be in the build - adding them to package.json without a
 * build to prove them would be a screen that crashes on open. Until then this
 * shows the code, which the till can key in, and opens the web voucher page,
 * which renders the signed QR the scanner expects.
 *
 * The signed payload itself is never displayed as text: the QR encodes a
 * signature over the voucher id, and a human-readable dump of it invites
 * someone to retype it into a generator.
 */
export default function CouponScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [row, setRow] = useState<VoucherRow | null | 'missing'>(null)

  useEffect(() => {
    if (!id) return
    supabase
      .from('vouchers')
      .select('id, code, status, expires_at, qr_payload')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setRow((data as VoucherRow | null) ?? 'missing'))
  }, [id])

  if (row === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  if (row === 'missing') {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>הקופון לא נמצא.</Text>
      </View>
    )
  }

  const expired = row.status !== 'issued'

  return (
    <View style={styles.page}>
      <Text style={styles.code}>{row.code}</Text>
      <Text style={styles.body}>
        {row.expires_at
          ? `בתוקף עד ${new Date(row.expires_at).toLocaleDateString('he-IL')}`
          : 'ללא תאריך תפוגה'}
      </Text>
      {expired ? <Text style={styles.warn}>הקופון כבר אינו פעיל.</Text> : null}

      <Pressable
        style={styles.button}
        onPress={() => Linking.openURL(siteUrl(`/account/coupons/${row.id}`))}
      >
        <Text style={styles.buttonText}>הצגת ה-QR לסריקה</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 28, gap: 12, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  code: { fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  body: { fontSize: 15, color: '#4b5563', textAlign: 'center', writingDirection: 'rtl' },
  warn: { fontSize: 14, color: '#b91c1c', textAlign: 'center', writingDirection: 'rtl' },
  button: {
    marginTop: 14,
    backgroundColor: '#f5c518',
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 10,
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
})
