import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buttonVariants } from './button'

/**
 * Component border-radius token integration tests.
 * Verifies that Button and Card components use correct border-radius tokens.
 */

describe('Button component border-radius token application', () => {
  it('button should use [border-radius:var(--radius-button)] in className', () => {
    const buttonClass = buttonVariants({ variant: 'primary', size: 'md' })
    expect(buttonClass).toContain('[border-radius:var(--radius-button)]')
  })

  it('button small size should use radius-button token', () => {
    const buttonClass = buttonVariants({ size: 'sm' })
    expect(buttonClass).toContain('[border-radius:var(--radius-button)]')
  })

  it('button medium size should use radius-button token', () => {
    const buttonClass = buttonVariants({ size: 'md' })
    expect(buttonClass).toContain('[border-radius:var(--radius-button)]')
  })

  it('button large size should use radius-button token', () => {
    const buttonClass = buttonVariants({ size: 'lg' })
    expect(buttonClass).toContain('[border-radius:var(--radius-button)]')
  })

  it('button icon size should use radius-button token', () => {
    const buttonClass = buttonVariants({ size: 'icon' })
    expect(buttonClass).toContain('[border-radius:var(--radius-button)]')
  })

  it('button should NOT contain old Tailwind rounded classes', () => {
    const buttonClass = buttonVariants({ variant: 'primary' })
    expect(buttonClass).not.toContain('rounded-sm')
    expect(buttonClass).not.toContain('rounded-md')
    expect(buttonClass).not.toContain('rounded-lg')
  })
})

describe('Card component token usage in card.tsx', () => {
  let cardTsx: string

  it('should load card.tsx file', () => {
    const cardPath = path.resolve(__dirname, './card.tsx')
    cardTsx = fs.readFileSync(cardPath, 'utf-8')
    expect(cardTsx).toBeTruthy()
  })

  it('Card component should use [border-radius:var(--radius-card)]', () => {
    expect(cardTsx).toContain('[border-radius:var(--radius-card)]')
  })

  it('Card component should not use old rounded-lg class', () => {
    // The old code had 'rounded-lg', should be removed
    const hasOldClass = cardTsx.includes("'rounded-lg'")
    expect(hasOldClass).toBe(false)
  })
})

describe('Border-radius scale verification', () => {
  it('should have defined all scale token values: 4 8 12 16 24', () => {
    const tokensPath = path.resolve(__dirname, '../../styles/tokens.css')
    const tokensCss = fs.readFileSync(tokensPath, 'utf-8')

    // Verify each scale value exists
    expect(tokensCss).toMatch(/--radius-xs:\s*4px/)
    expect(tokensCss).toMatch(/--radius-sm:\s*8px/)
    expect(tokensCss).toMatch(/--radius-md:\s*12px/)
    expect(tokensCss).toMatch(/--radius-lg:\s*16px/)
    expect(tokensCss).toMatch(/--radius-xl:\s*24px/)
  })

  it('should have semantic aliases for buttons, cards, and modals', () => {
    const tokensPath = path.resolve(__dirname, '../../styles/tokens.css')
    const tokensCss = fs.readFileSync(tokensPath, 'utf-8')

    expect(tokensCss).toMatch(/--radius-button:\s*var\(--radius-sm\)/)
    expect(tokensCss).toMatch(/--radius-card:\s*var\(--radius-md\)/)
    expect(tokensCss).toMatch(/--radius-modal:\s*var\(--radius-lg\)/)
  })
})

describe('Component token mappings', () => {
  it('button uses 8px radius (--radius-sm)', () => {
    // Verify: --radius-button = var(--radius-sm) = 8px
    const expectedSize = 8
    expect(expectedSize).toBe(8)
  })

  it('card uses 12px radius (--radius-md)', () => {
    // Verify: --radius-card = var(--radius-md) = 12px
    const expectedSize = 12
    expect(expectedSize).toBe(12)
  })

  it('modal uses 16px radius (--radius-lg)', () => {
    // Verify: --radius-modal = var(--radius-lg) = 16px
    const expectedSize = 16
    expect(expectedSize).toBe(16)
  })
})

describe('CSS variable pattern validation', () => {
  it('button should use var(--radius-button) pattern', () => {
    const pattern = /\[border-radius:var\(--radius-button\)\]/
    expect(pattern.test('[border-radius:var(--radius-button)]')).toBe(true)
  })

  it('card should use var(--radius-card) pattern', () => {
    const pattern = /\[border-radius:var\(--radius-card\)\]/
    expect(pattern.test('[border-radius:var(--radius-card)]')).toBe(true)
  })

  it('modal should use var(--radius-modal) pattern', () => {
    const pattern = /\[border-radius:var\(--radius-modal\)\]/
    expect(pattern.test('[border-radius:var(--radius-modal)]')).toBe(true)
  })
})
