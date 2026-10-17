import { Stack, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, ScrollView, View, Text } from 'react-native'
import { useState, useEffect } from 'react'

/**
 * Product detail page. Navigated from product deep-links in notifications.
 */
export default function ProductDetailPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const [loading, setLoading] = useState(true)
  const [product, setProduct] = useState<any>(null)

  useEffect(() => {
    if (!slug) return

    // Fetch product data from the mobile API endpoint
    fetch(`https://kenyonexpress.co.il/api/mobile/products/${slug}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json()
      })
      .then((data) => {
        setProduct(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [slug])

  return (
    <>
      <Stack.Screen options={{ title: product?.name_he || 'מוצר' }} />
      <ScrollView className="flex-1 bg-white">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
          </View>
        ) : product ? (
          <View className="p-4">
            <Text className="text-lg font-bold mb-2 text-right">{product.name_he}</Text>
            <Text className="text-base text-gray-600 text-right">{product.description_he}</Text>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-600">מוצר לא נמצא</Text>
          </View>
        )}
      </ScrollView>
    </>
  )
}
