import { pathFromNotification, registerForPush } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import * as Notifications from 'expo-notifications'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef } from 'react'
import { I18nManager, Platform } from 'react-native'

/**
 * Root layout: RTL, push wiring, and the two ways a notification can open a
 * screen.
 *
 * RTL IS FORCED ONCE AND IT NEEDS A RESTART. `I18nManager.forceRTL` takes
 * effect on the NEXT launch on Android; calling it here means the very first
 * run after install can render LTR. That is accepted rather than worked around:
 * the alternative is a programmatic reload that looks like a crash to the user.
 * `allowRTL` is set alongside it because forceRTL alone is ignored when the
 * app was built with RTL disallowed.
 */
I18nManager.allowRTL(true)
if (!I18nManager.isRTL) I18nManager.forceRTL(true)

export default function RootLayout() {
  const handled = useRef<string | null>(null)

  useEffect(() => {
    // Registration follows the session, never the launch: a token belongs to a
    // user row, and asking for the permission before sign-in spends iOS's one
    // prompt on a screen where nobody has a reason to accept.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        registerForPush().catch(() => undefined)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    // COLD START. A notification that launched the app is not delivered to the
    // listener below, because the listener did not exist when it arrived. This
    // is the only way to see it, and forgetting it is why "tapping the push
    // opens the home screen" is such a common bug.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const path = pathFromNotification(response)
      if (path && handled.current !== response?.notification.request.identifier) {
        handled.current = response?.notification.request.identifier ?? null
        router.push(path as never)
      }
    })

    // WARM: app already running, foreground or background.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = pathFromNotification(response)
      if (path) router.push(path as never)
    })
    return () => subscription.remove()
  }, [])

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTitleAlign: 'center',
          // The stack's own back gesture points the wrong way under forced RTL
          // on iOS; the header handles direction itself, the gesture does not.
          gestureDirection: Platform.OS === 'ios' ? 'horizontal-inverted' : undefined,
          headerStyle: { backgroundColor: '#ffffff' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'KenyonExpress' }} />
        <Stack.Screen name="coupons/index" options={{ title: 'הקופונים שלי' }} />
        <Stack.Screen name="coupons/[id]" options={{ title: 'קופון' }} />
        <Stack.Screen name="wallet" options={{ title: 'הארנק שלי' }} />
        <Stack.Screen
          name="checkout/index"
          options={{ title: 'תשלום', presentation: 'modal' }}
        />
        <Stack.Screen name="checkout/return" options={{ title: 'אישור הזמנה' }} />
      </Stack>
    </>
  )
}
