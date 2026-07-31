// Stage 1: extract. Live WooCommerce (or a restored dump) into wp_import/raw/.
//
// Nothing is transformed here. Every payload is archived verbatim, one file
// per source page, because the raw archive is the audit trail: any mapped row
// must be traceable back to the bytes it came from (doc 5.4).
//
// Checkpointing is per page. A crash at product page 47 of 130 resumes at 47
// with --resume, not at 1. That matters when the source is a live store we are
// deliberately reading slowly.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PATHS, RUN, WC, ensureDirs } from './config.mjs'
import { wcPages } from './lib/http.mjs'
import { Run, info, ok, warn } from './lib/log.mjs'
import { readWooCsv, readWxr } from './lib/wxr.mjs'

// Fields we ask WooCommerce for. Explicit rather than the full payload: the
// full payload on a large catalog is tens of megabytes of markup we discard.
const PRODUCT_FIELDS = [
  'id',
  'name',
  'slug',
  'permalink',
  'type',
  'status',
  'featured',
  'description',
  'short_description',
  'sku',
  'price',
  'regular_price',
  'sale_price',
  'on_sale',
  'stock_status',
  'stock_quantity',
  'manage_stock',
  'virtual',
  'downloadable',
  'weight',
  'dimensions',
  'categories',
  'tags',
  'images',
  'attributes',
  'variations',
  'total_sales',
  'date_created_gmt',
  'date_modified_gmt',
  'meta_data',
].join(',')

const CATEGORY_FIELDS = 'id,name,slug,parent,description,display,image,menu_order,count'
const CUSTOMER_FIELDS = [
  'id',
  'email',
  'first_name',
  'last_name',
  'username',
  'role',
  'date_created_gmt',
  'date_modified_gmt',
  'billing',
  'shipping',
  'is_paying_customer',
  'meta_data',
].join(',')
const ORDER_FIELDS = [
  'id',
  'number',
  'status',
  'currency',
  'customer_id',
  'customer_note',
  'date_created_gmt',
  'date_paid_gmt',
  'date_completed_gmt',
  'discount_total',
  'shipping_total',
  'total_tax',
  'total',
  'payment_method',
  'payment_method_title',
  'transaction_id',
  'billing',
  'shipping',
  'line_items',
  'coupon_lines',
  'refunds',
  'meta_data',
].join(',')

/** Every collection we pull, in dependency order. */
const SOURCES = [
  {
    entity: 'category',
    path: 'products/categories',
    params: { _fields: CATEGORY_FIELDS, orderby: 'id', order: 'asc' },
  },
  {
    entity: 'product',
    path: 'products',
    params: { _fields: PRODUCT_FIELDS, status: 'any', orderby: 'id', order: 'asc' },
  },
  {
    entity: 'customer',
    path: 'customers',
    params: { _fields: CUSTOMER_FIELDS, role: 'all', orderby: 'id', order: 'asc' },
  },
  {
    entity: 'order',
    path: 'orders',
    params: { _fields: ORDER_FIELDS, status: 'any', orderby: 'id', order: 'asc' },
  },
  { entity: 'coupon', path: 'coupons', params: { status: 'any', orderby: 'id', order: 'asc' } },
]

function pagePath(entity, page) {
  return resolve(PATHS.raw, `${entity}_page_${String(page).padStart(4, '0')}.json`)
}

function writePage(entity, page, rows, meta) {
  writeFileSync(
    pagePath(entity, page),
    `${JSON.stringify({ entity, page, fetched_at: new Date().toISOString(), source: meta, rows }, null, 2)}\n`,
  )
}

/** Read back every archived page of one entity. The transform stage's input. */
export function readRaw(entity) {
  ensureDirs()
  const prefix = `${entity}_page_`
  const files = readdirSync(PATHS.raw)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
  const rows = []
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(resolve(PATHS.raw, file), 'utf8'))
    rows.push(...parsed.rows)
  }
  return rows
}

async function extractRest(run, source) {
  let fetched = 0
  let skipped = 0
  for await (const { page, rows, total, totalPages } of wcPages(source.path, source.params)) {
    if (RUN.resume && existsSync(pagePath(source.entity, page))) {
      skipped += 1
      continue
    }
    writePage(source.entity, page, rows, { base: WC.base, path: source.path, total, totalPages })
    fetched += rows.length
    run.op({ stage: 'extract', entity: source.entity, wpId: `page:${page}`, action: 'insert' })
    info(
      `  ${source.entity}: page ${page}${totalPages ? `/${totalPages}` : ''} (${rows.length} rows)`,
    )
    if (RUN.limit && fetched >= RUN.limit) {
      warn(`  ${source.entity}: stopping at --limit ${RUN.limit}`)
      break
    }
  }
  if (skipped) info(`  ${source.entity}: ${skipped} pages already checkpointed, skipped`)
  return fetched
}

