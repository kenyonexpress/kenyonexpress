import { findCatalogueProblems } from '@/lib/catalogue/safety-rules'
import { collectionRule } from '@/lib/category-page'
import { agorot, agorotToIls } from '@/lib/commerce/money'
import { arrangeHomeDeals, hasThumbnail } from '@/lib/homepage/deals'
import { processImage } from '@/lib/images/process'
import { validateImageDimensions } from '@/lib/images/validate'
import { describe, expect, it } from 'vitest'
import {
  DEMO_CATEGORY_SLUGS,
  DEMO_PRODUCTS,
  DEMO_SUPPLIERS,
  UNDER_99_AGOROT,
  countsByCategory,
  demoCatalogIds,
  isDemoSlug,
  supplierOf,
} from './demo-catalog-data'
import { REDACTED, loadEnv } from './demo-catalog-env'
import {
  PLACEHOLDER_SIZE,
  createStagingSink,
  isR2Env,
  placeholderSvg,
  renderPlaceholder,
  storeImageSet,
  wrapTitle,
} from './demo-catalog-images'
import { selectRemovable, toIls, toProductRow, toSupplierRow } from './demo-catalog-rows'

/**
 * The demo catalogue (W04), proven without a database: composition, slugs,
 * money, the publish gate, the row shape the storefront reads, and the image
 * pipeline on one real render. The scripts themselves only move these rows.
 */

// Measured live on the hosted project on 2026-10-05 (anon read of
// `categories`): the eleven slugs in the brief all exist and are active.
const LIVE_CATEGORY_SLUGS = new Set<string>(DEMO_CATEGORY_SLUGS)

const NOW = new Date('2026-10-05T12:00:00.000Z')
const CATEGORY_ID = '00000000-0000-4000-8000-00000000c0de'

function rowFor(product: (typeof DEMO_PRODUCTS)[number]) {
  return toProductRow(product, {
    categoryId: CATEGORY_ID,
    imageUrl: `https://cdn.example.test/${product.imageKey}/w800.webp`,
    supplierLogoUrl: 'https://cdn.example.test/logo/w800.webp',
    now: NOW,
  })
}

