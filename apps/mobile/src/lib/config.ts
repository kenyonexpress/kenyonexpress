import Constants from 'expo-constants'

/**
 * Everything the app needs to know about the outside world, resolved once.
 *
 * The site URL comes from `app.json`'s `extra` rather than from an env var,
 * because an OTA-updated JS bundle carries the value it was built with and a
 * `process.env` read would resolve against whatever Metro inlined at build
 * time. The Supabase publishable key is public by design - it is the same key
 * the website ships to every browser - and RLS is what protects the data.
 */

type Extra = {
  siteUrl?: string
  supabaseUrl?: string
  supabaseAnonKey?: string
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra

export const SITE_URL = (
  extra.siteUrl ??
  process.env.EXPO_PUBLIC_SITE_URL ??
  'https://kenyonexpress.co.il'
).replace(/\/+$/, '')

export const SUPABASE_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''

export const SUPABASE_ANON_KEY =
  extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

/** The path the checkout WebView closes on. Must match `APP_RETURN_PATH` on the server. */
export const APP_RETURN_PATH = '/checkout/app-return'

export function siteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
