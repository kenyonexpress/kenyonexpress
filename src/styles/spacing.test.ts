import { describe, expect, it } from 'vitest'
import { ELECTRO } from './tokens'

describe('UX34: Spacing Scale', () => {
  it('should define consistent spacing scale in tokens', () => {
    expect(ELECTRO.spacing).toBeDefined()
    expect(ELECTRO.spacing).toEqual({
      xs: '4px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      '2xl': '32px',
      '3xl': '48px',
      '4xl': '64px',
    })
  })

  it('should have all spacing values match expected scale', () => {
    const expectedValues = ['4px', '8px', '12px', '16px', '24px', '32px', '48px', '64px']
    const actualValues = Object.values(ELECTRO.spacing)
    expect(actualValues).toEqual(expectedValues)
  })

  it('should validate spacing scale progression', () => {
    const scale = [
      { name: 'xs', value: 4 },
      { name: 'sm', value: 8 },
      { name: 'md', value: 12 },
      { name: 'lg', value: 16 },
      { name: 'xl', value: 24 },
      { name: '2xl', value: 32 },
      { name: '3xl', value: 48 },
      { name: '4xl', value: 64 },
    ]

    for (const { name, value } of scale) {
      const token = ELECTRO.spacing[name as keyof typeof ELECTRO.spacing]
      expect(token).toBe(`${value}px`)
    }
  })

  it('should have spacing values in ascending order', () => {
    const values = Object.values(ELECTRO.spacing).map((v) => Number.parseInt(v))
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i]).toBeLessThan(values[i + 1])
    }
  })

  it('should support all spacing keys', () => {
    const keys = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl']
    for (const key of keys) {
      expect(ELECTRO.spacing).toHaveProperty(key)
    }
  })

  it('should contain 8 spacing values', () => {
    expect(Object.keys(ELECTRO.spacing)).toHaveLength(8)
  })

  it('should validate numeric progression ratios', () => {
    const values = Object.values(ELECTRO.spacing).map((v) => Number.parseInt(v))
    const ratios = []
    for (let i = 1; i < values.length; i++) {
      ratios.push(values[i] / values[i - 1])
    }

    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(1)
      expect(ratio).toBeLessThanOrEqual(2.67)
    }
  })
})
