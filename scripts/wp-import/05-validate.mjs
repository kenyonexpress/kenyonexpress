// Stage 5: validate. The gates that decide whether the migration may go live.
//
// Every gate answers one question with a number, not an impression. A gate
// that cannot be evaluated (no DB connection, no data) reports 'unknown' and
// counts as NOT passed: silence is never success.
//
// The report is written to wp_import/reports/ as both JSON and Markdown, and
// mirrored into wp_import.validation_reports when the run is applying.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readRaw } from './01-extract.mjs'
import { readNormalized } from './02-transform.mjs'
import { DRY_RUN, PATHS, ensureDirs } from './config.mjs'
import { countRows, getDb } from './lib/db.mjs'
import { Run, error, info, ok, warn } from './lib/log.mjs'

const MAX_OFFENDERS = 25

class Gates {
  constructor() {
    this.results = []
    this.offenders = {}
  }

  /**
   * severity 'error' blocks cutover; 'warn' is reported and does not block.
   * `offenders` is a sample, capped: a report nobody can read blocks nothing.
   */
  add({ gate, severity = 'error', expected, actual, passed, detail = null, offenders = [] }) {
    this.results.push({ gate, severity, expected, actual, passed, detail })
    if (offenders.length > 0) {
      this.offenders[gate] = {
        total: offenders.length,
        sample: offenders.slice(0, MAX_OFFENDERS),
      }
    }
    return this
  }

  get blocking() {
    return this.results.filter((r) => r.severity === 'error' && r.passed !== true)
  }

  get passed() {
    return this.blocking.length === 0
  }
}

