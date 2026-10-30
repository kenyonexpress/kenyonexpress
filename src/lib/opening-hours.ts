/**
 * products.opening_hours (migration 320): jsonb keyed sun..sat, each
 * { open: boolean, from?: 'HH:MM', to?: 'HH:MM' }. Only the boolean `open: true`
 * counts, so a string "true", a missing day or a NULL column is "not open".
 */
export type OpeningHours = Partial<Record<string, { open?: unknown } | null>> | null | undefined

/** Friday or Saturday open. */
export function opensOnWeekend(hours: unknown): boolean {
  if (!hours || typeof hours !== 'object') return false
  const h = hours as Record<string, { open?: unknown } | null | undefined>
  return h.fri?.open === true || h.sat?.open === true
}
