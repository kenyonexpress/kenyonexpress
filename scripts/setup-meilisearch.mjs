#!/usr/bin/env node
/**
 * Creates the Meilisearch products index, applies the settings from
 * src/lib/search/meili-settings.ts, and syncs every active product into it.
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
    return JSON.parse(match[1].replace(/'/g, '"').replace(/,(\s*])/g, '$1'))
  }
  const typo = src.match(/minWordSizeForTypos: \{ oneTypo: (\d+), twoTypos: (\d+) \}/)
  if (!typo) throw new Error('could not read minWordSizeForTypos from meili-settings.ts')

  return {
    searchableAttributes: pick('SEARCHABLE_ATTRIBUTES'),
    filterableAttributes: pick('FILTERABLE_ATTRIBUTES'),
    sortableAttributes: pick('SORTABLE_ATTRIBUTES'),
    rankingRules: pick('RANKING_RULES'),
    stopWords: pick('STOP_WORDS'),
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: Number(typo[1]), twoTypos: Number(typo[2]) },
      disableOnAttributes: ['sku', 'slug', 'barcode'],
    },
  }
}

const HOST = (process.env.MEILISEARCH_HOST ?? '').replace(/\/$/, '')
const KEY = process.env.MEILISEARCH_API_KEY ?? ''
const INDEX = process.env.MEILISEARCH_INDEX ?? 'products'
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

async function loadProducts() {
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
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from('products')
    .select(
      `id, slug, name_he, name_en, brand, short_description_he, description_he, sku,
       type, is_coupon_enabled, kenyon_price, full_price, images, stock_quantity,
       category_id, supplier_id, created_at, categories(name_he, slug)`,
    )
    .eq('status', 'active')
    .is('deleted_at', null)

  if (error) throw new Error(`supabase: ${error.message}`)

  // Supplier names come from a separate read: suppliers RLS is admin-only, and
  // only the public-safe name is indexed (no contact details ever reach Meili).
  const supplierIds = [...new Set((data ?? []).map((p) => p.supplier_id).filter(Boolean))]
  const names = new Map()
  if (supplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .in('id', supplierIds)
    for (const s of suppliers ?? []) names.set(s.id, s.name)
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
      created_at: row.created_at ?? null,
    }
  })
}

async function main() {
  const health = await meili('/health')
  console.log(`setup-meilisearch: ${HOST} is ${health.status}`)

  const existing = await meili('/indexes').then((r) =>
    (r.results ?? []).some((i) => i.uid === INDEX),
  )
  if (!existing) {
    await awaitTask(
      await meili('/indexes', { method: 'POST', body: { uid: INDEX, primaryKey: 'id' } }),
      `create index ${INDEX}`,
    )
    console.log(`setup-meilisearch: created index "${INDEX}"`)
  } else {
    console.log(`setup-meilisearch: index "${INDEX}" already exists`)
  }

  const settings = loadSettings()
  await awaitTask(
    await meili(`/indexes/${INDEX}/settings`, { method: 'PATCH', body: settings }),
    'apply settings',
  )
  console.log(
    `setup-meilisearch: settings applied (typo tolerance oneTypo=${settings.typoTolerance.minWordSizeForTypos.oneTypo}, twoTypos=${settings.typoTolerance.minWordSizeForTypos.twoTypos} — tuned for Hebrew)`,
  )

  if (SETTINGS_ONLY) {
    console.log('setup-meilisearch: --settings-only, skipping product sync.')
    return
  }

  const documents = await loadProducts()
  if (documents.length === 0) {
    console.log('setup-meilisearch: no active products to index.')
    return
  }

  await awaitTask(
    await meili(`/indexes/${INDEX}/documents`, { method: 'PUT', body: documents }),
    'index documents',
  )
  console.log(`setup-meilisearch: indexed ${documents.length} product(s).`)
}

main().catch((error) => {
  console.error(`setup-meilisearch: ${error.message}`)
  process.exit(1)
})
