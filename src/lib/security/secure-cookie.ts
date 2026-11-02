import 'server-only'
import { headers } from 'next/headers'
import { hostOfHeader, isLoopbackHost } from './frame-policy'

/**
 * Whether a cookie set in this request should carry `Secure`.
 *
 * Production, except when the request named a loopback host. A local
 * `next start` serves plain http on localhost, where WebKit (unlike Chromium)
 * refuses a Secure cookie outright: the consent decision never stuck in Safari
 * and the WebKit e2e projects read it back as missing (measured 2026-11-02,
 * C142). A deployed site is never reached on a loopback Host, so production
 * cookies keep the flag.
 */
export async function secureCookie(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return false
  return !isLoopbackHost(hostOfHeader((await headers()).get('host')))
}
