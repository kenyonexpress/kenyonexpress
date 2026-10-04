import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE HEADER ICON ROW IS ELECTRO HEADER-V8'S, EXACTLY, AND IT IS RENDERED ONCE.
 *
 * W01 (2026-10-05) replaced the rule this file used to hold. The old rule was
 * "exactly two icons, heart then cart, and no account icon in the cluster"; the
 * row is now held to the Electro masthead instead, measured off the live
 * template and recorded in refs/electro-header-icons.json:
 *
 *   1. Three items in DOM order wishlist, account, cart. In an RTL flex row the
 *      FIRST child renders RIGHTMOST, so this puts the cart hard against the
 *      left edge, the mirror of Electro's cart hard against the right.
 *   2. The cart carries the yellow round counter and NOTHING else: Electro's
 *      `.cart-items-total-price` is never rendered here.
 *   3. Both headers (handheld and masthead) mount the one `HeaderIcons`
 *      component, so they cannot drift. Neither renders an icon of its own.
 *   4. The region picker is in TopBar beside התחברות, not in the row.
 *   5. The account entry points are TopBar's התחברות and the row's account
 *      menu, and no other file in the header chrome links to /login.
 *
 * WHY A TEST AND NOT A CONVENTION, the same argument `no-search-ui.test.ts`
 * makes: the previous rule was written in prose at the top of two files while
 * both files were breaking it. Prose does not fail a build.
 */

const ROOT = process.cwd()

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

/**
 * Strip comments before matching. These files explain at length what they
 * deliberately do NOT render, and a raw grep would count the explanation as
 * the violation it records.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const ROW = 'src/components/layout/HeaderIcons.tsx'

/** The two files that mount the row: handheld, then desktop. */
const MOUNTS = ['src/components/layout/Header.tsx', 'src/components/layout/MastheadNav.tsx']

/** Every component that makes up the page chrome above the fold. */
const HEADER_CHROME = [
  'src/app/layout.tsx',
  'src/components/layout/Header.tsx',
  'src/components/layout/TopBar.tsx',
  'src/components/layout/MastheadNav.tsx',
  'src/components/layout/MobileDrawer.tsx',
  'src/components/layout/RegionMenu.tsx',
  'src/components/layout/HeaderIcons.tsx',
  'src/components/layout/AccountMenu.tsx',
]

describe('the header icon row', () => {
  const row = code(read(ROW))

  it('holds wishlist, account and cart, once each, and nothing else', () => {
    expect(row.match(/<WishlistNavLink\b/g) ?? [], 'the wishlist').toHaveLength(1)
    expect(row.match(/<AccountMenu\b/g) ?? [], 'the account menu').toHaveLength(1)
    expect(row.match(/<HeaderCart\b/g) ?? [], 'the cart').toHaveLength(1)
    // Three children of the <nav>, no fourth: no compare, no search, no region.
    const children = row.match(/^\s{6}<[A-Z]\w*\b/gm) ?? []
    expect(children, 'exactly three items in the row').toHaveLength(3)
    expect(row).not.toMatch(/<RegionMenu\b/)
  })

  it('orders them wishlist, account, cart in the DOM (RTL: cart lands on the left)', () => {
    const at = ['<WishlistNavLink', '<AccountMenu', '<HeaderCart'].map((tag) => row.indexOf(tag))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect(at).toEqual([...at].sort((a, b) => a - b))
  })

  it.each(MOUNTS)('is mounted once by %s, which renders no icon of its own', (file) => {
    const src = code(read(file))
    expect(src.match(/<HeaderIcons\b/g) ?? [], 'the row').toHaveLength(1)
    for (const own of ['<WishlistNavLink', '<AccountMenu', '<HeaderCart', '<RegionMenu']) {
      expect(src, `${own} belongs to HeaderIcons or TopBar, not to ${file}`).not.toContain(own)
    }
    expect(src).not.toMatch(/from 'lucide-react'/)
  })
})

describe('the cart icon', () => {
  const src = code(read('src/components/cart/CartNavLink.tsx'))

  it('renders the counter and never the total price', () => {
    expect(src).toMatch(/header-icon-counter/)
    expect(src, 'no cart-items-total-price').not.toMatch(/total-price/)
    expect(src, 'no money formatter in the icon').not.toMatch(/shekels/)
    expect(src).not.toMatch(/cart\.subtotal/)
  })

  it('draws the Electro glyph, not a lucide cart', () => {
    expect(src).toMatch(/components\/icons\/electro\/ShoppingBag/)
    expect(src).not.toMatch(/from 'lucide-react'/)
  })
})

describe('the Electro glyphs', () => {
  it.each(['ShoppingBag', 'Favorites', 'User'])(
    '%s is an inline SVG with a bbox viewBox',
    (name) => {
      const src = code(read(`src/components/icons/electro/${name}.tsx`))
      expect(src).toMatch(/<svg\b/)
      expect(src).toMatch(/viewBox="-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+"/)
      expect(src).toMatch(/fill="currentColor"/)
      expect(src).toMatch(/aria-hidden="true"/)
      expect(src).toMatch(/<path d="M/)
    },
  )
})

describe('the region picker', () => {
  it('lives in TopBar and nowhere else in the header chrome', () => {
    const hits = HEADER_CHROME.filter((f) => /<RegionMenu\b/.test(code(read(f))))
    expect(hits).toEqual(['src/components/layout/TopBar.tsx'])
  })
})

describe('the account entry points', () => {
  it('are the top bar and the row’s account menu, and no other file', () => {
    const hits = HEADER_CHROME.filter((f) => /["']\/login["']/.test(code(read(f))))
    expect(hits.sort()).toEqual(
      ['src/components/layout/TopBar.tsx', 'src/components/layout/AccountMenu.tsx'].sort(),
    )
  })

  it('offer sign in and register from the account menu', () => {
    const src = code(read('src/components/layout/AccountMenu.tsx'))
    expect(src).toMatch(/href="\/login"/)
    expect(src).toMatch(/href="\/signup"/)
    expect(src).toMatch(/t\('auth\.login'\)/)
    expect(src).toMatch(/t\('auth\.signup'\)/)
  })
})
