/**
 * Date formatting for Hebrew locale (he-IL) with Israel timezone.
 * Centralized date formatters to ensure consistency.
 */

const IL_TIMEZONE = 'Asia/Jerusalem'

/**
 * Format date in Hebrew locale: DD.MM.YYYY
 */
export function formatDateHe(iso: string | Date | null): string {
  if (!iso) return 'לא זמין'

  const date = typeof iso === 'string' ? new Date(iso) : iso

  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: IL_TIMEZONE,
  }).format(date)
}

/**
 * Format date and time in Hebrew locale: DD.MM.YYYY, HH:MM
 */
export function formatDateTimeHe(iso: string | Date | null): string {
  if (!iso) return 'לא זמין'

  const date = typeof iso === 'string' ? new Date(iso) : iso

  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: IL_TIMEZONE,
  }).format(date)
}

/**
 * Format time only in Hebrew locale: HH:MM
 */
export function formatTimeHe(iso: string | Date | null): string {
  if (!iso) return 'לא זמין'

  const date = typeof iso === 'string' ? new Date(iso) : iso

  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: IL_TIMEZONE,
  }).format(date)
}

/**
 * Format date with month name: 24 ביולי 2026
 */
export function formatDateLongHe(iso: string | Date | null): string {
  if (!iso) return 'לא זמין'

  const date = typeof iso === 'string' ? new Date(iso) : iso

  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: IL_TIMEZONE,
  }).format(date)
}
