import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Border-radius token scale verification.
 * Reads tokens.css to verify actual token values and CSS definitions.
 */

describe('Border-radius tokens in tokens.css', () => {
  let tokensCss: string

  it('should load and parse tokens.css', () => {
    const tokensPath = path.resolve(__dirname, './tokens.css')
    tokensCss = fs.readFileSync(tokensPath, 'utf-8')
    expect(tokensCss).toBeTruthy()
    expect(tokensCss).toContain('--radius-')
  })

  describe('Token scale values', () => {
    it('should define --radius-xs: 4px', () => {
      const match = tokensCss.match(/--radius-xs:\s*4px/)
      expect(match).toBeTruthy()
    })

    it('should define --radius-sm: 8px (buttons)', () => {
      const match = tokensCss.match(/--radius-sm:\s*8px/)
      expect(match).toBeTruthy()
    })

    it('should define --radius-md: 12px (cards)', () => {
      const match = tokensCss.match(/--radius-md:\s*12px/)
      expect(match).toBeTruthy()
    })

    it('should define --radius-lg: 16px (modals)', () => {
      const match = tokensCss.match(/--radius-lg:\s*16px/)
      expect(match).toBeTruthy()
    })

    it('should define --radius-xl: 24px', () => {
      const match = tokensCss.match(/--radius-xl:\s*24px/)
      expect(match).toBeTruthy()
    })
  })

  describe('Semantic aliases', () => {
    it('should define --radius-button as var(--radius-sm)', () => {
      const match = tokensCss.match(/--radius-button:\s*var\(--radius-sm\)/)
      expect(match).toBeTruthy()
    })

    it('should define --radius-card as var(--radius-md)', () => {
      const match = tokensCss.match(/--radius-card:\s*var\(--radius-md\)/)
      expect(match).toBeTruthy()
    })

    it('should define --radius-modal as var(--radius-lg)', () => {
      const match = tokensCss.match(/--radius-modal:\s*var\(--radius-lg\)/)
      expect(match).toBeTruthy()
    })
  })

  describe('Token scale consistency', () => {
    it('should have all five scale steps', () => {
      const xs = tokensCss.includes('--radius-xs:')
      const sm = tokensCss.includes('--radius-sm:')
      const md = tokensCss.includes('--radius-md:')
      const lg = tokensCss.includes('--radius-lg:')
      const xl = tokensCss.includes('--radius-xl:')

      expect(xs && sm && md && lg && xl).toBe(true)
    })

    it('should have all semantic component aliases', () => {
      const button = tokensCss.includes('--radius-button:')
      const card = tokensCss.includes('--radius-card:')
      const modal = tokensCss.includes('--radius-modal:')

      expect(button && card && modal).toBe(true)
    })

    it('scale values should follow 4, 8, 12, 16, 24 pattern', () => {
      // Extract all radius values from the file
      const radiusPattern = /--radius-(?:xs|sm|md|lg|xl):\s*(\d+)px/g
      const matches = Array.from(tokensCss.matchAll(radiusPattern))
      const values = matches
        .map((m) => m[1])
        .filter((val) => val !== undefined)
        .map((val) => Number.parseInt(val, 10))

      // Should contain the scale values in order
      expect(values).toContain(4)
      expect(values).toContain(8)
      expect(values).toContain(12)
      expect(values).toContain(16)
      expect(values).toContain(24)
    })
  })

  describe('Component token usage', () => {
    it('buttons should use 8px radius', () => {
      // Verify button component uses --radius-button (maps to 8px)
      expect(tokensCss).toContain('--radius-sm: 8px')
      const buttonAlias = tokensCss.match(/--radius-button:\s*var\(--radius-sm\)/)
      expect(buttonAlias).toBeTruthy()
    })

    it('cards should use 12px radius', () => {
      // Verify card component uses --radius-card (maps to 12px)
      expect(tokensCss).toContain('--radius-md: 12px')
      const cardAlias = tokensCss.match(/--radius-card:\s*var\(--radius-md\)/)
      expect(cardAlias).toBeTruthy()
    })

    it('modals should use 16px radius', () => {
      // Verify modal component uses --radius-modal (maps to 16px)
      expect(tokensCss).toContain('--radius-lg: 16px')
      const modalAlias = tokensCss.match(/--radius-modal:\s*var\(--radius-lg\)/)
      expect(modalAlias).toBeTruthy()
    })
  })
})
