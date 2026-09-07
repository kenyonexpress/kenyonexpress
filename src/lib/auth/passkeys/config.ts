import { siteUrl } from '@/lib/site-url'

/**
 * The relying-party identity every ceremony is verified against.
 *
 * Derived from `siteUrl()` and not from a bare env read, for the reason
 * documented on `authRedirect` in server/actions/auth.ts: `siteUrl()` falls
 * back to the canonical origin instead of stringifying `undefined`. The rpID
 * is the bare hostname, per spec; the origin keeps scheme and port, which is
 * what the browser puts in clientDataJSON.
 */
export function passkeyRpConfig(): { rpID: string; rpName: string; origin: string } {
  const origin = siteUrl()
  return { rpID: new URL(origin).hostname, rpName: 'KenyonExpress', origin }
}

/**
 * The HMAC key for sealing challenges: derived from the service-role secret,
 * which env.ts already requires at boot, so no new variable and no new way
 * for a deploy to go out half-configured. The derivation prefix lives in
 * challenge.ts; this only picks which secret feeds it.
 */
export function passkeyChallengeSecret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? null
}
