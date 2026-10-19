/**
 * Deal scraper infrastructure for continuous deal seeding.
 *
 * Pulls deals from approved sources (live site, vendor APIs),
 * deduplicates, validates images, and stages for approval.
 */

import { createClient } from '@/lib/supabase/server'

export interface DealScraperConfig {
  sourceId: string
  sourceType: 'http' | 'api' | 'static' | 'webhook'
  sourceUrl: string
  scraperConfig: Record<string, unknown>
}

export interface ScrapedDeal {
  externalId: string
  nameHe: string
  nameEn?: string
  descriptionHe?: string
  descriptionEn?: string
  priceAgorot: number
  fullPriceAgorot?: number
  stockQuantity: number
  imageUrl?: string
  slug?: string
  categorySlug?: string
  supplierId?: string
  productType?: 'physical' | 'coupon' | 'other'
  metadata?: Record<string, unknown>
}

export interface ScrapingResult {
  sourceId: string
  dealsFound: number
  dealsInserted: number
  dealsSkipped: number
  dealsRejected: number
  duplicatesFound: number
  errors: string[]
  startedAt: Date
  completedAt: Date
}

/**
 * Scrape deals from the live site using HTTP.
 *
 * The live site is kenyonexpress.co.il. This function fetches the
 * product listing page and extracts deals matching our schema.
 */
