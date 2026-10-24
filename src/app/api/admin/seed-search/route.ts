import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * One-time production Meilisearch seeding endpoint.
 *
 * Protected by CRON_SECRET. Call once to seed the production index with all
 * active products. Remove this file after seeding is complete.
 *
 * Usage:
 *   curl -X POST https://kenyonexpress.vercel.app/api/admin/seed-search \
 *     -H "Authorization: Bearer <CRON_SECRET>"
 */

export async function POST(request: NextRequest) {
  // Verify authorization
  const auth = request.headers.get('authorization')
  const token = auth?.replace('Bearer ', '')

  if (!token || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Check Meilisearch is configured
  const host = process.env.MEILISEARCH_HOST
  const key = process.env.MEILISEARCH_API_KEY
  const index = process.env.MEILISEARCH_INDEX ?? 'products'

  if (!host || !key) {
    return NextResponse.json(
      {
        error: 'meilisearch_not_configured',
        detail: 'MEILISEARCH_HOST or MEILISEARCH_API_KEY missing',
      },
      { status: 500 },
    )
  }

  try {
    // Load all active products from Supabase
    const supabase = createAdminClient()
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id, slug, name_he, name_en, brand, short_description_he, description_he,
        sku, type, is_coupon_enabled, kenyon_price, full_price, images,
        stock_quantity, category_id, supplier_id, created_at, city,
        categories(name_he, slug)
      `)
      .eq('status', 'active')
      .is('deleted_at', null)

    if (error) {
      log.error('seed_search.supabase_failed', { reason: error.message })
      return NextResponse.json(
        {
          error: 'database_error',
          detail: error.message,
        },
        { status: 500 },
      )
    }

    if (!products || products.length === 0) {
      return NextResponse.json({
        ok: true,
        indexed: 0,
        message: 'No active products to index',
      })
    }

    // Get supplier names
    const supplierIds = [...new Set(products.map((p) => p.supplier_id).filter(Boolean))]
    const supplierNames = new Map<string, string>()

    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, name')
        .in('id', supplierIds)

      for (const s of suppliers ?? []) {
        supplierNames.set(s.id, s.name)
      }
    }

    // Format documents for Meilisearch
    const documents = products.map((row) => {
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
        supplier_name: row.supplier_id ? (supplierNames.get(row.supplier_id) ?? null) : null,
        city: row.city ?? null,
        created_at: row.created_at ?? null,
      }
    })

    // Send to Meilisearch
    const url = `${host.replace(/\/$/, '')}/indexes/${index}/documents`
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(documents),
    })

    if (!response.ok) {
      const text = await response.text()
      log.error('seed_search.meilisearch_failed', {
        status: response.status,
        detail: text,
      })
      return NextResponse.json(
        {
          error: 'meilisearch_error',
          status: response.status,
          detail: text,
        },
        { status: 500 },
      )
    }

    const result = await response.json()
    log.info('seed_search.success', { indexed: documents.length })

    return NextResponse.json({
      ok: true,
      indexed: documents.length,
      taskUid: result.taskUid,
      message: `Successfully queued ${documents.length} products for indexing`,
    })
  } catch (error) {
    log.error('seed_search.failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json(
      {
        error: 'internal_error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
