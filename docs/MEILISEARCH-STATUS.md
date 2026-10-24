# Meilisearch Production Status

**Last Updated:** 2026-10-25  
**Status:** ⚠️ CONFIGURED BUT UNVERIFIED

## Current State

### Environment Variables

| Variable | Status | Location |
|----------|--------|----------|
| `MEILISEARCH_HOST` | ✅ Set | Vercel production env |
| `MEILISEARCH_API_KEY` | ✅ Set | Vercel production env (encrypted) |
| `MEILISEARCH_INDEX` | Optional | Defaults to `products` |

**Set Date:** 2026-09-02 (MEILISEARCH_HOST), 2026-09-04 (MEILISEARCH_API_KEY)

### Code Deployment

| Component | Status | Location |
|-----------|--------|----------|
| Hebrew synonyms | ✅ Complete | `src/lib/search/hebrew-synonyms.ts` |
| Index settings | ✅ Complete | `src/lib/search/meili-settings.ts` |
| Search server | ✅ Complete | `src/lib/search-server.ts` |
| Real-time indexer | ✅ Complete | `src/lib/search/indexer.ts` |
| Health check | ✅ Complete | `src/lib/health/checks.ts` |
| Setup script | ✅ Complete | `scripts/setup-meilisearch.mjs` |
| TypeScript seed wrapper | ✅ Complete | `scripts/seed-meilisearch.ts` |

All code merged to `main` and deployed to production.

### Hebrew Synonyms

**13 synonym groups** with 50+ bidirectional term pairs:

1. **Eating out** (6 terms): מסעדה, מסעדות, אוכל, ארוחה, ארוחות, מסעדן
2. **Cafes** (4 terms): בית קפה, בתי קפה, קפה, קפיטריה
3. **Bars** (4 terms): בר, ברים, פאב, פאבים
4. **Pampering/spa** (7 terms): ספא, ספאים, עיסוי, עיסויים, פינוק, מסאז, מסאז׳
5. **Beauty** (3 terms): טיפוח, קוסמטיקה, יופי
6. **Haircuts** (4 terms): מספרה, מספרות, תספורת, תספורות
7. **Getaways** (7 terms): נופש, חופשה, חופשות, מלון, מלונות, צימר, צימרים
8. **Attractions** (6 terms): אטרקציה, אטרקציות, חוויה, חוויות, בילוי, בילויים
9. **Fitness** (5 terms): כושר, חדר כושר, ספורט, אימון, אימונים
10. **Gifts** (7 terms): מתנה, מתנות, שובר, שוברים, גיפט, קופון, קופונים
11. **Birthday** (3 terms): יום הולדת, יומולדת, הולדת
12. **Couple/romantic** (5 terms): זוגי, זוגית, רומנטי, רומנטית, לזוג
13. **Diapers** (3 terms): חיתול, חיתולים, חיתולי

Each base term is expanded with Hebrew prefixes (ה, ו, ב, ל, מ, ש, כ) where applicable, generating **hundreds of searchable variants**.

Example expansion:
```
מסעדה → [
  מסעדה, המסעדה, ומסעדה, במסעדה, למסעדה, 
  ממסעדה, שמסעדה, כמסעדה
]
```

Plus all prefixed forms of the 5 other synonyms in that group.

### Index Configuration

**Typo tolerance:** Tuned for Hebrew (4/7 instead of default 5/9)  
**Ranking:** In-stock products ranked higher than out-of-stock  
**Geo search:** Enabled via `_geo` field  
**Stop words:** 8 Hebrew conjunctions/fillers  

See [`docs/MEILISEARCH-SETUP.md`](./MEILISEARCH-SETUP.md) for full configuration details.

## Instance Status

### Known State (from memory)

According to production health checks:
- **Engine:** `'database'` (Postgres fallback, not Meilisearch)
- **Last probe:** Memory indicates "engine database is inactive"
- **Diagnosis:** Instance may be paused, unreachable, or URL/key incorrect

### What Works

✅ **Database fallback** - Search works via Postgres ILIKE  
✅ **Hebrew synonyms** - Applied in fallback path via `expandQueryWord()`  
✅ **All routes functional** - `/api/search`, search page, search dropdown  
✅ **Tests passing** - 114 search tests green across 10 files  

### What's Missing

⚠️ **Meilisearch benefits:**
- Typo tolerance (database is exact match only)
- Relevance ranking (database has no scoring)
- Performance at scale (database is ILIKE over full table)
- Geo radius search (database has no spatial index)
- Faceted search with counts (database requires separate queries)

## Actions Needed

### To Activate Production Meilisearch

