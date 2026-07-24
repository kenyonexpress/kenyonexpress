#!/usr/bin/env node
/**
 * Seeds the deterministic fixtures the E2E suite needs: one test supplier, one
 * test category, one coupon product and one physical product.
 *
 * Design rules this script obeys:
 *  - Idempotent. Every write is an upsert on a fixed UUID, so running it twice
 *    changes nothing. Safe to call at the top of a CI job.
 *  - No migrations. Fixtures are data, not schema; supabase/migrations is owned
 *    elsewhere and is never touched from here.
 *  - Fixed UUIDs in a reserved namespace (…-0e02b2c3dt##) so fixtures are
 *    recognisable in the DB and `--clean` can remove exactly what it created
 *    and nothing else.
 *  - Explicit platform_percent on both products. There is no default commission
 *    anywhere (docs/CONTRADICTIONS.md C1), so a fixture that omitted it would
 *    be teaching the wrong thing.
 *
 * Caveat worth knowing before you run it: both products are seeded `active`,
 * because an E2E run has to be able to browse and buy them. That also means
 * they appear in the catalog, the test category shows up in navigation, and on
 * a SHARED database they are visible to anyone browsing. Run this against a
 * disposable or CI database, and use --clean when you are done with a shared
 * one.
 *
 * Usage (from the repo root):
 *   node scripts/seed-test-data.mjs           # create or update the fixtures
 *   node scripts/seed-test-data.mjs --check   # report what exists, write nothing
 *   node scripts/seed-test-data.mjs --clean   # remove the fixtures
 *
 * Credentials come from the environment, falling back to .env.local.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const args = new Set(process.argv.slice(2))
const CHECK_ONLY = args.has('--check')
const CLEAN = args.has('--clean')

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq < 1 || line.trimStart().startsWith('#')) continue
      const key = line.slice(0, eq).trim()
      if (!env[key]) env[key] = line.slice(eq + 1).trim()
    }
  } catch {
    // No .env.local (CI): the environment is expected to carry the values.
  }
  return env
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY

if (!url || !key) {
  console.error(
    'seed-test-data: missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY.\n' +
      'Set them in the environment or in .env.local.',
  )
  process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false } })

// Reserved fixture namespace — see the header note on --clean.
const IDS = {
  supplier: 'f47ac10b-58cc-4372-a567-0e02b2c3d901',
  category: 'f47ac10b-58cc-4372-a567-0e02b2c3d902',
  couponProduct: 'f47ac10b-58cc-4372-a567-0e02b2c3d903',
  physicalProduct: 'f47ac10b-58cc-4372-a567-0e02b2c3d904',
}

const SUPPLIER = {
  id: IDS.supplier,
  name: 'ספק בדיקות אוטומטיות',
  contact_email: 'e2e@test.kenyonexpress.local',
  contact_phone: '03-0000000',
  commission_percent: 10,
  status: 'active',
  notes: 'פיקסצ׳ר לבדיקות E2E. אין למחוק ידנית — נוצר ע״י scripts/seed-test-data.mjs',
}

const CATEGORY = {
  id: IDS.category,
  slug: 'e2e-test-category',
  name_he: 'קטגוריית בדיקות',
  name_en: 'E2E Test Category',
  description_he: 'קטגוריה לבדיקות אוטומטיות בלבד',
  sort_order: 9999,
  is_active: true,
}

/** Coupon: customer pays platform_percent on site, the rest at the business. */
const COUPON_PRODUCT = {
  id: IDS.couponProduct,
  supplier_id: IDS.supplier,
  category_id: IDS.category,
  slug: 'e2e-test-coupon',
  name_he: 'קופון בדיקות אוטומטיות',
  name_en: 'E2E Test Coupon',
  description_he: 'מוצר קופון לבדיקות אוטומטיות. 400 ש״ח ערך נקוב, 10% באתר.',
  type: 'coupon',
  status: 'active',
  price_ils: 400,
  is_coupon_enabled: true,
  platform_percent: 10,
  cashback_percent: 5,
  commission_percent: 10,
  coupon_expiry_days: 90,
  stock_quantity: 1000,
  requires_shipping: false,
  is_featured: false,
}

/** Physical: customer pays the full price on site. */
const PHYSICAL_PRODUCT = {
  id: IDS.physicalProduct,
  supplier_id: IDS.supplier,
  category_id: IDS.category,
  slug: 'e2e-test-physical',
  name_he: 'מוצר פיזי לבדיקות אוטומטיות',
  name_en: 'E2E Test Physical Product',
  description_he: 'מוצר פיזי לבדיקות אוטומטיות. 100 ש״ח, עמלה 10%.',
  type: 'physical',
  status: 'active',
  price_ils: 100,
  is_coupon_enabled: false,
  platform_percent: 10,
  cashback_percent: 5,
  commission_percent: 10,
  stock_quantity: 1000,
  requires_shipping: true,
  is_featured: false,
}

async function upsert(table, row, label) {
  const { error } = await admin.from(table).upsert(row, { onConflict: 'id' })
  if (error) throw new Error(`${label}: ${error.message}`)
  console.log(`  ok   ${label}`)
}

async function report(table, id, label) {
  const { data, error } = await admin.from(table).select('id').eq('id', id).maybeSingle()
  if (error) throw new Error(`${label}: ${error.message}`)
  console.log(`  ${data ? 'present' : 'MISSING'.padEnd(7)} ${label}`)
  return Boolean(data)
}

async function remove(table, id, label) {
  const { error } = await admin.from(table).delete().eq('id', id)
  if (error) throw new Error(`${label}: ${error.message}`)
  console.log(`  removed ${label}`)
}

async function main() {
  console.log(`seed-test-data: ${url}`)

  if (CHECK_ONLY) {
    console.log('mode: check (no writes)')
    const results = [
      await report('suppliers', IDS.supplier, 'supplier'),
      await report('categories', IDS.category, 'category'),
      await report('products', IDS.couponProduct, 'coupon product'),
      await report('products', IDS.physicalProduct, 'physical product'),
    ]
    process.exit(results.every(Boolean) ? 0 : 1)
  }

  if (CLEAN) {
    console.log('mode: clean')
    // Children first: products reference the supplier and the category.
    await remove('products', IDS.couponProduct, 'coupon product')
    await remove('products', IDS.physicalProduct, 'physical product')
    await remove('categories', IDS.category, 'category')
    await remove('suppliers', IDS.supplier, 'supplier')
    console.log('seed-test-data: fixtures removed')
    return
  }

  console.log('mode: seed (idempotent upserts)')
  await upsert('suppliers', SUPPLIER, 'supplier')
  await upsert('categories', CATEGORY, 'category')
  await upsert('products', COUPON_PRODUCT, 'coupon product')
  await upsert('products', PHYSICAL_PRODUCT, 'physical product')
  console.log('seed-test-data: done')
}

main().catch((error) => {
  console.error(`seed-test-data: ${error.message}`)
  process.exit(1)
})
