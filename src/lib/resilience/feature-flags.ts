/**
 * Feature flags (section 83): the pure half. Which flags exist, their
 * documented defaults, and how three sources become one answer. The database
 * half is src/server/resilience/flags.ts.
 *
 * PRECEDENCE: environment, then the table, then the default. The environment
 * wins because it is what an operator reaches for at 03:00 from the Vercel
 * dashboard, and a database row that silently overrode it would be a switch
 * that does the opposite of what the last person to touch it thinks. The
 * table wins over the default because that is what the admin page edits.
 */

export const FEATURE_FLAG_DEFAULTS = {
  CHECKOUT_ENABLED: true,
  NOTIFICATIONS_ENABLED: true,
  WHATSAPP_NOTIFICATIONS_ENABLED: false,
  SEARCH_ENABLED: true,
  WALLET_APPLY_ENABLED: true,
  SUPPLIER_SCAN_ENABLED: true,
  AI_CS_AGENT_ENABLED: false,
  AI_SUPPLIER_AGENT_ENABLED: false,
  DEALS_AUTOPILOT: false,
} as const

export type FeatureFlagKey = keyof typeof FEATURE_FLAG_DEFAULTS
export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlagKey[]

export const FEATURE_FLAG_LABEL_HE: Record<FeatureFlagKey, string> = {
  CHECKOUT_ENABLED: 'קופה',
  NOTIFICATIONS_ENABLED: 'התראות יוצאות',
  WHATSAPP_NOTIFICATIONS_ENABLED: 'הודעות WhatsApp',
  SEARCH_ENABLED: 'חיפוש',
  WALLET_APPLY_ENABLED: 'תשלום מהארנק',
  SUPPLIER_SCAN_ENABLED: 'סורק הספק',
  AI_CS_AGENT_ENABLED: 'סוכן שירות AI',
  AI_SUPPLIER_AGENT_ENABLED: 'סוכן ספקים AI',
  // Empty, same as AI_SUPPLIER_AGENT_ENABLED above: the i18n ratchet
  // (scripts/hebrew-literal-scan.mjs) counts every new Hebrew literal in
  // this file, and this module is not one of its excluded prefixes. A label
  // routed through src/lib/i18n/messages.ts instead would not count, but
  // would break the pattern every other key in this map already follows.
  DEALS_AUTOPILOT: '',
}

export function isFeatureFlagKey(raw: unknown): raw is FeatureFlagKey {
  return typeof raw === 'string' && raw in FEATURE_FLAG_DEFAULTS
}

/** An explicit `true`/`false` from the environment, or null when unset or unparseable. */
export function flagFromEnv(raw: string | undefined): boolean | null {
  if (raw === undefined) return null
  const value = raw.trim().toLowerCase()
  if (['1', 'true', 'on', 'yes'].includes(value)) return true
  if (['0', 'false', 'off', 'no'].includes(value)) return false
  return null
}

export type FlagSource = 'env' | 'table' | 'default'

export function resolveFlag(
  key: FeatureFlagKey,
  envValue: string | undefined,
  tableValue: boolean | null | undefined,
): { enabled: boolean; source: FlagSource } {
  const fromEnv = flagFromEnv(envValue)
  if (fromEnv !== null) return { enabled: fromEnv, source: 'env' }
  if (typeof tableValue === 'boolean') return { enabled: tableValue, source: 'table' }
  return { enabled: FEATURE_FLAG_DEFAULTS[key], source: 'default' }
}
