import { siteUrl } from '@/lib/config'
import { supabase } from '@/lib/supabase'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

/**
 * Push registration, permission and routing.
 *
 * THE ORDER MATTERS AND IT IS NOT THE OBVIOUS ONE. Registration runs AFTER
 * sign-in, never on first launch. A token belongs to a user row; asking for
 * notification permission before there is anyone to notify burns the one
 * permission prompt iOS gives you on a screen where the customer has no reason
 * to say yes, and iOS will not ask again.
 *
 * A SIMULATOR HAS NO TOKEN. `getExpoPushTokenAsync` throws there rather than
 * returning null, which is why every call is guarded by `Device.isDevice`.
 */

// Foreground behaviour. Without this an arriving push is delivered silently to
// the JS handler and never shown, which reads as "push is broken" during every
// manual test.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

/** Must equal `ANDROID_CHANNEL_ID` on the server, or Android silences the push. */
export const ANDROID_CHANNEL_ID = 'default'

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'התראות',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#f5c518',
  })
}

async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync()
  if (existing.granted) return true
  // Asking again after a denial is a no-op on iOS: the OS answers from its own
  // record without showing anything. Handled by not treating it as an error.
  const asked = await Notifications.requestPermissionsAsync()
  return asked.granted
}

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId
  )
}

export type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'no-device' | 'denied' | 'no-token' | 'not-signed-in' | 'server' }

/**
 * Registers this device for the signed-in user. Safe to call on every cold
 * start: the server upserts on the token, so repeats cost one row update.
 */
export async function registerForPush(): Promise<RegisterResult> {
  if (!Device.isDevice) return { ok: false, reason: 'no-device' }

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { ok: false, reason: 'not-signed-in' }

  await ensureAndroidChannel()
  if (!(await requestPermission())) return { ok: false, reason: 'denied' }

  let token: string
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId: projectId() })
    token = result.data
  } catch {
    return { ok: false, reason: 'no-token' }
  }

  try {
    const response = await fetch(siteUrl('/api/app/push-tokens'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The WebView cookie bridge is a separate mechanism; this route is a
        // plain API call and authenticates with the token the app holds.
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        token,
        platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined,
        // Stable per install. The server retires this device's older tokens
        // when a store update makes Expo mint a new one.
        device_id: Device.osInternalBuildId ?? Device.modelId ?? undefined,
        app_version: Constants.expoConfig?.version,
        locale: 'he',
      }),
    })
    if (!response.ok) return { ok: false, reason: 'server' }
  } catch {
    return { ok: false, reason: 'server' }
  }

  return { ok: true, token }
}

/** Sign-out. Best effort: a failure here must not block the sign-out itself. */
export async function unregisterPush(accessToken: string, token: string): Promise<void> {
  await fetch(siteUrl('/api/app/push-tokens'), {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ token }),
  }).catch(() => undefined)
}

/**
 * The in-app destination a notification asked for. `path` is written by the
 * server's push templates and is always an app route with a leading slash.
 */
export function pathFromNotification(
  response: Notifications.NotificationResponse | null,
): string | null {
  const data = response?.notification.request.content.data as { path?: unknown } | undefined
  const path = data?.path
  // Only in-app paths. A notification must never be able to steer the app to an
  // arbitrary URL, and `//evil.test` is a path by any naive check.
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null
  return path
}
