#!/usr/bin/env node
// WXR dry run through fast-xml-parser, with prepared upsert statements.
//
//   node scripts/wp-import/xml-fxp-dryrun.mjs --file refs/wp-export/wp-export.xml
//
// Why a second reader when lib/xml.mjs exists: this one is an INDEPENDENT
// implementation on a real XML parser rather than the hand-rolled one, so its
// counts are a cross-check. When both agree, the number is a fact about the
// export and not a quirk of one parser. When they disagree, one of them has a
// bug and the disagreement is the finding.
//
// On the 2026-07-29 export they disagreed three times, and each disagreement was
// a defect in the older reader: 28 categories against 11 (it also ingests the
// blog taxonomy), 46 products against 45 (it imports Dokan's bookkeeping row),
// and 66 images against 65 (it keeps one orphan). See
// docs/WP-EXPORT-2026-07-29-DRY-RUN.md.
//
// This script NEVER connects to a database and NEVER executes SQL. It writes
// upsert statements to a file for review. Applying them is a separate, human
// decision, and the pipeline's own load/project stages are the supported path.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { XMLParser } from 'fast-xml-parser'
import { DEFAULTS, PATHS, REPO_ROOT, ensureDirs } from './config.mjs'

const { values: argv } = parseArgs({
  options: {
    file: { type: 'string' },
    out: { type: 'string' },
    limit: { type: 'string' },
  },
  allowPositionals: true,
})

const FILE = resolve(process.cwd(), argv.file || 'refs/wp-export/wp-export.xml')
const OUT_SQL = resolve(process.cwd(), argv.out || `${PATHS.reports}/upserts-fxp.sql`)
const OUT_JSON = OUT_SQL.replace(/\.sql$/, '.json')

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

// WXR is namespaced (wp:, dc:, content:, excerpt:). removeNSPrefix collapses
// wp:post_id to post_id, which is what every mapping below expects.
//
// parseTagValue MUST be false. WooCommerce SKUs like "0012" and phone numbers
// like "0501234567" are strings whose leading zero is data; letting the parser
// coerce them to numbers silently corrupts them. Prices are parsed explicitly
// where they are used, not globally.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  cdataPropName: '__cdata',
  // A single <item> must still be an array, or a one-product export takes a
  // different code path than a 48-product one.
  isArray: (name) => ['item', 'category', 'author', 'postmeta', 'tag', 'term'].includes(name),
})

const xml = readFileSync(FILE, 'utf8')
const doc = parser.parse(xml)
const channel = doc?.rss?.channel
if (!channel) {
  console.error(`not a WXR file (no rss > channel): ${FILE}`)
  process.exit(2)
}

/** CDATA-or-text, since WXR wraps most values in CDATA but not all of them. */
function text(node) {
  if (node === null || node === undefined) return null
  if (typeof node === 'string') return node === '' ? null : node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  if (typeof node === 'object') {
    if ('__cdata' in node) {
      const v = node.__cdata
      return v === '' || v === null || v === undefined ? null : String(v)
    }
    if ('#text' in node) return text(node['#text'])
  }
  return null
}

const items = channel.item ?? []
const authors = channel.author ?? []

// Product categories live in <wp:term term_taxonomy=product_cat>, NOT in
// <wp:category>. <wp:category> is the BLOG post taxonomy: in this export it
// holds 17 leftover Electro demo terms (Aside, Design, Podcasts, Videos) that
// have never had a product in them. Reading both, as lib/wxr.mjs does, puts
// English theme-demo terms into the Hebrew storefront navigation.
const productCatTerms = (channel.term ?? []).filter((t) => text(t.term_taxonomy) === 'product_cat')
const blogCategoryTerms = channel.category ?? []

// ---------------------------------------------------------------------------
// Bucket by post_type
// ---------------------------------------------------------------------------

const byType = new Map()
for (const item of items) {
  const t = text(item.post_type) ?? '?'
  if (!byType.has(t)) byType.set(t, [])
  byType.get(t).push(item)
}