1. **Verify instance exists and is running**
   - Check Meilisearch Cloud dashboard
   - Ensure instance is not paused (free tier auto-pauses)
   - Verify region (should be Paris for low latency to Israel)

2. **Test credentials**
   ```bash
   curl 'https://<MEILISEARCH_HOST>/health' \
     -H 'Authorization: Bearer <MEILISEARCH_API_KEY>'
   # Should return: {"status":"available"}
   ```

3. **Seed the index**
   ```bash
   # With production credentials
   MEILISEARCH_HOST=<prod> \
   MEILISEARCH_API_KEY=<prod> \
   NEXT_PUBLIC_SUPABASE_URL=<prod> \
   SUPABASE_SECRET_KEY=<prod> \
   node scripts/setup-meilisearch.mjs
   ```

4. **Verify health endpoint**
   ```bash
   curl 'https://kenyonexpress.vercel.app/api/ready'
   # Check dependencies.search.status == "ok"
   ```

5. **Test Hebrew search**
   ```bash
   curl 'https://kenyonexpress.vercel.app/api/search?q=ספא'
   # Should return results with engine: "meilisearch"
   ```

### If Instance Doesn't Exist

Create new Paris region instance per [`docs/MEILISEARCH-SETUP.md`](./MEILISEARCH-SETUP.md#recommended-paris-region-instance).

## Performance Baseline

### Database Fallback (Current)

Measured 2026-09-08 against production:
- **Latency:** 200-400ms per query (depends on table size)
- **Capacity:** Rate limited to 120 queries per IP per 5 minutes
- **Coverage:** 61 active products indexed
- **Synonym support:** ✅ Via `expandQueryWord()`
- **Typo tolerance:** ❌ Exact match only
- **Ranking:** ❌ No relevance scoring

### Expected with Meilisearch

Based on Meilisearch Cloud specs (Paris region):
- **Latency:** 10-50ms per query (faster, consistent)
- **Capacity:** No rate limit on search (only on indexing)
- **Coverage:** Same 61 products, real-time sync
- **Synonym support:** ✅ Same synonym groups
- **Typo tolerance:** ✅ 1 typo from 4 chars, 2 from 7
- **Ranking:** ✅ Multi-factor relevance (words, typo, proximity, attribute, stock, exactness)
- **Geo search:** ✅ Radius filtering + distance sorting
- **Facets:** ✅ Count by category, city, discount, stock

## Test Coverage

| Test File | Tests | Status |
|-----------|-------|--------|
| `search.routes.test.ts` | 18 | ✅ Pass |
| `search.indexer.test.ts` | 12 | ✅ Pass |
| `search.pipeline-contracts.test.ts` | 9 | ✅ Pass |
| `search.qstash.test.ts` | 8 | ✅ Pass |
| `search-server.test.ts` | 14 | ✅ Pass |
| `golden-queries.test.ts` | 9 | ✅ Pass |
| `golden-queries-db.test.ts` | 9 | ✅ Pass |
| `hebrew-synonyms.test.ts` | 11 | ✅ Pass |
| `meili-settings.test.ts` | 15 | ✅ Pass |
| `meili-request.test.ts` | 9 | ✅ Pass |
| **Total** | **114** | **✅ All pass** |

All tests run in CI on every push.

## Real-Time Sync Status

The indexer (`src/lib/search/indexer.ts`) is wired to:

✅ Admin product create/update actions  
✅ CSV import pipeline  
✅ QStash webhook for bulk updates  
✅ Stock quantity changes  
✅ Product deletion (removes from index)  

**But:** Sync only runs when Meilisearch is configured and reachable. With the current `database` fallback, products are **not** being pushed to Meilisearch.

Once the instance is verified and activated, all product changes will sync automatically with no code changes needed.

## Next Steps

1. **Verify Vercel env vars point to a real, running Meilisearch instance**
2. **Seed the production index** (one-time via `setup-meilisearch.mjs`)
3. **Confirm health check returns `"ok"`** (not `"not_configured"` or `"down"`)
4. **Test a Hebrew query** and verify `engine: "meilisearch"` in response
5. **Monitor `/api/ready` dashboard** for search dependency status
6. **Update this doc** with verified instance details and performance metrics

## References

- Setup guide: [`docs/MEILISEARCH-SETUP.md`](./MEILISEARCH-SETUP.md)
- Hebrew synonyms: [`src/lib/search/hebrew-synonyms.ts`](../src/lib/search/hebrew-synonyms.ts)
- Index settings: [`src/lib/search/meili-settings.ts`](../src/lib/search/meili-settings.ts)
- Search server: [`src/lib/search-server.ts`](../src/lib/search-server.ts)
- Health checks: [`src/lib/health/checks.ts`](../src/lib/health/checks.ts)
