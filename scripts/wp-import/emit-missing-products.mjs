#!/usr/bin/env node
/**
 * Emits idempotent SQL for the WordPress products that production does NOT
 * already have.
 *
 * WHY THIS EXISTS INSTEAD OF `run.mjs project --apply`
 *
 * The pipeline's projection stage cannot be pointed at this database, for two
 * independent reasons measured on 2026-08-07:
 *
 *   1. It needs a service_role key to write. The key in .env.local answers
 *      401 "Invalid API key" to every request. There is no working key on this
 *      machine, so `--apply` cannot run at all.
 *
 *   2. More importantly, it would write numbers nobody chose.
 *      `04-project-public.mjs` sets `platform_percent: DEFAULTS.platformPercent`
 *      (10), `commission_percent` (15) and `couponExpiryDays` (365), and hangs
 *      every row off an auto-created "Kenyon Express (legacy WP)" supplier with
 *      no phone, address or logo. A fixed platform percent is the one thing
 *      this codebase forbids outright - there is no default commission
 *      anywhere, per CONTRADICTIONS C1 and ADMIN-ARCHITECTURE section 0 - and
 *      an incomplete supplier cannot pass the publish gate anyway.
 *
 * So this script writes what the export actually contains and NOTHING it does
 * not: real title, real price, real images, real category. Every row lands as
 * `status = 'draft'` with `platform_percent` NULL and no supplier, which is
 * precisely the state `assertPublishable` refuses to activate. An admin sets
 * the commission and the supplier per product, and only then can it go live.
 * That is the intended workflow, not a limitation of this script.
 *
 *   node scripts/wp-import/emit-missing-products.mjs > out.sql
 *
 * It writes SQL to stdout and touches no database itself.
 */

import { readFileSync } from 'node:fs'

const products = JSON.parse(readFileSync('wp_import/normalized/products.json', 'utf8'))
const categories = JSON.parse(readFileSync('wp_import/normalized/categories.json', 'utf8'))
const media = JSON.parse(readFileSync('wp_import/normalized/media.json', 'utf8'))

/**
 * WordPress product category slug -> the category slug production already uses.
 *
 * Production migrated its categories to English slugs before this export was
 * taken, so the two sides agree on the Hebrew NAME and disagree on the slug.
 * Mapped by name, by hand, once, and listed here so the pairing is reviewable
 * rather than inferred by a fuzzy match at runtime. The 17 blog taxonomy terms
 * in the export (Aside, Design, Podcasts, ...) are deliberately absent: they
 * are not product categories and must not become any.
 */
const CATEGORY_SLUG_MAP = {
  'מסעדות-ובתי-קפה': 'restaurants-cafes',
  'יופי-בריאות-וטיפוח': 'beauty-health',
  'טלפונים-מחשבים-ואביזרים': 'phones-computers',
  'תינוקות-וילדים': 'baby-kids',
  'צימרים-מלונות-ונופש': 'vacation',
  'ציוד-ומזון-לבעלי-חיים': 'pets',
  'בעלי-מקצוע': 'professionals',
  'קורסים-express': 'courses',
  'hot-deals': 'hot-deals',
  'עד-99': 'under-99',
}

/** Slugs production already has. Passed in so this file states no stale list. */
const EXISTING = new Set(JSON.parse(readFileSync(process.argv[2], 'utf8')))

const termById = new Map(categories.map((c) => [c.wp_term_id, c.slug_decoded]))
const mediaById = new Map(media.map((m) => [m.wp_attachment_id, m.source_url]))

/**
 * WordPress descriptions are HTML. `products.description_he` is not.
 *
 * The product page renders it as TEXT - `<p>{product.description_he}</p>` at
 * src/app/(store)/product/[slug]/page.tsx:254 - and the same column feeds the
 * page's meta description. Importing raw markup would show customers literal
 * `<ul><li>` and put tags in a search result snippet.
 *
 * This is deliberately a small, blunt converter and not a parser: block-level
 * tags become newlines, everything else is dropped, and the five entities that
 * actually occur in this export are decoded. Anything it cannot handle
 * degrades to plain text, which is the correct failure direction for a column
 * that is only ever displayed.
 */
