#!/usr/bin/env -S pnpm exec tsx
/**
 * Seeds the demo catalogue (queue item W04): 12 suppliers, 60 coupons and 12
 * physical products with `demo-` slugs across the eleven live categories, each
 * with an 800x800 webp+avif image set, into a NON-PRODUCTION database.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx scripts/seed-demo-catalog.ts            # dry run: plan + images to .image-staging/, writes nothing
 *   pnpm exec tsx scripts/seed-demo-catalog.ts --apply    # write to the database NEXT_PUBLIC_SUPABASE_URL names
 *   pnpm exec tsx scripts/seed-demo-catalog.ts --check    # read-only: how many demo- rows the target holds
 *
 * WHICH DATABASE. `SEED_SUPABASE_URL` + `SEED_SUPABASE_SERVICE_KEY` when set,
 * otherwise `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`/
 * `SUPABASE_SECRET_KEY`, from the environment or `.env.local`. Before the
 * first write the target goes through `scripts/seed-target-guard.mjs`, which
 * REFUSES the production project ref. There is no dev database on this
 * machine today (docs/SEED.md: one hosted project, `supabase start` does not
 * run); the dry run is what can be exercised here, and `--apply` is for the
 * day a disposable project exists.
 *
 * WHY THE SUPABASE ADMIN CLIENT AND NOT A SERVER ACTION OR DRIZZLE. The
 * application's own write path is `createProduct` in
 * `src/server/actions/admin/products.ts`, which needs a staff session and a
 * multipart request; a script has neither. Drizzle (`drizzle.config.ts`) wants
 * `SUPABASE_DB_URL`, which is not configured anywhere here, and its schema
 * (`src/db/schema/`) has no `products` table. So the rows are built by the
 * same pure money module the action uses (`scripts/seed/demo-catalog-rows.ts`)
 * and written with the service-role client, the way `seed-test-data.mjs` does.
 *
 * IDEMPOTENT. Fixed ids, `upsert ... onConflict id`; images under fixed keys,
 * uploaded with upsert. Running it twice leaves one copy.
 */

import type { Database } from '@/types/database'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { checkSeedTarget, refusalMessage } from './seed-target-guard.mjs'
import {
  DEMO_CATEGORY_SLUGS,
  DEMO_PRODUCTS,
  DEMO_SLUG_PREFIX,
  DEMO_SUPPLIERS,
  type DemoProduct,
  type DemoSupplier,
  countsByCategory,
  supplierOf,
} from './seed/demo-catalog-data'
import { loadEnv } from './seed/demo-catalog-env'
import {
  type ImageSink,
  STAGING_DIR,
  buildImageSet,
  categoryHue,
  createR2Sink,
  createStagingSink,
  createSupabaseStorageSink,
  isR2Env,
  storeImageSet,
} from './seed/demo-catalog-images'
import { toMediaAssetRow, toProductRow, toSupplierRow } from './seed/demo-catalog-rows'

type Admin = SupabaseClient<Database>

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const CHECK = args.has('--check')

function mediaAssetId(kind: 'supplier' | 'product', index: number): string {
  return `de30de30-0000-4000-8000-3${kind === 'supplier' ? '0' : '1'}${String(index).padStart(10, '0')}`
}

function printPlan(): void {
  const counts = countsByCategory()
  console.log(
    `demo catalogue: ${DEMO_SUPPLIERS.length} suppliers, ${DEMO_PRODUCTS.length} products`,
  )
  console.log(
    `  coupons ${DEMO_PRODUCTS.filter((p) => p.type === 'coupon').length}, physical ${DEMO_PRODUCTS.filter((p) => p.type === 'physical').length}`,
  )
  for (const slug of DEMO_CATEGORY_SLUGS) {
    const c = counts[slug]
    console.log(
      `  ${slug.padEnd(18)} coupons ${String(c.coupons).padStart(2)}  physical ${String(c.physical).padStart(2)}`,
    )
  }
}

