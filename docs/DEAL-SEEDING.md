# Deal Seeding Infrastructure

Continuous automated deal scraping, deduplication, validation, and approval workflow.

## Overview

The deal seeding system enables:

1. **Continuous Scraping** — Fetch deals from approved sources (live site, vendor APIs)
2. **Automatic Deduplication** — SHA-256 content hashing prevents duplicate entries
3. **Image Validation** — Verify images exist and meet quality standards before approval
4. **Approval Workflow** — Human review of staged deals before publication
5. **Audit Trail** — Complete history of all scraped, approved, and rejected deals

## Architecture

```
Approved Sources (kenyonexpress.co.il, vendor APIs)
    ↓
Scraper (HTTP, API, webhook handlers)
    ↓
Deduplication (content hash check)
    ↓
pending_deals table (staged for review)
    ↓
Image Validation (HTTP HEAD, content type, size)
    ↓
Approval Workflow (human review)
    ↓
products table (published)
```

## Database Schema

### `deal_sources`
Configuration for approved scraping sources:
- `name` — Source identifier
- `url` — Scraping endpoint
- `scraper_type` — Type of scraper (`http`, `api`, `static`, `webhook`)
- `scraper_config` — Type-specific configuration
- `is_active` — Enable/disable scraping
- `is_verified` — Legal/compliance approval status
- Quality gates: `require_image`, `require_stock_info`, `minimum_stock_quantity`

### `pending_deals`
Deals awaiting approval:
- `source_id` — Which source provided this deal
- `external_id` — ID in the source system
- `content_hash` — SHA-256 for deduplication
- `name_he`, `description_he` — Hebrew content
- `category_id`, `supplier_id` — Catalog relationships
- `price_agorot`, `full_price_agorot` — Integer pricing
- `stock_quantity` — Available units
- `image_url`, `image_validation_status` — Media validation
- `approval_status` — `pending` | `approved` | `rejected` | `duplicate`

### `deal_duplicates`
Deduplication tracking:
- Maps duplicate deals to canonical entry
- Records confidence score and detection method
- Supports investigation of dedup errors

### `deal_validations`
Image and content health checks:
- Image reachability, content type, dimensions
- Content quality scores
- Category alignment validation
- Overall status: `pending` | `passed` | `failed` | `warning`

## API

### Scraping

#### `scrapeLiveSite()`
Fetch deals from kenyonexpress.co.il:

```typescript
const deals = await scrapeLiveSite()
// Returns: ScrapedDeal[]
```

#### `ingestScrapedDeals(sourceId, deals)`
Insert scraped deals into pending queue:

```typescript
const result = await ingestScrapedDeals(sourceId, deals)
// Returns: { inserted: number, duplicates: number, errors: string[] }
```

### Deduplication

#### `computeHash(nameHe, priceAgorot, supplierId)`
Generate content hash for dedup:

```typescript
const hash = computeHash('מסעדה', 100000, 'supplier-1')
// Returns: SHA-256 hex string
```

### Validation

#### `validateDealImage(dealId, imageUrl)`
Verify image existence and quality:

```typescript
const result = await validateDealImage(dealId, imageUrl)
// Returns: { isValid: boolean, error?: string, metadata?: {...} }
```

#### `validatePendingDeals(sourceId, limit)`
Batch validation of pending images:

```typescript
const result = await validatePendingDeals(sourceId, 100)
// Returns: { validated: number, passed: number, failed: number }
```

## Cron Job

**Endpoint:** `POST /api/cron/deal-scraper`  
**Schedule:** Every 30 minutes (`*/30 * * * *`)  
**Authorization:** `Bearer ${CRON_SECRET}`

### Request

```bash
curl -X POST https://kenyonexpress.com/api/cron/deal-scraper \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Response

```json
{
  "message": "Deal scraping complete: 42 deals found, 35 inserted, 7 duplicates",
  "results": [
    {
      "sourceId": "source-1",
      "dealsFound": 42,
      "dealsInserted": 35,
      "dealsSkipped": 7,
      "dealsRejected": 0,
      "duplicatesFound": 7,
      "errors": [],
      "startedAt": "2026-10-18T12:00:00Z",
      "completedAt": "2026-10-18T12:02:30Z"
    }
  ]
}
```

## Approval Workflow

### 1. Review Pending Deals
```sql
SELECT id, name_he, price_agorot, image_url, image_validation_status
  FROM pending_deals
 WHERE approval_status = 'pending'
   AND image_validation_status = 'valid'
 ORDER BY scraped_at DESC;
