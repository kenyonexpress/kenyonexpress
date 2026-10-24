# Meilisearch Setup

## Overview

Kenyonexpress uses Meilisearch for Hebrew product search with:
- **Hebrew synonyms** (50+ bidirectional pairs + prefix forms)
- **Hebrew-tuned typo tolerance** (4/7 chars instead of default 5/9)
- **Smart ranking** (in-stock products ranked higher)
- **Geo search** capabilities for location-based deals
- **Database fallback** when Meilisearch is unavailable

## Production Configuration

### Required Environment Variables

Set in Vercel project settings:

```bash
MEILISEARCH_HOST=https://<instance>.meilisearch.io
MEILISEARCH_API_KEY=<master-key>
MEILISEARCH_INDEX=products  # optional, defaults to "products"
```

### Recommended: Paris Region Instance

**Why Paris?**
- Closest Meilisearch Cloud region to Israel
- Low latency for Hebrew search queries
- GDPR-compliant European hosting

**Setup Steps:**

1. **Create instance**
   - Go to https://cloud.meilisearch.com
   - New project → Select Paris (eu-west-3)
   - Choose plan (Starter for dev, Pro for production)

2. **Get credentials**
   - Copy the instance URL (ends with `.meilisearch.io`)
   - Copy the Master API key from dashboard

3. **Set in Vercel**
   ```bash
   vercel env add MEILISEARCH_HOST production
   # Paste: https://your-instance.meilisearch.io
   
   vercel env add MEILISEARCH_API_KEY production
   # Paste: your-master-key
   ```

4. **Initial seed**
   ```bash
   # From local with production env loaded
   MEILISEARCH_HOST=<prod-host> \
   MEILISEARCH_API_KEY=<prod-key> \
   NEXT_PUBLIC_SUPABASE_URL=<prod-url> \
   SUPABASE_SECRET_KEY=<prod-key> \
   node scripts/setup-meilisearch.mjs
   ```

## Index Configuration

Defined in `src/lib/search/meili-settings.ts`:

### Searchable Attributes (in ranking order)
1. `name_he` - Hebrew product name
2. `name_en` - English name
3. `brand` - Product brand
4. `category_name_he` - Category name
5. **`city`** - Location (ranked above descriptions for "place + thing" queries)
6. `tags` - Product tags
7. `supplier_name` - Supplier name
8. `short_description_he` - Short description
9. `description_he` - Full description
10. `sku` - Product SKU (exact match only, no typos)

### Hebrew Synonyms

Located in `src/lib/search/hebrew-synonyms.ts`:

**13 synonym groups** covering:
- Eating out (מסעדה, אוכל, ארוחה, etc.)
- Cafes (בית קפה, קפה, קפיטריה)
- Pampering (ספא, עיסוי, פינוק, מסאז)
- Getaways (נופש, חופשה, מלון, צימר)
- Fitness (כושר, ספורט, אימון)
- Occasions (מתנה, שובר, קופון)
- Physical goods (חיתול, חיתולים, חיתולי)

**Features:**
- Bidirectional matching (search any term, get all variants)
- Hebrew prefix generation (ה, ו, ב, ל, מ, ש, כ)
- Only for words 3+ characters to avoid false matches

Example: Searching "מסעדה" matches:
```
מסעדה, מסעדות, אוכל, ארוחה, ארוחות, מסעדן,
המסעדה, במסעדה, למסעדה, ומסעדה, משמסעדה, כמסעדה
# + all prefixed forms of the other synonyms
```

### Typo Tolerance

Tuned for Hebrew's shorter words:
```typescript
{
  oneTypo: 4,   // allow 1 typo from 4 chars (not 5)
  twoTypos: 7,  // allow 2 typos from 7 chars (not 9)
  disableOnAttributes: ['sku', 'slug', 'barcode']
}
```

Hebrew words are systematically shorter because they're written without vowels:
- מסעדה (5 chars) - now gets typo tolerance
- ספא (3 chars) - still exact match only (correct)

### Ranking Rules

```typescript
[
  'words',         // all query words must appear
  'typo',          // fewer typos = better
  'in_stock:desc', // in-stock products ranked higher
  'proximity',     // words closer together = better
  'attribute',     // match in name > match in description
  'sort',          // explicit sort parameter
  'exactness',     // exact match > prefix match
]
```

**Key feature:** `in_stock:desc` is inserted before `proximity` so an in-stock near-match beats an out-of-stock exact match.

### Filterable Attributes

```typescript
type, category_id, category_slug, city, tags, 
supplier_id, kenyon_price, discount_percent, 
in_stock, _geo
```

Enables faceted search:
```javascript
// Products in Tel Aviv under ₪100
filter: 'city = "תל אביב" AND kenyon_price < 10000'

// Deals 30% off or better, in stock
filter: 'discount_percent >= 30 AND in_stock = true'

// Within 5km of coordinates
filter: '_geoRadius(32.0853, 34.7818, 5000)'
```

### Sortable Attributes

```typescript
kenyon_price, discount_percent, created_at, _geo
```