type RenderedSet = Awaited<ReturnType<typeof storeImageSet>>

async function renderSupplierLogo(sink: ImageSink, supplier: DemoSupplier): Promise<RenderedSet> {
  const processed = await buildImageSet({ title: supplier.name, caption: supplier.city, hue: 210 })
  return storeImageSet(sink, supplier.logoKey, processed)
}

async function renderProductImage(sink: ImageSink, product: DemoProduct): Promise<RenderedSet> {
  const supplier = supplierOf(product)
  const processed = await buildImageSet({
    title: product.nameHe,
    caption: `${supplier.name} · ${supplier.city}`,
    hue: categoryHue(product.categorySlug),
  })
  return storeImageSet(sink, product.imageKey, processed)
}

/** Dry run: the plan, every image through the pipeline into staging, no database. */
async function dryRun(): Promise<void> {
  printPlan()
  const sink = createStagingSink()
  let files = 0
  let bytes = 0
  const started = Date.now()
  for (const supplier of DEMO_SUPPLIERS) {
    const set = await renderSupplierLogo(sink, supplier)
    files += set.webp.length + set.avif.length
    bytes += set.bytes
  }
  for (const product of DEMO_PRODUCTS) {
    const set = await renderProductImage(sink, product)
    files += set.webp.length + set.avif.length
    bytes += set.bytes
    // Build the row too, so a dry run proves the money and the publish gate
    // for every product, not just the images.
    toProductRow(product, {
      categoryId: '00000000-0000-4000-8000-000000000000',
      imageUrl: set.mainUrl,
      supplierLogoUrl: 'staging://logo',
      now: new Date(),
    })
  }
  console.log(
    `images: ${files} files, ${(bytes / 1024).toFixed(0)} KiB, ${((Date.now() - started) / 1000).toFixed(1)}s -> ${STAGING_DIR}/demo-catalog/`,
  )
  console.log('rows: all 72 built and passed the publish gate')
  console.log(
    'dry run: nothing written to any database. Use --apply against a non-production project.',
  )
}

type Target = { url: string; key: string | null; anon: string | null; ref: string | null }

function resolveTarget(env: Record<string, string | undefined>): Target {
  const url = env.SEED_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    console.error('seed-demo-catalog: no SEED_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.')
    process.exit(1)
  }
  const key = env.SEED_SUPABASE_URL
    ? (env.SEED_SUPABASE_SERVICE_KEY ?? null)
    : (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY ?? null)
  const verdict = checkSeedTarget({ url, override: env.SEED_ALLOW_PRODUCTION })
  return { url, key, anon: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null, ref: verdict.ref }
}

/** Read-only. Works with the anon key too, because `products` is publicly readable. */
async function check(env: Record<string, string | undefined>): Promise<void> {
  const target = resolveTarget(env)
  const key = target.key ?? target.anon
  if (!key) {
    console.error('seed-demo-catalog --check: no key to read with.')
    process.exit(1)
  }
  const client = createClient<Database>(target.url, key)
  const { data, error } = await client
    .from('products')
    .select('slug, type, status')
    .like('slug', `${DEMO_SLUG_PREFIX}%`)
  if (error) {
    console.error(`check failed: ${error.message}`)
    process.exit(1)
  }
  const rows = data ?? []
  const active = rows.filter((r) => r.status === 'active')
  console.log(
    `target project ${target.ref ?? 'unknown'}: ${rows.length} demo- products (${active.length} active)`,
  )
  console.log(
    `  coupons ${rows.filter((r) => r.type === 'coupon').length}, physical ${rows.filter((r) => r.type === 'physical').length}`,
  )
}

async function pickSink(env: Record<string, string | undefined>, admin: Admin): Promise<ImageSink> {
  if (isR2Env(env)) {
    console.log(`images -> R2 bucket ${env.R2_BUCKET}`)
    return createR2Sink(env)
  }
  console.log('images -> Supabase Storage product-images (R2 not configured)')
  return createSupabaseStorageSink(admin)
}