export async function validate(run) {
  ensureDirs()
  const db = await getDb()
  const gates = new Gates()

  const rawProducts = readRaw('product')
  const rawCategories = readRaw('category')
  const products = readNormalized('products').filter((p) => p.post_type === 'product')
  const categories = readNormalized('categories')
  const media = readNormalized('media')
  const customers = readNormalized('customers')
  const orders = readNormalized('orders')
  const urls = readNormalized('url_inventory')
  const issues = readNormalized('issues')

  // ------------------------------------------------------------------
  // Count parity. Source rows we chose to drop are subtracted explicitly,
  // so a shrinking catalog has to be justified rather than noticed later.
  // ------------------------------------------------------------------

  const excludedStatuses = new Set(['trash', 'private', 'auto-draft', 'inherit'])
  const sourceProducts = rawProducts.filter(
    (p) =>
      (p.post_type ?? 'product') === 'product' &&
      !excludedStatuses.has(String(p.status).toLowerCase()),
  )
  gates.add({
    gate: 'count_parity_products',
    expected: sourceProducts.length,
    actual: products.length,
    passed: sourceProducts.length === products.length,
    detail: `${rawProducts.length} raw rows, ${rawProducts.length - sourceProducts.length} excluded by status`,
    offenders: sourceProducts
      .filter((s) => !products.some((p) => p.wp_post_id === s.id))
      .map((s) => ({ wp_id: s.id, slug: s.slug, status: s.status })),
  })

  gates.add({
    gate: 'count_parity_categories',
    expected: rawCategories.length,
    actual: categories.length,
    passed: rawCategories.length === categories.length,
  })

  // ------------------------------------------------------------------
  // Referential integrity
  // ------------------------------------------------------------------

  const noCategory = products.filter((p) => !p.category_wp_ids || p.category_wp_ids.length === 0)
  gates.add({
    gate: 'products_without_category',
    expected: 0,
    actual: noCategory.length,
    passed: noCategory.length === 0,
    detail: 'a product with no product_cat term cannot be browsed to; it projects as draft',
    offenders: noCategory.map((p) => ({
      wp_id: p.wp_post_id,
      slug: p.slug_decoded,
      title: p.title_he,
    })),
  })

  const knownCategoryIds = new Set(categories.map((c) => String(c.wp_term_id)))
  const danglingCategory = products.filter(
    (p) =>
      (p.category_wp_ids || []).length > 0 &&
      !(p.category_wp_ids || []).some((id) => knownCategoryIds.has(String(id))),
  )
  gates.add({
    gate: 'products_with_dangling_category',
    expected: 0,
    actual: danglingCategory.length,
    passed: danglingCategory.length === 0,
    detail: 'every product_cat term the product references is missing from the category export',
    offenders: danglingCategory.map((p) => ({
      wp_id: p.wp_post_id,
      slug: p.slug_decoded,
      refs: p.category_wp_ids,
    })),
  })

  // ------------------------------------------------------------------
  // Images
  // ------------------------------------------------------------------

  const mediaIds = new Set(media.map((m) => String(m.wp_attachment_id)))
  const noImage = products.filter(
    (p) => !p.featured_image_wp_id && (p.gallery_wp_ids || []).length === 0,
  )
  gates.add({
    gate: 'products_without_image',
    severity: 'warn',
    expected: 0,
    actual: noImage.length,
    passed: noImage.length === 0,
    detail: 'renders with a placeholder; not a cutover blocker but bad for conversion and OG cards',
    offenders: noImage.map((p) => ({ wp_id: p.wp_post_id, slug: p.slug_decoded })),
  })

  const missingMedia = []
  for (const p of products) {
    const refs = [p.featured_image_wp_id, ...(p.gallery_wp_ids || [])].filter(Boolean)
    const missing = refs.filter((id) => !mediaIds.has(String(id)))
    if (missing.length > 0) {
      missingMedia.push({ wp_id: p.wp_post_id, slug: p.slug_decoded, missing_attachments: missing })
    }
  }
  gates.add({
    gate: 'products_with_missing_images',
    expected: 0,
    actual: missingMedia.length,
    passed: missingMedia.length === 0,
    detail:
      'product references an attachment id that never appeared in the media inventory: a dead image',
    offenders: missingMedia,
  })

  const unsyncedMedia = media.filter((m) => m.status !== 'uploaded')
  gates.add({
    gate: 'media_uploaded',
    expected: media.length,
    actual: media.length - unsyncedMedia.length,
    passed: media.length > 0 && unsyncedMedia.length === 0,
    detail: 'every attachment must be downloaded, converted and uploaded before cutover',
    offenders: unsyncedMedia.map((m) => ({
      wp_id: m.wp_attachment_id,
      status: m.status,
      url: m.source_url,
    })),
  })

  // ------------------------------------------------------------------
  // Prices and slugs
  // ------------------------------------------------------------------

  const badPrice = products.filter(
    (p) => p.projected_status === 'active' && (p.price === null || p.price <= 0),
  )
  gates.add({
    gate: 'active_products_without_price',
    expected: 0,
    actual: badPrice.length,
    passed: badPrice.length === 0,
    offenders: badPrice.map((p) => ({ wp_id: p.wp_post_id, slug: p.slug_decoded, price: p.price })),
  })

  const fakeDiscount = products.filter(
    (p) =>
      p.compare_at_price !== null &&
      p.compare_at_price !== undefined &&
      p.price !== null &&
      p.compare_at_price <= p.price,
  )
  gates.add({
    gate: 'fake_strikethrough_prices',
    expected: 0,
    actual: fakeDiscount.length,
    passed: fakeDiscount.length === 0,
    detail: 'compare_at_price must be strictly greater than price, or it is a misleading discount',
    offenders: fakeDiscount.map((p) => ({
      wp_id: p.wp_post_id,
      price: p.price,
      compare_at: p.compare_at_price,
    })),
  })

  for (const [label, rows, key] of [
    ['product', products, 'slug_decoded'],
    ['category', categories, 'slug_decoded'],
  ]) {
    const seen = new Map()
    const dupes = []
    for (const row of rows) {
      const slug = row[key]
      if (!slug) continue
      if (seen.has(slug))
        dupes.push({ slug, wp_ids: [seen.get(slug), row.wp_post_id ?? row.wp_term_id] })
      else seen.set(slug, row.wp_post_id ?? row.wp_term_id)
    }
    gates.add({
      gate: `${label}_slug_uniqueness`,
      expected: 0,
      actual: dupes.length,
      passed: dupes.length === 0,
      offenders: dupes,
    })
  }

  // ------------------------------------------------------------------
  // Redirect coverage: no indexed URL may 404 after cutover
  // ------------------------------------------------------------------

  const resolvedUrls = urls.filter((u) => u.mapped_new_path || u.direct_match || u.gone_410)
  gates.add({
    gate: 'redirect_coverage',
    expected: urls.length,
    actual: resolvedUrls.length,
    passed: urls.length > 0 && resolvedUrls.length === urls.length,
    detail: 'every old path needs a 301 target, a direct match, or an explicit 410',
    offenders: urls
      .filter((u) => !u.mapped_new_path && !u.direct_match && !u.gone_410)
      .map((u) => ({ old_path: u.old_path, entity: u.entity })),
  })

  // ------------------------------------------------------------------
  // People and orders: the rules that are policy, not data quality
  // ------------------------------------------------------------------

  const importableCustomers = customers.filter((c) => c.email_normalized)
  gates.add({
    gate: 'customers_with_usable_email',
    severity: 'warn',
    expected: customers.length,
    actual: importableCustomers.length,
    passed: customers.length === importableCustomers.length,
    detail: 'customers without a valid email cannot be invited and are archive-only',
  })

  // A password hash reaching staging would be a security incident, not a bug.
  const leakedSecrets = customers.filter((c) =>
    JSON.stringify(c.raw_meta ?? {}).match(/user_pass|\$P\$|\$wp\$|session_tokens/i),
  )
  gates.add({
    gate: 'no_password_material_staged',
    expected: 0,
    actual: leakedSecrets.length,
    passed: leakedSecrets.length === 0,
    detail: 'WordPress password hashes and session tokens must never reach staging',
    offenders: leakedSecrets.map((c) => ({ wp_id: c.wp_user_id })),
  })

  const optedIn = customers.filter((c) => c.marketing_opt_in === true)
  gates.add({
    gate: 'no_imported_marketing_consent',
    expected: 0,
    actual: optedIn.length,
    passed: optedIn.length === 0,
    detail: 'every imported person starts opted out; consent is re-collected on the new site',
  })

  // ------------------------------------------------------------------
  // Live database counts, when we can reach it
  // ------------------------------------------------------------------

  const countsAfter = {}
  if (db) {
    countsAfter.public_products = await countRows(db, 'public', 'products')
    countsAfter.public_categories = await countRows(db, 'public', 'categories')
    countsAfter.staging_products = await countRows(db, 'wp_import', 'products')
    countsAfter.staging_categories = await countRows(db, 'wp_import', 'categories')
    countsAfter.staging_media = await countRows(db, 'wp_import', 'media')
    countsAfter.id_map = await countRows(db, 'wp_import', 'id_map')
  } else {
    gates.add({
      gate: 'live_count_parity',
      expected: 'measured',
      actual: 'unknown',
      passed: false,
      detail: 'no database connection: live counts could not be verified. Not a pass.',
    })
  }

  const blockingIssues = issues.filter((i) => i.severity === 'error')
  gates.add({
    gate: 'no_blocking_issues',
    expected: 0,
    actual: blockingIssues.length,
    passed: blockingIssues.length === 0,
    offenders: blockingIssues.map((i) => ({ entity: i.entity, wp_id: i.wp_id, code: i.code })),
  })

  // ------------------------------------------------------------------
  // Report
  // ------------------------------------------------------------------

  const countsBefore = {
    raw_products: rawProducts.length,
    raw_categories: rawCategories.length,
    source_products_in_scope: sourceProducts.length,
  }
  const countsAfterLocal = {
    normalized_products: products.length,
    normalized_categories: categories.length,
    normalized_media: media.length,
    normalized_customers: customers.length,
    normalized_orders: orders.length,
    normalized_urls: urls.length,
    ...countsAfter,
  }

  const report = {
    batch_id: run.batchId,
    kind: DRY_RUN ? 'post_load' : 'post_projection',
    dry_run: DRY_RUN,
    generated_at: new Date().toISOString(),
    passed: gates.passed,
    gates: gates.results,
    counts_before: countsBefore,
    counts_after: countsAfterLocal,
    offenders: gates.offenders,
  }

  const jsonPath = resolve(PATHS.reports, `validation-${run.batchId}.json`)
  const mdPath = resolve(PATHS.reports, `validation-${run.batchId}.md`)
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(mdPath, renderMarkdown(report))

  for (const result of gates.results) {
    const line = `${result.gate.padEnd(34)} expected ${String(result.expected).padStart(7)}  actual ${String(result.actual).padStart(7)}`
    if (result.passed) ok(`  ${line}`)
    else if (result.severity === 'warn') warn(`  ${line}`)
    else error(`  ${line}`)
  }

  if (db && !DRY_RUN) {
    const { error: err } = await db.schema('wp_import').from('validation_reports').insert({
      batch_id: run.batchId,
      kind: report.kind,
      passed: report.passed,
      gates: report.gates,
      counts_before: report.counts_before,
      counts_after: report.counts_after,
      offenders: report.offenders,
      report_path: mdPath,
    })
    if (err) warn(`validation_reports insert failed: ${err.message}`)
  }

  info(`report: ${mdPath}`)
  if (report.passed) ok('all blocking gates green')
  else error(`${gates.blocking.length} blocking gates failed: cutover is blocked`)
  return report
}

