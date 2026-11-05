import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RouteLoading from '../error-pages/RouteLoading'

/**
 * S33: EVERY ROUTE GROUP WHOSE PAGES WAIT ON THE REQUEST HAS A LOADING STATE,
 * EVERY ONE OF THEM IS THE SHARED RTL HEBREW STATE, AND NONE OF THEM SITS
 * WHERE IT WOULD COST A 404 OR A FIRST PAINT.
 *
 * Measured 06.11.2026 before this item: zero loading.tsx files under src/app.
 * The twin of segment-coverage.test.ts, which asks the same of error.tsx.
 *
 * WHAT A loading.tsx IS, since a file that is believed in is worse than none:
 * the fallback of a Suspense boundary between a layout and every page below
 * the file. It is not free, and this item's builds measured both prices.
 *
 *   1. THE STATUS LINE. The boundary lets the shell go out before the page
 *      has decided anything, so a notFound() below it runs too late. With a
 *      loading.tsx at the root of (store) and of (main): /product/<unknown>,
 *      /category/<unknown>, /s/<unknown>, /city/<unknown> and
 *      /coupons/<unknown> all answered 200 instead of 404.
 *   2. THE FIRST PAINT. A page that used to prerender whole now prerenders as
 *      this fallback plus a script that swaps the real content in. With one at
 *      the root of (auth): the built HTML of /forgot-password, /mfa,
 *      /reset-password and /signup/confirm painted the loading state where the
 *      form had been. With one on /search: it replaced SearchPageFallback.
 *
 * So the file sits only where pages read at request time behind a frame and
 * have no slug that must miss: the three signed-in groups, the public supplier
 * pages, /cart and the newsletter pages. The two groups without one are named
 * below with the reason. scripts/error-states-check.mjs measures the same two
 * prices on a real build; this test is the half that needs no build.
 */

const APP = resolve(process.cwd(), 'src/app')

function walk(dir: string, name: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...walk(full, name))
    else if (entry === name) found.push(full)
  }
  return found
}

const groups = readdirSync(APP)
  .filter((entry) => entry.startsWith('(') && entry.endsWith(')'))
  .filter((entry) => statSync(join(APP, entry)).isDirectory())
  .filter((entry) => walk(join(APP, entry), 'page.tsx').length > 0)
  .sort()

/**
 * Groups whose LAYOUT already wraps its children in a Suspense boundary (the
 * session check has to stream under cacheComponents). Every page in them was
 * already behind a boundary before this item, all of them sit behind a
 * sign-in, and none is indexed, so a loading.tsx at the group root changes no
 * status code there.
 */
const ALREADY_STREAMED = ['(account)', '(admin)', '(supplier)']

/** Groups that deliberately have no loading.tsx anywhere, and why. */
const WITHOUT: Record<string, string> = {
  '(auth)':
    'every page keeps its own boundary inside AuthFrame; a group-level one displaced the prerendered form on four static pages',
  '(legal)': 'every page is a permanentRedirect; nothing is ever painted',
}

/** A real call, not a mention in a comment. */
function callsNotFound(source: string): boolean {
  return source
    .split('\n')
    .some((line) => /\bnotFound\(\)/.test(line) && !/^\s*(\*|\/\/|\/\*)/.test(line))
}