/**
 * Dump mode. The operator restores the mysqldump locally, runs the queries in
 * scripts/wp-import/sql/ and drops the JSON output into wp_import/raw/dump/.
 *
 * We deliberately do not regex-parse a mysqldump: serialized PHP inside
 * escaped SQL string literals is a reliable way to silently corrupt a catalog.
 * Restoring the dump and querying it is both safer and simpler.
 */
function extractDump(run, source) {
  const file = resolve(PATHS.raw, 'dump', `${source.entity}.json`)
  if (!existsSync(file)) {
    warn(`  ${source.entity}: no dump export at ${file} (see scripts/wp-import/sql/README)`)
    return 0
  }
  const rows = JSON.parse(readFileSync(file, 'utf8'))
  writePage(source.entity, 1, rows, { dump: file })
  run.op({ stage: 'extract', entity: source.entity, wpId: 'dump', action: 'insert' })
  info(`  ${source.entity}: ${rows.length} rows from dump export`)
  return rows.length
}

/**
 * File mode: a WXR export or a WooCommerce product CSV.
 *
 * Both are read into the same page files the REST and dump paths write, in the
 * dump-shaped row format 02-transform already accepts. Nothing downstream knows
 * which of the four sources a run used, which is the point: the transform stays
 * a pure function of `wp_import/raw/`.
 *
 * Unlike REST, a file cannot be paginated by the source, so each entity lands
 * as a single page. That is fine for the checkpointing contract (`--resume`
 * skips a completed page) because re-reading a local file is cheap.
 */
async function extractFile(run) {
  if (!existsSync(RUN.file)) throw new Error(`no such file: ${RUN.file}`)

  const emit = (entity, rows, meta) => {
    if (RUN.entity && RUN.entity !== entity) return 0
    const limited = RUN.limit ? rows.slice(0, RUN.limit) : rows
    writePage(entity, 1, limited, meta)
    run.op({ stage: 'extract', entity, wpId: 'file', action: 'insert' })
    run.count(`extract.${entity}.rows`, limited.length)
    info(
      `  ${entity}: ${limited.length} rows${limited.length < rows.length ? ` (capped from ${rows.length})` : ''}`,
    )
    return limited.length
  }

  if (RUN.source === 'csv') {
    const { products, categories, warnings } = readWooCsv(readFileSync(RUN.file, 'utf8'))
    for (const w of warnings) warn(`  ${w}`)
    emit('category', categories, { csv: RUN.file })
    emit('product', products, { csv: RUN.file })
    // A CSV export carries no customers, orders or coupons. Saying so beats
    // leaving an operator to wonder why those files are missing.
    info('  csv export carries products and categories only (no customers, orders, coupons)')
    return
  }

  const { categories, products, variations, attachments, itemsSeen } = await readWxr(RUN.file, {
    onProgress: (n) => info(`  ...${n} items read`),
  })
  const meta = { wxr: RUN.file, itemsSeen }
  emit('category', categories, meta)
  emit('product', products, meta)
  if (variations.length) emit('product_variation', variations, meta)
  emit('attachment', attachments, meta)

  const orphanCats = products.filter((p) => p._wxr.unresolved_categories.length).length
  if (orphanCats) {
    warn(`  ${orphanCats} products name a category the export did not define`)
  }
  const missingMedia = products.reduce((n, p) => n + (p._wxr.missing_attachments?.length ?? 0), 0)
  if (missingMedia) {
    warn(`  ${missingMedia} gallery references have no attachment item in this export`)
  }
}

export async function extract(run) {
  ensureDirs()

  if (RUN.source === 'xml' || RUN.source === 'csv') {
    info(`extract from ${RUN.source} file: ${RUN.file}`)
    try {
      await extractFile(run)
    } catch (err) {
      run.fail('extract', 'file', RUN.file ?? 'file', 'extract_failed', err)
      warn(`  ${err.message}`)
    }
    ok(`extract done -> ${PATHS.raw}`)
    return
  }

  const sources = RUN.entity ? SOURCES.filter((s) => s.entity === RUN.entity) : SOURCES
  if (sources.length === 0) throw new Error(`unknown --entity ${RUN.entity}`)

  if (RUN.source === 'rest' && (!WC.key || !WC.secret)) {
    warn(
      'WC_KEY / WC_SECRET not set: the REST API will reject unauthenticated reads of drafts and orders',
    )
  }

  for (const source of sources) {
    info(`extract ${source.entity} (${RUN.source})`)
    try {
      const n = RUN.source === 'dump' ? extractDump(run, source) : await extractRest(run, source)
      run.count(`extract.${source.entity}.rows`, n)
    } catch (err) {
      run.fail('extract', source.entity, 'collection', 'extract_failed', err)
      warn(`  ${source.entity}: ${err.message}`)
    }
  }
  ok(`extract done -> ${PATHS.raw}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = new Run({ kind: 'staging_load' })
  await extract(run)
  process.stdout.write(run.summary())
}
