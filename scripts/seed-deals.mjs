#!/usr/bin/env node
/**
 * Seeds sample deals from approved sources into pending_deals table.
 *
 * Mirrors seed-catalogue.mjs pattern: outputs SQL without writing,
 * allowing review before MCP apply_migration.
 *
 * Usage (from repo root):
 *   node scripts/seed-deals.mjs            # dry run: shows SQL
 *   node scripts/seed-deals.mjs --sql      # output the SQL block
 *   WIP_ALLOW_WRITES=1 node scripts/seed-deals.mjs  # (when DB ready)
 */

import crypto from 'node:crypto'

/**
 * Generate a v4 UUID.
 */
function uuidv4() {
  return crypto.randomUUID()
}

const _ALLOW_WRITES = process.env.WIP_ALLOW_WRITES === '1'
const args = new Set(process.argv.slice(2))

/**
 * Sample deals from kenyonexpress.co.il (live source)
 */
const SAMPLE_DEALS = [
  {
    externalId: 'live-deal-001',
    nameHe: 'מסעדת לזאר - קופון ערב',
    descriptionHe: 'קופון ערב לזוגיים במסעדה פרימיום',
    categorySlug: 'restaurants-cafes',
    priceAgorot: 120000, // ₪1200
    fullPriceAgorot: 300000, // ₪3000
    stockQuantity: 50,
    imageUrl: 'https://kenyonexpress.co.il/images/products/lazar-1.jpg',
  },
  {
    externalId: 'live-deal-002',
    nameHe: 'ספא בת שבע - טיפול פנים מלא',
    descriptionHe: 'טיפול פנים דוקה זהב עם מסכה',
    categorySlug: 'beauty-health',
    priceAgorot: 80000, // ₪800
    fullPriceAgorot: 200000, // ₪2000
    stockQuantity: 30,
    imageUrl: 'https://kenyonexpress.co.il/images/products/spa-1.jpg',
  },
  {
    externalId: 'live-deal-003',
    nameHe: 'קורס אונליין - עיצוב גרפי',
    descriptionHe: 'קורס מלא בעיצוב גרפי עם סרטיקט',
    categorySlug: 'courses',
    priceAgorot: 150000, // ₪1500
    fullPriceAgorot: 450000, // ₪4500
    stockQuantity: 100,
    imageUrl: 'https://kenyonexpress.co.il/images/products/course-design.jpg',
  },
]

/**
 * Compute content hash for deduplication.
 */
function computeHash(nameHe, priceAgorot, supplierId = '') {
  const content = `${nameHe}::${priceAgorot}::${supplierId}`
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Escape single quotes in SQL values.
 */
function q(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replace(/'/g, "''")}'`
}

/**
 * Generate SQL INSERT for pending deals.
 */
function generateSQL(deals, sourceId) {
  const values = deals
    .map((deal) => {
      const contentHash = computeHash(deal.nameHe, deal.priceAgorot)
      const slug = deal.nameHe
        .toLowerCase()
        .replace(/[^֐-׿a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 50)

      return `(${q(uuidv4())}, ${q(sourceId)}, ${q(deal.externalId)}, ${q(contentHash)}, ${q(deal.nameHe)}, NULL, ${q(slug)}, ${q(deal.descriptionHe)}, NULL, (SELECT id FROM categories WHERE slug = ${q(deal.categorySlug)}), ${deal.priceAgorot}, ${deal.fullPriceAgorot ? q(deal.fullPriceAgorot) : 'NULL'}, ${deal.stockQuantity}, ${q(deal.imageUrl)}, 'pending', 'pending', NULL, now(), now(), now(), jsonb_build_object('source', 'live', 'externalId', ${q(deal.externalId)}))`
    })
    .join(',\n    ')

  return `-- Seed sample deals into pending_deals
-- BEFORE applying: verify deal_sources row exists with is_verified=true
-- RLS requires service_role, so this is applied via MCP apply_migration only

INSERT INTO public.pending_deals (
  id, source_id, external_id, content_hash,
  name_he, name_en, slug, description_he, description_en,
  category_id, price_agorot, full_price_agorot, stock_quantity,
  image_url, approval_status, image_validation_status, image_validation_error,
  created_at, updated_at, scraped_at, metadata
) VALUES
    ${values}
ON CONFLICT (content_hash) DO NOTHING;

-- Verify:
SELECT COUNT(*) as pending_deals_count FROM pending_deals
 WHERE approval_status = 'pending';`
}

/**
 * Main.
 */
async function main() {
  // In a real scenario, sourceId would come from deal_sources table
  // For now, use a fixed UUID for the "Live Site" source
  const LIVE_SITE_SOURCE_ID = '00000000-0000-0000-0000-000000000001'

  console.log('Deal seeding script (pattern: seed-catalogue.mjs)')
  console.log('━'.repeat(60))
  console.log()

  if (args.has('--sql')) {
    // Output SQL
    console.log(generateSQL(SAMPLE_DEALS, LIVE_SITE_SOURCE_ID))
    return
  }

  // Dry run: summary
  console.log(`Sample deals to seed: ${SAMPLE_DEALS.length}`)
  console.log(`Source ID: ${LIVE_SITE_SOURCE_ID}`)
  console.log()

  SAMPLE_DEALS.forEach((deal, i) => {
    const hash = computeHash(deal.nameHe, deal.priceAgorot)
    console.log(`${i + 1}. ${deal.nameHe}`)
    console.log(`   Price: ₪${deal.priceAgorot / 100} → ₪${deal.fullPriceAgorot / 100}`)
    console.log(`   Stock: ${deal.stockQuantity}`)
    console.log(`   Hash: ${hash.slice(0, 16)}...`)
    console.log()
  })

  console.log('⚠️  Dry run complete. No data written.')
  console.log()
  console.log('To generate SQL:')
  console.log('  node scripts/seed-deals.mjs --sql')
  console.log()
  console.log('To apply via MCP:')
  console.log('  1. Run: node scripts/seed-deals.mjs --sql')
  console.log('  2. Copy output to MCP apply_migration')
  console.log("  3. Verify: SELECT * FROM pending_deals WHERE approval_status = 'pending'")
}

main().catch(console.error)
