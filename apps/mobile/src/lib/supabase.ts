import { SUPABASE_ANON_KEY, SUPABASE_URL, siteUrl } from '@/lib/config'
import { clearQueue } from '@/lib/supplier/queue'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import 'react-native-url-polyfill/auto'

/**
 * The session lives in the Keychain (iOS) / Keystore (Android), not in
 * AsyncStorage.
 *
 * AsyncStorage is an unencrypted SQLite file inside the app sandbox. That is
 * fine for a cache and wrong for a refresh token, which is a bearer credential
 * with a long life: anything that can read the sandbox - a jailbroken device, a
 * device backup, a malicious backup extractor - reads the token and becomes the
 * customer. SecureStore is hardware-backed on both platforms.
 *
 * SecureStore refuses values over 2048 bytes on Android. Supabase sessions are
 * comfortably under that today, but a JWT that grows past it would fail
 * SILENTLY inside the adapter and log the customer out on the next cold start,
 * so the setter says so out loud instead.
 */
const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => {
    if (value.length > 2000) {
      console.warn(
        `[supabase] session value for ${key} is ${value.length} bytes and may exceed the SecureStore limit`,
      )
    }
    return SecureStore.setItemAsync(key, value)
  },
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no URL bar to read a fragment out of. OAuth comes back through
    // the deep link handler, which calls setSession itself.
    detectSessionInUrl: false,
  },
})

/**
 * Mirrors the current session into the website's cookie jar, so a WebView
 * opened afterwards is the same logged-in shopper.
 *
 * Called before the checkout WebView mounts and again after every sign-in. It
 * hands the server a token pair the app already holds; the server validates it
 * and writes cookies. Nothing is minted here.
 */
export async function bridgeSessionToWeb(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return false

  try {
    const response = await fetch(siteUrl('/api/app/session'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // The WebView reads the platform cookie jar, which is what `fetch`
      // writes into on both platforms.
      credentials: 'include',
      body: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Signs out of all three places the session leaves a trace: the website's
 * cookie jar, the till's pending scan queue, and Supabase itself.
 *
 * THE QUEUE IS CLEARED FIRST AND THE ORDER IS NOT ARBITRARY. Queued scans are
 * unredeemed voucher codes belonging to the business the device was signed in
 * to; leaving them on a device that has been handed to somebody else means the
 * next person to sign in drains another supplier's vouchers under their own
 * membership. The cost is that scans made offline and never synced are lost on
 * sign-out - which is why the scan screen drains on mount and after every
 * online scan, and why the history screen shows the pending count in a colour
 * that is hard to walk past.
 */
export async function signOutEverywhere(): Promise<void> {
  await clearQueue().catch(() => undefined)
  await fetch(siteUrl('/api/app/session'), { method: 'DELETE', credentials: 'include' }).catch(
    () => undefined,
  )
  await supabase.auth.signOut()
}
