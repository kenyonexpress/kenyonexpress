import { describe, expect, it } from 'vitest'
import { DEFAULT_SLUG, DEFAULT_URL, parseCaptureArgs } from './capture-electro-args.mjs'

describe('parseCaptureArgs', () => {
  it('defaults to the Electro home page with no seed', () => {
    expect(parseCaptureArgs([])).toEqual({
      url: DEFAULT_URL,
      slug: DEFAULT_SLUG,
      addToCart: null,
      seedUrl: null,
    })
  })

  it('takes url and slug positionally', () => {
    const parsed = parseCaptureArgs(['https://electro.madrasthemes.com/cart/', 'electro_cart'])
    expect(parsed.url).toBe('https://electro.madrasthemes.com/cart/')
    expect(parsed.slug).toBe('electro_cart')
    expect(parsed.seedUrl).toBeNull()
  })

  it('builds the WooCommerce add-to-cart GET on the target origin', () => {
    const parsed = parseCaptureArgs([
      'https://electro.madrasthemes.com/checkout/',
      'electro_checkout',
      '--add-to-cart=2439',
    ])
    expect(parsed.addToCart).toBe('2439')
    expect(parsed.seedUrl).toBe('https://electro.madrasthemes.com/?add-to-cart=2439&quantity=1')
  })

  it('accepts the option before the positionals', () => {
    const parsed = parseCaptureArgs(['--add-to-cart=7', 'https://x.test/cart/', 'x_cart'])
    expect(parsed.slug).toBe('x_cart')
    expect(parsed.seedUrl).toBe('https://x.test/?add-to-cart=7&quantity=1')
  })

  it('refuses a non-numeric product id instead of seeding an empty cart', () => {
    expect(() => parseCaptureArgs(['https://x.test/cart/', 'c', '--add-to-cart=abc'])).toThrow(
      /numeric product id/,
    )
    expect(() => parseCaptureArgs(['https://x.test/cart/', 'c', '--add-to-cart='])).toThrow(
      /numeric product id/,
    )
  })

  it('refuses unknown options and slugs that would escape refs/', () => {
    expect(() => parseCaptureArgs(['https://x.test/', 'c', '--seed=1'])).toThrow(/unknown option/)
    expect(() => parseCaptureArgs(['https://x.test/', '../etc'])).toThrow(/slug/)
  })
})
