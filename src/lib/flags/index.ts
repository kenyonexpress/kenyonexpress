/**
 * Phase 2 feature flags. Migration 293 seeds them in the database (all OFF).
 * The async `getFlagsFromSupabase()` reads from DB with 30s cache, falling back
 * to env vars on error. The sync `isFlagOn()` reads env-only for build-time use.
 *
 * PREFER the async version in request handlers. Use the sync version only where
 * async is not possible (middleware, config).
 */
export const FLAGS = {
  'physical-products': 'FLAG_PHYSICAL_PRODUCTS',
  'courses-monthly': 'FLAG_COURSES_MONTHLY',
  'tzimmer-calendar': 'FLAG_TZIMMER_CALENDAR',
  'monthly-billing': 'FLAG_MONTHLY_BILLING',
  'maintenance-banner': 'FLAG_MAINTENANCE_BANNER',
  // Live card charges. OFF until Cardcom production credentials are in place.
  payment_production: 'FLAG_PAYMENT_PRODUCTION',
  // WhatsApp sign-in codes over the Meta Cloud API. OFF until the AUTHENTICATION template is approved.
  wa_otp_enabled: 'FLAG_WA_OTP_ENABLED',
} as const

export type FlagName = keyof typeof FLAGS

export type FlagEnv = Record<string, string | undefined>

export const FLAG_NAMES = Object.keys(FLAGS) as FlagName[]

/**
 * Sync version: reads env vars only. Use for build-time or sync contexts.
 */
export function isFlagOn(name: FlagName, env: FlagEnv = process.env): boolean {
  const raw = env[FLAGS[name]]?.trim().toLowerCase()
  return raw === '1' || raw === 'true'
}

/**
 * Sync version: env-only report for all flags.
 */
export function flagReport(env: FlagEnv = process.env): Record<FlagName, boolean> {
  return Object.fromEntries(FLAG_NAMES.map((n) => [n, isFlagOn(n, env)])) as Record<
    FlagName,
    boolean
  >
}
