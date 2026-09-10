import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type CatalogueProduct,
  claimedPrice,
  findCatalogueProblems,
  findingKey,
  normalizeName,
} from './safety-rules'

/**
 * The live catalogue, gated the way the RLS manifest is gated: a MEASUREMENT
 * committed to the repo, plus the rules it has to satisfy, because CI has no
 * database and production is the only honest source.
 *
 * WHAT THIS REPLACED. `scripts/audit-data-integrity.mjs` prints counts and a
 * few sample rows, has no pass or fail, is wired into nothing, and reads
 * `.env.local`, whose service key is not this project's. It could not have
 * caught any of the 25 findings below and it never claimed to.
 *
 * WHY THE FLOOR IS 25 AND NOT 0. Every one of those findings is real and none
 * of them is this repo's to fix. Which of two duplicate `טיפול פנים` rows is
 * the real one, and whether a massage costs 9 or the 108 its own slug
 * advertises, are the operator's decisions. A gate that demanded zero would
 * have been red the day it was written, and a gate that is red on arrival gets
 * deleted rather than fixed.
 *
 * So the ledger is the floor. A NEW finding fails. A ledger entry that stops
 * firing ALSO fails, so the list cannot keep names of things already fixed and
 * quietly stop meaning anything.
 */
const SNAPSHOT = resolve(process.cwd(), 'supabase/catalogue-snapshot.json')
const LEDGER = resolve(process.cwd(), 'supabase/catalogue-known-issues.json')

type Snapshot = {
  $measured_at: string
  $project_ref: string
  $predicate: string
  products: CatalogueProduct[]
}
type Ledger = { $measured_at: string; known: Record<string, { product: string; detail: string }> }

const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Snapshot
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger
/**
 * The disk half of the image rule. `public/` is the only place a `/images/...`
 * path can resolve from, and this is the check that would have caught 13 active
 * products pointing at files that were not in the repository and answered 404 in
 * production - measured 2026-09-10, twelve of them recoverable from a staging
 * directory an earlier session had left untracked.
 */
const imageExists = (publicPath: string) =>
  existsSync(resolve(process.cwd(), 'public', publicPath.replace(/^\//, '')))

const findings = findCatalogueProblems(snapshot.products, imageExists)
const found = new Set(findings.map(findingKey))
const known = new Set(Object.keys(ledger.known))

describe('the measured catalogue', () => {
  it('describes production, and says when it was taken', () => {
    expect(snapshot.$project_ref).toBe('ixvwfbuvfxxsjiywhbbb')
    expect(snapshot.$predicate).toBe("status = 'active' AND deleted_at IS NULL")
    expect(snapshot.$measured_at).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('is not empty or truncated', () => {
    // 44 active products on 2026-09-09. The floor stops a botched paste from
    // passing by having nothing left to check.
    expect(snapshot.products.length).toBeGreaterThanOrEqual(40)
  })

  it('names each product and each slug once', () => {
    const ids = snapshot.products.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    const slugs = snapshot.products.map((p) => p.slug)
    expect(new Set(slugs).size, 'two live products share a slug, so one is unreachable').toBe(
      slugs.length,
    )
  })
})

describe('catalogue safety', () => {
  it('has no finding that is not on the ledger', () => {
    const unlisted = findings.filter((f) => !known.has(findingKey(f)))
    expect(
      unlisted.map((f) => `${findingKey(f)} -- ${f.detail}`),
      'a new catalogue defect reached production; fix the row, or add it to catalogue-known-issues.json with the reason',
    ).toEqual([])
  })

  it('keeps no ledger entry that has stopped firing', () => {
    // The other direction, and the one that keeps the number honest. Without
    // it the ledger becomes a list of things somebody fixed in March and the
    // count stops describing anything.
    const stale = [...known].filter((key) => !found.has(key))
    expect(
      stale,
      'these are recorded as known defects but no longer fire; delete them from catalogue-known-issues.json',
    ).toEqual([])
  })

  it('has every commission set, which is the one rule with no exceptions', () => {
    // platform_percent has no default anywhere in this project, so a null is a
    // product that cannot be split at settlement. Zero in production on
    // 2026-09-09, and this is what keeps it there.
    const missing = findings.filter((f) => f.rule === 'missing-platform-percent')
    expect(missing.map((f) => f.detail)).toEqual([])
  })
})

describe('the rules themselves', () => {
  // A gate is only worth the confidence that it fires, so each rule is proven
  // on a row built to break it rather than only on the snapshot.
  const base: CatalogueProduct = {
    id: 'x',
    name_he: 'מוצר תקין',
    slug: 'מוצר-תקין',
    type: 'physical',
    kenyon_price: '100.00',
    full_price: null,
    coupon_price_ils: null,
    stock_quantity: 10,
    platform_percent: '30.00',
    supplier_id: 's1',
    category_slug: 'hot-deals',
  }
  const rulesFor = (p: Partial<CatalogueProduct>) =>
    findCatalogueProblems([{ ...base, ...p }]).map((f) => f.rule)

  it('passes a clean row', () => {
    expect(rulesFor({})).toEqual([])
  })

  it('catches a template name and a template slug separately', () => {
    expect(rulesFor({ name_he: 'צימר מאסטר' })).toContain('template-name')
    expect(rulesFor({ slug: 'צימר-מאסטר-copy' })).toContain('template-slug')
  })

  it('catches a shekel sign in a slug', () => {
    expect(rulesFor({ slug: 'עיסוי-108₪' })).toContain('unsafe-slug')
  })

  it('catches a slug that is a bare import id', () => {
    expect(rulesFor({ slug: '6253' })).toContain('opaque-slug')
  })

  it('catches a missing commission', () => {
    expect(rulesFor({ platform_percent: null })).toContain('missing-platform-percent')
  })

  it('catches a price the text contradicts', () => {
    expect(rulesFor({ slug: 'עיסוי-רק-108', kenyon_price: '9.00' })).toContain(
      'price-contradicts-text',
    )
  })

  it('does not read a duration or a model number as a price claim', () => {
    // `45-דקות` and `series-7` live in real slugs. Only a number introduced by
    // רק ("only") is a price claim.
    expect(claimedPrice('עיסוי-מפנק-45-דקות')).toBeNull()
    expect(claimedPrice('apple-watch-series-7')).toBeNull()
    expect(claimedPrice('עיסוי-רק-ב108')).toBe(108)
  })

  it('reports both halves of a duplicate, not just the second', () => {
    // Naming only one of them would make the operator guess which row the gate
    // meant, and the whole difficulty of a duplicate is telling them apart.
    const dup = findCatalogueProblems([
      { ...base, id: 'a', slug: 'a' },
      { ...base, id: 'b', slug: 'b' },
    ]).filter((f) => f.rule === 'duplicate-name')
    expect(dup.map((f) => f.productId).sort()).toEqual(['a', 'b'])
  })

  it('matches names that differ only by punctuation or spacing', () => {
    expect(normalizeName('! צימר מאסטר')).toBe(normalizeName('צימר   מאסטר'))
  })
})
