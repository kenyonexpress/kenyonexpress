import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CATALOG_CSS_METRICS,
  CATALOG_CSS_VARS,
  ELECTRO,
  THEME_BRAND,
  TOUCH_TARGET_PX,
} from './tokens'

/**
 * The catalog stylesheet is only allowed to name a colour once, in its custom
 * property block, and that block has to agree with tokens.ts. Without this test
 * "fix it through the tokens" is a convention nobody enforces: a raw hex could
 * be pasted back into any rule and nothing would complain.
 */
function css(): string {
  return readFileSync(resolve(process.cwd(), 'src/styles/category-page.css'), 'utf8')
}

function declarationBlock(source: string): string {
  const start = source.indexOf('.category-page {')
  const end = source.indexOf('}', start)
  return source.slice(start, end)
}

/**
 * Everything the browser actually applies: the token block and all comments
 * removed. Comments are documentation and are expected to quote the measured
 * numbers they explain, so scanning them for literals would flag the very
 * provenance notes that make the tokens trustworthy.
 */
function declarationsOnly(source: string): string {
  return source.replace(declarationBlock(source), '').replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('catalog colour tokens', () => {
  it('declares every token from tokens.ts with the same value', () => {
    const block = declarationBlock(css())
    for (const [name, value] of Object.entries(CATALOG_CSS_VARS)) {
      const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
      expect(match, `${name} is missing from category-page.css`).not.toBeNull()
      expect(match?.[1]?.trim().toLowerCase(), `${name} drifted from tokens.ts`).toBe(
        value.toLowerCase(),
      )
    }
  })

  it('carries no raw hex outside the declaration block', () => {
    const stray = declarationsOnly(css()).match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(stray, `raw hex found in rules: ${stray.join(', ')}`).toHaveLength(0)
  })

  it('declares every measured metric with the same value as tokens.ts', () => {
    const block = declarationBlock(css())
    for (const [name, value] of Object.entries(CATALOG_CSS_METRICS)) {
      const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
      expect(match, `${name} is missing from category-page.css`).not.toBeNull()
      expect(match?.[1]?.trim(), `${name} drifted from tokens.ts`).toBe(value)
    }
  })

  it('carries no measured px literal inside a rule', () => {
    // Media queries cannot read custom properties, so breakpoints stay literal.
    const rules = declarationsOnly(css()).replace(/@media[^{]+/g, '')
    const offenders: string[] = []
    // Only unambiguous measurements are scanned: fractional values, or values
    // of 100px and up. Round two-digit ones like 8px and 10px are also ordinary
    // spacing elsewhere in the sheet, so flagging them would be a false alarm.
    const distinctive = [...new Set(Object.values(CATALOG_CSS_METRICS))].filter(
      (v) => v.includes('.') || Number.parseFloat(v) >= 100,
    )
    for (const value of distinctive) {
      // (?<![\d.]) so 20.006px is not matched inside a longer number
      if (new RegExp(`(?<![\\d.])${value.replace('.', '\\.')}`).test(rules)) {
        offenders.push(value)
      }
    }
    expect(offenders, `measured values hardcoded in rules: ${offenders.join(', ')}`).toHaveLength(0)
  })

  it('keeps the sale colour on the live value, not the brief', () => {
    // The brief says #E4002B. getComputedStyle on the live archive says
    // #dc3545, and the pixel comparison runs against live.
    expect(CATALOG_CSS_VARS['--cat-sale']).toBe('#dc3545')
  })
})

describe('brand + a11y tokens', () => {
  it('locks the measured brand yellow (not #FDD700)', () => {
    expect(ELECTRO.colors.primary.toLowerCase()).toBe('#fed700')
    expect(ELECTRO.colors.dark.toLowerCase()).toBe('#333e48')
  })

  it('keeps the deprecated sky-blue marked but never promotes it to theme', () => {
    expect(ELECTRO.colors.blue.toLowerCase()).toBe('#b0e0e9')
    const themeValues = Object.values(THEME_BRAND).map((v) => v.toLowerCase())
    expect(themeValues).not.toContain('#b0e0e9')
  })

  it('exports a 44px touch target for interactive controls', () => {
    expect(TOUCH_TARGET_PX).toBe(44)
    expect(ELECTRO.a11y.touchTarget).toBe('44px')
  })

  it('keeps globals.css @theme brand colours in step with tokens.ts', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
    const themeStart = css.indexOf('@theme')
    const themeEnd = css.indexOf('}', themeStart)
    const block = css.slice(themeStart, themeEnd)
    for (const [name, value] of Object.entries(THEME_BRAND)) {
      const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
      expect(match, `${name} missing from globals.css @theme`).not.toBeNull()
      expect(match?.[1]?.trim().toLowerCase(), `${name} drifted from tokens.ts`).toBe(
        value.toLowerCase(),
      )
    }
  })
})
