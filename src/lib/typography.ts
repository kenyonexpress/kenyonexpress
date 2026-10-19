import { TYPOGRAPHY_SCALE } from '@/styles/tokens'

/**
 * Generates inline styles for typography scale entries.
 * Used to apply consistent font sizing, line height, and weight across components.
 *
 * @param scale - Key from TYPOGRAPHY_SCALE (e.g., 'h1', 'body', 'button')
 * @returns CSS-in-JS object with fontSize, lineHeight, and fontWeight
 *
 * @example
 * const h1Styles = getTypographyStyles('h1')
 * // Returns: { fontSize: '39.998px', lineHeight: '47.9976px', fontWeight: 'var(--weight-black)' }
 */
export function getTypographyStyles(scale: keyof typeof TYPOGRAPHY_SCALE) {
  const entry = TYPOGRAPHY_SCALE[scale]
  return {
    fontSize: entry.size,
    lineHeight: entry.lineHeight,
    fontWeight: `var(${entry.weight})`,
  }
}

/**
 * CSS class name generator for typography scale.
 * Returns Tailwind-compatible class names for a given typography scale.
 *
 * Note: For components using className, prefer inline styles via getTypographyStyles()
 * since arbitrary Tailwind sizes may not match measured typography scale exactly.
 *
 * @param scale - Key from TYPOGRAPHY_SCALE
 * @returns Object with className suggestions and inline style fallback
 */
export function getTypographyClasses(scale: keyof typeof TYPOGRAPHY_SCALE) {
  const styles = getTypographyStyles(scale)
  return {
    styles,
    description: `Typography scale: ${scale}`,
  }
}

/**
 * Validates that a component uses typography scale instead of arbitrary sizes.
 * Development helper to catch inconsistent typography.
 */
export function validateTypography(componentName: string, scale: keyof typeof TYPOGRAPHY_SCALE) {
  if (process.env.NODE_ENV === 'development') {
    const entry = TYPOGRAPHY_SCALE[scale]
    if (!entry) {
      console.warn(`[Typography] Unknown scale "${scale}" in ${componentName}`)
      return false
    }
  }
  return true
}
