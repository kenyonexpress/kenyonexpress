// Stage 4: project. Staging rows into public.* through wp_import.id_map.
//
// This is the only stage that can touch the live catalog, so it is the most
// conservative one:
//
//   * every target uuid comes from id_map, so a re-run updates the row it
//     created last time instead of minting a second one;
//   * a product whose price or category did not survive validation is
//     projected as draft, never as active;
//   * historical orders are NOT projected. They stay a read-only archive in
//     wp_import.orders (doc 5.5);
//   * customers are projected as identities with NO password. WordPress
//     password hashes are never extracted, so there is nothing to migrate:
//     every legacy customer signs in through the password-reset flow.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readNormalized } from './02-transform.mjs'
import { DEFAULTS, DRY_RUN, PATHS, RUN, dryRunReason } from './config.mjs'
import { getDb, persistIdMap, resolveIdMap, upsertRows } from './lib/db.mjs'
import { Run, info, ok, warn } from './lib/log.mjs'

/**
 * The legacy supplier every imported product hangs off. WooCommerce has no
 * first-class supplier, and public.products.supplier_id is NOT NULL, so this
 * row has to exist before any product is projected.
 */
async function ensureLegacySupplier(run, db) {
  if (!db) return null
  const { data, error } = await db
    .from('suppliers')
    .select('id')
    .eq('name', DEFAULTS.legacySupplierName)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`supplier lookup failed: ${error.message}`)
  if (data) return data.id

  if (DRY_RUN) {
    info(`  supplier      would create "${DEFAULTS.legacySupplierName}"`)
    run.op({
      stage: 'project_public',
      entity: 'supplier',
      wpId: 'legacy',
      action: 'insert',
      targetTable: 'public.suppliers',
    })
    return null
  }
  const { data: created, error: insertError } = await db
    .from('suppliers')
    .insert({
      name: DEFAULTS.legacySupplierName,
      commission_percent: DEFAULTS.commissionPercent,
      status: 'active',
      notes:
        'Auto-created by the WordPress import. Owns every legacy catalog row until real suppliers are attached.',
    })
    .select('id')
    .single()
  if (insertError) throw new Error(`supplier create failed: ${insertError.message}`)
  run.op({
    stage: 'project_public',
    entity: 'supplier',
    wpId: 'legacy',
    action: 'insert',
    targetTable: 'public.suppliers',
    targetId: created.id,
  })
  return created.id
}

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

async function projectCategories(run, db) {
  const staged = readNormalized('categories')
  if (staged.length === 0) return new Map()

  const ids = await resolveIdMap({ db, entity: 'category', wpIds: staged.map((c) => c.wp_term_id) })

  // public.categories keeps the WooCommerce tree (it has parent_id), so the
  // hierarchy is preserved rather than flattened. Parents first: a child's
  // parent_id must already resolve.
  const depth = new Map()
  const byWpId = new Map(staged.map((c) => [String(c.wp_term_id), c]))
  const depthOf = (category, guard = 0) => {
    const key = String(category.wp_term_id)
    if (depth.has(key)) return depth.get(key)
    // a term whose parent chain loops is a corrupt taxonomy; treat it as root
    const parent = category.parent_wp_id ? byWpId.get(String(category.parent_wp_id)) : null
    const value = !parent || guard > 20 ? 0 : depthOf(parent, guard + 1) + 1
    depth.set(key, value)
    return value
  }
  const ordered = [...staged].sort((a, b) => depthOf(a) - depthOf(b) || a.wp_term_id - b.wp_term_id)

  const rows = ordered.map((c) => ({
    id: ids.get(String(c.wp_term_id)).newId,
    slug: c.slug_decoded,
    name_he: c.name_he || c.slug_decoded,
    // NOT NULL in public.categories and absent from WooCommerce. The slug is
    // the only latin string we reliably have; a human renames it later.
    name_en: c.slug_decoded,
    description_he: c.description,
    parent_id: c.parent_wp_id ? (ids.get(String(c.parent_wp_id))?.newId ?? null) : null,
    sort_order: 0,
    is_active: true,
  }))

  const plan = await upsertRows({
    db,
    schema: 'public',
    table: 'categories',
    rows,
    conflictColumn: 'id',
    entity: 'category',
    wpIdColumn: 'slug',
  })
  for (const [i, item] of plan.entries()) {
    run.op({
      stage: 'project_public',
      entity: 'category',
      wpId: ordered[i].wp_term_id,
      action: item.action,
      targetTable: 'public.categories',
      targetId: rows[i].id,
      after: { slug: rows[i].slug, name_he: rows[i].name_he },
    })
  }
  await persistIdMap({ db, entity: 'category', ids, batchId: run.batchId })
  info(`  categories    ${String(rows.length).padStart(6)} projected`)
  return ids
}

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------

