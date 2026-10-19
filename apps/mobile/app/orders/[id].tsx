import { Stack, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, ScrollView, View, Text } from 'react-native'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Order detail page. Navigated from order deep-links in notifications.
 */
export default function OrderDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    // Fetch order details from Supabase
    const fetchOrder = async () => {
      try {
        const { data, error: err } = await supabase.from('orders').select('*').eq('id', id).single()
        if (err) throw err
        setOrder(data)
      } catch (err) {
        setError('Order not found')
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
  }, [id])

  return (
    <>
      <Stack.Screen options={{ title: 'הזמנה' }} />
      <ScrollView className="flex-1 bg-white">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-red-600">{error}</Text>
          </View>
        ) : order ? (
          <View className="p-4">
            <Text className="text-lg font-bold mb-2 text-right">הזמנה #{order.id.slice(0, 8)}</Text>
            <Text className="text-base text-gray-600 text-right">סטטוס: {order.status}</Text>
            <Text className="text-base text-gray-600 text-right">
              סכום: ₪{Math.floor(order.total / 100)}.{String(order.total % 100).padStart(2, '0')}
            </Text>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-600">הזמנה לא נמצאה</Text>
          </View>
        )}
      </ScrollView>
    </>
  )
}