/**
 * `content:encoded` and `excerpt:encoded` are DIFFERENT fields that both become
 * `encoded` once removeNSPrefix strips the namespace, so the parser hands back
 * an array of two. Reading it as a scalar silently yields null, which is how a
 * catalog imports with every description empty and nothing complains.
 *
 * WXR emits content before excerpt inside an item, so index 0 is the body and
 * index 1 is the short description. Both indices are checked against the other
 * parser's output in the report, so a source that ever reorders them shows up as
 * a description-length disagreement rather than as silent damage.
 */
function encodedParts(item) {
  const e = item.encoded
  if (e === null || e === undefined) return { content: null, excerpt: null }
  if (Array.isArray(e)) return { content: text(e[0]), excerpt: text(e[1]) }
  return { content: text(e), excerpt: null }
}

/** postmeta pairs into a plain object. Later keys win, matching WP behaviour. */
function metaOf(item) {
  const out = {}
  for (const m of item.postmeta ?? []) {
    const k = text(m.meta_key)
    if (k) out[k] = text(m.meta_value)
  }
  return out
}

/** <category domain="product_cat" nicename="...">Name</category> on an item. */
function termsOf(item, domain) {
  const raw = item.category
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : [raw]
  return list
    .filter((c) => c?.['@_domain'] === domain)
    .map((c) => ({ slug: decodeSlug(c['@_nicename'] ?? null), name: text(c) }))
    .filter((c) => c.slug)
}

// ---------------------------------------------------------------------------
// Money. WooCommerce _price is a DECIMAL STRING in store currency ("199.90"),
// not cents. public.products.price_ils is numeric(10,2). So the mapping is
// decimal -> decimal, and the "cents -> agorot integer" shape belongs to
// order_items and coupon_deals, which are not fed by this file.
// ---------------------------------------------------------------------------

