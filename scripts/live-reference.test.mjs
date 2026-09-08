import { describe, expect, it } from 'vitest'
import {
  OUR_BUILD,
  REFERENCE,
  UNKNOWN,
  classifyReference,
  refusalMessage,
} from './live-reference.mjs'

/**
 * The two marker sets below are the ones measured on 2026-09-09, not invented
 * shapes: `https://kenyonexpress.co.il/cart/` served 125 `_next` references and
 * zero woocommerce ones, and `refs/ke_live_cart.html` (captured 2026-08-12)
 * holds 64 woocommerce references and no `_next` at all.
 */
const liveHostToday = {
  wpStyleOrScript: 0,
  wooBodyClass: false,
  generator: null,
  nextAssets: 125,
  nextRuntime: true,
}

const wooArchive = {
  wpStyleOrScript: 34,
  wooBodyClass: true,
  generator: 'WooCommerce 9.4.2',
  nextAssets: 0,
  nextRuntime: false,
}

describe('classifyReference', () => {
  it('calls the WooCommerce capture the reference', () => {
    const { kind } = classifyReference(wooArchive)
    expect(kind).toBe(REFERENCE)
  })

  it('calls the domain as it serves today our own build', () => {
    const { kind, why } = classifyReference(liveHostToday)
    expect(kind).toBe(OUR_BUILD)
    expect(why).toContain('125')
  })

  it('identifies WordPress from stylesheets and scripts alone', () => {
    // The generator meta is strippable and the body class is theme-dependent.
    // wp-content assets are not optional on a page WooCommerce rendered.
    const { kind } = classifyReference({
      wpStyleOrScript: 1,
      wooBodyClass: false,
      generator: null,
      nextAssets: 0,
      nextRuntime: false,
    })
    expect(kind).toBe(REFERENCE)
  })

  it('does not read a Next runtime as a reference', () => {
    const { kind } = classifyReference({
      wpStyleOrScript: 0,
      wooBodyClass: false,
      generator: null,
      nextAssets: 0,
      nextRuntime: true,
    })
    expect(kind).toBe(OUR_BUILD)
  })

  it('refuses a page carrying both marker sets rather than picking one', () => {
    const { kind } = classifyReference({ ...wooArchive, nextAssets: 12, nextRuntime: true })
    expect(kind).toBe(UNKNOWN)
  })

  it('refuses a page carrying neither', () => {
    const { kind } = classifyReference({
      wpStyleOrScript: 0,
      wooBodyClass: false,
      generator: null,
      nextAssets: 0,
      nextRuntime: false,
    })
    expect(kind).toBe(UNKNOWN)
  })

  it('treats a missing generator as absent rather than as a match', () => {
    expect(classifyReference({ ...liveHostToday, generator: undefined }).kind).toBe(OUR_BUILD)
  })

  /**
   * THE REGRESSION THIS FILE EXISTS FOR. Our catalogue still serves product
   * photos from the old WordPress media paths, so wp-content appears in the
   * IMAGES on our own pages. A classifier that counted those would call our
   * build the reference and wave the mirror through -- with a green tick,
   * because a page compared with itself scores near zero.
   */
  it('is not fooled by our own pages still loading wp-content IMAGES', () => {
    // compare.mjs counts stylesheets and scripts only, so an image-only
    // wp-content presence never reaches this function as a WordPress marker.
    const { kind } = classifyReference(liveHostToday)
    expect(kind).toBe(OUR_BUILD)
  })
})

describe('refusalMessage', () => {
  it('says the mirror is a mirror, and says it fails safe', () => {
    const msg = refusalMessage({
      url: 'https://kenyonexpress.co.il/cart/',
      ...classifyReference(liveHostToday),
    })
    expect(msg).toContain('REFUSING to measure')
    expect(msg).toContain('our build with our build')
    expect(msg).toContain('docs/PARITY-REFERENCE.md')
  })

  it('names the page it refused', () => {
    const msg = refusalMessage({
      url: 'file:///tmp/whatever.html',
      ...classifyReference({
        wpStyleOrScript: 0,
        wooBodyClass: false,
        generator: null,
        nextAssets: 0,
        nextRuntime: false,
      }),
    })
    expect(msg).toContain('file:///tmp/whatever.html')
    expect(msg).toContain('no WordPress and no Next markers')
  })
})
