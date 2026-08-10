import { type TodayScan, drainQueue, loadTodayScans } from '@/lib/supplier/api'
import { type QueuedScan, pendingScans } from '@/lib/supplier/queue'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

/**
 * Today's scans, and what is still waiting to become one.
 *
 * THE TWO LISTS ARE NOT MERGED, AND THAT IS THE POINT. A queued scan has not
 * happened yet - the voucher is not burned and might turn out to be expired.
 * Showing it in the same list as a completed redemption, greyed out, is how a
 * cashier ends up believing a sale went through. So: a settled list read from
 * the database, and a separate, clearly-labelled pending list read from the
 * device.
 *
 * The settled list comes from `voucher_redemptions` under the supplier read
 * policy, which is also why refusals appear in it: an expired voucher somebody
 * tried to use is part of the day and is often the thing the cashier is looking
 * for.
 */

const OUTCOME_LABEL: Record<string, string> = {
  success: 'מומש',
  already_redeemed: 'כבר מומש',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
  refunded: 'הוחזר',
  not_found: 'לא נמצא',
  wrong_supplier: 'שובר של עסק אחר',
  invalid_signature: 'קוד לא תקין',
  rate_limited: 'נחסם זמנית',
  unauthorized: 'אין הרשאה',
  invalid_request: 'בקשה לא תקינה',
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

export default function HistoryScreen() {
  const [scans, setScans] = useState<TodayScan[] | null>(null)
  const [queued, setQueued] = useState<QueuedScan[]>([])
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    const [rows, pending] = await Promise.all([loadTodayScans(), pendingScans()])
    setScans(rows)
    setQueued(pending)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function sync() {
    setSyncing(true)
    await drainQueue()
    await load()
    setSyncing(false)
  }

  if (scans === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    )
  }

  const redeemed = scans.filter((row) => row.outcome === 'success').length

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.summary}>{`${redeemed} מומשו היום · ${scans.length} סריקות`}</Text>

      {queued.length > 0 ? (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingTitle}>{`${queued.length} ממתינות לסנכרון`}</Text>
          <Text style={styles.pendingBody}>
            הסריקות האלה עדיין לא נשלחו. השוברים טרם מומשו.
          </Text>
          {queued.map((item) => (
            <Text key={item.idempotencyKey} style={styles.pendingRow}>
              {`${time(item.scannedAt)} · ${item.label}`}
            </Text>
          ))}
          <Pressable style={[styles.syncButton, syncing && styles.busy]} onPress={sync} disabled={syncing}>
            <Text style={styles.syncButtonText}>{syncing ? 'מסנכרן...' : 'סנכרון עכשיו'}</Text>
          </Pressable>
        </View>
      ) : null}

      {scans.length === 0 ? (
        <Text style={styles.empty}>עדיין לא נסרקו שוברים היום.</Text>
      ) : (
        scans.map((row) => (
          <View key={row.id} style={styles.row}>
            <Text style={styles.rowCode}>{row.code_entered ?? '—'}</Text>
            <Text
              style={[styles.rowOutcome, row.outcome === 'success' ? styles.ok : styles.bad]}
            >
              {OUTCOME_LABEL[row.outcome] ?? row.outcome}
            </Text>
            <Text style={styles.rowTime}>{time(row.created_at)}</Text>
          </View>
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summary: { fontSize: 16, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  empty: { fontSize: 15, color: '#4b5563', textAlign: 'center', marginTop: 24 },

  pendingBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  pendingTitle: { fontSize: 15, fontWeight: '700', color: '#92400e', textAlign: 'right' },
  pendingBody: { fontSize: 13, color: '#92400e', textAlign: 'right', writingDirection: 'rtl' },
  pendingRow: { fontSize: 13, color: '#78350f', textAlign: 'right' },
  syncButton: {
    marginTop: 8,
    backgroundColor: '#92400e',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  syncButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  busy: { opacity: 0.6 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
  },
  rowCode: { fontSize: 15, fontWeight: '700' },
  rowOutcome: { fontSize: 14, fontWeight: '600' },
  ok: { color: '#166534' },
  bad: { color: '#b91c1c' },
  rowTime: { fontSize: 13, color: '#6b7280' },
})
