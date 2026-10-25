/**
 * Number formatting for Hebrew locale.
 * All numbers use Hebrew digit grouping (thousands separator: comma).
 */

/**
 * Format an integer with Hebrew locale thousands separator.
 */
export function formatNumberHe(value: number): string {
  return value.toLocaleString('he-IL', { useGrouping: true })
}

/**
 * Format a decimal number with Hebrew locale.
 * Defaults to 2 fraction digits, configurable.
 */
export function formatDecimalHe(value: number, fractionDigits = 2): string {
  return value.toLocaleString('he-IL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

/**
 * Format a percentage with Hebrew locale.
 * Input: 0.15 -> Output: "15%"
 */
export function formatPercentHe(value: number): string {
  return value.toLocaleString('he-IL', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}
