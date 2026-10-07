import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * STEP 33: the responsive contract, pinned at the source so a refactor cannot
 * quietly drop one half of it. The browser-measured half (no sideways scroll
 * at 375/768/1024/1440, 44px hit areas under a coarse pointer) lives in
 * e2e/responsive.spec.ts and e2e/touch-targets.spec.ts; this file guards the
 * declarations those measurements depend on.
 */

const root = process.cwd()
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('viewport meta', () => {
  it('opts into the safe area with viewport-fit=cover', () => {
    // Without this every env(safe-area-inset-*) is 0 and the padding the
    // mobile cart bar asks for is never applied. Read from the source rather
    // than imported: layout.tsx pulls in fonts and analytics providers that
    // have no business in a unit test.
    const layout = read('src/app/layout.tsx')
    expect(layout).toMatch(/viewportFit:\s*'cover'/)
    expect(layout).toMatch(/width:\s*'device-width'/)
    expect(layout).toMatch(/initialScale:\s*1/)
  })
})

describe('safe-area insets', () => {
  const css = stripComments(read('src/styles/responsive.css'))

  it('declares the four inset tokens from env()', () => {
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(css).toMatch(new RegExp(`--safe-${side}:\\s*env\\(safe-area-inset-${side},\\s*0px\\)`))
    }
  })

  it('is imported by globals.css', () => {
    expect(read('src/app/globals.css')).toContain('@import "../styles/responsive.css"')
  })

  it('pads the body on the inline edges for landscape notches', () => {
    expect(css).toMatch(/body\s*\{[^}]*padding-left:\s*var\(--safe-left\)/)
    expect(css).toMatch(/body\s*\{[^}]*padding-right:\s*var\(--safe-right\)/)
  })

  it('lifts the WhatsApp float by the bottom inset in both of its positions', () => {
    expect(css).toMatch(
      /\.whatsapp-float\s*\{[^}]*bottom:\s*calc\(1\.25rem \+ var\(--safe-bottom\)\)/,
    )
    const miniCart = stripComments(read('src/styles/mini-cart.css'))
    expect(miniCart).toMatch(
      /body\.mobile-cart-bar-visible \.whatsapp-float\s*\{[^}]*env\(safe-area-inset-bottom/,
    )
  })

  /**
   * Every `position: fixed` rule in the stylesheets, found rather than listed,
   * so a new fixed element is caught the day it is written. Each one either
   * names a safe-area inset inside its own block or is exempt for a stated
   * reason.
   */
  it('every fixed rule in src/styles consumes an inset or is exempt with a reason', () => {
    const exempt: Record<string, string> = {
      '.cart-drawer-root':
        'inset: 0 backdrop; the sheet inside it (.cart-drawer) pads top and bottom',
    }
    const offenders: string[] = []
    for (const file of readdirSync(resolve(root, 'src/styles')).filter((f) => f.endsWith('.css'))) {
      const source = stripComments(read(`src/styles/${file}`))
      // Naive block split is enough: every fixed rule here is a flat
      // selector { declarations } with no nesting.
      for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = match[1]?.trim().split('\n').pop()?.trim() ?? ''
        const body = match[2] ?? ''
        if (!/position:\s*fixed/.test(body)) continue
        if (exempt[selector]) continue
        if (!/safe-area-inset/.test(body)) offenders.push(`${file} ${selector}`)
      }
    }
    expect(offenders, 'fixed rules without a safe-area inset').toEqual([])
    const miniCart = stripComments(read('src/styles/mini-cart.css'))
    expect(miniCart).toMatch(/\.cart-drawer\s*\{[^}]*padding:\s*env\(safe-area-inset-top/)
  })

  it('the fixed Tailwind components add the insets in their own markup', () => {
    // Bottom-anchored banners add the inset to their offset; full-height
    // drawers and the sticky header pad the edge they touch.
    expect(read('src/components/analytics/ConsentBanner.tsx')).toContain(
      "paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))'",
    )
    expect(read('src/components/pwa/InstallPrompt.tsx')).toContain(
      'var(--reserve-consent) + env(safe-area-inset-bottom, 0px)',
    )
    expect(read('src/components/layout/MobileDrawer.tsx')).toMatch(
      /className=\{`safe-pt safe-pb fixed inset-y-0/,
    )
    expect(read('src/components/layout/Header.tsx')).toMatch(/className="safe-pt sticky top-0/)
    expect(read('src/components/shared/WhatsAppFloat.tsx')).toContain(
      'whatsapp-float fixed bottom-5 end-5',
    )
    expect(css).toMatch(/\.safe-pt\s*\{[^}]*padding-top:\s*var\(--safe-top\)/)
    expect(css).toMatch(/\.safe-pb\s*\{[^}]*padding-bottom:\s*var\(--safe-bottom\)/)
  })
})

describe('tap area', () => {
  const css = stripComments(read('src/styles/responsive.css'))

  it('grows the hit box to the touch token on both axes and never shrinks a larger control', () => {
    const block = css.match(/\.tap-area::after\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(block).toContain('content: ""')
    expect(block).toContain('position: absolute')
    for (const axis of ['inset-block', 'inset-inline']) {
      expect(block).toMatch(
        new RegExp(
          `${axis}:\\s*min\\(0px,\\s*calc\\(\\(100% - var\\(--tap-size, var\\(--spacing-touch-min\\)\\)\\) / 2\\)\\)`,
        ),
      )
    }
    expect(css).toMatch(/\.tap-area--36\s*\{[^}]*--tap-size:\s*36px/)
  })

  it('sits in the components layer so a position utility on the host still wins', () => {
    // The overlay wishlist is `absolute`; an unlayered `position: relative`
    // would override the utility and drop the heart out of the image corner.
    expect(css).toMatch(/@layer components\s*\{[\s\S]*\.tap-area\s*\{\s*position:\s*relative;\s*\}/)
  })

  it('is on every control measured under 44px at 375', () => {
    // Measured hit areas on the production build, 2026-10-07, coarse pointer.
    const consumers: Record<string, RegExp> = {
      'src/components/layout/Header.tsx': /className="tap-area shrink-0"/, // logo link 100x26
      'src/components/cart/CartNavLink.tsx': /tap-area -m-1 flex/, // cart trigger 60x30
      'src/components/layout/TopBar.tsx': /tap-area flex h-topbar-row/, // sign-in 78x37
      'src/components/ProductCard.tsx': /tap-area flex h-full w-full/, // home add-to-cart 40x40
      'src/components/ProductDealCard.tsx': /tap-area flex h-full w-full/,
      'src/components/category/CategoryProductCard.tsx': /tap-area category-card__atc/, // 37x34
      'src/components/product/WishlistButton.tsx': /tap-area absolute start-2 top-2/, // overlay 36x36
      'src/components/shared/ShareButton.tsx': /tap-area tap-area--36 inline-flex/, // share row 20px, pitch 36
      'src/components/shared/WhatsAppShareButton.tsx': /tap-area tap-area--36 inline-flex/,
      'src/components/shared/FacebookShareButton.tsx': /tap-area tap-area--36 inline-flex/,
      'src/components/category/CategoryBreadcrumb.tsx': /tap-area inline-block py-1/, // crumb 60x32
      'src/components/cart/CartPageView.tsx': /tap-area inline-block py-1/,
      'src/app/(legal)/_components/LegalArticle.tsx': /tap-area hover:text-heading/, // crumb 20x21
    }
    for (const [file, pattern] of Object.entries(consumers)) {
      expect(read(file), file).toMatch(pattern)
    }
  })

  it('uses padding, not the pseudo-element, on the line-clamped card link', () => {
    // overflow: hidden (line-clamp) clips ::after, so the category link on the
    // compact card grows with py-1 and hands it back with -my-1.
    expect(read('src/components/ProductCard.tsx')).toMatch(
      /className="-my-1 block py-1 text-xs text-muted-2 hover:text-heading line-clamp-1"/,
    )
  })
})

describe('coarse pointer floors', () => {
  const css = stripComments(read('src/styles/responsive.css'))
  const block = css.match(/@media \(pointer: coarse\)\s*\{([\s\S]*)\}\s*$/)?.[1] ?? ''

  it('raises the replaced controls and stacked rows to the touch token on touch screens only', () => {
    for (const selector of [
      '.pdp-buy__qty', // 140x41 off live
      '.category-control-bar__select', // 174x34
      '.ke-newsletter__input', // 199x39
      '.ke-newsletter__button', // 84x39
      '.category-sidebar__summary', // 345x32
      '.search-facets__option', // 345x24, stacked 32 apart
      '.legal-toc__link', // 24 tall, stacked 28 apart
    ]) {
      expect(block, selector).toContain(selector)
    }
    expect(block).toMatch(/min-height:\s*var\(--spacing-touch-min\)/)
    // The token is the single 44 in the theme; no literal here.
    expect(block).not.toMatch(/44px/)
  })

  it('names a class the legal TOC links actually carry', () => {
    expect(read('src/app/(legal)/_components/LegalArticle.tsx')).toContain('legal-toc__link')
  })
})

describe('related products grid', () => {
  it('only fixes the five 230px columns from 1200, where they fit', () => {
    // 5 x 230 = 1150 in a container that is the viewport less 30px until it
    // caps at 1170: at 1024..1199 that overflowed the inline end by up to
    // 141px and the product page scrolled sideways (measured 2026-10-07).
    const css = stripComments(read('src/styles/product-page.css'))
    const at1024 = css.match(/@media \(min-width: 1024px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(at1024).toMatch(
      /\.pdp-related__grid\s*\{[^}]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/,
    )
    expect(at1024).not.toContain('230px')
    // The sheet has more than one 1200 query; the grid rule must be in one.
    const at1200 = [...css.matchAll(/@media \(min-width: 1200px\)\s*\{([\s\S]*?)\n\}/g)].map(
      (m) => m[1] ?? '',
    )
    expect(
      at1200.some((block) =>
        /\.pdp-related__grid\s*\{[^}]*grid-template-columns:\s*repeat\(5, 230px\)/.test(block),
      ),
    ).toBe(true)
  })
})
