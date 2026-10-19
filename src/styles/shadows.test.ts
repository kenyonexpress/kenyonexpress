import { describe, expect, it } from 'vitest'
import { ELECTRO } from './tokens'

describe('Shadow Tokens (UX36)', () => {
  describe('ELECTRO.shadow structure', () => {
    it('should have all 8 shadow values defined (sm, md, lg, xl with hover variants)', () => {
      const requiredShadows = ['sm', 'smHover', 'md', 'mdHover', 'lg', 'lgHover', 'xl', 'xlHover']
      for (const shadow of requiredShadows) {
        expect(ELECTRO.shadow).toHaveProperty(shadow)
        expect(typeof ELECTRO.shadow[shadow as keyof typeof ELECTRO.shadow]).toBe('string')
      }
    })

    it('should have legacy aliases for backward compatibility', () => {
      expect(ELECTRO.shadow).toHaveProperty('card')
      expect(ELECTRO.shadow).toHaveProperty('hover')
      expect(typeof ELECTRO.shadow.card).toBe('string')
      expect(typeof ELECTRO.shadow.hover).toBe('string')
    })
  })

  describe('Shadow elevation hierarchy', () => {
    it('should follow elevation order: sm < md < lg < xl', () => {
      const shadows = {
        sm: ELECTRO.shadow.sm,
        md: ELECTRO.shadow.md,
        lg: ELECTRO.shadow.lg,
        xl: ELECTRO.shadow.xl,
      }

      // Each shadow should have increasing blur radius and spread
      expect(shadows.sm).toMatch(/0px 1px 2px/) // small elevation
      expect(shadows.md).toMatch(/0px 2px 8px/) // medium elevation
      expect(shadows.lg).toMatch(/0px 4px 16px/) // large elevation
      expect(shadows.xl).toMatch(/0px 8px 24px/) // extra large elevation
    })

    it('should have hover variants for interactive feedback', () => {
      // Hover variants should have larger spread/opacity than base variants
      const getSpread = (shadow: string): number => {
        const parts = shadow.match(/(\d+)px/g)
        return parts ? Number.parseInt(parts[2], 10) : 0 // third number is spread
      }

      expect(getSpread(ELECTRO.shadow.smHover)).toBeGreaterThan(getSpread(ELECTRO.shadow.sm))
      expect(getSpread(ELECTRO.shadow.mdHover)).toBeGreaterThan(getSpread(ELECTRO.shadow.md))
      expect(getSpread(ELECTRO.shadow.lgHover)).toBeGreaterThan(getSpread(ELECTRO.shadow.lg))
      expect(getSpread(ELECTRO.shadow.xlHover)).toBeGreaterThan(getSpread(ELECTRO.shadow.xl))
    })
  })

  describe('Shadow format and values', () => {
    it('should use rgba format with proper opacity values', () => {
      const shadows = Object.values(ELECTRO.shadow)
      for (const shadow of shadows) {
        expect(shadow).toMatch(/rgba\(\s*0,\s*0,\s*0,\s*[\d.]+\)/)
      }
    })

    it('should have consistent color (black with varying opacity)', () => {
      const shadows = Object.values(ELECTRO.shadow)
      for (const shadow of shadows) {
        // All shadows should use black (0,0,0) with opacity
        expect(shadow).toMatch(/rgba\(\s*0,\s*0,\s*0,/)
      }
    })

    it('should use increasing opacity for hover variants', () => {
      const getOpacity = (shadow: string): number => {
        const match = shadow.match(/rgba\([^,]+,\s*[^,]+,\s*[^,]+,\s*([\d.]+)\)/)
        return match ? Number.parseFloat(match[1]) : 0
      }

      expect(getOpacity(ELECTRO.shadow.smHover)).toBeGreaterThan(getOpacity(ELECTRO.shadow.sm))
      expect(getOpacity(ELECTRO.shadow.mdHover)).toBeGreaterThan(getOpacity(ELECTRO.shadow.md))
      expect(getOpacity(ELECTRO.shadow.lgHover)).toBeGreaterThan(getOpacity(ELECTRO.shadow.lg))
      expect(getOpacity(ELECTRO.shadow.xlHover)).toBeGreaterThan(getOpacity(ELECTRO.shadow.xl))
    })
  })

  describe('Legacy aliases', () => {
    it('should map card to md shadow', () => {
      expect(ELECTRO.shadow.card).toBe(ELECTRO.shadow.md)
    })

    it('should map hover to mdHover shadow', () => {
      expect(ELECTRO.shadow.hover).toBe(ELECTRO.shadow.mdHover)
    })
  })

  describe('Shadow opacity progression', () => {
    const getOpacity = (shadow: string): number => {
      const match = shadow.match(/rgba\([^,]+,\s*[^,]+,\s*[^,]+,\s*([\d.]+)\)/)
      return match ? Number.parseFloat(match[1]) : 0
    }

    it('should have base opacities: 0.05, 0.08, 0.12, 0.16', () => {
      expect(getOpacity(ELECTRO.shadow.sm)).toBe(0.05)
      expect(getOpacity(ELECTRO.shadow.md)).toBe(0.08)
      expect(getOpacity(ELECTRO.shadow.lg)).toBe(0.12)
      expect(getOpacity(ELECTRO.shadow.xl)).toBe(0.16)
    })

    it('should have hover opacities: 0.08, 0.12, 0.16, 0.20', () => {
      expect(getOpacity(ELECTRO.shadow.smHover)).toBe(0.08)
      expect(getOpacity(ELECTRO.shadow.mdHover)).toBe(0.12)
      expect(getOpacity(ELECTRO.shadow.lgHover)).toBe(0.16)
      expect(getOpacity(ELECTRO.shadow.xlHover)).toBe(0.2)
    })
  })

  describe('Shadow blur and spread values', () => {
    const parseValues = (shadow: string) => {
      const matches = shadow.match(/(\d+)px/g)
      return matches ? matches.map((m) => Number.parseInt(m, 10)) : []
    }

    it('should have correct blur and spread for sm shadow', () => {
      const values = parseValues(ELECTRO.shadow.sm)
      expect(values).toEqual([0, 1, 2]) // x: 0px, y-offset: 1px, blur: 2px
    })

    it('should have correct blur and spread for md shadow', () => {
      const values = parseValues(ELECTRO.shadow.md)
      expect(values).toEqual([0, 2, 8]) // x: 0px, y: 2px, blur: 8px
    })

    it('should have correct blur and spread for lg shadow', () => {
      const values = parseValues(ELECTRO.shadow.lg)
      expect(values).toEqual([0, 4, 16]) // x: 0px, y: 4px, blur: 16px
    })

    it('should have correct blur and spread for xl shadow', () => {
      const values = parseValues(ELECTRO.shadow.xl)
      expect(values).toEqual([0, 8, 24]) // x: 0px, y: 8px, blur: 24px
    })
  })

  describe('Total shadow count', () => {
    it('should have exactly 10 shadow values (8 new + 2 legacy)', () => {
      const shadowKeys = Object.keys(ELECTRO.shadow)
      expect(shadowKeys.length).toBe(10)
    })
  })
})
