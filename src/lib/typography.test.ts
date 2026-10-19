import { TYPOGRAPHY_SCALE } from '@/styles/tokens'
import { describe, expect, it } from 'vitest'
import { getTypographyClasses, getTypographyStyles, validateTypography } from './typography'

describe('typography utilities', () => {
  it('getTypographyStyles returns correct CSS properties for a scale', () => {
    const styles = getTypographyStyles('h1')

    expect(styles).toHaveProperty('fontSize')
    expect(styles).toHaveProperty('lineHeight')
    expect(styles).toHaveProperty('fontWeight')
    expect(styles.fontSize).toBe(TYPOGRAPHY_SCALE.h1.size)
    expect(styles.lineHeight).toBe(TYPOGRAPHY_SCALE.h1.lineHeight)
    expect(styles.fontWeight).toContain('var(--weight-')
  })

  it('getTypographyStyles works for all typography scales', () => {
    for (const scale of Object.keys(TYPOGRAPHY_SCALE) as Array<keyof typeof TYPOGRAPHY_SCALE>) {
      const styles = getTypographyStyles(scale)
      expect(styles.fontSize).toBe(TYPOGRAPHY_SCALE[scale].size)
      expect(styles.lineHeight).toBe(TYPOGRAPHY_SCALE[scale].lineHeight)
      expect(styles.fontWeight).toContain(`var(${TYPOGRAPHY_SCALE[scale].weight})`)
    }
  })

  it('getTypographyClasses returns styles and description', () => {
    const result = getTypographyClasses('body')

    expect(result).toHaveProperty('styles')
    expect(result).toHaveProperty('description')
    expect(result.description).toContain('body')
    expect(result.styles).toHaveProperty('fontSize')
    expect(result.styles).toHaveProperty('lineHeight')
    expect(result.styles).toHaveProperty('fontWeight')
  })

  it('validateTypography returns true for valid scales', () => {
    expect(validateTypography('TestComponent', 'h1')).toBe(true)
    expect(validateTypography('TestComponent', 'body')).toBe(true)
    expect(validateTypography('TestComponent', 'button')).toBe(true)
  })

  it('fontWeight uses CSS custom property syntax', () => {
    const h1Styles = getTypographyStyles('h1')
    expect(h1Styles.fontWeight).toMatch(/^var\(--weight-\w+\)$/)

    const bodyStyles = getTypographyStyles('body')
    expect(bodyStyles.fontWeight).toMatch(/^var\(--weight-\w+\)$/)
  })

  it('all typography scales accessible via getTypographyStyles', () => {
    const scales: Array<keyof typeof TYPOGRAPHY_SCALE> = [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'body',
      'bodyBold',
      'button',
      'nav',
      'caption',
    ]

    for (const scale of scales) {
      expect(() => getTypographyStyles(scale)).not.toThrow()
    }
  })
})