function renderMarkdown(report) {
  const rows = report.gates
    .map((g) => {
      const mark = g.passed ? 'pass' : g.severity === 'warn' ? 'warn' : 'FAIL'
      return `| ${mark} | \`${g.gate}\` | ${g.expected} | ${g.actual} | ${g.detail ?? ''} |`
    })
    .join('\n')

  const counts = (obj) =>
    Object.entries(obj)
      .map(([k, v]) => `| \`${k}\` | ${v ?? 'n/a'} |`)
      .join('\n')

  const offenders = Object.entries(report.offenders)
    .map(([gate, data]) => {
      const shown = data.sample.map((o) => `  ${JSON.stringify(o)}`).join('\n')
      const more =
        data.total > data.sample.length ? `\n  ... and ${data.total - data.sample.length} more` : ''
      return `### \`${gate}\` (${data.total})\n\n\`\`\`\n${shown}${more}\n\`\`\`\n`
    })
    .join('\n')

  return `# WP import validation report

- batch: \`${report.batch_id}\`
- kind: ${report.kind}
- mode: ${report.dry_run ? 'DRY RUN' : 'APPLIED'}
- generated: ${report.generated_at}
- result: **${report.passed ? 'PASS' : 'BLOCKED'}**

## Gates

| | gate | expected | actual | note |
| --- | --- | --- | --- | --- |
${rows}

## Counts before

| metric | value |
| --- | --- |
${counts(report.counts_before)}

## Counts after

| metric | value |
| --- | --- |
${counts(report.counts_after)}

## Offenders

${offenders || '_none_'}
`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = new Run({ kind: 'verify' })
  const report = await validate(run)
  process.stdout.write(run.summary())
  process.exit(report.passed ? 0 : 1)
}
