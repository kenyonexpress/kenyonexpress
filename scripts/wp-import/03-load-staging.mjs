// Stage 3: load. Normalized rows into the wp_import.* staging schema.
//
// Idempotent by construction: every table upserts on its natural WordPress key
// (wp_post_id, wp_term_id, wp_user_id, ...), which is the same key the
// external_id wp:<entity>:<wp_id> is built from. Running this ten times leaves
// the same rows as running it once.
//
// Nothing here writes to public.*. Staging is a landing zone that a human
// curates before stage 4 projects anything into the live catalog.

import { readNormalized } from './02-transform.mjs'
import { DRY_RUN, RUN, dryRunReason } from './config.mjs'
import { getDb, upsertRows } from './lib/db.mjs'
import { Run, info, ok, warn } from './lib/log.mjs'

/**
 * Column allow-list per staging table.
 *
 * The transform stage carries a few derived fields (compare_at_price,
 * projected_status) that are useful in the JSON artifact but have no staging
 * column. Filtering here rather than trimming there keeps the artifact rich
 * and stops a schema drift from turning into a cryptic PostgREST 400.
 */
const TABLES = [
  {
    name: 'categories',
    file: 'categories',
    entity: 'category',
    key: 'wp_term_id',
    columns: [
      'wp_term_id',
      'batch_id',
      'slug_raw',
      'slug_decoded',
      'name_he',
      'description',
      'parent_wp_id',
      'product_count',
      'thumbnail_wp_id',
      'permalink',
      'raw',
    ],
  },
  {
    name: 'products',
    file: 'products',
    entity: 'product',
    key: 'wp_post_id',
    columns: [
      'wp_post_id',
      'batch_id',
      'post_type',
      'wp_parent_id',
      'slug_raw',
      'slug_decoded',
      'permalink',
      'title_he',
      'description_html',
      'excerpt_html',
      'status_raw',
      'sku',
      'regular_price',
      'sale_price',
      'price',
      'currency',
      'manage_stock',
      'stock_status_raw',
      'stock_quantity',
      'is_virtual',
      'product_type_raw',
      'total_sales',
      'attributes',
      'category_wp_ids',
      'tag_names',
      'featured_image_wp_id',
      'gallery_wp_ids',
      'seo_title_raw',
      'seo_description_raw',
      'created_at_wp',
      'modified_at_wp',
      'proposed_slug',
      'target_type',
      'raw_meta',
      'raw_post',
    ],
  },
  {
    name: 'media',
    file: 'media',
    entity: 'media',
    key: 'wp_attachment_id',
    columns: [
      'wp_attachment_id',
      'batch_id',
      'wp_parent_post_id',
      'source_url',
      'file_name',
      'mime_type',
      'alt_text',
      'title',
      'width',
      'height',
      'byte_size',
      'sha256',
      'status',
      'bucket',
      'created_at_wp',
      'raw',
    ],
  },
  {
    name: 'customers',
    file: 'customers',
    entity: 'customer',
    key: 'wp_user_id',
    columns: [
      'wp_user_id',
      'batch_id',
      'email_raw',
      'email_normalized',
      'display_name',
      'first_name',
      'last_name',
      'phone_raw',
      'phone_normalized',
      'registered_at',
      'last_active_at',
      'is_paying_customer',
      'orders_count',
      'total_spent',
      'billing',
      'shipping',
      'newsletter_optin_raw',
      'raw_meta',
    ],
  },
  {
    name: 'orders',
    file: 'orders',
    entity: 'order',
    key: 'wp_order_id',
    columns: [
      'wp_order_id',
      'batch_id',
      'storage_source',
      'order_number',
      'status_raw',
      'currency',
      'customer_wp_id',
      'billing_email',
      'billing_phone',
      'billing',
      'shipping',
      'subtotal',
      'discount_total',
      'shipping_total',
      'tax_total',
      'total',
      'refunded_total',
      'payment_method',
      'payment_method_title',
      'transaction_id',
      'customer_note',
      'created_at_wp',
      'paid_at_wp',
      'completed_at_wp',
      'raw',
    ],
  },
  {
    // after orders: order_items has an FK onto wp_import.orders
    name: 'order_items',
    file: 'order_items',
    entity: 'order_item',
    key: 'wp_order_item_id',
    columns: [
      'wp_order_item_id',
      'wp_order_id',
      'batch_id',
      'item_type',
      'product_wp_id',
      'variation_wp_id',
      'item_name',
      'quantity',
      'line_subtotal',
      'line_total',
      'line_tax',
      'meta',
    ],
  },
  {
    name: 'coupons',
    file: 'coupons',
    entity: 'coupon_code',
    key: 'wp_post_id',
    columns: [
      'wp_post_id',
      'batch_id',
      'code',
      'discount_type',
      'amount',
      'usage_limit',
      'usage_count',
      'expires_at_wp',
      'status_raw',
      'raw_meta',
    ],
  },
  {
    name: 'url_inventory',
    file: 'url_inventory',
    entity: 'redirect',
    key: 'old_path',
    columns: [
      'old_path',
      'batch_id',
      'sources',
      'entity',
      'entity_wp_id',
      'mapped_new_path',
      'direct_match',
      'gone_410',
      'mapping_rule',
    ],
  },
]