describe('the demo catalogue composition', () => {
  it('is exactly 12 suppliers, 60 coupons and 12 physical products', () => {
    expect(DEMO_SUPPLIERS).toHaveLength(12)
    expect(DEMO_PRODUCTS.filter((p) => p.type === 'coupon')).toHaveLength(60)
    expect(DEMO_PRODUCTS.filter((p) => p.type === 'physical')).toHaveLength(12)
  })

  it('covers every one of the eleven live categories and no other', () => {
    const counts = countsByCategory()
    for (const slug of DEMO_CATEGORY_SLUGS) {
      expect(counts[slug].coupons + counts[slug].physical, slug).toBeGreaterThan(0)
    }
    for (const p of DEMO_PRODUCTS)
      expect(LIVE_CATEGORY_SLUGS.has(p.categorySlug), p.slug).toBe(true)
  })

  it('prefixes every slug with demo-, keeps them URL-safe ASCII and unique', () => {
    const slugs = DEMO_PRODUCTS.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(isDemoSlug(slug), slug).toBe(true)
      expect(slug).toMatch(/^demo-[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
  })

  it('lives in its own de30de30 namespace with unique ids', () => {
    const ids = [...demoCatalogIds().suppliers, ...demoCatalogIds().products]
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^de30de30-0000-4000-8000-[12][0-9]{11}$/)
  })

  it('points every product at one of the twelve demo suppliers', () => {
    const suppliers = new Set(demoCatalogIds().suppliers)
    for (const p of DEMO_PRODUCTS) expect(suppliers.has(p.supplierId), p.slug).toBe(true)
  })

  it('writes two-sentence Hebrew descriptions', () => {
    for (const p of DEMO_PRODUCTS) {
      const sentences = p.descriptionHe.split(/(?<=\.)\s+/)
      expect(sentences, p.slug).toHaveLength(2)
      expect(p.descriptionHe.endsWith('.'), p.slug).toBe(true)
      expect(p.descriptionHe).toMatch(/[֐-׿]/)
      expect(p.nameHe).toMatch(/[֐-׿]/)
    }
  })

  it('keeps every price an integer number of agorot below its reference price', () => {
    for (const p of DEMO_PRODUCTS) {
      expect(Number.isInteger(p.priceAgorot), p.slug).toBe(true)
      expect(Number.isInteger(p.originalPriceAgorot), p.slug).toBe(true)
      expect(p.priceAgorot, p.slug).toBeGreaterThan(0)
      expect(p.originalPriceAgorot, p.slug).toBeGreaterThan(p.priceAgorot)
    }
  })

  it('prices every under-99 row under the collection rule it is filed in', () => {
    const rule = collectionRule('under-99')
    expect(rule).toEqual({ kind: 'price_max', maxIls: 99 })
    const rows = DEMO_PRODUCTS.filter((p) => p.categorySlug === 'under-99')
    expect(rows.length).toBeGreaterThan(0)
    for (const p of rows) expect(p.priceAgorot, p.slug).toBeLessThanOrEqual(UNDER_99_AGOROT)
  })

  it('features exactly the hot-deals rows, which the featured rule reads', () => {
    expect(collectionRule('hot-deals')).toEqual({ kind: 'featured' })
    for (const p of DEMO_PRODUCTS) expect(p.featured, p.slug).toBe(p.categorySlug === 'hot-deals')
  })

  it('gives coupons an offer deadline and voucher validity, and physical rows stock', () => {
    for (const p of DEMO_PRODUCTS) {
      if (p.type === 'coupon') {
        expect(p.offerValidDays, p.slug).toBeGreaterThan(0)
        expect(p.couponExpiryDays, p.slug).toBe(90)
        expect(p.stockQuantity, p.slug).toBeNull()
      } else {
        expect(p.offerValidDays, p.slug).toBeNull()
        expect(p.couponExpiryDays, p.slug).toBeNull()
        expect(p.stockQuantity, p.slug).toBeGreaterThan(0)
      }
    }
  })

  it('gives every supplier the four details the publish gate demands, plus a city', () => {
    for (const s of DEMO_SUPPLIERS) {
      expect(s.name.length).toBeGreaterThan(2)
      expect(s.contactPhone).toMatch(/^0\d-\d{7}$/)
      expect(s.address.length).toBeGreaterThan(3)
      expect(s.city.length).toBeGreaterThan(2)
      expect(s.businessId).toMatch(/^\d{9}$/)
      expect(s.logoKey.startsWith('demo-catalog/suppliers/')).toBe(true)
    }
  })

  it('is flagged by the catalogue safety rules as template rows, by design', () => {
    // `demo` is a template marker. These rows are for a disposable database,
    // and the gate is what keeps them out of production's snapshot.
    const findings = findCatalogueProblems(
      DEMO_PRODUCTS.map((p) => ({
        id: p.id,
        slug: p.slug,
        name_he: p.nameHe,
        type: p.type,
        kenyon_price: String(toIls(p.priceAgorot)),
        full_price: String(toIls(p.originalPriceAgorot)),
        coupon_price_ils: p.type === 'coupon' ? String(toIls(p.priceAgorot)) : null,
        stock_quantity: p.stockQuantity,
        platform_percent: String(p.platformPercent),
        supplier_id: p.supplierId,
        category_slug: p.categorySlug,
        first_image: `/${p.imageKey}/w800.webp`,
      })),
      () => true,
    )
    const templateSlugs = findings.filter((f) => f.rule === 'template-slug')
    expect(templateSlugs).toHaveLength(DEMO_PRODUCTS.length)
    // And nothing else: no unsafe slug, no duplicate name, no price that
    // contradicts its own text, no missing platform percent.
    expect(findings.filter((f) => f.rule !== 'template-slug')).toEqual([])
  })
})

describe('the rows the seed writes', () => {
  it('builds all 72 through the money module and the publish gate', () => {
    for (const p of DEMO_PRODUCTS) expect(() => rowFor(p), p.slug).not.toThrow()
  })

  it('converts agorot to the shekel columns exactly once and exactly', () => {
    expect(toIls(10900)).toBe(109)
    expect(toIls(9900)).toBe(99)
    expect(toIls(12345)).toBe(123.45)
    expect(() => toIls(1.5)).toThrow(RangeError)
    for (const p of DEMO_PRODUCTS) {
      const row = rowFor(p)
      expect(row.kenyon_price, p.slug).toBe(agorotToIls(agorot(p.priceAgorot)))
      expect(row.full_price, p.slug).toBe(agorotToIls(agorot(p.originalPriceAgorot)))
    }
  })

  it('writes a coupon the way the card, the cart and the product page read one', () => {
    const coupon = DEMO_PRODUCTS.find((p) => p.type === 'coupon')
    if (!coupon) throw new Error('no coupon in the set')
    const row = rowFor(coupon)
    const paid = toIls(coupon.priceAgorot)
    const face = toIls(coupon.originalPriceAgorot)
    expect(row.kenyon_price).toBe(paid)
    expect(row.coupon_price_ils).toBe(paid)
    expect(row.price_ils).toBe(face)
    expect(row.full_price).toBe(face)
    expect(row.is_coupon_enabled).toBe(true)
    expect(row.requires_shipping).toBe(false)
    expect(row.commission_type).toBe('coupon_absolute')
    expect(row.coupon_expiry_days).toBe(90)
    expect(row.offer_valid_until).toBe(
      new Date(NOW.getTime() + (coupon.offerValidDays ?? 0) * 86_400_000).toISOString(),
    )
    expect(row.discount_percent).toBe(Math.round((1 - paid / face) * 10000) / 100)
    expect(row.redemption_instructions_he).toContain(supplierOf(coupon).city)
  })

  it('writes a physical row with the sticker as the charge and the reference struck through', () => {
    const physical = DEMO_PRODUCTS.find((p) => p.type === 'physical')
    if (!physical) throw new Error('no physical in the set')
    const row = rowFor(physical)
    expect(row.price_ils).toBe(row.kenyon_price)
    expect(row.coupon_price_ils).toBeNull()
    expect(row.is_coupon_enabled).toBe(false)
    expect(row.requires_shipping).toBe(true)
    expect(row.commission_type).toBe('physical_percent')
    expect(row.stock_quantity).toBe(physical.stockQuantity)
    expect(row.offer_valid_until).toBeNull()
  })

  it('sets the split pair to 100, a per-product platform percent and no float', () => {
    for (const p of DEMO_PRODUCTS) {
      const row = rowFor(p)
      expect(row.platform_percent, p.slug).toBe(p.platformPercent)
      expect((row.platform_percent ?? 0) + (row.supplier_split_percent ?? 0), p.slug).toBe(100)
      expect(row.commission_percent, p.slug).toBe(p.platformPercent)
      for (const column of [
        'kenyon_price',
        'full_price',
        'price_ils',
        'coupon_price_ils',
      ] as const) {
        const value = row[column]
        if (value != null) expect(Number.isInteger(value * 100), `${p.slug}.${column}`).toBe(true)
      }
    }
  })

  it('is active, approved and published, with the supplier city and one image', () => {
    for (const p of DEMO_PRODUCTS) {
      const row = rowFor(p)
      expect(row.status, p.slug).toBe('active')
      expect(row.approval_status, p.slug).toBe('approved')
      expect(row.published_at, p.slug).toBe(NOW.toISOString())
      expect(row.city, p.slug).toBe(supplierOf(p).city)
      expect(row.category_id).toBe(CATEGORY_ID)
      expect(hasThumbnail(row.images), p.slug).toBe(true)
      expect(row.tags).toEqual(['demo'])
    }
  })

  it('renders through the home deals arrangement with every row keeping its picture', () => {
    const rows = DEMO_PRODUCTS.map((p) => {
      const row = rowFor(p)
      return {
        id: p.id,
        slug: p.slug,
        name_he: p.nameHe,
        kenyon_price: row.kenyon_price ?? null,
        full_price: row.full_price ?? null,
        images: row.images,
        stock_quantity: row.stock_quantity ?? null,
        created_at: NOW.toISOString(),
        city: row.city ?? null,
        categories: { name_he: p.categorySlug, slug: p.categorySlug },
        suppliers: { city: supplierOf(p).city },
      }
    })
    const deals = arrangeHomeDeals(rows, rows.length)
    expect(deals).toHaveLength(DEMO_PRODUCTS.length)
    for (const deal of deals) expect(deal.city).not.toBeNull()
  })

  it('builds a complete supplier row', () => {
    const row = toSupplierRow(
      DEMO_SUPPLIERS[0] as (typeof DEMO_SUPPLIERS)[number],
      'https://cdn.example.test/logo.webp',
    )
    expect(row.status).toBe('active')
    expect(row.logo_url).toBe('https://cdn.example.test/logo.webp')
    expect(row.city).toBeTruthy()
    expect(row.address).toBeTruthy()
    expect(row.contact_phone).toBeTruthy()
  })
})

describe('removal selects only demo- slugs', () => {
  it('keeps ordered products, refuses non-demo rows, removes the rest', () => {
    const products = [
      { id: 'a', slug: 'demo-one' },
      { id: 'b', slug: 'demo-two' },
      { id: 'c', slug: 'real-thing' },
    ]
    const { remove, keptForOrders, refusedNotDemo } = selectRemovable(products, new Set(['b']))
    expect(remove.map((p) => p.slug)).toEqual(['demo-one'])
    expect(keptForOrders.map((p) => p.slug)).toEqual(['demo-two'])
    expect(refusedNotDemo.map((p) => p.slug)).toEqual(['real-thing'])
  })

  it('does not treat a slug that merely contains demo as removable', () => {
    expect(isDemoSlug('demo-x')).toBe(true)
    expect(isDemoSlug('my-demo-x')).toBe(false)
    expect(isDemoSlug('demonstration')).toBe(false)
  })
})

describe('the environment loader', () => {
  it('drops redaction placeholders and does not read a missing file', () => {
    const env = loadEnv({ A: REDACTED, B: 'real', C: '' }, '/nonexistent/.env.local')
    expect(env.A).toBeUndefined()
    expect(env.B).toBe('real')
    expect(env.C).toBeUndefined()
  })

  it('does not pick R2 on placeholder names', () => {
    expect(
      isR2Env({
        R2_ACCOUNT_ID: 'x',
        R2_ACCESS_KEY_ID: 'y',
        R2_SECRET_ACCESS_KEY: 'z',
        R2_BUCKET: 'b',
        R2_PUBLIC_BASE_URL: 'https://cdn.example.test',
      }),
    ).toBe(true)
    expect(isR2Env({ R2_ACCOUNT_ID: 'x' })).toBe(false)
    expect(isR2Env(loadEnv({ R2_ACCOUNT_ID: REDACTED }, '/nonexistent'))).toBe(false)
  })
})

describe('the placeholder image', () => {
  it('wraps a long Hebrew title into at most three lines', () => {
    expect(wrapTitle('עיסוי שוודי 60 דקות')).toEqual(['עיסוי שוודי 60 דקות'])
    const lines = wrapTitle('שני לילות באילת בחצי פנסיון עם ארוחות בוקר וערב במסעדת המלון')
    expect(lines.length).toBeLessThanOrEqual(3)
    expect(lines[lines.length - 1]?.endsWith('…')).toBe(true)
  })

  it('escapes markup in the title and marks the image as a demo', () => {
    const svg = placeholderSvg({ title: 'a < b & c', caption: 'x', hue: 10 })
    expect(svg).toContain('a &lt; b &amp; c')
    expect(svg).toContain('דמו')
    expect(svg).toContain('direction="rtl"')
  })

  it('renders 800x800 and comes out of the application pipeline as webp 800, webp 400 and avif 800', async () => {
    const png = await renderPlaceholder({
      title: 'עיסוי שוודי 60 דקות',
      caption: 'ספא נווה מדבר · הרצליה',
      hue: 328,
    })
    const processed = await processImage(png)
    expect(processed.width).toBe(PLACEHOLDER_SIZE)
    expect(processed.height).toBe(PLACEHOLDER_SIZE)
    expect(validateImageDimensions(processed.width, processed.height)).toBeNull()
    const shapes = processed.renditions.map((r) => `${r.format}@${r.width}x${r.height}`)
    expect(shapes).toEqual(['webp@800x800', 'webp@400x400', 'avif@800x800'])
    for (const r of processed.renditions) expect(r.buffer.byteLength).toBeGreaterThan(500)
  }, 60_000)

  it('stores the set under the admin upload action key shape and reports the main webp', async () => {
    const written: string[] = []
    const sink = {
      name: 'staging' as const,
      bucket: null,
      put: async (key: string) => {
        written.push(key)
        return `staging://${key}`
      },
    }
    const png = await renderPlaceholder({ title: 'בדיקה', caption: 'x', hue: 1 })
    const set = await storeImageSet(sink, 'demo-catalog/products/demo-x', await processImage(png))
    expect(written).toEqual([
      'demo-catalog/products/demo-x/w800.webp',
      'demo-catalog/products/demo-x/w400.webp',
      'demo-catalog/products/demo-x/w800.avif',
    ])
    expect(set.mainUrl).toBe('staging://demo-catalog/products/demo-x/w800.webp')
    expect(set.avif).toEqual([{ w: 800, url: 'staging://demo-catalog/products/demo-x/w800.avif' }])
    expect(set.blurDataURL.startsWith('data:image/webp;base64,')).toBe(true)
    expect(createStagingSink().name).toBe('staging')
  }, 60_000)
})
