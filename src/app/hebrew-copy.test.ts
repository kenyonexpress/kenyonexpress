import { describe, expect, it } from 'vitest'
import { copyFiles, formatLatinCopy, scanLatinCopy } from '../../scripts/latin-copy-scan.mjs'

/**
 * EVERY STRING A CUSTOMER READS IS HEBREW.
 *
 * The rule and its allowlists live in `scripts/latin-copy-scan.mjs`, which
 * `pnpm lint` also runs through `scripts/copy-gate.mjs`. This is the half that
 * fails `pnpm test`.
 *
 * WHAT IT CAUGHT WHEN IT WAS WRITTEN. Seven sentences of Electro demo copy above
 * the fold on the homepage -- "SHOP THE HOTTEST PRODUCTS", "CATCH BIG DEALS ON
 * THE CONSOLES", "LAPTOPS NOTEBOOKS AND MORE", "SIMPLY THE BEST", "THE NEW
 * STANDARD", "PREMIUM PRODUCT", three "Shop now" buttons -- plus "Recommended
 * Products" on /products. Two of them advertised games consoles and laptops,
 * which this store does not sell at all.
 *
 * Nothing was looking for them, and the pixel comparison actively argued FOR
 * them: the live site runs the same theme and shows the same English, so an
 * English homepage scored better against the reference than a Hebrew one.
 */
describe('the storefront speaks Hebrew', () => {
  it('renders no Latin-script marketing sentence', () => {
    const offenders = scanLatinCopy()
    expect(
      offenders,
      `Latin-script strings a customer would read:\n${formatLatinCopy(offenders)}`,
    ).toEqual([])
  })

  it('actually scans the components the homepage is built from', () => {
    // A guard on the guard. The assertion above passes trivially if the walk
    // stops finding files, which is how a scanner quietly stops being one.
    const files = copyFiles()
    expect(files).toContain('src/components/home/HeroPromoBanners.tsx')
    expect(files).toContain('src/lib/hero-singlefile-data.ts')
    expect(files).toContain('src/components/LeftSidebar.tsx')
    expect(files.length).toBeGreaterThan(200)
  })

  it('allows a single Latin word inside Hebrew, which is ordinary here', () => {
    // "לקניון Express" and "הזן כתובת Email" are how Israeli commerce writes,
    // and both are in files this scan covers. The rule is about SENTENCES; one
    // that banned every Latin character would have to ban the company's name.
    expect(scanLatinCopy(['src/lib/hero-singlefile-data.ts'])).toEqual([])
    expect(scanLatinCopy(['src/components/layout/SiteFooter.tsx'])).toEqual([])
  })
})
