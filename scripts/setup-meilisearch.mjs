#!/usr/bin/env node
/**
 * Creates the Meilisearch products, brands and categories indexes, applies the
 * settings from src/lib/search/meili-settings.ts (Hebrew typo budget, synonyms,
 * facets, and the `heb` tokenizer locale pin), syncs every active product, and
 * rebuilds the derived brands and categories indexes from the same read.
 *
 * Idempotent: re-running updates settings and re-pushes documents. Meilisearch
 * upserts on the primary key, so a re-sync never duplicates.
 *
 * Usage (Terminal, from the repo root):
 *   MEILISEARCH_HOST=http://127.0.0.1:7700 MEILISEARCH_API_KEY=<key> \
 *     node scripts/setup-meilisearch.mjs
 *
 * Add --settings-only to skip the product sync (no Supabase needed).
 *
 * Exit codes: 0 ok, 1 misconfigured or a Meilisearch task failed.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// The settings module is TypeScript, and this script runs under plain node.
// Rather than add a build step for one object, the literal is parsed out of the
// source; the test suite asserts the same values, so drift is caught there.
function loadSettings() {
  const src = readFileSync(join(ROOT, 'src/lib/search/meili-settings.ts'), 'utf8')
  const pick = (name) => {
    const match = src.match(new RegExp(`export const ${name} = (\\[[\\s\\S]*?\\]) as const`))
    if (!match) throw new Error(`could not read ${name} from meili-settings.ts`)
    // Strip the // comments first: the arrays carry rationale comments, and a
    // comment inside the literal is a syntax error to JSON.parse. Safe here
    // because none of the string values contains a slash.
    const literal = match[1]
      .replace(/\/\/[^\n]*/g, '')
      .replace(/'/g, '"')
      .replace(/,(\s*])/g, '$1')
    return JSON.parse(literal)
  }
  const typo = src.match(/minWordSizeForTypos: \{ oneTypo: (\d+), twoTypos: (\d+) \}/)
  if (!typo) throw new Error('could not read minWordSizeForTypos from meili-settings.ts')

  const typoTolerance = {
    enabled: true,
    minWordSizeForTypos: { oneTypo: Number(typo[1]), twoTypos: Number(typo[2]) },
    disableOnAttributes: ['sku', 'slug', 'barcode'],
  }

  return {
    settings: {
      searchableAttributes: pick('SEARCHABLE_ATTRIBUTES'),
      filterableAttributes: pick('FILTERABLE_ATTRIBUTES'),
      sortableAttributes: pick('SORTABLE_ATTRIBUTES'),
      rankingRules: pick('RANKING_RULES'),
      stopWords: pick('STOP_WORDS'),
      typoTolerance,
    },
    // Applied in a separate PATCH: localizedAttributes needs Meilisearch 1.10,
    // and an older engine must degrade to a warning, not fail the whole setup.
    localizedAttributes: [
      { attributePatterns: pick('HEBREW_ATTRIBUTE_PATTERNS'), locales: pick('HEBREW_LOCALES') },
    ],
    // Mirrors BRANDS_INDEX_SETTINGS in meili-settings.ts; the typo budget is
    // parsed from the same source so the two cannot drift on the numbers.
    brandsSettings: {
      searchableAttributes: ['name'],
      filterableAttributes: ['categories'],
      sortableAttributes: ['product_count'],
      rankingRules: [
        'words',
        'typo',
        'product_count:desc',
        'proximity',
        'attribute',
        'sort',
        'exactness',
      ],
      stopWords: [],
      typoTolerance: {
        enabled: true,
        minWordSizeForTypos: { ...typoTolerance.minWordSizeForTypos },
        disableOnAttributes: [],
      },
    },
    brandsLocalizedAttributes: [{ attributePatterns: ['name'], locales: pick('HEBREW_LOCALES') }],
    // Mirrors CATEGORIES_INDEX_SETTINGS in meili-settings.ts, typo budget from
    // the same parse. Categories are a real table, so the documents map rows;
    // the counts come from the same product read that fills the main index.
    categoriesSettings: {
      searchableAttributes: ['name_he', 'name_en', 'description_he'],
      filterableAttributes: ['parent_id', 'slug'],
      sortableAttributes: ['product_count', 'sort_order'],
      rankingRules: [
        'words',
        'typo',
        'product_count:desc',
        'proximity',
        'attribute',
        'sort',
        'exactness',
      ],
      stopWords: pick('STOP_WORDS'),
      typoTolerance: {
        enabled: true,
        minWordSizeForTypos: { ...typoTolerance.minWordSizeForTypos },
        disableOnAttributes: [],
      },
    },
    categoriesLocalizedAttributes: [
      { attributePatterns: ['name_he', 'description_he'], locales: pick('HEBREW_LOCALES') },
    ],
  }
}

