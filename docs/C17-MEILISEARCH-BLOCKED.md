# C17: Meilisearch Configuration - BLOCKED

**Date:** 2026-10-23  
**Status:** BLOCKED - Requires external Meilisearch instance provisioning

## Current State

### Vercel Production Environment
- ✅ `MEILISEARCH_HOST` is set (encrypted value)
- ✅ `MEILISEARCH_API_KEY` is set (encrypted value)
- ✅ Both variables exist for `production` target

### Production Behavior
- ❌ All searches use database fallback: `"engine": "database"`
- ✅ `/api/ready` reports `"meilisearch": "ok"` (health check passes)
- ❌ Actual search queries fail and fall back to Postgres ILIKE

**Evidence:**
```bash
curl https://www.kenyonexpress.co.il/api/search/facets?q=ספא
# Returns: "engine": "database"
```

## Root Cause Analysis

The environment variables are set in Vercel but either:
1. Point to a non-existent Meilisearch instance
2. Have invalid/expired credentials
3. Point to a misconfigured instance

The `/api/health` endpoint only checks if the host responds to `/health`, not whether the index works. The memory `production-meilisearch-silently-off.md` (from 2026-10-14) documents this same issue.

## What Needs to Happen

### Option A: Provision Meilisearch Cloud
1. Create account at https://cloud.meilisearch.com
2. Provision an instance (recommended: Paris/Frankfurt for EU proximity)
3. Get the instance URL and API key
4. Update Vercel env vars:
   ```bash
   vercel env rm MEILISEARCH_HOST production
   vercel env rm MEILISEARCH_API_KEY production
   vercel env add MEILISEARCH_HOST production
   # Enter: https://<instance-id>.meilisearch.io
   vercel env add MEILISEARCH_API_KEY production
   # Enter: <search-key>
   ```
5. Redeploy: `vercel deploy --prod`
6. Run setup script to create index:
   ```bash
   MEILISEARCH_HOST=<url> MEILISEARCH_API_KEY=<key> \
     node scripts/setup-meilisearch.mjs
   ```

### Option B: Self-Host Meilisearch
1. Deploy Meilisearch on Railway/Fly.io/DigitalOcean
2. Configure with MEILI_MASTER_KEY (minimum 16 bytes)
3. Generate search-only API key
4. Update Vercel env vars as above
5. Run setup script

### Option C: Local Development Setup
For testing locally:
```bash
docker compose up -d meilisearch
MEILISEARCH_HOST=http://127.0.0.1:7700 \
MEILISEARCH_API_KEY=kenyon-dev-master-key-change-me \
  node scripts/setup-meilisearch.mjs
```

## Files Ready for Deployment

### Setup Script
- ✅ `scripts/setup-meilisearch.mjs` - Creates index, applies settings, syncs products
- ✅ `src/lib/search/meili-settings.ts` - Index configuration (typo tolerance, synonyms, ranking)
- ✅ `src/lib/search/hebrew-synonyms.ts` - Hebrew synonym groups

### Synonyms
The goal mentions `docs/MEILI-SYNONYMS.json` but this file doesn't exist. The synonyms are defined in code at `src/lib/search/hebrew-synonyms.ts` and applied by the setup script.

## Why This Is Blocked

**Cannot be completed autonomously because:**
1. Cannot provision Meilisearch Cloud instances (requires payment method, account creation)
2. Cannot access encrypted Vercel env values to verify/debug current setup
3. Cannot determine if an instance exists at the configured URL (credentials hidden)

## Autonomous Work Completed

- ✅ Verified Vercel env vars exist
- ✅ Verified production search behavior (database fallback)
- ✅ Verified `/api/ready` response
- ✅ Located all Meilisearch setup scripts and configuration
- ✅ Documented docker-compose local setup
- ✅ Identified `scripts/setup-meilisearch.mjs` as the index rebuild tool

## Next Steps (Requires Manual Action)

1. **Provision Meilisearch instance** (Option A or B above)
2. **Update Vercel production env vars** with real credentials
3. **Redeploy production**
4. **Run setup script** to create index and sync products
5. **Verify** search returns `"engine": "meilisearch"`

## References

- Memory: `production-meilisearch-silently-off.md` (2026-10-14)
- Architecture: `ARCHITECTURE-SEARCH-DISCOVERY.md` (two-stage search contract)
- Dependencies: `docs/THIRD-PARTY-DEPENDENCIES.md` (Meilisearch optional, ~$30/mo)
- Setup guide: `scripts/setup-meilisearch.mjs` header comments