function money(raw) {
  if (raw === null || raw === undefined) return null
  const s = String(raw).replace(/[^\d.-]/g, '')
  if (s === '' || s === '-') return null
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

/**
 * WordPress stores Hebrew slugs percent-encoded, so `post_name` arrives as
 * `%d7%a9%d7%a2%d7%95%d7%9f-...`. Storing that in public.products.slug puts
 * double-encoded gibberish in every product URL, and the storefront routes
 * expect readable Hebrew (src/app/(store)/product/[slug]). Decode, and keep the
 * raw form only if decoding fails.
 */
function decodeSlug(raw) {
  if (!raw) return raw
  if (!raw.includes('%')) return raw
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * A slug safe to put in a URL and in a UNIQUE text column.
 *
 * Decoding alone is not enough: WooCommerce titles carry currency signs and
 * punctuation, so `post_name` can decode to `...-רק-ב108₪`. A `₪` in a slug is
 * legal but gets re-encoded by every client, which defeats the point of
 * decoding. Strip to letters, digits and dashes, Unicode-aware so Hebrew
 * survives.
 */
function makeSlug(raw, fallbackTitle, wpId) {
  const clean = (s) =>
    decodeSlug(s ?? '')
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^\p{L}\p{N}-]+/gu, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')

  const fromName = clean(raw)
  if (fromName) return fromName
  // An empty post_name is normal for drafts and for titles WordPress could not
  // transliterate. A slug built from the title beats product-6810 in every URL,
  // sitemap entry and share card.
  const fromTitle = clean(fallbackTitle)
  if (fromTitle) return fromTitle
  return `product-${wpId}`
}

function intOrNull(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number.parseInt(String(raw), 10)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Attachments, so image ids resolve to URLs
// ---------------------------------------------------------------------------

const attachments = new Map()
for (const a of byType.get('attachment') ?? []) {
  const id = text(a.post_id)
  if (!id) continue
  const meta = metaOf(a)
  attachments.set(id, {
    wp_id: id,
    url: text(a.attachment_url),
    alt: meta._wp_attachment_image_alt ?? null,
    title: text(a.title),
  })
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const issues = []
function issue(entity, wp_id, severity, code, detail) {
  issues.push({ entity, wp_id: String(wp_id), severity, code, detail })
}

const categories = []
const takenCatSlugs = new Set()
for (const t of productCatTerms) {
  const wpId = text(t.term_id)
  const name = text(t.term_name) ?? text(t.term_slug) ?? `category-${wpId}`
  let slug = makeSlug(text(t.term_slug), name, `category-${wpId}`)
  if (takenCatSlugs.has(slug)) {
    const original = slug
    let n = 2
    while (takenCatSlugs.has(`${original}-${n}`)) n += 1
    slug = `${original}-${n}`
    issue('category', wpId, 'warn', 'slug_collision', `${original} taken, using ${slug}`)
  }
  takenCatSlugs.add(slug)
  categories.push({
    wp_id: wpId,
    slug,
    name_he: name,
    parent_slug: text(t.term_parent),
    description_he: text(t.term_description),
  })
}

// The blog taxonomy is reported, never projected. Silence here is how 17 junk
// categories reach a storefront.
if (blogCategoryTerms.length) {
  issue(
    'category',
    'blog-taxonomy',
    'warn',
    'blog_categories_excluded',
    `${blogCategoryTerms.length} <wp:category> blog terms ignored (not product_cat): ` +
      `${blogCategoryTerms
        .map((c) => text(c.category_nicename))
        .filter(Boolean)
        .slice(0, 20)
        .join(', ')}`,
  )
}

const catBySlug = new Map(categories.map((c) => [c.slug, c]))

// ---------------------------------------------------------------------------
// Products
//
// Status rule, from the pipeline's own contract: no product goes live broken.
// Missing price or missing category means draft, never active.
// ---------------------------------------------------------------------------

const EXCLUDED_STATUSES = new Set(['private', 'trash', 'auto-draft', 'inherit'])
// Products WooCommerce plugins create for their own bookkeeping. They are not
// catalog rows and must not be projected, not even as drafts.
const EXCLUDED_SLUGS = new Set(DEFAULTS.excludeProductSlugs ?? ['reverse-withdrawal-payment'])

const products = []
const skipped = []
const mediaRows = new Map()

for (const p of byType.get('product') ?? []) {
  const wpId = text(p.post_id)
  const wpStatus = text(p.status)
  const slug = makeSlug(text(p.post_name), text(p.title), wpId)

  if (EXCLUDED_STATUSES.has(wpStatus ?? '')) {
    skipped.push({ wp_id: wpId, slug, reason: 'status_excluded', detail: wpStatus })
    continue
  }
  if (EXCLUDED_SLUGS.has(slug)) {
    skipped.push({ wp_id: wpId, slug, reason: 'plugin_bookkeeping_product', detail: null })
    continue
  }

  const meta = metaOf(p)
  const { content, excerpt } = encodedParts(p)
  const title = text(p.title)
  const cats = termsOf(p, 'product_cat')

  // A slug that shares no word with its title is a recycled WordPress post: an
  // editor replaced the content and WordPress kept the original post_name.
  //
  // This is NOT a broken redirect. WordPress served the product at
  // /product/<post_name>, so carrying the slug over preserves the old URL
  // exactly, which is what SEO continuity wants. The cost is the other
  // direction: the new storefront inherits URLs that misdescribe their own
  // products. Re-slugging from the title reads better but breaks every inbound
  // link unless a 301 is emitted from the old slug. Either way it is a decision,
  // and a decision cannot be made about rows nobody counted.
  const tokens = (s) =>
    new Set(
      (s ?? '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length > 2),
    )
  const slugTokens = tokens(slug)
  const titleTokens = tokens(title)
  const shared = [...slugTokens].filter((t) => titleTokens.has(t))
  if (slugTokens.size && titleTokens.size && shared.length === 0) {
    issue(
      'product',
      wpId,
      'warn',
      'slug_title_mismatch',
      `slug "${slug}" shares no word with title "${title}": recycled post. Keeping it preserves the old URL; changing it needs a 301`,
    )
  }
  const regular = money(meta._regular_price)
  const sale = money(meta._sale_price)
  const price = money(meta._price) ?? sale ?? regular

  if (price === null) {
    issue(
      'product',
      wpId,
      'error',
      'missing_price',
      `no parseable price (regular=${meta._regular_price ?? ''}, sale=${meta._sale_price ?? ''}, price=${meta._price ?? ''})`,
    )
  }
  if (cats.length === 0) {
    issue('product', wpId, 'error', 'no_category', 'product has no product_cat term')
  }

  // compare_at_price only exists when the sale price is genuinely lower.
  // Otherwise it is a fake strikethrough, which the validator rejects.
  let compareAt = null
  if (sale !== null && regular !== null && regular > sale) compareAt = regular

  const thumbId = meta._thumbnail_id ?? null
  const galleryIds = (meta._product_image_gallery ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const imageIds = [...new Set([thumbId, ...galleryIds].filter(Boolean))]
  const images = []
  const missingAttachments = []
  for (const id of imageIds) {
    const a = attachments.get(id)
    if (!a?.url) {
      missingAttachments.push(id)
      continue
    }
    images.push({ wp_id: id, url: a.url, alt: a.alt })
    mediaRows.set(id, a)
  }
  if (missingAttachments.length) {
    issue(
      'product',
      wpId,
      'warn',
      'missing_attachments',
      `attachment ids not in export: ${missingAttachments.join(',')}`,
    )
  }
  if (images.length === 0) {
    issue('product', wpId, 'warn', 'no_image', 'product has no resolvable image')
  }

  // The description is raw WordPress HTML. The pipeline's lib/clean.mjs strips
  // theme leftovers (empty Reviews divs, bare <img> bodies) and reduces several
  // of these to nothing; this script keeps them verbatim so the difference is
  // visible rather than assumed. What must not pass silently is markup that
  // hotlinks the old domain: it survives cutover as a live dependency on a site
  // that is about to be turned off.
  if (content?.includes('kenyonexpress.co.il/wp-content')) {
    issue(
      'product',
      wpId,
      'warn',
      'description_hotlinks_legacy_media',
      'description HTML embeds wp-content URLs from the old domain',
    )
  }

  const stockStatus = meta._stock_status ?? null
  const stock = intOrNull(meta._stock)

  const broken = price === null || cats.length === 0
  const status = broken
    ? 'draft'
    : wpStatus === 'publish'
      ? stockStatus === 'outofstock'
        ? 'sold_out'
        : 'active'
      : 'draft'

  products.push({
    wp_id: wpId,
    slug,
    name_he: title ?? slug,
    description_he: content,
    short_description_he: excerpt,
    price_ils: price,
    compare_at_price_ils: compareAt,
    sku: meta._sku ?? null,
    stock_quantity: stock,
    stock_status: stockStatus,
    category_slug: cats[0] ? (catBySlug.has(cats[0].slug) ? cats[0].slug : null) : null,
    category_slug_raw: cats[0]?.slug ?? null,
    type: 'physical',
    status,
    wp_status: wpStatus,
    // NULL for the same reason as 04-project-public.mjs: no per-product percent
    // exists in the export, and inventing one decides the supplier's cut.
    platform_percent: null,
    commission_percent: 0,
    images,
    published_at: text(p.post_date_gmt),
  })

  if (cats[0] && !catBySlug.has(cats[0].slug)) {
    issue(
      'product',
      wpId,
      'error',
      'dangling_category',
      `product_cat ${cats[0].slug} is not in the category export`,
    )
  }
}

// duplicate slug detection, since products.slug is UNIQUE NOT NULL
const slugCounts = new Map()
for (const p of products) slugCounts.set(p.slug, (slugCounts.get(p.slug) ?? 0) + 1)
for (const [slug, n] of slugCounts) {
  if (n > 1) issue('product', slug, 'error', 'duplicate_slug', `${n} products share slug ${slug}`)
}

// ---------------------------------------------------------------------------
// Users and orders: what WXR can and cannot carry
// ---------------------------------------------------------------------------

const users = authors.map((a) => ({
  wp_id: text(a.author_id),
  login: text(a.author_login),
  email: text(a.author_email),
  display_name: text(a.author_display_name),
  first_name: text(a.author_first_name),
  last_name: text(a.author_last_name),
  // never imported opted in; consent is re-collected on the new site
  marketing_opt_in: DEFAULTS.marketingOptIn,
}))

const orders = []
for (const o of byType.get('shop_order') ?? []) {
  const meta = metaOf(o)
  orders.push({
    wp_order_id: text(o.post_id),
    status_raw: text(o.status),
    order_key: meta._order_key ?? null,
    customer_wp_id: intOrNull(meta._customer_user),
    billing_email: meta._billing_email ?? null,
    billing_phone: meta._billing_phone ?? null,
    currency: meta._order_currency ?? DEFAULTS.currency,
    discount_total: money(meta._cart_discount),
    shipping_total: money(meta._order_shipping),
    tax_total: money(meta._order_tax),
    total: money(meta._order_total),
    payment_method: meta._payment_method ?? null,
    payment_method_title: meta._payment_method_title ?? null,
    transaction_id: meta._transaction_id ?? null,
    created_at_wp: text(o.post_date_gmt),
    line_item_count: 0, // WXR has no line items. See the note below.
  })
}

// WooCommerce keeps line items in wp_woocommerce_order_items(+meta), which are
// TABLES, and WXR exports POSTS. So order contents cannot be in this file at
// all. This is not a parser limitation and no amount of parsing fixes it.
const lineItemMetaKeys = new Set()
for (const o of byType.get('shop_order') ?? []) {
  for (const k of Object.keys(metaOf(o))) {
    if (k.includes('line_item') || k.includes('order_item')) lineItemMetaKeys.add(k)
  }
}
if (orders.length > 0 && lineItemMetaKeys.size === 0) {
  issue(
    'order',
    'all',
    'error',
    'no_line_items',
    `${orders.length} orders carry headers only: WXR exports posts, and WooCommerce stores line items in tables`,
  )
}

const customersInOrders = new Set(orders.map((o) => o.customer_wp_id).filter((id) => id && id > 0))
const exportedAuthorIds = new Set(users.map((u) => u.wp_id))
const missingCustomers = [...customersInOrders].filter((id) => !exportedAuthorIds.has(String(id)))
if (missingCustomers.length) {
  issue(
    'customer',
    'all',
    'error',
    'customers_not_exported',
    `${missingCustomers.length} customer ids appear on orders but are not in the export (WXR exports authors, not customers): ${missingCustomers.slice(0, 10).join(',')}${missingCustomers.length > 10 ? ' ...' : ''}`,
  )
}

// ---------------------------------------------------------------------------
// SQL generation. Prepared, never executed.
// ---------------------------------------------------------------------------

function q(v) {
  if (v === null || v === undefined) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}
function num(v) {
  return v === null || v === undefined ? 'NULL' : String(v)
}
function jsonb(v) {
  return `${q(JSON.stringify(v))}::jsonb`
}

const sql = []
sql.push('-- Prepared upserts from the WordPress WXR export.')
sql.push(`-- source: ${FILE}`)
sql.push('-- generated by scripts/wp-import/xml-fxp-dryrun.mjs (fast-xml-parser)')
sql.push('--')
sql.push('-- NOT APPLIED. Review before running. The supported path is')
sql.push('--   WP_IMPORT_ALLOW_WRITES=1 node scripts/wp-import/run.mjs --apply')
sql.push('-- which also writes wp_import.id_map, the migration log, and supports rollback.')
sql.push('-- These statements are the same projection expressed as reviewable SQL.')
sql.push('--')
sql.push('-- Idempotency: every statement keys on the UNIQUE slug, so re-running')
sql.push('-- updates instead of duplicating. Admin-edited columns not listed in the')
sql.push('-- DO UPDATE SET clause are never clobbered.')
sql.push('')
sql.push('BEGIN;')
sql.push('')
sql.push('-- 1. categories -----------------------------------------------------------')
sql.push('')
for (const c of categories) {
  sql.push(`INSERT INTO public.categories (slug, name_he, description_he, is_active)
VALUES (${q(c.slug)}, ${q(c.name_he)}, ${q(c.description_he)}, true)
ON CONFLICT (slug) DO UPDATE SET
  name_he = EXCLUDED.name_he,
  description_he = COALESCE(EXCLUDED.description_he, public.categories.description_he),
  updated_at = now();`)
}
sql.push('')
sql.push('-- 1b. category parents, second pass: a parent must exist before it is')
sql.push('--     referenced, and WXR does not order terms parent-first.')
sql.push('')
for (const c of categories) {
  if (!c.parent_slug) continue
  if (!catBySlug.has(c.parent_slug)) {
    sql.push(`-- SKIPPED parent for ${c.slug}: parent slug ${c.parent_slug} not in export`)
    continue
  }
  sql.push(`UPDATE public.categories SET parent_id = (SELECT id FROM public.categories WHERE slug = ${q(c.parent_slug)}), updated_at = now()
 WHERE slug = ${q(c.slug)};`)
}
sql.push('')
sql.push('-- 2. the legacy supplier every imported product hangs off ------------------')
sql.push('')
sql.push(`INSERT INTO public.suppliers (name_he, slug, status)
VALUES (${q(DEFAULTS.legacySupplierName)}, 'legacy-wp', 'active')
ON CONFLICT (slug) DO UPDATE SET name_he = EXCLUDED.name_he, updated_at = now();`)
sql.push('')
sql.push('-- 3. products -------------------------------------------------------------')
sql.push('--')
sql.push('-- images holds the LEGACY WordPress URLs. The media stage rewrites them to')
sql.push('-- storage URLs. Applying this file without running media first leaves the')
sql.push('-- new catalog hotlinking the old site.')
sql.push('')
for (const p of products) {
  const catExpr = p.category_slug
    ? `(SELECT id FROM public.categories WHERE slug = ${q(p.category_slug)})`
    : 'NULL'
  sql.push(`INSERT INTO public.products (
  slug, name_he, description_he, short_description_he, type, status,
  price_ils, compare_at_price_ils, sku, stock_quantity,
  category_id, supplier_id,
  platform_percent, commission_percent, images, published_at
) VALUES (
  ${q(p.slug)}, ${q(p.name_he)}, ${q(p.description_he)}, ${q(p.short_description_he)}, 'physical', ${q(p.status)},
  ${num(p.price_ils ?? 0)}, ${num(p.compare_at_price_ils)}, ${q(p.sku)}, ${num(p.stock_quantity)},
  ${catExpr},
  (SELECT id FROM public.suppliers WHERE slug = 'legacy-wp'),
  ${num(p.platform_percent)}, ${num(p.commission_percent)}, ${jsonb(p.images.map((i) => i.url))}, ${q(p.published_at)}
)
ON CONFLICT (slug) DO UPDATE SET
  name_he = EXCLUDED.name_he,
  description_he = EXCLUDED.description_he,
  short_description_he = EXCLUDED.short_description_he,
  price_ils = EXCLUDED.price_ils,
  compare_at_price_ils = EXCLUDED.compare_at_price_ils,
  sku = EXCLUDED.sku,
  stock_quantity = EXCLUDED.stock_quantity,
  category_id = COALESCE(EXCLUDED.category_id, public.products.category_id),
  images = EXCLUDED.images,
  updated_at = now();`)
}
sql.push('')
sql.push('-- 4. id_map, so a re-run updates the same rows and rollback can find them --')
sql.push('')
for (const c of categories) {
  sql.push(`INSERT INTO wp_import.id_map (entity, wp_id, new_id)
SELECT 'category', ${q(c.wp_id)}, id FROM public.categories WHERE slug = ${q(c.slug)}
ON CONFLICT (entity, wp_id) DO UPDATE SET new_id = EXCLUDED.new_id, updated_at = now();`)
}
for (const p of products) {
  sql.push(`INSERT INTO wp_import.id_map (entity, wp_id, new_id)
SELECT 'product', ${q(p.wp_id)}, id FROM public.products WHERE slug = ${q(p.slug)}
ON CONFLICT (entity, wp_id) DO UPDATE SET new_id = EXCLUDED.new_id, updated_at = now();`)
}
sql.push('')
sql.push('-- 5. orders: ARCHIVE ONLY -------------------------------------------------')
sql.push('--')
sql.push('-- These go to wp_import.orders and are never projected into public commerce')
sql.push('-- tables. Headers only: WXR carries no line items, so what each order')
sql.push('-- contained is not recoverable from this file. raw is empty on purpose,')
sql.push('-- the full payload belongs to the pipeline load stage.')
sql.push('')
for (const o of orders) {
  sql.push(`INSERT INTO wp_import.orders (
  wp_order_id, storage_source, status_raw, currency, customer_wp_id,
  billing_email, billing_phone, discount_total, shipping_total, tax_total, total,
  payment_method, payment_method_title, transaction_id, created_at_wp
) VALUES (
  ${num(o.wp_order_id)}, 'posts', ${q(o.status_raw)}, ${q(o.currency)}, ${num(o.customer_wp_id)},
  ${q(o.billing_email)}, ${q(o.billing_phone)}, ${num(o.discount_total)}, ${num(o.shipping_total)}, ${num(o.tax_total)}, ${num(o.total)},
  ${q(o.payment_method)}, ${q(o.payment_method_title)}, ${q(o.transaction_id)}, ${q(o.created_at_wp)}
)
ON CONFLICT (wp_order_id) DO UPDATE SET
  status_raw = EXCLUDED.status_raw,
  total = EXCLUDED.total,
  updated_at = now();`)
}
sql.push('')
sql.push('-- 6. users: NOT INSERTED --------------------------------------------------')
sql.push('--')
sql.push(`-- ${users.length} authors are in the export. No INSERT is generated on purpose:`)
sql.push('--   * no password migration, ever. WXR has no hashes and must never get any.')
sql.push('--   * auth.users is written through the Supabase admin API, not SQL.')
sql.push('--   * imported people start opted out; consent is re-collected.')
sql.push('-- Legacy accounts arrive through the password reset flow.')
for (const u of users) {
  sql.push(`--   author ${u.wp_id}: ${u.email ?? '(no email)'} ${u.display_name ?? ''}`)
}
sql.push('')
sql.push('COMMIT;')
sql.push('')

const blocking = issues.filter((i) => i.severity === 'error')

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

ensureDirs()
writeFileSync(OUT_SQL, `${sql.join('\n')}\n`, 'utf8')

const summary = {
  source: FILE.replace(`${REPO_ROOT}/`, ''),
  parser: 'fast-xml-parser',
  items_total: items.length,
  post_types: Object.fromEntries(
    [...byType].map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1]),
  ),
  counts: {
    categories: categories.length,
    products: products.length,
    products_skipped: skipped.length,
    media: mediaRows.size,
    attachments_in_export: attachments.size,
    users: users.length,
    orders: orders.length,
    order_items: 0,
    coupons: (byType.get('shop_coupon') ?? []).length,
    variations: (byType.get('product_variation') ?? []).length,
  },
  products_by_status: products.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1
    return acc
  }, {}),
  skipped,
  issues,
  statements: sql.filter((s) => /^(INSERT|UPDATE)/.test(s)).length,
}
writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

const pad = (s) => String(s).padStart(6)
process.stdout.write(`
fast-xml-parser dry run
  file        ${summary.source}
  items       ${items.length}

counts
  categories        ${pad(categories.length)}
  products          ${pad(products.length)}   (${skipped.length} skipped)
  media             ${pad(mediaRows.size)}   (of ${attachments.size} attachments in export)
  users             ${pad(users.length)}
  orders            ${pad(orders.length)}   (order_items 0)
  coupons           ${pad(summary.counts.coupons)}
  variations        ${pad(summary.counts.variations)}

products by projected status
${Object.entries(summary.products_by_status)
  .map(([k, v]) => `  ${k.padEnd(18)}${pad(v)}`)
  .join('\n')}

skipped
${skipped.map((s) => `  ${s.wp_id.padEnd(6)} ${s.reason.padEnd(28)} ${s.slug}`).join('\n') || '  none'}

validation issues  ${issues.length} total, ${blocking.length} blocking
${issues.map((i) => `  ${i.severity.toUpperCase().padEnd(6)} ${i.entity}/${i.wp_id} ${i.code}: ${i.detail}`).join('\n') || '  none'}

prepared statements  ${summary.statements}
  sql   ${OUT_SQL}
  json  ${OUT_JSON}

NOTHING WAS WRITTEN TO ANY DATABASE. The SQL above was generated, not executed.
`)

process.exit(blocking.length > 0 ? 1 : 0)