function htmlToText(html) {
  if (html === null || html === undefined) return null
  const text = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text.length > 0 ? text : null
}

function sqlString(value) {
  if (value === null || value === undefined) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlNumber(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? 'null'
    : String(Number(value))
}

/** Gallery order, featured image first, deduped. Legacy URLs, see remote-hosts. */
function imagesFor(product) {
  const ids = [product.featured_image_wp_id, ...(product.gallery_wp_ids ?? [])].filter(
    (id) => id !== null && id !== undefined,
  )
  const urls = []
  for (const id of ids) {
    const url = mediaById.get(id)
    if (url && !urls.includes(url)) urls.push(url)
  }
  return urls
}

function categorySlugFor(product) {
  for (const wpId of product.category_wp_ids ?? []) {
    const wpSlug = termById.get(wpId)
    if (wpSlug && CATEGORY_SLUG_MAP[wpSlug]) return CATEGORY_SLUG_MAP[wpSlug]
  }
  return null
}

/**
 * Rows that are scaffolding, not merchandise.
 *
 * WordPress accumulated test products over four years and the export carries
 * them. They have prices and images, so no automated gate catches them - only
 * reading the title does. Listed by exact slug rather than sniffed for, so
 * this stays reviewable and cannot grow to swallow a real product whose name
 * happens to contain the word "test".
 */
const NOT_MERCHANDISE = new Set(['קופון-טסט', 'מוצר-לדוגמא', 'product-template'])

/** Tokens a slug and a title share. Used only to FLAG, never to rewrite. */
function tokensOf(value) {
  return new Set(
    String(value ?? '')
      .toLowerCase()
      .split(/[\s\-_,.()]+/)
      .filter((t) => t.length > 2),
  )
}

/**
 * Whether this product's slug has nothing to do with its title.
 *
 * WordPress reuses a deleted product's slug for the next product created in its
 * place, so `שעון-אפל-חכם-apple-watch-series-7` is now a breakfast deal and
 * `ארוחת-שף-במסעדת-אולטרה` is a facial. The dry run counts 20 of these.
 *
 * The slug is the URL, so this is not cosmetic: publishing one puts a customer
 * on /product/apple-watch-series-7 looking at a restaurant voucher. Nothing is
 * renamed here - a slug is an addressable identity and re-slugging silently
 * would break whatever links to it. The row is flagged and left for a human,
 * which is also why every imported row lands as a draft.
 */
function slugMismatchesTitle(product) {
  const slugTokens = tokensOf(product.proposed_slug)
  const titleTokens = tokensOf(product.title_he)
  if (slugTokens.size === 0 || titleTokens.size === 0) return true
  for (const token of titleTokens) if (slugTokens.has(token)) return false
  return true
}

const missing = products.filter(
  (p) =>
    p.post_type === 'product' &&
    !EXISTING.has(p.proposed_slug) &&
    !NOT_MERCHANDISE.has(p.proposed_slug),
)

const excluded = products.filter(
  (p) => p.post_type === 'product' && NOT_MERCHANDISE.has(p.proposed_slug),
)

const lines = []
const rows = []

let skippedNoPrice = 0
let skippedNoImage = 0
let mismatched = 0

for (const p of missing) {
  const images = imagesFor(p)
  const categorySlug = categorySlugFor(p)
  const price = p.price ?? p.regular_price

  if (price === null || price === undefined || Number(price) <= 0) {
    skippedNoPrice += 1
    lines.push(`-- SKIPPED (no usable price): ${p.proposed_slug}`)
    continue
  }
  if (images.length === 0) {
    skippedNoImage += 1
    lines.push(`-- SKIPPED (no image): ${p.proposed_slug}`)
    continue
  }

  const type = p.target_type === 'coupon' ? 'coupon' : 'physical'
  const commissionType = type === 'coupon' ? 'coupon_absolute' : 'physical_percent'

  // Provenance travels with the row so a later reconciliation can tell an
  // imported product from a hand-made one without guessing from the slug.
  const mismatch = slugMismatchesTitle(p)
  if (mismatch) mismatched += 1

  const attributes = JSON.stringify({
    wp_post_id: p.wp_post_id,
    imported_from: 'kenyonexpress-wxr-2026-07-29',
    imported_at: '2026-08-07',
    // Reviewable from SQL: `where attributes->>'slug_title_mismatch' = 'true'`.
    ...(mismatch ? { slug_title_mismatch: true, legacy_slug: p.proposed_slug } : {}),
  })

  // One tuple per product, fed into a single INSERT ... SELECT below. A VALUES
  // list rather than 20 separate statements: it is one round trip, one
  // transaction, and roughly half the bytes, which matters because the only
  // route to this database is an MCP call that carries the whole script.
  rows.push(
    `(${sqlString(p.proposed_slug)},${sqlString(p.title_he)},${sqlString(htmlToText(p.description_html))},` +
      `${sqlString((htmlToText(p.excerpt_html) ?? '').slice(0, 300) || null)},` +
      `${sqlString(type)},${sqlString(commissionType)},${sqlNumber(price)},${sqlNumber(p.compare_at_price)},` +
      `${sqlString(categorySlug)},${sqlString(JSON.stringify(images))},${sqlString(attributes)},${sqlString(p.sku)})`,
  )
}

/**
 * `on conflict (slug) do nothing` rather than a per-row `where not exists`:
 * products_slug_key is a real unique index (verified against production), so
 * the database decides, and a concurrent writer cannot slip a duplicate in
 * between the check and the insert the way the guarded form allows.
 *
 * commission_percent is 0 because the column is NOT NULL with no default and
 * something has to go there. It is NOT a commission: platform_percent is left
 * NULL, and `assertPublishable` refuses to activate a product whose split is
 * unset, so no imported row can be sold until a human types the real number.
 */
const statement = `insert into public.products (
  slug, name_he, description_he, short_description_he, type, commission_type, status,
  price_ils, kenyon_price, compare_at_price_ils, commission_percent, platform_percent,
  supplier_id, category_id, images, attributes, sku, requires_shipping, is_coupon_enabled
)
select v.slug, v.name_he, v.description_he, v.short_description_he,
  v.type::product_type, v.commission_type::commission_type, 'draft'::product_status,
  v.price, v.price, v.compare_at,
  0, null,
  null,
  c.id,
  v.images::jsonb, v.attributes::jsonb,
  v.sku, v.type = 'physical', v.type = 'coupon'
from (values
${rows.join(',\n')}
) as v(slug, name_he, description_he, short_description_he, type, commission_type, price, compare_at, category_slug, images, attributes, sku)
left join public.categories c on c.slug = v.category_slug
on conflict (slug) do nothing;`

lines.push('-- WordPress import: the products production does not have.')
lines.push('-- Generated by scripts/wp-import/emit-missing-products.mjs. Idempotent.')
lines.push(statement)
lines.push(
  `-- ${missing.length} not in production; ${skippedNoPrice} skipped for price, ${skippedNoImage} for images.`,
)

process.stdout.write(`${lines.join('\n')}\n`)
process.stderr.write(
  `missing=${missing.length} excluded_scaffolding=${excluded.length} ` +
    `skipped_no_price=${skippedNoPrice} skipped_no_image=${skippedNoImage} ` +
    `slug_title_mismatch=${mismatched} ` +
    `emitted=${missing.length - skippedNoPrice - skippedNoImage}\n`,
)
