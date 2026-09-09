import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WCAG 2.4.1 BYPASS BLOCKS, WHICH AXE CANNOT CHECK FOR YOU.
 *
 * Israeli standard 5568 adopts WCAG 2.0 AA, and 2.4.1 says a page with a
 * repeated block of navigation must offer a way past it. `e2e/a11y.spec.ts`
 * runs axe across the site at WCAG A/AA and was green throughout the period
 * described below, because **a missing skip link is not an automated check**:
 * axe can see that a landmark exists, not that a user can reach it in one Tab.
 *
 * MEASURED 2026-09-09, before this test existed. `SkipLink.tsx` was written,
 * documented, unit-tested, and rendered by exactly two of the six layouts that
 * needed it:
 *
 *   (store)     SkipLink + <main id="main-content" tabIndex={-1}>
 *   (legal)     SkipLink + <main id="main-content" tabIndex={-1}>
 *   (account)   SiteHeader, the SAME masthead SkipLink's own comment describes,
 *               and no skip link
 *   (main)      Header, two sidebars, no skip link
 *   (admin)     sticky header + AdminSidebar, no skip link
 *   (supplier)  sticky header + SupplierNav, no skip link
 *
 * The four had a `<main>` with no `id` and no `tabIndex`, so even a link
 * pointing at them would have moved the viewport and left focus in the nav.
 *
 * WHAT THIS ASSERTS, and why all three parts are needed:
 *
 *   1. a layout with a nav renders <SkipLink />
 *   2. it has <main id="main-content">
 *   3. that <main> carries tabIndex={-1}
 *
 * Three is the one that looks optional and is not. Without it the browser
 * scrolls to the target and leaves FOCUS on the link, so the next Tab returns
 * to the top of the navigation. The skip link then appears to work for a
 * sighted tester using a mouse and does nothing whatsoever for the keyboard
 * user it exists for, which is the worst of both outcomes.
 *
 * `(auth)` is exempt and the exemption is derived, not listed: it renders no
 * nav or header, so 2.4.1 has no repeated block to bypass. If a header is ever
 * added there, this test starts failing on it by itself.
 */

const APP = 'src/app'

/** Every `layout.tsx` under src/app, including the root. */
function layouts(dir = APP, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) layouts(full, found)
    else if (entry === 'layout.tsx') found.push(full)
  }
  return found
}

/**
 * Does this layout render a repeated navigation block?
 *
 * Deliberately generous: a header, a nav element, or a component whose name
 * ends in Header / Nav / Sidebar. Over-matching costs a skip link on a page
 * that did not strictly need one, which harms nobody. Under-matching costs the
 * violation this file exists to prevent.
 */
function rendersNav(source: string): boolean {
  return (
    /<header[\s>]/.test(source) ||
    /<nav[\s>]/.test(source) ||
    /<[A-Z][A-Za-z]*(Header|Nav|Sidebar)[\s/>]/.test(source)
  )
}

describe('WCAG 2.4.1: every layout with a navigation block can be bypassed', () => {
  const withNav = layouts().filter((file) => rendersNav(readFileSync(file, 'utf8')))

  it('finds the layouts to check, so a passing run is not an empty one', () => {
    // A refactor that moved every layout would otherwise make this whole file
    // pass by testing nothing.
    expect(withNav.length).toBeGreaterThanOrEqual(5)
  })

  it.each(layouts().map((file) => [file] as const))('%s', (file) => {
    const source = readFileSync(file, 'utf8')
    if (!rendersNav(source)) return

    expect(source, `${file} renders a nav and no <SkipLink />`).toContain('<SkipLink />')
    expect(source, `${file} has no #main-content for the skip link to reach`).toMatch(
      /<main[^>]*id="main-content"/s,
    )
    // The load-bearing one. See the header of this file.
    expect(source, `${file}: <main id="main-content"> needs tabIndex={-1}`).toMatch(
      /<main[^>]*id="main-content"[^>]*tabIndex=\{-1\}|<main[^>]*tabIndex=\{-1\}[^>]*id="main-content"/s,
    )
  })
})

describe('the skip link itself', () => {
  const source = readFileSync('src/components/a11y/SkipLink.tsx', 'utf8')

  it('points at the id the layouts actually use', () => {
    expect(source).toContain('href="#main-content"')
  })

  it('becomes visible on focus rather than staying screen-reader only', () => {
    // `sr-only` alone would keep it hidden even when focused, which is a skip
    // link a sighted keyboard user can never see they have landed on.
    expect(source).toContain('sr-only')
    expect(source).toContain('focus:not-sr-only')
  })

  it('is placed for RTL, because the reading origin is the top right', () => {
    expect(source).toContain('focus:right-4')
    expect(source).not.toContain('focus:left-4')
  })
})
