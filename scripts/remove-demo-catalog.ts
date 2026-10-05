#!/usr/bin/env -S pnpm exec tsx
/**
 * Removes the demo catalogue: products whose slug starts with `demo-`, and
 * NOTHING else, from the database `scripts/seed-demo-catalog.ts` targets.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx scripts/remove-demo-catalog.ts            # dry run: lists what --apply would delete
 *   pnpm exec tsx scripts/remove-demo-catalog.ts --apply    # delete
 *
 * WHAT "ONLY demo- SLUGS" MEANS HERE, PRECISELY.
 *
 *   products       slug LIKE 'demo-%', re-checked row by row in code before
 *                  the delete (`selectRemovable`), and SKIPPED when an
 *                  `order_items` row references the product: an order is a
 *                  money record and the product it names must survive it.
 *   media_assets   base_path LIKE 'demo-catalog/%', the keys only this seed writes.
 *   storage        objects under `demo-catalog/` in the product-images bucket
 *                  (or the R2 bucket), best effort and reported.
 *   suppliers      ONLY the twelve fixed ids in the `de30de30-…-1…` namespace,
 *                  and only once no product of any kind references them.
 *
 * The same target guard as the seed: production is refused.
 */

import type { Database } from '@/types/database'
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { checkSeedTarget, refusalMessage } from './seed-target-guard.mjs'
import { DEMO_SLUG_PREFIX, demoCatalogIds } from './seed/demo-catalog-data'
import { loadEnv } from './seed/demo-catalog-env'
import { PRODUCT_IMAGES_BUCKET, isR2Env } from './seed/demo-catalog-images'
import { selectRemovable } from './seed/demo-catalog-rows'

type Admin = SupabaseClient<Database>

const APPLY = new Set(process.argv.slice(2)).has('--apply')
const ASSET_PREFIX = 'demo-catalog/'

async function removeStorageObjects(
  env: Record<string, string | undefined>,
  admin: Admin,
  apply: boolean,
): Promise<void> {
  if (isR2Env(env)) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    })
    let token: string | undefined
    let total = 0
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: env.R2_BUCKET,
          Prefix: ASSET_PREFIX,
          ContinuationToken: token,
        }),
      )
      const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k))
      total += keys.length
      if (apply && keys.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: env.R2_BUCKET,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        )
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    console.log(`  ${apply ? 'removed' : 'would remove'} ${total} R2 objects under ${ASSET_PREFIX}`)
    return
  }

  // Supabase Storage lists one folder level at a time; the seed writes
  // demo-catalog/{products,suppliers}/<key>/w*.{webp,avif}.
  const bucket = admin.storage.from(PRODUCT_IMAGES_BUCKET)
  const paths: string[] = []
  for (const group of ['products', 'suppliers']) {
    const { data: folders, error } = await bucket.list(`${ASSET_PREFIX}${group}`, { limit: 1000 })
    if (error) {
      console.log(`  storage list ${ASSET_PREFIX}${group}: ${error.message} (skipped)`)
      continue
    }
    for (const folder of folders ?? []) {
      const dir = `${ASSET_PREFIX}${group}/${folder.name}`
      const { data: files } = await bucket.list(dir, { limit: 100 })
      for (const file of files ?? []) paths.push(`${dir}/${file.name}`)
    }
  }
  if (apply && paths.length > 0) {
    const { error } = await bucket.remove(paths)
    if (error) console.log(`  storage remove: ${error.message}`)
  }
  console.log(
    `  ${apply ? 'removed' : 'would remove'} ${paths.length} storage objects under ${ASSET_PREFIX}`,
  )
}

async function main(): Promise<void> {
  const env = loadEnv()
  const url = env.SEED_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SEED_SUPABASE_URL
    ? env.SEED_SUPABASE_SERVICE_KEY
    : (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY)
  if (!url || !key) {
    console.error('remove-demo-catalog: need a target URL and a service-role key.')
    process.exit(1)
  }
  const verdict = checkSeedTarget({ url, override: env.SEED_ALLOW_PRODUCTION })
  if (!verdict.allowed) {
    console.error(refusalMessage(verdict.ref))
    process.exit(1)
  }
  console.log(
    `target project ${verdict.ref ?? 'unknown host'} (${verdict.reason}); ${APPLY ? 'APPLY' : 'dry run'}`,
  )

  const admin: Admin = createClient<Database>(url, key, { auth: { persistSession: false } })

  // Products: the contract is the slug prefix, nothing else.
  const { data: products, error } = await admin
    .from('products')
    .select('id, slug')
    .like('slug', `${DEMO_SLUG_PREFIX}%`)
  if (error) throw new Error(`products: ${error.message}`)
  const candidates = products ?? []

  const { data: ordered, error: orderedError } = await admin
    .from('order_items')
    .select('product_id')
    .in(
      'product_id',
      candidates.map((p) => p.id),
    )
  if (orderedError) throw new Error(`order_items: ${orderedError.message}`)
  const orderedIds = new Set(
    (ordered ?? []).map((o) => o.product_id).filter((id): id is string => Boolean(id)),
  )

  const { remove, keptForOrders, refusedNotDemo } = selectRemovable(candidates, orderedIds)
  if (refusedNotDemo.length > 0) {
    throw new Error(
      `refusing: non-demo slugs came back from a demo- query: ${refusedNotDemo.map((p) => p.slug).join(', ')}`,
    )
  }
  console.log(`  ${APPLY ? 'removing' : 'would remove'} ${remove.length} products`)
  for (const p of keptForOrders) console.log(`  kept (has order items): ${p.slug}`)

  if (APPLY && remove.length > 0) {
    const { error: delError } = await admin
      .from('products')
      .delete()
      .in(
        'id',
        remove.map((p) => p.id),
      )
      .like('slug', `${DEMO_SLUG_PREFIX}%`)
    if (delError) throw new Error(`delete products: ${delError.message}`)
  }

  // Assets and objects.
  const { data: assets, error: assetError } = await admin
    .from('media_assets')
    .select('id')
    .like('base_path', `${ASSET_PREFIX}%`)
  if (assetError) {
    console.log(`  media_assets: ${assetError.message} (skipped)`)
  } else {
    console.log(
      `  ${APPLY ? 'removing' : 'would remove'} ${(assets ?? []).length} media_assets rows`,
    )
    if (APPLY && (assets ?? []).length > 0) {
      const { error: delAssets } = await admin
        .from('media_assets')
        .delete()
        .like('base_path', `${ASSET_PREFIX}%`)
      if (delAssets) throw new Error(`delete media_assets: ${delAssets.message}`)
    }
  }
  await removeStorageObjects(env, admin, APPLY)

  // Suppliers: fixed namespace, and only the unreferenced ones.
  const supplierIds = demoCatalogIds().suppliers
  const { data: stillReferenced } = await admin
    .from('products')
    .select('supplier_id')
    .in('supplier_id', supplierIds)
  const referenced = new Set((stillReferenced ?? []).map((p) => p.supplier_id))
  const freeSuppliers = supplierIds.filter((id) => !referenced.has(id))
  console.log(
    `  ${APPLY ? 'removing' : 'would remove'} ${freeSuppliers.length} demo suppliers (${supplierIds.length - freeSuppliers.length} still referenced, kept)`,
  )
  if (APPLY && freeSuppliers.length > 0) {
    const { error: delSup } = await admin.from('suppliers').delete().in('id', freeSuppliers)
    if (delSup) throw new Error(`delete suppliers: ${delSup.message}`)
  }

  if (!APPLY) console.log('dry run: nothing deleted. Re-run with --apply.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