describe('per-group loading states', () => {
  it('finds the route groups, so a restructure cannot empty this test', () => {
    expect(groups.length).toBeGreaterThanOrEqual(8)
  })

  it('gives every route group a loading state, or a written reason for none', () => {
    const missing = groups.filter(
      (group) => !(group in WITHOUT) && walk(join(APP, group), 'loading.tsx').length === 0,
    )
    expect(missing, 'route groups with pages and no loading state').toEqual([])
  })

  it('keeps the exempt groups exempt for the reason given', () => {
    for (const group of Object.keys(WITHOUT)) {
      expect(walk(join(APP, group), 'loading.tsx'), `${group}: ${WITHOUT[group]}`).toEqual([])
    }
    // The (legal) reason is checkable from source: if a real page ever lands
    // in the group, this fails and the exemption has to be argued again.
    for (const page of walk(join(APP, '(legal)'), 'page.tsx')) {
      expect(readFileSync(page, 'utf8'), page).toContain('permanentRedirect(')
    }
  })

  it('never puts one above a page that must be able to answer 404', () => {
    const offenders: string[] = []
    for (const group of groups) {
      if (ALREADY_STREAMED.includes(group)) continue
      for (const loading of walk(join(APP, group), 'loading.tsx')) {
        const segment = loading.slice(0, -'/loading.tsx'.length)
        for (const page of walk(segment, 'page.tsx')) {
          if (callsNotFound(readFileSync(page, 'utf8'))) {
            offenders.push(
              `${loading.slice(APP.length + 1)} is above ${page.slice(APP.length + 1)}`,
            )
          }
        }
      }
    }
    expect(offenders, 'a loading.tsx above a notFound() turns its 404 into a 200').toEqual([])
  })

  it('grounds the exemption: the exempt layouts really do stream their children', () => {
    for (const group of ALREADY_STREAMED) {
      const layout = readFileSync(join(APP, group, 'layout.tsx'), 'utf8')
      expect(layout, `${group}/layout.tsx`).toMatch(/<Suspense/)
    }
  })

  it('keeps the store root, search and checkout free of one', () => {
    // Root: the product, category, supplier and city pages must 404.
    // Search: it has a fallback shaped like its own results.
    // Checkout: the payment provider and the Android app follow HTTP
    // redirects from its return pages; a boundary above them would turn each
    // into a 200 that redirects from inside the stream.
    expect(() => statSync(join(APP, '(store)', 'loading.tsx'))).toThrow()
    expect(walk(join(APP, '(store)', 'search'), 'loading.tsx')).toEqual([])
    expect(walk(join(APP, '(store)', 'checkout'), 'loading.tsx')).toEqual([])
    expect(() => statSync(join(APP, '(main)', 'loading.tsx'))).toThrow()
  })

  it('builds every one of them on the shared RouteLoading', () => {
    const all = walk(APP, 'loading.tsx')
    expect(all.length).toBeGreaterThanOrEqual(6)
    for (const file of all) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).toContain('RouteLoading')
      // A loading.tsx that became a client component would ship its fallback
      // as script; it is static markup and stays a server component.
      expect(source, file).not.toContain("'use client'")
    }
  })

  it('keeps the account column held while the account page loads (V08)', () => {
    // The layout's own fallback is an empty .account-content__pending box that
    // holds the column's height. loading.tsx is the nearer boundary, so it has
    // to keep that box or the footer jumps again.
    const source = readFileSync(join(APP, '(account)', 'loading.tsx'), 'utf8')
    expect(source).toContain('account-content__pending')
  })
})

describe('RouteLoading', () => {
  it('announces itself as a status, in Hebrew, right to left', () => {
    render(<RouteLoading />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('dir')).toBe('rtl')
    expect(status.textContent).toMatch(/[֐-׿]/)
    expect(status.textContent).toBe('טוענים את העמוד…')
  })

  it('hides the ring and the bones from a screen reader', () => {
    const { container } = render(<RouteLoading />)
    const ring = container.querySelector('.ke-route-loading__ring')
    const bones = container.querySelector('.ke-route-loading__bones')
    expect(ring?.getAttribute('aria-hidden')).toBe('true')
    expect(bones?.getAttribute('aria-hidden')).toBe('true')
  })

  it('takes the panel modifier for frames that already hold their height', () => {
    const { container } = render(<RouteLoading panel />)
    expect(container.querySelector('.ke-route-loading--panel')).not.toBeNull()
  })

  it('stops moving when motion is reduced, and names no colour outside its own sheet', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/route-loading.css'), 'utf8')
    expect(css).toMatch(/prefers-reduced-motion: reduce/)
    expect(css).toContain('--ke-load-primary: #fed700')
    // Self-contained, like error-pages.css: nothing from the frozen globals.
    expect(css).not.toMatch(/@import/)
  })
})