const HOST = (process.env.MEILISEARCH_HOST ?? '').replace(/\/$/, '')
const KEY = process.env.MEILISEARCH_API_KEY ?? ''
const INDEX = process.env.MEILISEARCH_INDEX ?? 'products'
const BRANDS_INDEX = process.env.MEILISEARCH_BRANDS_INDEX ?? 'brands'
const CATEGORIES_INDEX = process.env.MEILISEARCH_CATEGORIES_INDEX ?? 'categories'
const SETTINGS_ONLY = process.argv.includes('--settings-only')

if (!HOST) {
  console.error('setup-meilisearch: MEILISEARCH_HOST is not set.')
  process.exit(1)
}

async function meili(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${text}`)
  }
  return json
}

/** Meilisearch writes are async; a task that fails must fail this script. */
async function awaitTask(task, label) {
  if (!task?.taskUid && task?.taskUid !== 0) return
  for (let attempt = 0; attempt < 120; attempt++) {
    const status = await meili(`/tasks/${task.taskUid}`)
    if (status.status === 'succeeded') return
    if (status.status === 'failed' || status.status === 'canceled') {
      throw new Error(`${label} ${status.status}: ${JSON.stringify(status.error)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`${label} did not finish in 30s`)
}

async function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      'setup-meilisearch: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed to sync products.\n' +
        '  Pass --settings-only to configure the index without syncing.',
    )
    process.exit(1)
  }

  const { createClient } = await import('@supabase/supabase-js')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function loadProducts(supabase) {
  const { data, error } = await supabase
    .from('products')
    .select(
      `id, slug, name_he, name_en, brand, short_description_he, description_he, sku,
       type, is_coupon_enabled, kenyon_price, full_price, images, stock_quantity,
       category_id, supplier_id, city, tags, created_at, categories(name_he, slug)`,
    )
    .eq('status', 'active')
    .is('deleted_at', null)

  if (error) throw new Error(`supabase: ${error.message}`)

  // Supplier names come from a separate read: suppliers RLS is admin-only, and
  // only the public-safe name is indexed (no contact details ever reach Meili).
  const supplierIds = [...new Set((data ?? []).map((p) => p.supplier_id).filter(Boolean))]
  const names = new Map()
  const cities = new Map()
  if (supplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name, city')
      .in('id', supplierIds)
    for (const s of suppliers ?? []) {
      names.set(s.id, s.name)
      if (typeof s.city === 'string' && s.city.trim()) cities.set(s.id, s.city.trim())
    }
  }

  return (data ?? []).map((row) => {
    const category = Array.isArray(row.categories) ? (row.categories[0] ?? null) : row.categories
    return {
      id: row.id,
      slug: row.slug,
      name_he: row.name_he,
      name_en: row.name_en ?? null,
      brand: row.brand ?? null,
      short_description_he: row.short_description_he ?? null,
      description_he: row.description_he ?? null,
      sku: row.sku ?? null,
      type: row.type === 'coupon' || row.is_coupon_enabled ? 'coupon' : (row.type ?? 'physical'),
      kenyon_price: row.kenyon_price ?? null,
      full_price: row.full_price ?? null,
      images: row.images ?? [],
      stock_quantity: row.stock_quantity ?? null,
      in_stock: row.stock_quantity == null || row.stock_quantity > 0,
      category_id: row.category_id ?? null,
      category_slug: category?.slug ?? null,
      category_name_he: category?.name_he ?? null,
      supplier_id: row.supplier_id ?? null,
      supplier_name: row.supplier_id ? (names.get(row.supplier_id) ?? null) : null,
      // The same COALESCE the indexer resolves: the product's own city wins,
      // the supplier's carries the rest. Tags index as a clean string array.
      city:
        (typeof row.city === 'string' && row.city.trim()) ||
        (row.supplier_id ? (cities.get(row.supplier_id) ?? null) : null) ||
        null,
      tags: Array.isArray(row.tags)
        ? row.tags.filter((t) => typeof t === 'string' && t.trim().length > 0)
        : [],
      created_at: row.created_at ?? null,
    }
  })
}

