import { describe, expect, it } from 'vitest'
import { SITE_CSS_METRICS, TYPOGRAPHY_SCALE } from './tokens'

describe('font-weight tokens', () => {
  const fontWeights = {
    '--weight-light': '300',
    '--weight-regular': '400',
    '--weight-medium': '500',
    '--weight-bold': '700',
    '--weight-black': '900',
  }

  it('exports all required font-weight tokens', () => {
    for (const [key, expected] of Object.entries(fontWeights)) {
      expect(SITE_CSS_METRICS[key], `${key} missing from SITE_CSS_METRICS`).toBe(expected)
    }
  })

  it('font-weight tokens are numeric strings', () => {
    for (const [key, value] of Object.entries(fontWeights)) {
      expect(/^\d+$/.test(value), `${key}="${value}" is not a numeric string`).toBe(true)
    }
  })

  it('font-weight tokens use only Heebo-supported weights (300, 400, 500, 700, 900)', () => {
    const supported = new Set(['300', '400', '500', '700', '900'])
    for (const [key, value] of Object.entries(fontWeights)) {
      expect(supported.has(value), `${key}="${value}" is not a supported Heebo weight`).toBe(true)
    }
  })

  it('font-weight tokens appear in tokens.css', () => {
    const fs = require('node:fs')
    const css = fs.readFileSync('./src/styles/tokens.css', 'utf8')
    const themeBlock = css.slice(
      css.indexOf('@theme {'),
      css.indexOf('\n}', css.indexOf('@theme {')),
    )

    for (const [key, value] of Object.entries(fontWeights)) {
      const pattern = new RegExp(`${key.replace(/-/g, '\\-')}:\\s*${value}`)
      expect(pattern.test(themeBlock), `${key} missing or mismatched in tokens.css @theme`).toBe(
        true,
      )
    }
  })
})

describe('typography scale', () => {
  it('defines comprehensive semantic typography combinations for consistent sizing', () => {
    // Headings (h1-h6)
    expect(TYPOGRAPHY_SCALE).toHaveProperty('h1')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('h2')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('h3')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('h4')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('h5')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('h6')

    // Subtitles
    expect(TYPOGRAPHY_SCALE).toHaveProperty('subtitle')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('subtitleSmall')

    // Body text variants
    expect(TYPOGRAPHY_SCALE).toHaveProperty('body')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('bodyBold')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('bodyMedium')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('bodyLight')

    // Small text and captions
    expect(TYPOGRAPHY_SCALE).toHaveProperty('small')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('smallBold')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('caption')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('captionSmall')

    // Buttons
    expect(TYPOGRAPHY_SCALE).toHaveProperty('button')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('buttonSmall')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('buttonLarge')

    // Navigation
    expect(TYPOGRAPHY_SCALE).toHaveProperty('nav')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('navActive')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('navSmall')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('navSmallActive')

    // Labels
    expect(TYPOGRAPHY_SCALE).toHaveProperty('label')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('labelSmall')

    // Product-specific
    expect(TYPOGRAPHY_SCALE).toHaveProperty('productTitle')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('productPrice')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('productDescription')

    // Footer
    expect(TYPOGRAPHY_SCALE).toHaveProperty('footer')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('footerLink')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('footerHeading')

    // Special text (overline, eyebrow)
    expect(TYPOGRAPHY_SCALE).toHaveProperty('overline')
    expect(TYPOGRAPHY_SCALE).toHaveProperty('eyebrow')
  })

  it('each typography entry has size, lineHeight, and weight', () => {
    for (const [name, style] of Object.entries(TYPOGRAPHY_SCALE)) {
      expect(style).toHaveProperty('size', expect.any(String))
      expect(style).toHaveProperty('lineHeight', expect.any(String))
      expect(style).toHaveProperty('weight', expect.any(String))
      expect(style.size, `${name}.size should be in pixels`).toMatch(/^\d+(\.\d+)?px$/)
      expect(style.lineHeight, `${name}.lineHeight should be in pixels`).toMatch(/^\d+(\.\d+)?px$/)
      expect(style.weight, `${name}.weight should reference a font-weight token`).toMatch(
        /^--weight-/,
      )
    }
  })

  it('typography weights reference valid font-weight tokens', () => {
    const fontWeightTokens = {
      '--weight-light': '300',
      '--weight-regular': '400',
      '--weight-medium': '500',
      '--weight-bold': '700',
      '--weight-black': '900',
    }
    const validTokens = new Set(Object.keys(fontWeightTokens))

    for (const [name, style] of Object.entries(TYPOGRAPHY_SCALE)) {
      expect(
        validTokens.has(style.weight),
        `${name} uses invalid weight token: ${style.weight}`,
      ).toBe(true)
    }
  })

  it('uses all available Heebo font weights across the typography scale', () => {
    const weights = new Set<string>()
    for (const style of Object.values(TYPOGRAPHY_SCALE)) {
      weights.add(style.weight)
    }

    // Verify that all available weights are used somewhere in the scale
    expect(weights.has('--weight-light'), 'light weight (300) should be used somewhere').toBe(true)
    expect(weights.has('--weight-regular'), 'regular weight (400) should be used somewhere').toBe(
      true,
    )
    expect(weights.has('--weight-medium'), 'medium weight (500) should be used somewhere').toBe(
      true,
    )
    expect(weights.has('--weight-bold'), 'bold weight (700) should be used somewhere').toBe(true)
    expect(weights.has('--weight-black'), 'black weight (900) can be used optionally').toBe(true)
  })
})
