import { supabase } from '@/lib/supabase'
import { Link } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

type VoucherRow = {
  id: string
  code: string
  status: string
  expires_at: string | null
  face_value_agorot: number | null
}

/**
 * The customer's coupons, read straight from Postgres under RLS.
 *
 * No API layer for a read the database already scopes correctly: the vouchers
 * policy limits a signed-in user to their own rows, so an extra endpoint would
 * only be a second place for that rule to be got wrong.
 *
 * `issued` only. A redeemed or expired coupon is history, and mixing it into
 * the wallet is how a customer walks into a shop holding a dead code.
 */
export default function CouponsScreen() {
  const [rows, setRows] = useState<VoucherRow[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('vouchers')
      .select('id, code, status, expires_at, face_value_agorot')
      .eq('status', 'issued')
      .order('expires_at', { ascending: true })
    setRows((data ?? []) as VoucherRow[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (rows === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>אין לך קופונים פעילים כרגע.</Text>
      </View>
    )
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true)
        await load()
        setRefreshing(false)
      }}
      renderItem={({ item }) => (
        <Link href={`/coupons/${item.id}`} asChild>
          <Pressable style={styles.card}>
            <Text style={styles.code}>{item.code}</Text>
            <Text style={styles.meta}>
              {item.expires_at
                ? `בתוקף עד ${new Date(item.expires_at).toLocaleDateString('he-IL')}`
                : 'ללא תאריך תפוגה'}
            </Text>
          </Pressable>
        </Link>
      )}
    />
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { fontSize: 15, color: '#4b5563', textAlign: 'center', writingDirection: 'rtl' },
  list: { padding: 16, gap: 12 },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#ffffff',
    gap: 6,
  },
  code: { fontSize: 18, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' },
  meta: { fontSize: 13, color: '#6b7280', textAlign: 'right', writingDirection: 'rtl' },
})
