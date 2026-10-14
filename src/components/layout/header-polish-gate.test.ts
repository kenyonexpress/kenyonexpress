import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * UX03, THE MASTHEAD POLISH, held to what was measured off live on 14.10.2026
 * (logs/ux03/before.json against refs/ke_live_home.html's stylesheet):
 *
 *   logo      handheld `.header-logo img{max-width:100px}` -> width-bound 100;
 *             masthead `max-width:300px` -> 300x79; the fallback box is 300, not 52
 *   cluster   three 22px glyphs, cart on the gutter (x15); no price below xl
 *   price     `.cart-items-total-price` 15.988px / 700 / #333e48 at xl
 *   hover     `a:hover{color:#29323a}`, a colour and not an opacity fade
 *   badge     one component, two measured shapes (20 dark / 21 yellow), a pop
 *   focus     `input:focus{border-color:#ffeb80}` on the pill, the site ring on
 *             the pill rather than clipped inside it
 *
 * Each is a class or a token a later "tidy" can undo without failing a build;
 * this is the build failure. The geometry itself is e2e/header.spec.ts.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')
const code = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const HEADER = 'src/components/layout/Header.tsx'
const MASTHEAD = 'src/components/layout/MastheadNav.tsx'
const CART_LINK = 'src/components/cart/CartNavLink.tsx'
const HANDHELD_SEARCH = 'src/components/search/HandheldSearch.tsx'
const WISHLIST_COUNT = 'src/components/wishlist/WishlistNavCount.tsx'
const SITE_SEARCH = 'src/components/search/SiteSearch.tsx'
const BADGE = 'src/components/layout/HeaderBadge.tsx'
const GLOBALS = 'src/app/globals.css'
const TOKENS_CSS = 'src/styles/tokens.css'
const TOKENS_TS = 'src/styles/tokens.ts'

/** Every file that paints a header icon. */
const ICON_FILES = [HEADER, MASTHEAD, CART_LINK, HANDHELD_SEARCH]

describe('the logo', () => {
  it('is width-bound below xl and height-bound from it', () => {
    const logo = code(read(HEADER)).match(/<SmartImage[\s\S]*?\/>/)?.[0] ?? ''
    const className = logo.match(/\sclassName="([^"]*)"/)?.[1] ?? ''
    for (const cls of [
      'aspect-[19/5]',
      'w-handheld-logo-w',
      'h-auto',
      'xl:h-logo-h',
      'xl:w-auto',
    ]) {
      expect(className.split(/\s+/), cls).toContain(cls)
    }
    expect(className).not.toMatch(/(^|\s)h-handheld-logo-h(\s|$)/)
  })

  it('has a 300px fallback box, the size the masthead image paints', () => {
    expect(read(TOKENS_CSS)).toMatch(/--spacing-logo-w:\s*300px;/)
    expect(read(TOKENS_TS)).toMatch(/'--spacing-logo-w':\s*'300px'/)
  })
})

describe('the handheld icon cluster', () => {
  it('is three touching 44px cells pulled back by the glyph overhang', () => {
    const src = code(read(HEADER))
    expect(src).toMatch(/className="-me-touch-pad flex items-center gap-0 xl:hidden"/)
    // The cart gets the same cell as its neighbours.
    expect(src).toMatch(
      /<div className="grid size-touch-min place-items-center">\s*<HeaderCart \/>\s*<\/div>/,
    )
    expect(read(TOKENS_CSS)).toMatch(/--spacing-touch-pad:\s*11px;/)
    expect(read(TOKENS_TS)).toMatch(/'--spacing-touch-pad':\s*'11px'/)
  })

  it('shows the subtotal in the masthead only, at live’s 16px / 700 / heading', () => {
    const src = code(read(CART_LINK))
    const price = src.match(
      /<span className="([^"]*)">\s*\{shekelsRounded\(cart\.subtotal\)\}/,
    )?.[1]
    expect(price, 'the price span').toBeDefined()
    const classes = (price ?? '').split(/\s+/)
    for (const cls of ['hidden', 'xl:inline', 'text-base', 'font-bold', 'text-heading']) {
      expect(classes, cls).toContain(cls)
    }
  })
})