async function ensureIndex(uid) {
  const existing = await meili('/indexes').then((r) => (r.results ?? []).some((i) => i.uid === uid))
  if (!existing) {
    await awaitTask(
      await meili('/indexes', { method: 'POST', body: { uid, primaryKey: 'id' } }),
      `create index ${uid}`,
    )
    console.log(`setup-meilisearch: created index "${uid}"`)
  } else {
    console.log(`setup-meilisearch: index "${uid}" already exists`)
  }
}

/**
 * `localizedAttributes` pins the tokenizer's language detection to Hebrew for
 * the Hebrew-content fields. The setting exists from Meilisearch 1.10; an
 * older engine rejects the key, and that must cost a warning, not the setup.
 */
async function applyLocalized(uid, localizedAttributes) {
  try {
    await awaitTask(
      await meili(`/indexes/${uid}/settings`, { method: 'PATCH', body: { localizedAttributes } }),
      `apply localizedAttributes to ${uid}`,
    )
    console.log(`setup-meilisearch: Hebrew tokenizer locales pinned on "${uid}" (heb)`)
  } catch (error) {
    console.warn(
      `setup-meilisearch: WARNING, localizedAttributes not applied to "${uid}" ` +
        `(needs Meilisearch >= 1.10): ${error.message}`,
    )
  }
}

/**
 * One document per distinct brand, aggregated from the product documents.
 * Mirrors toBrandDocuments in meili-settings.ts, which the test suite covers;
 * grouping is case- and whitespace-insensitive, the first spelling wins, and
 * the id is base64url because Meilisearch ids only allow [A-Za-z0-9_-].
 */
/**
 * One document per active category. Mirrors toCategoryDocuments in
 * meili-settings.ts, which the test suite covers: counts come from the SAME
 * product documents just pushed to the main index, so a chip's number can
 * never describe a different catalogue than the one indexed.
 */
async function loadCategories(supabase) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, parent_id, slug, name_he, name_en, description_he, image_url, sort_order')
    .eq('is_active', true)
    .is('deleted_at', null)
  if (error) throw new Error(`supabase categories: ${error.message}`)
  return data ?? []
}

function toCategoryDocuments(categories, products) {
  const productCount = new Map()
  const couponCount = new Map()
  for (const product of products) {
    if (!product.category_id) continue
    productCount.set(product.category_id, (productCount.get(product.category_id) ?? 0) + 1)
    if (product.type === 'coupon') {
      couponCount.set(product.category_id, (couponCount.get(product.category_id) ?? 0) + 1)
    }
  }
  return categories
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name_he: row.name_he,
      name_en: row.name_en ?? null,
      description_he: row.description_he ?? null,
      parent_id: row.parent_id ?? null,
      image_url: row.image_url ?? null,
      sort_order: row.sort_order ?? 0,
      product_count: productCount.get(row.id) ?? 0,
      coupon_count: couponCount.get(row.id) ?? 0,
    }))
    .sort((a, b) => a.sort_order - b.sort_order || a.name_he.localeCompare(b.name_he, 'he'))
}

function toBrandDocuments(products) {
  const byKey = new Map()
  for (const row of products) {
    const name = typeof row.brand === 'string' ? row.brand.trim() : ''
    if (!name) continue
    const key = name.toLowerCase().replace(/\s+/g, ' ')
    let doc = byKey.get(key)
    if (!doc) {
      doc = {
        id: Buffer.from(key, 'utf8').toString('base64url'),
        name,
        product_count: 0,
        coupon_count: 0,
        categories: new Set(),
      }
      byKey.set(key, doc)
    }
    doc.product_count += 1
    if (row.type === 'coupon') doc.coupon_count += 1
    if (row.category_slug) doc.categories.add(row.category_slug)
  }
  return [...byKey.values()]
    .map((d) => ({ ...d, categories: [...d.categories].sort() }))
    .sort((a, b) => b.product_count - a.product_count)
}