function project(row, columns, batchId) {
  const out = {}
  for (const column of columns) {
    if (column === 'batch_id') {
      out.batch_id = batchId
    } else if (row[column] !== undefined) {
      out[column] = row[column]
    }
  }
  return out
}

/**
 * Open an import_batches row for this run, so every staged row and log entry
 * carries a real batch_id. In a dry run there is no row to open: the run keeps
 * its local uuid and batch_id stays null on the previewed payloads.
 */
async function openBatch(run, db) {
  if (DRY_RUN || !db) return null
  const { data, error } = await db
    .schema('wp_import')
    .from('import_batches')
    .insert({
      id: run.batchId,
      kind: 'staging_load',
      wp_site_url: process.env.WC_BASE || null,
      dry_run: false,
      notes: 'scripts/wp-import/03-load-staging.mjs',
    })
    .select('id')
    .single()
  if (error) throw new Error(`could not open import_batches row: ${error.message}`)
  return data.id
}

async function closeBatch(run, db, batchId) {
  if (!batchId || !db) return
  await db
    .schema('wp_import')
    .from('import_batches')
    .update({ finished_at: new Date().toISOString(), stats: run.counts })
    .eq('id', batchId)
}

export async function loadStaging(run) {
  const db = await getDb()
  if (DRY_RUN) warn(`dry run: nothing will be written (${dryRunReason()})`)

  const batchId = await openBatch(run, db)
  const tables = RUN.entity ? TABLES.filter((t) => t.entity === RUN.entity) : TABLES

  for (const table of tables) {
    const source = readNormalized(table.file)
    if (source.length === 0) {
      info(`  ${table.name.padEnd(14)} nothing to load`)
      continue
    }
    const rows = source.map((row) => project(row, table.columns, batchId))

    try {
      const plan = await upsertRows({
        db,
        schema: 'wp_import',
        table: table.name,
        rows,
        conflictColumn: table.key,
        entity: table.entity,
      })
      let inserted = 0
      let updated = 0
      for (const item of plan) {
        run.op({
          stage: 'load_staging',
          entity: table.entity,
          wpId: item.wpId,
          action: item.action,
          targetTable: item.targetTable,
        })
        if (item.action === 'insert') inserted += 1
        else updated += 1
      }
      info(
        `  ${table.name.padEnd(14)} ${String(rows.length).padStart(6)} rows  (+${inserted} new, ~${updated} existing)`,
      )
    } catch (err) {
      run.fail('load_staging', table.entity, table.name, 'load_failed', err)
      warn(`  ${table.name}: ${err.message}`)
    }
  }

  // issues are findings, not entities: they upsert on their own natural key
  const issues = readNormalized('issues')
  if (issues.length > 0 && db && !DRY_RUN) {
    const { error } = await db
      .schema('wp_import')
      .from('issues')
      .upsert(
        issues.map((i) => ({ ...i, batch_id: batchId })),
        { onConflict: 'entity,wp_id,code' },
      )
    if (error) warn(`issues upsert failed: ${error.message}`)
  }
  info(`  ${'issues'.padEnd(14)} ${String(issues.length).padStart(6)} findings`)

  await run.flush(db)
  await closeBatch(run, db, batchId)
  ok(`load ${DRY_RUN ? 'planned' : 'applied'}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = new Run({ kind: 'staging_load' })
  await loadStaging(run)
  process.stdout.write(run.summary())
}