describe('the icon hover', () => {
  it.each(ICON_FILES)('darkens to live’s a:hover colour in %s, never an opacity fade', (file) => {
    const src = code(read(file))
    expect(src).not.toMatch(/hover:opacity-\d+/)
    expect(src).not.toMatch(/style=\{\{\s*color:/)
    expect(src).toMatch(/hover:text-heading-hover/)
    expect(src).toMatch(/transition-colors/)
  })
})

describe('the count badge', () => {
  it('is one component, mounted by the cart and the heart and nowhere else', () => {
    expect(code(read(CART_LINK))).toMatch(
      /<HeaderBadge count=\{itemCount\} armed=\{serverConfirmed\}/,
    )
    expect(code(read(WISHLIST_COUNT))).toMatch(/<HeaderBadge count=\{count\} armed=\{ready\}/)
    for (const file of [CART_LINK, WISHLIST_COUNT, HEADER, MASTHEAD]) {
      expect(code(read(file)), `${file} draws no badge of its own`).not.toMatch(/rounded-full/)
    }
  })

  it('has both measured shapes in CSS, switched on the clusters’ breakpoint, and a pop', () => {
    const css = read(GLOBALS)
    const rule = css.match(/\.header-badge \{[^}]*\}/)?.[0] ?? ''
    expect(rule).toMatch(/height: var\(--spacing-badge-handheld\)/)
    expect(rule).toMatch(/font-size: var\(--text-nano\)/)
    expect(rule).toMatch(/background-color: var\(--color-heading\)/)
    const masthead =
      css.match(/@media \(min-width: 1280px\) \{\s*\.header-badge \{[^}]*\}/)?.[0] ?? ''
    expect(masthead).toMatch(/height: var\(--spacing-badge-masthead\)/)
    expect(masthead).toMatch(/font-size: var\(--text-badge\)/)
    expect(masthead).toMatch(/background-color: var\(--color-brand-primary\)/)
    expect(css).toMatch(/\.header-badge--bump \{\s*animation: header-badge-pop/)
    expect(css).toMatch(/@keyframes header-badge-pop/)
    expect(code(read(BADGE))).toMatch(/onAnimationEnd=\{settle\}/)
    for (const [name, value] of [
      ['--spacing-badge-masthead', '21px'],
      ['--spacing-badge-handheld', '20px'],
      ['--text-badge', '12px'],
    ]) {
      expect(read(TOKENS_CSS)).toMatch(new RegExp(`${name}:\\s*${value};`))
      expect(read(TOKENS_TS)).toMatch(new RegExp(`'${name}':\\s*'${value}'`))
    }
  })
})

describe('the search pill focus', () => {
  it('lightens the border to live’s #ffeb80 and lifts the site ring onto the pill', () => {
    expect(code(read(SITE_SEARCH))).toMatch(
      /className=\{`site-search__pill flex items-stretch overflow-hidden rounded-pill/,
    )
    const css = read(GLOBALS)
    expect(css).toMatch(
      /\.site-search__pill:focus-within \{\s*border-color: var\(--color-brand-primary-focus\);/,
    )
    expect(css).toMatch(
      /\.site-search__pill:has\(> input:focus-visible\) \{\s*outline: 3px solid var\(--color-brand-primary\)/,
    )
    expect(css).toMatch(
      /\.site-search__pill > input:focus-visible \{\s*outline: none;\s*box-shadow: none;/,
    )
    expect(css).toMatch(
      /\.site-search__pill > button:focus-visible \{\s*outline: none;\s*box-shadow: inset/,
    )
    expect(read(TOKENS_CSS)).toMatch(/--color-brand-primary-focus:\s*#ffeb80;/)
    expect(read(TOKENS_TS)).toMatch(/'--color-brand-primary-focus':\s*SITE\.brand\.primaryFocus/)
    expect(read(TOKENS_TS)).toMatch(/primaryFocus:\s*'#ffeb80'/)
  })
})
