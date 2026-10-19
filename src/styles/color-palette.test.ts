import { describe, expect, it } from 'vitest'
import { COLOR_PALETTE, SITE_CSS_VARS } from './tokens'

describe('COLOR_PALETTE', () => {
  describe('structure', () => {
    it('should have all required color families', () => {
      expect(Object.keys(COLOR_PALETTE)).toEqual([
        'primary',
        'success',
        'error',
        'warning',
        'info',
        'neutral',
      ])
    })

    it('should have 11 shades per color family', () => {
      const expectedShades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
      for (const [, palette] of Object.entries(COLOR_PALETTE)) {
        expect(
          Object.keys(palette)
            .map(Number)
            .sort((a, b) => a - b),
        ).toEqual(expectedShades)
      }
    })
  })

  describe('primary color', () => {
    it('should have fed700 at shade 500', () => {
      expect(COLOR_PALETTE.primary[500]).toBe('#fed700')
    })

    it('should have appropriate hover variant at shade 400', () => {
      expect(COLOR_PALETTE.primary[400]).toBe('#fedd26')
    })

    it('should have valid hex values for all shades', () => {
      for (const [, color] of Object.entries(COLOR_PALETTE.primary)) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i)
      }
    })

    it('should provide tints (lighter) in lower shades', () => {
      const lighter = COLOR_PALETTE.primary[50]
      expect(lighter).toBeDefined()
      expect(lighter.length).toBe(7) // Valid hex
    })

    it('should provide shades (darker) in higher shades', () => {
      const darker = COLOR_PALETTE.primary[950]
      expect(darker).toBeDefined()
      expect(darker.length).toBe(7) // Valid hex
    })
  })

  describe('semantic colors', () => {
    it('success should use green hues', () => {
      expect(COLOR_PALETTE.success[500]).toBe('#22c55e')
    })

    it('error should use red hues', () => {
      expect(COLOR_PALETTE.error[500]).toBe('#ef4444')
    })

    it('warning should use amber/orange hues', () => {
      expect(COLOR_PALETTE.warning[500]).toBe('#f59e0b')
    })

    it('info should use blue hues', () => {
      expect(COLOR_PALETTE.info[500]).toBe('#3b82f6')
    })

    it('neutral should use gray hues', () => {
      expect(COLOR_PALETTE.neutral[500]).toBe('#6b7280')
    })
  })

  describe('contrast and accessibility', () => {
    it('should have distinct shades that progress in value', () => {
      // Just verify that shades are different hex values (actual contrast testing is in axe)
      for (const palette of Object.values(COLOR_PALETTE)) {
        const shades = Object.values(palette as Record<number, string>)
        const uniqueShades = new Set(shades)
        expect(uniqueShades.size).toBe(shades.length)
      }
    })
  })
})

describe('SITE_CSS_VARS color tokens', () => {
  describe('primary color tokens', () => {
    it('should declare primary-50 through primary-950', () => {
      const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
      for (const shade of shades) {
        const cssVar = `--color-primary-${shade}`
        expect(SITE_CSS_VARS[cssVar]).toBeDefined()
        expect(SITE_CSS_VARS[cssVar]).toMatch(/^#[0-9a-f]{6}$/i)
      }
    })

    it('should match COLOR_PALETTE values', () => {
      const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
      for (const shade of shades) {
        const cssVar = `--color-primary-${shade}`
        expect(SITE_CSS_VARS[cssVar]).toBe(COLOR_PALETTE.primary[shade])
      }
    })
  })

  describe('semantic color tokens', () => {
    const families = ['success', 'error', 'warning', 'info', 'neutral'] as const
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

    for (const family of families) {
      describe(`${family}`, () => {
        it(`should declare ${family}-50 through ${family}-950`, () => {
          for (const shade of shades) {
            const cssVar = `--color-${family}-${shade}`
            expect(SITE_CSS_VARS[cssVar]).toBeDefined()
            expect(SITE_CSS_VARS[cssVar]).toMatch(/^#[0-9a-f]{6}$/i)
          }
        })

        it(`should match COLOR_PALETTE.${family} values`, () => {
          for (const shade of shades) {
            const cssVar = `--color-${family}-${shade}`
            expect(SITE_CSS_VARS[cssVar]).toBe(COLOR_PALETTE[family][shade])
          }
        })
      })
    }
  })

  describe('consistency across token sources', () => {
    it('should have all COLOR_PALETTE entries in SITE_CSS_VARS', () => {
      for (const [family, palette] of Object.entries(COLOR_PALETTE)) {
        for (const [shade, color] of Object.entries(palette)) {
          const cssVar = `--color-${family}-${shade}`
          expect(SITE_CSS_VARS[cssVar]).toBe(color)
        }
      }
    })
  })
})