export async function scrapeLiveSite(): Promise<ScrapedDeal[]> {
  const LIVE_SITE = 'https://kenyonexpress.co.il'
  const deals: ScrapedDeal[] = []

  try {
    const response = await fetch(`${LIVE_SITE}/api/products`, {
      headers: {
        'User-Agent': 'KenyonExpress-Scraper/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    })

    if (!response.ok) {
      throw new Error(`Live site returned ${response.status}`)
    }

    const data = (await response.json()) as unknown

    if (!Array.isArray(data)) {
      throw new Error('Expected array of deals from live site')
    }

    for (const item of data) {
      const deal = parseLiveSiteDeal(item)
      if (deal) {
        deals.push(deal)
      }
    }

    return deals
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to scrape live site: ${message}`)
  }
}

/**
 * Parse a single deal from the live site format.
 */
function parseLiveSiteDeal(item: unknown): ScrapedDeal | null {
  if (!item || typeof item !== 'object') return null

  const obj = item as Record<string, unknown>

  // Require minimum fields
  const nameHe = obj.name_he || obj.nameHe || obj.title
  if (!nameHe || typeof nameHe !== 'string') return null

  const priceAgorot = Number(obj.price || obj.priceAgorot || 0)
  if (priceAgorot <= 0) return null

  const stockQuantity = Number(obj.stock || obj.stockQuantity || 0)
  const externalId = String(obj.id || obj.external_id || obj.externalId)

  if (!externalId) return null

  return {
    externalId,
    nameHe: nameHe as string,
    nameEn: typeof obj.name_en === 'string' ? obj.name_en : undefined,
    descriptionHe: typeof obj.description_he === 'string' ? obj.description_he : undefined,
    descriptionEn: typeof obj.description_en === 'string' ? obj.description_en : undefined,
    priceAgorot,
    fullPriceAgorot: typeof obj.full_price === 'number' ? obj.full_price : undefined,
    stockQuantity,
    imageUrl: typeof obj.image_url === 'string' ? obj.image_url : undefined,
    slug: typeof obj.slug === 'string' ? obj.slug : undefined,
    categorySlug: typeof obj.category === 'string' ? obj.category : undefined,
    supplierId: typeof obj.supplier_id === 'string' ? obj.supplier_id : undefined,
    productType:
      typeof obj.type === 'string' && ['physical', 'coupon', 'other'].includes(obj.type)
        ? (obj.type as 'physical' | 'coupon' | 'other')
        : 'physical',
    metadata: obj,
  }
}

/**
 * Ingest scraped deals into pending_deals table.
 *
 * Returns count of new deals inserted and duplicates found.
 */
export async function ingestScrapedDeals(
  sourceId: string,
  deals: ScrapedDeal[],
): Promise<{
  inserted: number
  duplicates: number
  errors: string[]
}> {
  const client = await createClient()
  let inserted = 0
  let duplicates = 0
  const errors: string[] = []

  // Resolve category IDs
  const { data: categories } = await client
    .from('categories')
    .select('id, slug')
    .in('slug', deals.map((d) => d.categorySlug || 'hot-deals').filter(Boolean))

  const categoryMap = new Map(
    (categories || []).map((c: { id: string; slug: string }) => [c.slug, c.id]),
  )

  for (const deal of deals) {
    try {
      // Compute content hash for deduplication
      const contentHash = computeHash(deal.nameHe, deal.priceAgorot, deal.supplierId)

      // Check for existing deal with same hash
      const { data: existing } = await client
        .from('pending_deals')
        .select('id')
        .eq('content_hash', contentHash)
        .eq('source_id', sourceId)
        .neq('approval_status', 'rejected')
        .limit(1)

      if (existing && existing.length > 0) {
        duplicates += 1
        continue
      }

      // Resolve category
      const categoryId =
        categoryMap.get(deal.categorySlug || '') || categoryMap.get('hot-deals') || null

      // Insert pending deal
      const { error } = await client.from('pending_deals').insert({
        source_id: sourceId,
        external_id: deal.externalId,
        supplier_id: deal.supplierId || null,
        content_hash: contentHash,
        name_he: deal.nameHe,
        name_en: deal.nameEn || null,
        slug: deal.slug || slugify(deal.nameHe),
        description_he: deal.descriptionHe || null,
        description_en: deal.descriptionEn || null,
        category_id: categoryId as string,
        price_agorot: deal.priceAgorot,
        full_price_agorot: deal.fullPriceAgorot || null,
        stock_quantity: deal.stockQuantity,
        image_url: deal.imageUrl || null,
        product_type: deal.productType || 'physical',
        approval_status: 'pending',
        image_validation_status: deal.imageUrl ? 'pending' : 'skipped',
        metadata: deal.metadata || {},
      })

      if (error) {
        errors.push(`Failed to insert ${deal.nameHe}: ${error.message}`)
      } else {
        inserted += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`Error processing ${deal.nameHe}: ${message}`)
    }
  }

  return { inserted, duplicates, errors }
}

/**
 * Compute SHA-256 hash of deal for deduplication.
 */
export function computeHash(nameHe: string, priceAgorot: number, supplierId?: string): string {
  const crypto = require('node:crypto')
  const content = `${nameHe}::${priceAgorot}::${supplierId || ''}`
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Convert Hebrew string to URL-safe slug.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^֐-׿\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
}

/**
 * Fetch and validate deal image, updating validation status.
 */
export async function validateDealImage(
  dealId: string,
  imageUrl: string | null,
): Promise<{
  isValid: boolean
  error?: string
  metadata?: { contentType?: string; size?: number }
}> {
  if (!imageUrl) {
    return { isValid: false, error: 'No image URL provided' }
  }

  try {
    const response = await fetch(imageUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'KenyonExpress-Scraper/1.0',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return {
        isValid: false,
        error: `Image unreachable: HTTP ${response.status}`,
      }
    }

    const contentType = response.headers.get('content-type')
    const contentLength = response.headers.get('content-length')

    // Validate content type
    if (contentType && !contentType.startsWith('image/')) {
      return {
        isValid: false,
        error: `Invalid content type: ${contentType}`,
      }
    }

    // Check file size (max 10MB)
    const size = contentLength ? Number.parseInt(contentLength, 10) : 0
    if (size > 10 * 1024 * 1024) {
      return {
        isValid: false,
        error: `Image too large: ${(size / 1024 / 1024).toFixed(1)}MB`,
      }
    }

    // Update validation status in database
    const client = await createClient()
    await client
      .from('pending_deals')
      .update({
        image_validation_status: 'valid',
      })
      .eq('id', dealId)

    return {
      isValid: true,
      metadata: { contentType: contentType || undefined, size },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      isValid: false,
      error: `Image validation failed: ${message}`,
    }
  }
}

/**
 * Run validation on pending deals.
 */
export async function validatePendingDeals(
  sourceId: string,
  limit = 100,
): Promise<{
  validated: number
  passed: number
  failed: number
}> {
  const client = await createClient()

  // Fetch pending deals with unvalidated images
  const { data: deals } = await client
    .from('pending_deals')
    .select('id, image_url')
    .eq('source_id', sourceId)
    .eq('image_validation_status', 'pending')
    .limit(limit)

  if (!deals || deals.length === 0) {
    return { validated: 0, passed: 0, failed: 0 }
  }

  let passed = 0
  let failed = 0

  for (const deal of deals) {
    const result = await validateDealImage(deal.id, deal.image_url)

    if (!result.isValid) {
      // Update validation status to failed
      await client
        .from('pending_deals')
        .update({
          image_validation_status: 'failed',
          image_validation_error: result.error,
        })
        .eq('id', deal.id)

      failed += 1
    } else {
      passed += 1
    }
  }

  return {
    validated: deals.length,
    passed,
    failed,
  }
}
