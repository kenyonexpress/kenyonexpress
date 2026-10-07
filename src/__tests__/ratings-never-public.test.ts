import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ADMIN_SECTIONS } from '@/lib/admin/nav'
import { describe, expect, it } from 'vitest'

/**
 * RATINGS ARE COLLECTED FROM BUYERS AND READ BY THE OWNER. NOTHING ELSE.
 *
 * STEP 45 closes the rating model the way 232 closed review content: a buyer
 * scores the order (247) or a product (154) after the sale, the owner reads
 * the scores in /admin/reviews and on the dashboard, and no visitor sees a
 * score, a count or an average anywhere. The rule is cheap to break by
 * accident -- one `rating` prop, one JSON-LD field, one SECURITY DEFINER
 * function -- and each of those existed before this file did. This test pins
 * the code half; the SQL half is pinned on the amended 235 and on 247's own
 * self-check.
 */

const ROOT = process.cwd()

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8')
}

function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(resolve(ROOT, dir))) {
    const rel = join(dir, name)
    if (statSync(resolve(ROOT, rel)).isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel)
  }
  return out
}

/** Every module a visitor's request can render or run. */
const STOREFRONT_DIRS = [
  'src/app/(store)',
  'src/app/(account)',
  'src/components/storefront',
  'src/components/product',
  'src/components/home',
  'src/components/layout',
  'src/lib/seo',
]

/** The only modules allowed to read the two rating tables. */
const ALLOWED_TABLE_READERS = new Set([
  // the buyer's own writes and own-row reads, on the user client
  'src/server/actions/reviews.ts',
  'src/server/actions/order-feedback.ts',
  'src/server/queries/order-feedback.ts',
  // the owner's reads, on the service role, behind requireSection
  'src/server/queries/ratings-admin.ts',
  'src/server/actions/admin/reviews.ts',
  // the customer's own data export (own rows by policy)
  'src/app/api/account/export/route.ts',
])

describe('no rating reaches a visitor', () => {
  it('no storefront module asks the database for a rating or a review', () => {
    const offenders: string[] = []
    for (const dir of STOREFRONT_DIRS) {
      for (const file of walk(dir)) {
        const code = stripComments(read(file))
        if (/product_rating_summary|from\(\s*['"](reviews|order_feedback)['"]/.test(code)) {
          offenders.push(file)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('the rating tables are read only where the policy or the gate makes it safe', () => {
    const offenders: string[] = []
    for (const file of walk('src')) {
      if (ALLOWED_TABLE_READERS.has(file)) continue
      const code = stripComments(read(file))
      if (/from\(\s*['"](reviews|order_feedback)['"]/.test(code)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('product JSON-LD builds no AggregateRating and takes no rating input', () => {
    const code = stripComments(read('src/lib/seo/json-ld.ts'))
    expect(code).not.toMatch(/aggregateRating\s*[:=]/)
    expect(code).not.toMatch(/AggregateRating/)
    expect(code).not.toMatch(/^\s*rating\??:/m)
  })

  it('the product page passes no rating and the detail loader reads none', () => {
    const page = stripComments(read('src/app/(store)/product/[slug]/page.tsx'))
    expect(page).not.toMatch(/\brating\b/)
    const detail = stripComments(read('src/lib/product-detail.ts'))
    expect(detail).not.toMatch(/loadRatingSummary|product_rating_summary|RatingSummary/)
    const info = stripComments(read('src/components/storefront/ProductInfo.tsx'))
    expect(info).not.toMatch(/RatingStars|\brating\b/)
  })

  it('the star row is a tombstone', () => {
    const code = stripComments(read('src/components/storefront/RatingStars.tsx'))
    expect(code.match(/export/g)).toEqual(['export'])
    expect(code).toMatch(/export \{\}/)
  })

  it('the rating-summary RPC is dropped by 235, not created, and anon gets nothing', () => {
    const sql = read('migrations/pending/235_product_live_and_rating.sql').replace(
      /^\s*--.*$/gm,
      '',
    )
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.product_rating_summary/)
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.product_rating_summary\(uuid\);/)
    expect(sql).toMatch(/to_regprocedure\('public\.product_rating_summary\(uuid\)'\) IS NOT NULL/)
    expect(sql).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/)
    // The live-channel half is untouched.
    expect(sql).toMatch(/CREATE TRIGGER products_broadcast_live/)
  })
})

describe('the owner reads them where only the owner can', () => {
  it('the admin page and the dashboard read through the service role behind a section gate', () => {
    for (const file of [
      'src/app/(admin)/admin/reviews/page.tsx',
      'src/app/(admin)/admin/dashboard/page.tsx',
    ]) {
      const code = stripComments(read(file))
      expect(code, file).toMatch(/requireSection\(/)
      expect(code, file).toMatch(/createAdminClient\(\)/)
    }
    const page = read('src/app/(admin)/admin/reviews/page.tsx')
    expect(page).toContain('לא מוצג באתר')
  })

  it('the ratings query module is the admin-only reader and says so', () => {
    const code = stripComments(read('src/server/queries/ratings-admin.ts'))
    expect(code).toMatch(/from\('order_feedback' as never\)/)
    expect(code).toMatch(/from\('reviews' as never\)/)
    expect(code).not.toMatch(/createClient\(|createPublicClient|createCatalogueReadClient/)
    expect(code).not.toMatch(/'use server'|'use client'/)
  })

  it('/admin/reviews is an admin-only section in the navigation model', () => {
    const section = ADMIN_SECTIONS.find((s) => s.href === '/admin/reviews')
    expect(section).toBeDefined()
    expect(section?.staffAllowed).toBe(false)
  })
})

describe('the ask comes after delivery', () => {
  it('the delivered mail links the private feedback anchor, and the order page carries it', () => {
    const mail = stripComments(read('src/lib/email/notifications.ts'))
    expect(mail).toMatch(/#rating/)
    const page = read('src/app/(account)/account/orders/[id]/page.tsx')
    expect(page).toContain('data-section="order-feedback" id="rating"')
  })
})
