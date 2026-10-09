import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE HEADER CLUSTER IS EXACTLY TWO ICONS, AND THE ACCOUNT ENTRY POINT IS ONE.
 *
 * Two standing project rules meet in the shell's chrome, and both had been
 * broken at once when the component queue reached 02:
 *
 *   1. The icon cluster is the wishlist heart, then the cart. At every
 *      breakpoint. No account icon, no compare icon, no search icon.
 *   2. The account entry point lives in the shell's top-left and exists in
 *      exactly one place -- TopBar's התחברות.
 *
 * WHAT WAS ACTUALLY THERE. `MastheadNav.tsx` rendered heart, user, cart: three
 * icons, the middle one an account link. `Header.tsx`'s handheld cluster
 * rendered cart and a second account link and no heart at all, so below `xl`
 * the wishlist had no affordance. Counting TopBar, that is three account entry
 * points where the rule allows one, and three places to keep in sync.
 *
 * WHY A TEST AND NOT A CONVENTION, the same argument `no-search-ui.test.ts`
 * makes: the rule was already written in prose at the top of both files while
 * both files were breaking it. Prose does not fail a build.
 *
 * The cluster order is asserted too, and it is not cosmetic. In an RTL flex row
 * the FIRST child renders RIGHTMOST, so heart-then-cart in the DOM puts the
 * cart on the inline-end -- live's x=15 at 380, hard against the left edge.
 * Cart-first renders the mirror of live and still passes a count-only check.
 */

const ROOT = process.cwd()

const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

/**
 * Strip comments before matching.
 *
 * These files explain at length what they deliberately do NOT render, naming
 * `<User>` and `/login` in prose to say why they are absent. A raw grep counts
 * those mentions and reports the exact violation the comment is recording as
 * fixed, so the gate has to read code and not documentation.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/** The two files that render a header icon cluster: handheld, then desktop. */
const CLUSTERS = ['src/components/layout/Header.tsx', 'src/components/layout/MastheadNav.tsx']

/** Every component that makes up the page chrome above the fold. */
const HEADER_CHROME = [
  'src/app/layout.tsx',
  'src/components/layout/Header.tsx',
  'src/components/layout/TopBar.tsx',
  'src/components/layout/MastheadNav.tsx',
  'src/components/layout/MobileDrawer.tsx',
  'src/components/layout/RegionMenu.tsx',
]

describe('the header icon cluster', () => {
  it.each(CLUSTERS)('renders a heart and a cart in %s, and nothing else', (file) => {
    const src = code(read(file))
    expect(src.match(/<Heart\b/g) ?? [], 'the wishlist heart').toHaveLength(1)
    expect(src.match(/<HeaderCart\b/g) ?? [], 'the cart').toHaveLength(1)
  })

  it.each(CLUSTERS)('puts the heart before the cart in the DOM in %s', (file) => {
    const src = code(read(file))
    // RTL: first child renders rightmost, so heart-first is what puts the cart
    // on the left where live measures it.
    expect(src.indexOf('<Heart')).toBeLessThan(src.indexOf('<HeaderCart'))
  })

  it.each(CLUSTERS)('carries no account icon in %s', (file) => {
    const src = code(read(file))
    expect(src, 'the account entry point is TopBar, not the cluster').not.toMatch(/<User\b/)
    expect(src).not.toMatch(/\bUser\b\s*[,}].*from 'lucide-react'/)
  })
})

describe('the account entry point', () => {
  it('exists in exactly one place in the header chrome, and it is the top bar', () => {
    const hits = HEADER_CHROME.filter((f) => /["']\/login["']/.test(code(read(f))))
    expect(hits, 'exactly one account entry point, in the shell top-left').toEqual([
      'src/components/layout/TopBar.tsx',
    ])
  })
})