async function projectProducts(run, db, categoryIds, supplierId) {
  const staged = readNormalized('products').filter((p) => p.post_type === 'product')
  if (staged.length === 0) return

  const ids = await resolveIdMap({ db, entity: 'product', wpIds: staged.map((p) => p.wp_post_id) })
  const mediaByAttachment = new Map(
    readNormalized('media').map((m) => [String(m.wp_attachment_id), m]),
  )

  const rows = []
  const skipped = []
  for (const p of staged) {
    const categoryId =
      p.category_wp_ids?.map((wpId) => categoryIds.get(String(wpId))?.newId).find(Boolean) ?? null

    // The two gates that keep a broken row out of the live catalog. Both are
    // already recorded as issues by the transform stage; here they decide
    // status rather than dropping the row, so nothing silently disappears.
    let status = p.projected_status ?? 'draft'
    if (p.price === null || p.price <= 0) status = 'draft'
    if (!categoryId) status = 'draft'
    if (status === 'draft' && p.status_raw === 'publish') {
      skipped.push({
        wp_id: p.wp_post_id,
        slug: p.slug_decoded,
        reason: !categoryId ? 'no_category' : 'no_price',
      })
    }

    rows.push({
      id: ids.get(String(p.wp_post_id)).newId,
      supplier_id: supplierId,
      category_id: categoryId,
      slug: p.slug_decoded,
      name_he: p.title_he,
      description_he: p.description_html,
      short_description_he: p.excerpt_html,
      type: p.target_type ?? 'physical',
      status,
      price_ils: p.price ?? 0,
      compare_at_price_ils: p.compare_at_price ?? null,
      sku: p.sku,
      stock_quantity: p.stock_quantity,
      images: buildImages(p, mediaByAttachment),
      attributes: p.attributes ?? {},
      is_coupon_enabled: p.target_type === 'coupon',
      platform_percent: DEFAULTS.platformPercent,
      commission_percent: DEFAULTS.commissionPercent,
      cashback_percent: DEFAULTS.cashbackPercent,
      coupon_expiry_days: DEFAULTS.couponExpiryDays,
      requires_shipping: p.target_type === 'physical',
      seo_title: p.seo_title_raw,
      seo_description: p.seo_description_raw,
      published_at: status === 'active' ? p.created_at_wp : null,
    })
  }

  // batched so one bad row cannot take a whole 40k-product catalog with it
  for (let i = 0; i < rows.length; i += DEFAULTS.batchSize) {
    const slice = rows.slice(i, i + DEFAULTS.batchSize)
    const sourceSlice = staged.slice(i, i + DEFAULTS.batchSize)
    try {
      const plan = await upsertRows({
        db,
        schema: 'public',
        table: 'products',
        rows: slice,
        conflictColumn: 'id',
        entity: 'product',
        wpIdColumn: 'slug',
      })
      for (const [j, item] of plan.entries()) {
        run.op({
          stage: 'project_public',
          entity: 'product',
          wpId: sourceSlice[j].wp_post_id,
          action: item.action,
          targetTable: 'public.products',
          targetId: slice[j].id,
          after: { slug: slice[j].slug, status: slice[j].status, price_ils: slice[j].price_ils },
        })
      }
    } catch (err) {
      for (const source of sourceSlice) {
        run.fail('project_public', 'product', source.wp_post_id, 'batch_failed', err)
      }
      warn(`  products batch ${i / DEFAULTS.batchSize + 1}: ${err.message}`)
    }
  }

  await persistIdMap({ db, entity: 'product', ids, batchId: run.batchId })
  info(
    `  products      ${String(rows.length).padStart(6)} projected (${rows.filter((r) => r.status === 'active').length} active)`,
  )
  if (skipped.length > 0) {
    warn(
      `  ${skipped.length} products were published on WordPress but project as draft (missing price or category)`,
    )
    writeFileSync(
      resolve(PATHS.reports, 'downgraded-to-draft.json'),
      `${JSON.stringify(skipped, null, 2)}\n`,
    )
  }
}

