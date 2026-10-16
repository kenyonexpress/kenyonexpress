import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Shadow Elevation System', () => {
  it('should define all shadow tokens in electro.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'packages/design-tokens/electro.css'), 'utf8')

    const shadowTokens = [
      '--electro-shadow-xs',
      '--electro-shadow-sm',
      '--electro-shadow-md',
      '--electro-shadow-lg',
      '--electro-shadow-xl',
    ]

    for (const token of shadowTokens) {
      expect(css).toContain(token)
    }
  })

  it('should define hover state elevation shadows', () => {
    const css = readFileSync(resolve(process.cwd(), 'packages/design-tokens/electro.css'), 'utf8')

    const hoverShadows = [
      '--electro-shadow-sm-hover',
      '--electro-shadow-md-hover',
      '--electro-shadow-lg-hover',
      '--electro-shadow-xl-hover',
    ]

    for (const token of hoverShadows) {
      expect(css).toContain(token)
    }
  })

  it('should define component-specific elevation tokens', () => {
    const css = readFileSync(resolve(process.cwd(), 'packages/design-tokens/electro.css'), 'utf8')

    const elevationTokens = [
      '--electro-elevation-base',
      '--electro-elevation-card',
      '--electro-elevation-panel',
      '--electro-elevation-modal',
      '--electro-elevation-dropdown',
      '--electro-elevation-float',
    ]

    for (const token of elevationTokens) {
      expect(css).toContain(token)
    }
  })

  it('should define transition timing variables', () => {
    const css = readFileSync(resolve(process.cwd(), 'packages/design-tokens/electro.css'), 'utf8')

    const transitions = [
      '--electro-transition-base',
      '--electro-transition-fast',
      '--electro-transition-slow',
    ]

    for (const token of transitions) {
      expect(css).toContain(token)
      expect(css).toContain('ms')
    }
  })

  it('should have elevation utility classes defined', () => {
    const css = readFileSync(resolve(process.cwd(), 'packages/design-tokens/electro.css'), 'utf8')

    const elevationClasses = [
      '.elevation-sm',
      '.elevation-md',
      '.elevation-lg',
      '.elevation-xl',
      '.card-elevation',
      '.panel-elevation',
      '.modal-elevation',
      '.dropdown-elevation',
      '.floating-elevation',
    ]

    for (const className of elevationClasses) {
      expect(css).toContain(className)
    }
  })

  it('elevation levels should reference shadow levels', () => {
    const css = readFileSync(resolve(process.cwd(), 'packages/design-tokens/electro.css'), 'utf8')

    // Check that elevation tokens reference shadow tokens
    expect(css).toContain('--electro-elevation-card: var(--electro-shadow-sm)')
    expect(css).toContain('--electro-elevation-panel: var(--electro-shadow-md)')
    expect(css).toContain('--electro-elevation-modal: var(--electro-shadow-lg)')
  })

  it('hover states should reference next elevation level', () => {
    const css = readFileSync(resolve(process.cwd(), 'packages/design-tokens/electro.css'), 'utf8')

    // Check that hover states elevate to next level
    expect(css).toContain('--electro-shadow-sm-hover: var(--electro-shadow-md)')
    expect(css).toContain('--electro-shadow-md-hover: var(--electro-shadow-lg)')
    expect(css).toContain('--electro-shadow-lg-hover: var(--electro-shadow-xl)')
  })

  it('should define hover pseudo-classes for elevation classes', () => {
    const css = readFileSync(resolve(process.cwd(), 'packages/design-tokens/electro.css'), 'utf8')

    // Check for hover states with transitions
    expect(css).toContain('.elevation-sm:hover')
    expect(css).toContain('.elevation-md:hover')
    expect(css).toContain('.elevation-lg:hover')
    expect(css).toContain('.elevation-xl:hover')
    expect(css).toContain('transition: box-shadow')
  })
})
