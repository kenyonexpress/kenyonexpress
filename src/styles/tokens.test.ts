import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG_CSS_METRICS, CATALOG_CSS_VARS } from './tokens'

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
    const source = css()
    const block = declarationBlock(source)
    const rules = source.replace(block, '')
    const stray = rules.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
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
    const source = css()
    const block = declarationBlock(source)
    // Media queries cannot read custom properties, so breakpoints stay literal.
    const rules = source.replace(block, '').replace(/@media[^{]+/g, '')
    const offenders: string[] = []
    for (const value of new Set(Object.values(CATALOG_CSS_METRICS))) {
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