/** products.images jsonb, in gallery order, primary first (doc 3.4). */
function buildImages(product, mediaByAttachment) {
  const ordered = []
  if (product.featured_image_wp_id) ordered.push(product.featured_image_wp_id)
  for (const id of product.gallery_wp_ids || []) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  return ordered
    .map((id, position) => {
      const media = mediaByAttachment.get(String(id))
      if (!media) return null
      return {
        // new_url is filled by the media sync stage. Until then the source URL
        // is kept so a dry run shows what the row would look like, and so a
        // half-migrated catalog still renders off the old CDN rather than
        // rendering nothing.
        url: media.new_url || media.source_url,
        alt: media.alt_text || product.title_he,
        width: media.width,
        height: media.height,
        sha256: media.sha256 ?? null,
        wp_attachment_id: media.wp_attachment_id,
        position,
      }
    })
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// customers: identities without passwords
// ---------------------------------------------------------------------------

/**
 * WordPress password hashes are phpass; Supabase Auth uses bcrypt and, more to
 * the point, we never extracted the hashes (see scripts/wp-import/sql/). So
 * there is nothing to carry over. Each legacy customer gets an account with no
 * password and reclaims it through the standard reset flow.
 *
 * This stage does not send anything. It writes the invite list; sending is a
 * separate, deliberate, rate-limited campaign after cutover.
 */
async function projectCustomers(run, db) {
  const staged = readNormalized('customers').filter((c) => c.email_normalized)
  if (staged.length === 0) return

  const ids = await resolveIdMap({ db, entity: 'customer', wpIds: staged.map((c) => c.wp_user_id) })
  const inviteList = []

  for (const customer of staged) {
    const targetId = ids.get(String(customer.wp_user_id)).newId
    inviteList.push({
      wp_user_id: customer.wp_user_id,
      email: customer.email_normalized,
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone_normalized,
      target_user_id: targetId,
      // Every imported person starts opted OUT. An opt-in on the old site is
      // evidence, not consent on the new one (doc 5.5).
      marketing_opt_in: DEFAULTS.marketingOptIn,
      flow: 'password_reset',
    })
    run.op({
      stage: 'project_public',
      entity: 'customer',
      wpId: customer.wp_user_id,
      action: 'skip',
      targetTable: 'auth.users',
      targetId,
      errorCode: 'deferred_to_invite_list',
      errorDetail:
        'account creation happens in the post-cutover invite campaign, not in the import',
    })
  }

  await persistIdMap({ db, entity: 'customer', ids, batchId: run.batchId })
  const file = resolve(PATHS.reports, 'customer-invites.json')
  writeFileSync(file, `${JSON.stringify(inviteList, null, 2)}\n`)
  info(
    `  customers     ${String(inviteList.length).padStart(6)} queued for password-reset invite -> ${file.replace(`${PATHS.root}/`, '')}`,
  )
  warn(
    '  no auth accounts were created: passwords are never migrated, invites are a separate campaign',
  )
}

// ---------------------------------------------------------------------------
// orders: archive only, asserted rather than assumed
// ---------------------------------------------------------------------------

function reportOrders(run) {
  const orders = readNormalized('orders')
  if (orders.length === 0) return
  for (const order of orders) {
    run.op({
      stage: 'project_public',
      entity: 'order',
      wpId: order.wp_order_id,
      action: 'skip',
      targetTable: 'wp_import.orders',
      errorCode: 'archive_only',
      errorDetail:
        'historical orders are read-only archive and are never projected into live commerce tables',
    })
  }
  info(
    `  orders        ${String(orders.length).padStart(6)} kept as read-only archive (never projected)`,
  )
}

// ---------------------------------------------------------------------------

export async function projectPublic(run) {
  const db = await getDb()
  if (DRY_RUN) warn(`dry run: nothing will be written (${dryRunReason()})`)

  const supplierId = await ensureLegacySupplier(run, db)
  if (!supplierId && !DRY_RUN) throw new Error('no legacy supplier id: cannot project products')

  const categoryIds =
    RUN.entity && RUN.entity !== 'category'
      ? await resolveIdMap({
          db,
          entity: 'category',
          wpIds: readNormalized('categories').map((c) => c.wp_term_id),
        })
      : await projectCategories(run, db)

  if (!RUN.entity || RUN.entity === 'product')
    await projectProducts(run, db, categoryIds, supplierId)
  if (!RUN.entity || RUN.entity === 'customer') await projectCustomers(run, db)
  if (!RUN.entity || RUN.entity === 'order') reportOrders(run)

  await run.flush(db)
  ok(`projection ${DRY_RUN ? 'planned' : 'applied'}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = new Run({ kind: 'project_catalog' })
  await projectPublic(run)
  process.stdout.write(run.summary())
}