async function apply(env: Record<string, string | undefined>): Promise<void> {
  const target = resolveTarget(env)
  const verdict = checkSeedTarget({ url: target.url, override: env.SEED_ALLOW_PRODUCTION })
  if (!verdict.allowed) {
    console.error(refusalMessage(verdict.ref))
    console.error(
      '\nseed-demo-catalog: these are 72 demo rows with `demo-` slugs; production is not where they go.',
    )
    process.exit(1)
  }
  if (!target.key) {
    console.error('seed-demo-catalog --apply: no service-role key for the target.')
    process.exit(1)
  }
  printPlan()
  console.log(`target project ${verdict.ref ?? 'unknown host'} (${verdict.reason})`)

  const admin: Admin = createClient<Database>(target.url, target.key, {
    auth: { persistSession: false },
  })

  // 1. Categories by slug. Never invented: a missing one stops the run.
  const { data: categories, error: catError } = await admin
    .from('categories')
    .select('id, slug')
    .in('slug', [...DEMO_CATEGORY_SLUGS])
  if (catError) throw new Error(`categories: ${catError.message}`)
  const categoryId = new Map((categories ?? []).map((c) => [c.slug, c.id]))
  const missing = DEMO_CATEGORY_SLUGS.filter((slug) => !categoryId.has(slug))
  if (missing.length > 0) {
    throw new Error(
      `target lacks categories: ${missing.join(', ')}. Apply 018_seed_categories.sql first.`,
    )
  }

  const sink = await pickSink(env, admin)
  const now = new Date()

  // 2. Suppliers, logo first so the publish gate sees one.
  const logoUrl = new Map<string, string>()
  for (const [i, supplier] of DEMO_SUPPLIERS.entries()) {
    const set = await renderSupplierLogo(sink, supplier)
    logoUrl.set(supplier.id, set.mainUrl)
    const { error } = await admin.from('media_assets').upsert(
      toMediaAssetRow({
        id: mediaAssetId('supplier', i + 1),
        altHe: `לוגו ${supplier.name}`,
        basePath: supplier.logoKey,
        provider: sink.name === 'r2' ? 'r2' : 'supabase',
        bucket: sink.bucket,
        ...set,
      }),
      { onConflict: 'id' },
    )
    if (error) throw new Error(`media_assets ${supplier.logoKey}: ${error.message}`)
    const { error: supError } = await admin
      .from('suppliers')
      .upsert(toSupplierRow(supplier, set.mainUrl), { onConflict: 'id' })
    if (supError) throw new Error(`supplier ${supplier.name}: ${supError.message}`)
    console.log(`  ok supplier ${supplier.name}`)
  }

  // 3. Products.
  for (const [i, product] of DEMO_PRODUCTS.entries()) {
    const set = await renderProductImage(sink, product)
    const { error: assetError } = await admin.from('media_assets').upsert(
      toMediaAssetRow({
        id: mediaAssetId('product', i + 1),
        altHe: product.nameHe,
        basePath: product.imageKey,
        provider: sink.name === 'r2' ? 'r2' : 'supabase',
        bucket: sink.bucket,
        ...set,
      }),
      { onConflict: 'id' },
    )
    if (assetError) throw new Error(`media_assets ${product.imageKey}: ${assetError.message}`)
    const row = toProductRow(product, {
      categoryId: categoryId.get(product.categorySlug) as string,
      imageUrl: set.mainUrl,
      supplierLogoUrl: logoUrl.get(product.supplierId) as string,
      now,
    })
    const { error } = await admin.from('products').upsert(row, { onConflict: 'id' })
    if (error) throw new Error(`product ${product.slug}: ${error.message}`)
    console.log(`  ok ${product.type.padEnd(8)} ${product.slug}`)
  }

  // 4. Read back what the storefront will see.
  await check(env)
}

async function main(): Promise<void> {
  const env = loadEnv()
  if (CHECK) return check(env)
  if (APPLY) return apply(env)
  return dryRun()
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