```

### 2. Approve Batch
```sql
-- Via application or SQL
SELECT approve_pending_deals(
  ARRAY['deal-id-1', 'deal-id-2'],
  'user-id'
);
```

This promotes approved deals to the `products` table with:
- `status = 'active'`
- `approval_status = 'approved'`
- Original `pending_deals` row marked `approval_status = 'approved'`

### 3. Reject or Request Changes
```sql
UPDATE pending_deals
   SET approval_status = 'rejected',
       approval_reason = 'Image quality too low'
 WHERE id = 'deal-id';
```

## Scraper Configuration

### Live Site Scraper
```json
{
  "name": "KenyonExpress Live Site",
  "url": "https://kenyonexpress.co.il/api/products",
  "scraper_type": "http",
  "scraper_config": {
    "method": "GET",
    "headers": {
      "User-Agent": "KenyonExpress-Scraper/1.0"
    },
    "timeout": 30000
  },
  "is_active": true,
  "is_verified": true,
  "scrape_interval_minutes": 30,
  "require_image": true,
  "require_stock_info": true,
  "minimum_stock_quantity": 1
}
```

## Quality Gates

Each deal must pass:

1. **Price Validation**
   - Positive integer agorot
   - Within configured price range

2. **Stock Validation**
   - Non-negative integer
   - Meets minimum threshold

3. **Content Validation**
   - Hebrew name (required)
   - Description provided
   - Category assigned

4. **Image Validation**
   - URL reachable (HTTP 200)
   - Valid image content type
   - Size < 10MB
   - Dimensions detected

5. **Deduplication**
   - No existing deal with same content hash
   - No already-approved product match

## Legal & Compliance

All sources must be:
- Listed in `deal_sources` table
- Marked `is_verified = true` (legal review completed)
- Have valid scraper configuration
- Comply with source TOS and robots.txt

**Current Approved Sources:**
- `kenyonexpress.co.il` (live site, fully licensed)

## Environment Variables

- `CRON_SECRET` — Bearer token for cron authorization
- `NTFY_TOPIC` — ntfy.sh topic for error alerts (default: `kenyon-ofir-limit`)

## Monitoring

### Metrics
```
Scraped deals per source
Deduplication ratio (duplicates / total)
Image validation pass rate
Approval rate
Time from scrape to approval
```

### Alerts
- Critical errors → high priority ntfy alert
- Validation failures → warning level alert
- Source unavailability → ntfy notification

### Dashboard
Access pending deals:
- `GET /api/admin/pending-deals` (paginated)
- Filter by `approval_status`, `source_id`, `image_validation_status`

## Testing

Run scraper tests:
```bash
pnpm test src/lib/deals/scraper.test.ts
pnpm test src/app/api/cron/deal-scraper/route.test.ts
```

Test scraping manually:
```bash
curl -X POST http://localhost:3000/api/cron/deal-scraper \
  -H "Authorization: Bearer dev-secret"
```

## Troubleshooting

### Deals not appearing
- Check `deal_sources` is active
- Verify scraper returning valid data
- Look for errors in `pending_deals.metadata`
- Check image validation status

### High duplicate rate
- Verify source deduplication rules
- Check if external IDs are stable
- Consider adjusting `computeHash` algorithm

### Image validation failing
- Verify image URLs are publicly reachable
- Check Content-Type headers
- Ensure images meet size limits

### Approval not working
- Verify user has admin role
- Check image_validation_status = 'valid'
- Ensure category_id is assigned

## Future Enhancements

1. **Webhook Support** — Accept deal pushes from vendors
2. **Smart Pricing** — Auto-detect discounts and compare-at prices
3. **Image Processing** — Auto-crop, optimize, generate variants
4. **Bulk Operations** — Approve/reject batches with filters
5. **Source Quality Score** — Track accuracy and timeliness per source
6. **ML Deduplication** — Similarity scoring for fuzzy matching
