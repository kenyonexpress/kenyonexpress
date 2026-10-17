import { Stack } from 'expo-router'
import { ActivityIndicator, FlatList, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Notification history center. Shows past push notifications and their delivery status.
 */
type Notification = {
  id: string
  title: string
  body: string
  kind: string
  created_at: string
  push_status: string
  push_sent_at: string | null
}

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setError('Not signed in')
          return
        }

        // Fetch notification history from the outbox
        const { data, error: err } = await supabase
          .from('notification_outbox')
          .select('id, kind, push_status, push_sent_at, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (err) throw err
        setNotifications(data || [])
      } catch (err) {
        setError('Failed to load notifications')
      } finally {
        setLoading(false)
      }
    }

    fetchNotifications()
  }, [])

  const renderNotification = ({ item }: { item: Notification }) => (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.kind}>{kindLabel(item.kind)}</Text>
        <Text style={[styles.status, statusStyle(item.push_status)]}>
          {statusLabel(item.push_status)}
        </Text>
      </View>
      <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString('he-IL')}</Text>
    </View>
  )

  return (
    <>
      <Stack.Screen options={{ title: 'התראות' }} />
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.empty}>אין התראות</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}
    </>
  )
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'voucher_issued':
      return 'קופון חדש'
    case 'voucher_expiring':
      return 'קופון פוקע'
    case 'cashback_credited':
      return 'קאשבק'
    default:
      return kind
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'בהמתנה'
    case 'sent':
      return 'נשלח'
    case 'none':
      return 'לא שלח'
    case 'skipped':
      return 'דילוג'
    case 'dead':
      return 'כשל'
    default:
      return status
  }
}

function statusStyle(status: string) {
  switch (status) {
    case 'sent':
      return { color: '#22c55e' }
    case 'dead':
      return { color: '#ef4444' }
    case 'pending':
      return { color: '#f59e0b' }
    default:
      return { color: '#6b7280' }
  }
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: 12,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kind: {
    fontSize: 14,
    fontWeight: '500',
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
  },
  date: {
    fontSize: 12,
    color: '#6b7280',
  },
  error: {
    color: '#ef4444',
  },
  empty: {
    color: '#6b7280',
  },
})
