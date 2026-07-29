// Stage 2: transform. Raw WooCommerce payloads into wp_import.* staging rows.
//
// This stage is pure: raw JSON in, normalized JSON out, no network, no
// database. That is what makes the whole pipeline reviewable before it ever
// touches Supabase, and it is why a dry run is worth running.
//
// Every row keeps its source payload in a raw jsonb column. Fields we have no
// target column for are not lost, they are parked.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readRaw } from './01-extract.mjs'
import { DEFAULTS, PATHS, ROUTES, RUN, WC, ensureDirs } from './config.mjs'
import {
  applyStockStatus,
  cleanHtml,
  cleanText,
  dedupeSlug,
  derivePrice,
  htmlToText,
  mapStatus,
  mapType,
  normalizeEmail,
  normalizePhoneIL,
  normalizeSlug,
  parsePrice,
} from './lib/clean.mjs'
import { Run, info, ok, warn } from './lib/log.mjs'

const issues = []

function issue(entity, wpId, severity, code, detail) {
  issues.push({ entity, wp_id: String(wpId), severity, code, detail })
}

function toIso(value) {
  if (!value) return null
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function metaMap(metaData) {
  const out = {}
  for (const entry of metaData || []) {
    if (entry && entry.key !== undefined) out[entry.key] = entry.value
  }
  return out
}

/** WordPress size suffixes (-300x200) point at derivatives, not the original. */
function stripSizeSuffix(url) {
  if (!url) return url
  return url.replace(/-\d{2,5}x\d{2,5}(\.[a-z0-9]{2,5})(\?.*)?$/i, '$1$2')
}

function pathOf(url) {
  if (!url) return null
  try {
    return new URL(url, WC.base).pathname.replace(/\/+$/, '') || '/'
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

function transformCategories(run, rawCategories) {
  const taken = new Set()
  const rows = []
  // sort by id so slug collision suffixes are stable across runs
  for (const raw of [...rawCategories].sort((a, b) => a.id - b.id)) {
    const name = cleanText(raw.name)
    const base = normalizeSlug(raw.slug, name)
    if (!base) {
      issue(
        'category',
        raw.id,
        'error',
        'unslugable',
        `category ${raw.id} has neither slug nor name`,
      )
      run.op({
        stage: 'transform',
        entity: 'category',
        wpId: raw.id,
        action: 'skip',
        errorCode: 'unslugable',
      })
      continue
    }
    const { slug, collided } = dedupeSlug(base, taken)
    if (collided)
      issue('category', raw.id, 'warn', 'slug_collision', `${base} taken, using ${slug}`)

    rows.push({
      wp_term_id: raw.id,
      slug_raw: raw.slug ?? null,
      slug_decoded: slug,
      name_he: name,
      description: htmlToText(raw.description),
      parent_wp_id: raw.parent || null,
      product_count: raw.count ?? 0,
      thumbnail_wp_id: raw.image?.id ?? null,
      permalink: raw.permalink ?? `/product-category/${raw.slug ?? slug}`,
      raw,
    })
    run.op({ stage: 'transform', entity: 'category', wpId: raw.id, action: 'insert' })
  }
  return rows
}

// ---------------------------------------------------------------------------
// products (and variations, which share the staging table)
// ---------------------------------------------------------------------------

function transformProducts(run, rawProducts, categoryBySlugId) {
  const taken = new Set()
  const rows = []
  // Products we deliberately do not import still had indexed URLs. They are
  // tracked here so buildUrlInventory can give each one an explicit 410
  // instead of leaving it to 404 after cutover.
  const excluded = []

  for (const raw of [...rawProducts].sort((a, b) => a.id - b.id)) {
    const postType = raw.post_type === 'product_variation' ? 'product_variation' : 'product'
    const meta = metaMap(raw.meta_data)
    const name = cleanText(raw.name)
    const status = mapStatus(raw.status)

    if (status === null) {
      // trashed / private / auto-draft: intentionally out of the catalog
      excluded.push({
        wp_post_id: raw.id,
        permalink: pathOf(raw.permalink) ?? `/product/${raw.slug ?? raw.id}`,
        status_raw: raw.status ?? null,
      })
      run.op({
        stage: 'transform',
        entity: 'product',
        wpId: raw.id,
        action: 'skip',
        errorCode: 'status_excluded',
      })
      continue
    }

    const base = normalizeSlug(raw.slug, name)
    if (!base && postType === 'product') {
      issue('product', raw.id, 'error', 'unslugable', `product ${raw.id} has neither slug nor name`)
      run.op({
        stage: 'transform',
        entity: 'product',
        wpId: raw.id,
        action: 'fail',
        errorCode: 'unslugable',
      })
      continue
    }
    const { slug, collided } = base ? dedupeSlug(base, taken) : { slug: null, collided: false }
    if (collided) issue('product', raw.id, 'warn', 'slug_collision', `${base} taken, using ${slug}`)

    const { price, compareAt } = derivePrice({
      regularPrice: raw.regular_price,
      salePrice: raw.sale_price,
      effectivePrice: raw.price,
    })

    // A product with no parseable price never reaches the catalog as active.
    // Better a visible draft than a live product priced at nothing.
    let effectiveStatus = applyStockStatus(status, raw.stock_status)
    if (price === null || price <= 0) {
      if (postType === 'product') {
        issue(
          'product',
          raw.id,
          'error',
          'missing_price',
          `no parseable price (regular=${raw.regular_price}, sale=${raw.sale_price}, price=${raw.price})`,
        )
        effectiveStatus = 'draft'
      }
    }

    const categoryIds = raw.categories
      ? raw.categories.map((c) => c.id)
      : Array.isArray(raw.category_ids)
        ? raw.category_ids
        : []
    if (postType === 'product' && categoryIds.length === 0) {
      issue('product', raw.id, 'error', 'no_category', 'product has no product_cat term')
    }

    const categorySlugs = categoryIds.map((id) => categoryBySlugId.get(String(id))).filter(Boolean)

    const galleryIds = raw.images
      ? raw.images.map((img) => img.id).filter(Boolean)
      : parseIdList(raw.gallery_ids)
    const featuredId = raw.images?.[0]?.id ?? (raw.thumbnail_id ? Number(raw.thumbnail_id) : null)

    rows.push({
      wp_post_id: raw.id,
      post_type: postType,
      wp_parent_id: raw.parent_id || null,
      slug_raw: raw.slug ?? null,
      slug_decoded: slug,
      permalink: pathOf(raw.permalink) ?? (slug ? `/product/${slug}` : null),
      title_he: name,
      description_html: cleanHtml(raw.description),
      excerpt_html: cleanHtml(raw.short_description),
      status_raw: raw.status ?? null,
      sku: cleanText(raw.sku),
      regular_price: parsePrice(raw.regular_price),
      sale_price: parsePrice(raw.sale_price),
      price,
      currency: DEFAULTS.currency,
      manage_stock: toBool(raw.manage_stock),
      stock_status_raw: raw.stock_status ?? null,
      stock_quantity:
        raw.stock_quantity === null || raw.stock_quantity === undefined
          ? null
          : Number.parseInt(raw.stock_quantity, 10) || null,
      is_virtual: toBool(raw.virtual) ?? false,
      product_type_raw: raw.type ?? raw.product_type ?? null,
      total_sales: Number.parseInt(raw.total_sales, 10) || 0,
      attributes: raw.attributes ?? {},
      category_wp_ids: categoryIds,
      tag_names: (raw.tags?.map((t) => t.name) ?? raw.tag_names ?? []).filter(Boolean),
      featured_image_wp_id: featuredId,
      gallery_wp_ids: galleryIds,
      seo_title_raw: cleanText(raw.seo_title ?? meta._yoast_wpseo_title ?? meta.rank_math_title),
      seo_description_raw: cleanText(
        raw.seo_description ?? meta._yoast_wpseo_metadesc ?? meta.rank_math_description,
      ),
      created_at_wp: toIso(raw.date_created_gmt),
      modified_at_wp: toIso(raw.date_modified_gmt),
      // curation columns: the proposal, for a human to approve before projection
      proposed_slug: slug,
      target_type: mapType(categorySlugs, DEFAULTS, meta),
      compare_at_price: compareAt,
      projected_status: effectiveStatus,
      raw_meta: meta,
      raw_post: raw,
    })
    run.op({
      stage: 'transform',
      entity: postType === 'product' ? 'product' : 'variant',
      wpId: raw.id,
      action: 'insert',
    })
  }
  return { rows, excluded }
}

function toBool(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value
  return ['yes', '1', 'true'].includes(String(value).toLowerCase())
}

function parseIdList(value) {
  if (!value) return []
  return String(value)
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter(Number.isFinite)
}

// ---------------------------------------------------------------------------
// media: derived from product and category image references
// ---------------------------------------------------------------------------

function transformMedia(run, rawProducts, rawCategories) {
  const byId = new Map()

  const add = (img, parentId) => {
    if (!img?.id) return
    const key = String(img.id)
    if (byId.has(key)) return
    const src = stripSizeSuffix(img.src || img.source_url || img.guid)
    if (!src) {
      issue('media', img.id, 'warn', 'no_source_url', `attachment ${img.id} has no resolvable URL`)
      return
    }
    byId.set(key, {
      wp_attachment_id: Number(img.id),
      wp_parent_post_id: parentId ?? null,
      source_url: src,
      file_name: src.split('/').pop() || null,
      mime_type: img.mime_type ?? null,
      alt_text: cleanText(img.alt) ?? null,
      title: cleanText(img.name) ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
      status: 'pending',
      bucket: DEFAULTS.imageBucket,
      created_at_wp: toIso(img.date_created_gmt),
      raw: img,
    })
    run.op({ stage: 'transform', entity: 'media', wpId: img.id, action: 'insert' })
  }

  for (const product of rawProducts) {
    for (const img of product.images || []) add(img, product.id)
  }
  for (const category of rawCategories) {
    if (category.image) add(category.image, null)
  }
  return [...byId.values()]
}

// ---------------------------------------------------------------------------
// customers: identity only. Never passwords, never marketing consent.
// ---------------------------------------------------------------------------

function transformCustomers(run, rawCustomers) {
  const rows = []
  for (const raw of rawCustomers) {
    const meta = metaMap(raw.meta_data)
    const email = normalizeEmail(raw.email || raw.billing?.email)
    if (!email) {
      issue(
        'customer',
        raw.id,
        'warn',
        'invalid_email',
        `user ${raw.id} has no usable email; not importable`,
      )
    }
    const phone = normalizePhoneIL(raw.billing?.phone)

    rows.push({
      wp_user_id: raw.id,
      email_raw: raw.email ?? null,
      email_normalized: email,
      display_name: cleanText(raw.display_name ?? `${raw.first_name ?? ''} ${raw.last_name ?? ''}`),
      first_name: cleanText(raw.first_name ?? raw.billing?.first_name),
      last_name: cleanText(raw.last_name ?? raw.billing?.last_name),
      phone_raw: raw.billing?.phone ?? null,
      phone_normalized: phone,
      registered_at: toIso(raw.date_created_gmt),
      last_active_at: toIso(raw.date_modified_gmt),
      is_paying_customer: toBool(raw.is_paying_customer) ?? false,
      orders_count: Number.parseInt(raw.orders_count, 10) || 0,
      total_spent: parsePrice(raw.total_spent) ?? 0,
      billing: raw.billing ?? {},
      shipping: raw.shipping ?? {},
      // Evidence only. An opt-in recorded on the old site is not consent on the
      // new one; every imported person starts at marketing_*=false and is
      // re-consented, or never contacted. Non-negotiable (doc 5.5).
      newsletter_optin_raw: pickOptInEvidence(meta),
      raw_meta: stripSecrets(meta),
    })
    run.op({
      stage: 'transform',
      entity: 'customer',
      wpId: raw.id,
      action: email ? 'insert' : 'skip',
    })
  }
  return rows
}

const OPT_IN_KEYS = ['newsletter', 'mailchimp', 'subscribe', 'marketing', 'consent', 'gdpr']

function pickOptInEvidence(meta) {
  const found = {}
  for (const [key, value] of Object.entries(meta)) {
    if (OPT_IN_KEYS.some((needle) => key.toLowerCase().includes(needle))) found[key] = value
  }
  return Object.keys(found).length ? found : null
}

// Password hashes, session tokens and reset keys must not reach staging even
// inside a raw blob. If they are never extracted they can never leak.
const SECRET_KEYS = [
  'user_pass',
  'password',
  'session_tokens',
  'activation_key',
  'wp_user-settings',
  'auth_key',
]

function stripSecrets(meta) {
  const out = {}
  for (const [key, value] of Object.entries(meta)) {
    if (SECRET_KEYS.some((needle) => key.toLowerCase().includes(needle))) continue
    out[key] = value
  }
  return out
}

// ---------------------------------------------------------------------------
// orders: permanent read-only archive. Never projected into live commerce.
// ---------------------------------------------------------------------------

function transformOrders(run, rawOrders) {
  const orders = []
  const items = []

  for (const raw of rawOrders) {
    const total = parsePrice(raw.total)
    const lineItems = raw.line_items || []
    const subtotal = lineItems.reduce((sum, li) => sum + (parsePrice(li.subtotal) ?? 0), 0)

    orders.push({
      wp_order_id: raw.id,
      storage_source: raw.storage_source === 'hpos' ? 'hpos' : 'posts',
      order_number: cleanText(raw.number) ?? String(raw.id),
      status_raw: raw.status ?? null,
      currency: raw.currency || DEFAULTS.currency,
      customer_wp_id: Number.parseInt(raw.customer_id, 10) || null,
      billing_email: normalizeEmail(raw.billing?.email),
      billing_phone: normalizePhoneIL(raw.billing?.phone),
      billing: raw.billing ?? {},
      shipping: raw.shipping ?? {},
      subtotal: Math.round(subtotal * 100) / 100,
      discount_total: parsePrice(raw.discount_total),
      shipping_total: parsePrice(raw.shipping_total),
      tax_total: parsePrice(raw.total_tax),
      total,
      refunded_total:
        (raw.refunds || []).reduce((sum, r) => sum + Math.abs(parsePrice(r.total) ?? 0), 0) || null,
      payment_method: cleanText(raw.payment_method),
      payment_method_title: cleanText(raw.payment_method_title),
      transaction_id: cleanText(raw.transaction_id),
      customer_note: cleanText(raw.customer_note),
      created_at_wp: toIso(raw.date_created_gmt),
      paid_at_wp: toIso(raw.date_paid_gmt),
      completed_at_wp: toIso(raw.date_completed_gmt),
      raw,
    })

    for (const li of lineItems) {
      items.push({
        wp_order_item_id: li.id,
        wp_order_id: raw.id,
        item_type: li.type ?? 'line_item',
        product_wp_id: Number.parseInt(li.product_id, 10) || null,
        variation_wp_id: Number.parseInt(li.variation_id, 10) || null,
        item_name: cleanText(li.name),
        quantity: Number.parseInt(li.quantity, 10) || null,
        line_subtotal: parsePrice(li.subtotal),
        line_total: parsePrice(li.total),
        line_tax: parsePrice(li.tax ?? li.total_tax),
        meta: li.meta_data ?? {},
      })
    }

    if (total === null)
      issue('order', raw.id, 'warn', 'missing_total', 'order has no parseable total')
    run.op({ stage: 'transform', entity: 'order', wpId: raw.id, action: 'insert' })
  }
  return { orders, items }
}

// ---------------------------------------------------------------------------
// coupons: archive only
// ---------------------------------------------------------------------------

function transformCoupons(run, rawCoupons) {
  return rawCoupons.map((raw) => {
    run.op({ stage: 'transform', entity: 'coupon_code', wpId: raw.id, action: 'insert' })
    return {
      wp_post_id: raw.id,
      code: cleanText(raw.code),
      discount_type: raw.discount_type ?? null,
      amount: parsePrice(raw.amount),
      usage_limit: Number.parseInt(raw.usage_limit, 10) || null,
      usage_count: Number.parseInt(raw.usage_count, 10) || 0,
      expires_at_wp: toIso(raw.date_expires),
      status_raw: raw.status ?? null,
      raw_meta: metaMap(raw.meta_data),
    }
  })
}

// ---------------------------------------------------------------------------
// url_inventory: every old path and where it should land
// ---------------------------------------------------------------------------

/**
 * The comparison form of a path. Must stay identical to the normalisation the
 * proxy applies to an incoming request, or a row written here will never match
 * the request it was written for.
 *
 * Lowercased, percent-decoded, NFC-normalised, no trailing slash, no query.
 * NFC matters for Hebrew specifically: the same word can be encoded composed or
 * decomposed, the two are different byte strings, and a browser and a database
 * will disagree about them forever unless both are normalised.
 */
export function normalizePath(path) {
  if (!path) return ''
  let out = String(path).split('#')[0].split('?')[0]
  try {
    out = decodeURIComponent(out)
  } catch {
    // A malformed percent sequence is left as-is rather than throwing: a bad
    // legacy URL should still get a row.
  }
  out = out.normalize('NFC').toLowerCase().replace(/\/+$/, '')
  return out || '/'
}

/** meta values arrive as a scalar for one occurrence and an array for several. */
function toArray(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

export function buildUrlInventory(products, categories, excludedProducts = []) {
  const rows = []
  for (const p of products) {
    if (p.post_type !== 'product') continue
    // The target is the slug we are ACTUALLY going to store, which is the
    // deduped one. Using slug_decoded here sent a collided product's old URL to
    // the slug the winner took, so a customer following a two-year-old link
    // landed on a different product's page and could buy the wrong thing.
    const finalSlug = p.proposed_slug || p.slug_decoded
    if (!finalSlug) continue
    const newPath = `${ROUTES.product}/${finalSlug}`
    const oldPath = p.permalink || `${ROUTES.product}/${p.slug_raw ?? p.slug_decoded}`

    rows.push({
      old_path: oldPath,
      sources: ['crawl'],
      entity: 'product',
      entity_wp_id: p.wp_post_id,
      mapped_new_path: newPath,
      // A path that already equals its target needs no redirect row at all.
      // Emitting one produces /product/x -> /product/x, which is a redirect
      // loop and takes the page down rather than moving it.
      direct_match: normalizePath(oldPath) === normalizePath(newPath),
      gone_410: false,
      mapping_rule: 'product_slug',
    })

    // Every slug this post ever had. WordPress records them in _wp_old_slug and
    // each one is a URL that is still indexed and still receives clicks; they
    // are the single largest source of recoverable traffic in a migration, and
    // they are invisible in both the sitemap and the current permalink.
    const oldSlugs = new Set([
      ...(p.raw_post?.old_slugs ?? []),
      ...toArray(p.raw_meta?._wp_old_slug),
    ])
    for (const old of oldSlugs) {
      if (!old || old === finalSlug) continue
      rows.push({
        old_path: `${ROUTES.product}/${old}`,
        sources: ['wp_old_slug'],
        entity: 'product',
        entity_wp_id: p.wp_post_id,
        mapped_new_path: newPath,
        direct_match: false,
        gone_410: false,
        mapping_rule: 'wp_old_slug',
      })
    }
  }
  // A product we chose not to import must 410, not 404: an explicit "this is
  // gone" is a decision, a 404 is an oversight, and Search Console tells the
  // two apart.
  for (const x of excludedProducts) {
    rows.push({
      old_path: x.permalink,
      sources: ['crawl'],
      entity: 'product',
      entity_wp_id: x.wp_post_id,
      mapped_new_path: null,
      direct_match: false,
      gone_410: true,
      mapping_rule: `excluded_status:${x.status_raw}`,
    })
  }
  for (const c of categories) {
    const finalSlug = c.proposed_slug || c.slug_decoded
    if (!finalSlug) continue
    const newPath = `${ROUTES.category}/${finalSlug}`
    const oldPath = c.permalink || `/product-category/${c.slug_raw ?? c.slug_decoded}`
    rows.push({
      old_path: oldPath,
      sources: ['crawl'],
      entity: 'category',
      entity_wp_id: c.wp_term_id,
      mapped_new_path: newPath,
      direct_match: normalizePath(oldPath) === normalizePath(newPath),
      gone_410: false,
      mapping_rule: 'category_slug',
    })
  }
  // one row per old path; a parent and child term can collide on permalink
  const seen = new Set()
  return rows.filter((r) => {
    if (!r.old_path?.startsWith('/') || seen.has(r.old_path)) return false
    seen.add(r.old_path)
    return true
  })
}

// ---------------------------------------------------------------------------

function writeNormalized(name, rows) {
  const file = resolve(PATHS.normalized, `${name}.json`)
  writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`)
  info(
    `  ${name.padEnd(14)} ${String(rows.length).padStart(6)} rows -> ${file.replace(`${PATHS.root}/`, '')}`,
  )
  return rows.length
}

export function readNormalized(name) {
  try {
    return JSON.parse(readFileSync(resolve(PATHS.normalized, `${name}.json`), 'utf8'))
  } catch {
    return []
  }
}

export async function transform(run) {
  ensureDirs()
  issues.length = 0

  const rawCategories = readRaw('category')
  const rawProducts = readRaw('product')
  const rawCustomers = readRaw('customer')
  const rawOrders = readRaw('order')
  const rawCoupons = readRaw('coupon')

  if (rawProducts.length === 0 && rawCategories.length === 0) {
    warn('nothing in wp_import/raw/ - run the extract stage first')
  }

  const limit = (rows) => (RUN.limit ? rows.slice(0, RUN.limit) : rows)

  const categories = transformCategories(run, limit(rawCategories))
  const categoryBySlugId = new Map(categories.map((c) => [String(c.wp_term_id), c.slug_decoded]))
  const { rows: products, excluded: excludedProducts } = transformProducts(
    run,
    limit(rawProducts),
    categoryBySlugId,
  )
  const media = transformMedia(run, limit(rawProducts), limit(rawCategories))
  const customers = transformCustomers(run, limit(rawCustomers))
  const { orders, items } = transformOrders(run, limit(rawOrders))
  const coupons = transformCoupons(run, limit(rawCoupons))
  const urls = buildUrlInventory(products, categories, excludedProducts)

  info('transform output')
  writeNormalized('categories', categories)
  writeNormalized('products', products)
  writeNormalized('media', media)
  writeNormalized('customers', customers)
  writeNormalized('orders', orders)
  writeNormalized('order_items', items)
  writeNormalized('coupons', coupons)
  writeNormalized('url_inventory', urls)
  writeNormalized('issues', issues)

  const errors = issues.filter((i) => i.severity === 'error').length
  if (errors > 0) warn(`${errors} blocking issues recorded in normalized/issues.json`)
  ok(`transform done -> ${PATHS.normalized}`)
  return { categories, products, media, customers, orders, items, coupons, urls, issues }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = new Run({ kind: 'staging_load' })
  await transform(run)
  process.stdout.write(run.summary())
}