async function main() {
  const health = await meili('/health')
  console.log(`setup-meilisearch: ${HOST} is ${health.status}`)

  await ensureIndex(INDEX)
  await ensureIndex(BRANDS_INDEX)
  await ensureIndex(CATEGORIES_INDEX)

  const {
    settings,
    localizedAttributes,
    brandsSettings,
    brandsLocalizedAttributes,
    categoriesSettings,
    categoriesLocalizedAttributes,
  } = loadSettings()
  await awaitTask(
    await meili(`/indexes/${INDEX}/settings`, { method: 'PATCH', body: settings }),
    'apply settings',
  )
  console.log(
    `setup-meilisearch: settings applied (typo tolerance oneTypo=${settings.typoTolerance.minWordSizeForTypos.oneTypo}, twoTypos=${settings.typoTolerance.minWordSizeForTypos.twoTypos}: tuned for Hebrew)`,
  )
  await awaitTask(
    await meili(`/indexes/${BRANDS_INDEX}/settings`, { method: 'PATCH', body: brandsSettings }),
    'apply brands settings',
  )
  await awaitTask(
    await meili(`/indexes/${CATEGORIES_INDEX}/settings`, {
      method: 'PATCH',
      body: categoriesSettings,
    }),
    'apply categories settings',
  )
  await applyLocalized(INDEX, localizedAttributes)
  await applyLocalized(BRANDS_INDEX, brandsLocalizedAttributes)
  await applyLocalized(CATEGORIES_INDEX, categoriesLocalizedAttributes)

  if (SETTINGS_ONLY) {
    console.log('setup-meilisearch: --settings-only, skipping product sync.')
    return
  }

  const supabase = await createSupabase()
  const documents = await loadProducts(supabase)
  if (documents.length === 0) {
    // Keep going: the derived indexes still need their rebuild, and a category
    // with zero products is a real (if sad) state the index should describe.
    console.log('setup-meilisearch: no active products to index.')
  } else {
    await awaitTask(
      await meili(`/indexes/${INDEX}/documents`, { method: 'PUT', body: documents }),
      'index documents',
    )
    console.log(`setup-meilisearch: indexed ${documents.length} product(s).`)
  }

  // The brands index is derived, so it is REBUILT rather than merged: a brand
  // whose last product left the catalogue must leave the index too, and an
  // upsert alone would keep it forever.
  const brands = toBrandDocuments(documents)
  await awaitTask(
    await meili(`/indexes/${BRANDS_INDEX}/documents`, { method: 'DELETE' }),
    'clear brands index',
  )
  if (brands.length > 0) {
    await awaitTask(
      await meili(`/indexes/${BRANDS_INDEX}/documents`, { method: 'PUT', body: brands }),
      'index brand documents',
    )
  }
  console.log(`setup-meilisearch: indexed ${brands.length} brand(s).`)

  // Categories are rebuilt for the same reason brands are: a category
  // deactivated in the catalogue must leave the index, and an upsert alone
  // would keep it forever.
  const categoryDocuments = toCategoryDocuments(await loadCategories(supabase), documents)
  await awaitTask(
    await meili(`/indexes/${CATEGORIES_INDEX}/documents`, { method: 'DELETE' }),
    'clear categories index',
  )
  if (categoryDocuments.length > 0) {
    await awaitTask(
      await meili(`/indexes/${CATEGORIES_INDEX}/documents`, {
        method: 'PUT',
        body: categoryDocuments,
      }),
      'index category documents',
    )
  }
  console.log(`setup-meilisearch: indexed ${categoryDocuments.length} category document(s).`)
}

main().catch((error) => {
  console.error(`setup-meilisearch: ${error.message}`)
  process.exit(1)
})