Enables sorting:
```javascript
sort: ['kenyon_price:asc']         // cheapest first
sort: ['discount_percent:desc']    // biggest saving first
sort: ['_geoPoint(lat, lng):asc']  // nearest first
```

## Seeding & Updates

### Initial Seed

```bash
# Production
MEILISEARCH_HOST=<prod> MEILISEARCH_API_KEY=<prod> \
NEXT_PUBLIC_SUPABASE_URL=<prod> SUPABASE_SECRET_KEY=<prod> \
node scripts/setup-meilisearch.mjs

# Or via TypeScript wrapper
tsx scripts/seed-meilisearch.ts
```

### Settings-Only Update

When you change `meili-settings.ts` or `hebrew-synonyms.ts`:

```bash
MEILISEARCH_HOST=<host> MEILISEARCH_API_KEY=<key> \
node scripts/setup-meilisearch.mjs --settings-only
```

No Supabase credentials needed.

### Continuous Sync

Products are indexed in real-time via `src/lib/search/indexer.ts`:
- On product create/update → pushed to Meilisearch
- On product delete → removed from index
- On stock change → `in_stock` field updated

Triggered by:
- Admin product mutations
- CSV imports
- QStash webhook (for async bulk updates)

## Health Check

The `/api/ready` endpoint checks Meilisearch:

```json
{
  "ok": true,
  "dependencies": [
    {
      "name": "search",
      "status": "ok",           // or "down" or "not_configured"
      "latencyMs": 45,
      "detail": "Meilisearch"
    }
  ]
}
```

Status meanings:
- **ok** - Meilisearch `/health` responded 200
- **down** - Host/key set but instance not reachable
- **not_configured** - `MEILISEARCH_HOST` or `MEILISEARCH_API_KEY` missing (search falls back to Postgres)

## Fallback Behavior

When Meilisearch is down or not configured, search automatically falls back to Postgres ILIKE:

```typescript
// src/lib/search-server.ts
if (meiliConfigured()) {
  const meili = await searchMeili(q, limit, productType)
  if (meili) return meili
}
return searchDb(q, limit, productType)
```

The database fallback:
- Uses the **same Hebrew synonyms** via `expandQueryWord()`
- Searches `name_he`, `description_he`, and `city`
- Requires every query word to match (AND logic)
- No typo tolerance
- No ranking (simple relevance)

Result shape is identical:
```typescript
{ results: Product[], total: number, engine: 'meilisearch' | 'database' }
```

The `engine` field lets the UI show which backend served the query.

## Troubleshooting

### "Meilisearch מוגדר אך אינו עונה"

Health check returns `down`. Possible causes:

1. **Instance paused** (free tier auto-pauses)
   - Check Meilisearch Cloud dashboard
   - Restart instance

2. **Wrong URL format**
   - Should be: `https://instance.meilisearch.io`
   - **Not**: `https://instance.meilisearch.io/` (trailing slash)
   - **Not**: `http://` (must be HTTPS in production)

3. **Invalid API key**
   - Re-generate Master Key in dashboard
   - Update Vercel env var
   - Redeploy

4. **Network/firewall block**
   - Vercel can reach `.meilisearch.io` by default
   - Self-hosted? Check firewall rules

### Index exists but searches return nothing

1. **Check index is seeded**
   ```bash
   curl 'https://<host>/indexes/products/stats' \
     -H 'Authorization: Bearer <key>'
   # Look for numberOfDocuments > 0
   ```

2. **Re-seed from scratch**
   ```bash
   # Delete index
   curl -X DELETE 'https://<host>/indexes/products' \
     -H 'Authorization: Bearer <key>'
   
   # Re-create and seed
   node scripts/setup-meilisearch.mjs
   ```

3. **Check filter syntax**
   - Filter values must be exact: `type = coupon` not `type LIKE '%coupon%'`
   - Strings need quotes: `city = "תל אביב"` not `city = תל אביב`

### Hebrew text appears garbled

Not a Meilisearch issue - check:
1. Database column encoding (should be UTF-8)
2. API response `Content-Type: application/json; charset=utf-8`
3. Vercel deployment region (any region handles UTF-8 correctly)

### Synonyms not working

1. **Verify synonyms are applied**
   ```bash
   curl 'https://<host>/indexes/products/settings/synonyms' \
     -H 'Authorization: Bearer <key>'
   ```

2. **Re-apply settings**
   ```bash
   node scripts/setup-meilisearch.mjs --settings-only
   ```

3. **Clear search cache**
   - Meilisearch has no query cache
   - But Next.js caches `/api/search` for 30s
   - Wait or clear CDN cache

## References

- [Meilisearch Cloud](https://cloud.meilisearch.com)
- [Meilisearch Docs](https://www.meilisearch.com/docs)
- [Hebrew synonyms source](../src/lib/search/hebrew-synonyms.ts)
- [Index settings](../src/lib/search/meili-settings.ts)
- [Setup script](../scripts/setup-meilisearch.mjs)
- [Search server](../src/lib/search-server.ts)
