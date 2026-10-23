/**
 * Phase 2 feature flags. Every flag is OFF unless its env variable is exactly
 * "1" or "true", so a missing, empty or mistyped value never turns a feature on.
 *
 * These are build/boot-time env switches, the same model as the kill switches in
 * lib/resilience/kill-switches.ts. They do not touch the database.
 */
export const FLAGS = {
  'physical-products': 'FLAG_PHYSICAL_PRODUCTS',
  'courses-monthly': 'FLAG_COURSES_MONTHLY',
  'tzimmer-calendar': 'FLAG_TZIMMER_CALENDAR',
  'monthly-billing': 'FLAG_MONTHLY_BILLING',
  'maintenance-banner': 'FLAG_MAINTENANCE_BANNER',
} as const

export type FlagName = keyof typeof FLAGS

export type FlagEnv = Record<string, string | undefined>

export const FLAG_NAMES = Object.keys(FLAGS) as FlagName[]

export function isFlagOn(name: FlagName, env: FlagEnv = process.env): boolean {
  const raw = env[FLAGS[name]]?.trim().toLowerCase()
  return raw === '1' || raw === 'true'
}

export function flagReport(env: FlagEnv = process.env): Record<FlagName, boolean> {
  return Object.fromEntries(FLAG_NAMES.map((n) => [n, isFlagOn(n, env)])) as Record<
    FlagName,
    boolean
  >
}
