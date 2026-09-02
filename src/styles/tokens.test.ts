import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CATALOG_CSS_METRICS,
  CATALOG_CSS_VARS,
  PDP,
  PDP_CSS_METRICS,
  PDP_CSS_VARS,
  SITE,
  SITE_CSS_METRICS,
  SITE_CSS_VARS,
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

function pdpCss(): string {
  return readFileSync(resolve(process.cwd(), 'src/styles/product-page.css'), 'utf8')
}

function declarationBlock(source: string, selector = '.category-page {'): string {
  const start = source.indexOf(selector)
  const end = source.indexOf('}', start)
  return source.slice(start, end)
}

/**
 * Everything the browser actually applies: the token block and all comments
 * removed. Comments are documentation and are expected to quote the measured
 * numbers they explain, so scanning them for literals would flag the very
 * provenance notes that make the tokens trustworthy.
 */
function declarationsOnly(source: string, selector = '.category-page {'): string {
  return source.replace(declarationBlock(source, selector), '').replace(/\/\*[\s\S]*?\*\//g, '')
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

/**
 * The product page gets the same contract as the catalog sheet: every colour
 * and every measured number is declared once, on `.pdp`, and has to agree with
 * PDP in tokens.ts. The PDP numbers are load-bearing in a way the catalog ones
 * are not -- they are what puts our footer on live's y1442 instead of 230px
 * above it -- so a number that drifts here silently un-aligns the whole page.
 */
describe('product page tokens', () => {
  it('declares every colour from tokens.ts with the same value', () => {
    const block = declarationBlock(pdpCss(), '.pdp {')
    for (const [name, value] of Object.entries(PDP_CSS_VARS)) {
      const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
      expect(match, `${name} is missing from product-page.css`).not.toBeNull()
      expect(match?.[1]?.trim().toLowerCase(), `${name} drifted from tokens.ts`).toBe(
        value.toLowerCase(),
      )
    }
  })

  it('declares every measured metric with the same value as tokens.ts', () => {
    const block = declarationBlock(pdpCss(), '.pdp {')
    for (const [name, value] of Object.entries(PDP_CSS_METRICS)) {
      const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
      expect(match, `${name} is missing from product-page.css`).not.toBeNull()
      expect(match?.[1]?.trim(), `${name} drifted from tokens.ts`).toBe(value)
    }
  })

  it('carries no raw hex outside the declaration block', () => {
    const stray = declarationsOnly(pdpCss(), '.pdp {').match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
    expect(stray, `raw hex found in rules: ${stray.join(', ')}`).toHaveLength(0)
  })

  it('carries no measured px literal inside a rule', () => {
    const rules = declarationsOnly(pdpCss(), '.pdp {').replace(/@media[^{]+/g, '')
    const offenders: string[] = []
    const distinctive = [...new Set(Object.values(PDP_CSS_METRICS))].filter(
      (v) => v.includes('.') || Number.parseFloat(v) >= 100,
    )
    for (const value of distinctive) {
      if (new RegExp(`(?<![\\d.])${value.replace('.', '\\.')}`).test(rules)) {
        offenders.push(value)
      }
    }
    expect(offenders, `measured values hardcoded in rules: ${offenders.join(', ')}`).toHaveLength(0)
  })

  it('keeps the container at the measured 1170, not the 1320 page override', () => {
    // The site container is deliberately 1320 (see STATE). Live's single-product
    // template is 1170, and using the wider one put every column edge ~26px out.
    expect(PDP_CSS_METRICS['--pdp-container']).toBe('1170px')
  })
})

/**
 * The site palette: same contract as the catalog one above, applied to the
 * `@theme` block in globals.css and to every component.
 *
 * The second test here is the one that makes the sweep stick. Before it, "use
 * a token" was a convention: 74 raw hexes had accumulated across 33 components
 * because nothing objected when one more was pasted in. Now a hex in a .tsx
 * fails the suite, and the only way to add a colour is to name it in tokens.ts
 * and mirror it into tokens.css.
 *
 * The `@theme` block moved from `src/app/globals.css` to `src/styles/tokens.css`
 * on 2026-09-03. Both files are read and concatenated rather than just the new
 * one: if a `@theme` block is ever added back to globals.css, the tokens in it
 * have to face this same contract instead of quietly sitting outside it.
 */
function globalsCss(): string {
  return [
    readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8'),
    readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8'),
  ].join('\n')
}

function themeBlock(source: string): string {
  // Every `@theme` block in the concatenated sources, not just the first.
  const blocks: string[] = []
  let start = source.indexOf('@theme {')
  while (start !== -1) {
    const end = source.indexOf('\n}', start)
    blocks.push(source.slice(start, end === -1 ? undefined : end))
    start = source.indexOf('@theme {', end === -1 ? source.length : end)
  }
  return blocks.join('\n')
}

/** Every .tsx under src/, repo-relative. */
function tsxFiles(dir = resolve(process.cwd(), 'src'), out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) tsxFiles(full, out)
    else if (entry.name.endsWith('.tsx')) out.push(relative(process.cwd(), full))
  }
  return out
}

/**
 * The one file allowed to name a hex. Google's sign-in mark is a trademark
 * reproduced to their branding guidelines, so it is deliberately NOT a design
 * token: a KenyonExpress rebrand must leave it alone. It is declared once, in
 * a file whose only job is to be that mark.
 */
// GoogleLogo carries Google's brand hexes, which are not ours to tokenise.
//
// global-error.tsx is the root-layout boundary: it renders when the layout
// itself threw, which includes the case where the stylesheet is what failed to
// load. It therefore cannot reference a CSS variable for the same reason it
// supplies its own <html> and <body>, and inline hex is the only thing
// guaranteed to render at that point.
const HEX_ALLOWLIST = new Set(['src/components/shared/GoogleLogo.tsx', 'src/app/global-error.tsx'])

/**
 * THE PDP PALETTE AND THE SITE PALETTE MUST NOT DRIFT APART.
 *
 * `product-page.css` declares its own `--pdp-*` colours, and `PDP_CSS_VARS`
 * already gates those against `tokens.ts`. What nothing gated is the pair of
 * palettes against EACH OTHER: eight of the twelve PDP colours are the same
 * value as a `SITE` colour, and the two are maintained in different objects.
 *
 * The failure that allows is quiet and total. Rebranding through
 * `SITE.brand.primary` -- which the tokens file names as the way to rebrand --
 * moves the header, the cards and every button on the site, and leaves the
 * product page's add-to-cart the old yellow. No test fails, because each half
 * still agrees with its own source. The page just stops matching the site.
 *
 * The four PDP colours with no site counterpart (`action`, `rule`, `buy`,
 * `buyHover`) are deliberately absent from this table: they are measured
 * values that exist only on that template.
 */
describe('the PDP palette tracks the site palette', () => {
  const SHARED: Array<[keyof typeof PDP.color, string]> = [
    ['ink', SITE.functional.heading],
    ['muted', SITE.neutral.muted2],
    ['sale', SITE.functional.price],
    ['strike', SITE.functional.priceStrike],
    ['line', SITE.neutral.border],
    ['brand', SITE.brand.primary],
    ['brandHover', SITE.brand.primaryHover],
    ['surface', SITE.surface.page],
  ]

  it.each(SHARED)('PDP.color.%s equals its site token', (key, siteValue) => {
    expect(PDP.color[key].toLowerCase()).toBe(siteValue.toLowerCase())
  })
})

describe('site colour tokens', () => {
  it('declares every token from tokens.ts in the @theme block with the same value', () => {
    const block = themeBlock(globalsCss())
    for (const [name, value] of Object.entries(SITE_CSS_VARS)) {
      const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
      expect(match, `${name} is missing from globals.css @theme`).not.toBeNull()
      expect(match?.[1]?.trim().toLowerCase(), `${name} drifted from tokens.ts`).toBe(
        value.toLowerCase(),
      )
    }
  })

  it('declares every shared metric with the same value as tokens.ts', () => {
    const block = themeBlock(globalsCss())
    for (const [name, value] of Object.entries(SITE_CSS_METRICS)) {
      const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
      expect(match, `${name} is missing from globals.css @theme`).not.toBeNull()
      expect(match?.[1]?.trim(), `${name} drifted from tokens.ts`).toBe(value)
    }
  })

  it('carries no raw hex in any component', () => {
    const offenders: string[] = []
    for (const file of tsxFiles()) {
      if (HEX_ALLOWLIST.has(file)) continue
      // Comments are documentation and may name a token, not a hex; the sweep
      // rewrote the provenance notes to say "bg = brand-primary" for exactly
      // that reason, so nothing here needs stripping first.
      for (const hex of readFileSync(file, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
        offenders.push(`${file}: ${hex}`)
      }
    }
    expect(offenders, `raw hex in components:\n  ${offenders.join('\n  ')}`).toHaveLength(0)
  })

  /**
   * THE HEX RULE HAD A HOLE THE SAME SIZE AS ITSELF.
   *
   * `rgb(221, 221, 222)` is `#dddddd` written another way, and the assertion
   * above never looked at it. Five of them had settled into components by
   * 2026-09-03 -- a border already tokenised as `--color-border`, the slider's
   * inactive dot, and the consent banner's hairline, shadow and body ink --
   * and every one of them was invisible to the gate that exists to prevent
   * exactly that.
   *
   * Same allowlist as the hex rule, for the same two reasons.
   */
  it('carries no raw rgb() or rgba() in any component', () => {
    const offenders: string[] = []
    for (const file of tsxFiles()) {
      if (HEX_ALLOWLIST.has(file)) continue
      for (const fn of readFileSync(file, 'utf8').match(/\brgba?\(\s*\d[^)]*\)/g) ?? []) {
        offenders.push(`${file}: ${fn}`)
      }
    }
    expect(offenders, `raw rgb() in components:\n  ${offenders.join('\n  ')}`).toHaveLength(0)
  })

  it('keeps the Google mark out of the palette', () => {
    // A rebrand edits SITE.brand.*; it must not be able to reach Google's mark.
    const palette = JSON.stringify(SITE_CSS_VARS).toLowerCase()
    for (const google of ['#4285f4', '#34a853', '#fbbc05', '#ea4335']) {
      expect(palette, `${google} must not be a design token`).not.toContain(google)
    }
  })
})
