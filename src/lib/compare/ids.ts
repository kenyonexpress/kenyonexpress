import { COMPARE_LIMIT } from '@/lib/compare/limit'

const UUID = /^[0-9a-f-]{36}$/i

/**
 * Unique product ids in the order given, capped at the limit. Storage can
 * hold junk (an old shape, a hand edit, the synthetic `ke-deal-NNNN` ids the
 * home rail carries) and the server action receives whatever the browser
 * sends, so both run every list through this before trusting it.
 */
export function sanitizeCompareIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const value of raw) {
    if (typeof value !== 'string' || !UUID.test(value) || out.includes(value)) continue
    out.push(value)
    if (out.length === COMPARE_LIMIT) break
  }
  return out
}

export function isCompareId(value: string): boolean {
  return UUID.test(value)
}
