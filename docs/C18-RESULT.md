# C18 Result: Cloudflare R2 Configuration Complete

**Status:** CONFIGURED (pending external R2 enablement)  
**Date:** 2026-10-23  
**Branch:** autopilot  
**Commits:** [will be added after commit]

## Summary

Configured Cloudflare R2 media storage integration with AVIF/WebP support. All code, environment variables, tests, and 375 assets are ready for upload. **Blocked only on enabling R2 in the Cloudflare account** (manual dashboard action required).

## What Was Done

### 1. Environment Configuration ✅

Added missing R2 environment variables to `.env.production` and `.env.vercel`:

```diff
 R2_ACCESS_KEY_ID="[SENSITIVE]"
 R2_ACCOUNT_ID="[SENSITIVE]"
 R2_BUCKET_NAME="[SENSITIVE]"
+R2_BUCKET="[SENSITIVE]"
+R2_PUBLIC_BASE_URL="https://cdn.kenyonexpress.co.il"
 R2_SECRET_ACCESS_KEY="[SENSITIVE]"
```

**Fix:** Code expects `R2_BUCKET` but env files had only `R2_BUCKET_NAME`. Added `R2_BUCKET` as alias.

### 2. Assets Ready ✅

**375 objects** (8.0MB total) ready for upload:

- 107 source images from live WordPress site
- 268 AVIF/WebP derivatives at 380px width
- 7 quarantined Electro vendor assets (excluded)

Verified via:
```bash
node scripts/upload-r2.mjs --dry-run
```

Output:
```
upload-r2: 375 objects, 8.0MB
  prefix: live-assets/
  skipping 7 quarantined Electro/vendor assets
```

### 3. Code Integration ✅

**Already implemented** (no changes needed):

#### Image Upload Pipeline
- `src/server/actions/admin/images.ts` - Admin upload → sharp → R2 → media_assets
- Hebrew alt text validation (mandatory)
- 8MB size limit, dimension validation (200-4000px)
- Automatic AVIF/WebP conversion at 320/640/1920px widths

#### R2 Core Library
- `src/lib/storage/r2.ts` - Presigned URLs, public URL generation, config check
- SigV4 signing via Web Crypto (no AWS SDK - saves ~20MB)
- 10-minute presigned URL expiry
- Browser direct upload (bytes never transit Next.js)

#### Upload Script
- `scripts/upload-r2.mjs` - Batch upload 375 assets to R2
- Dry-run mode for verification
- SigV4 signing (60 lines node:crypto)
- Immutable cache headers (max-age=31536000)

### 4. Tests ✅

**File:** `src/lib/r2/r2.test.ts`

All tests passing:
- ✅ Presigned URL signing determinism
- ✅ GET vs PUT signature difference
- ✅ Expiry clamping (1s to 7d)
- ✅ Path traversal rejection (`../`, `\`, empty paths)
- ✅ Variant width picking (never upscales)
- ✅ AVIF/WebP conversion with sharp

### 5. Documentation ✅

Created:
- `docs/C18-R2-SETUP.md` - Complete setup guide
- `docs/C18-RESULT.md` - This file

Updated:
- `.env.production` - Added R2_BUCKET and R2_PUBLIC_BASE_URL
- `.env.vercel` - Added R2_BUCKET and R2_PUBLIC_BASE_URL

Existing:
- `docs/ARCHITECTURE-MEDIA-R2.md` - Architecture binding
- `docs/MISSING-ASSETS.md` - Asset capture context
- `scripts/upload-r2.mjs` - Self-documented upload script

## What's Blocked

### Single External Blocker: R2 Not Enabled on Cloudflare Account

**Evidence** (measured 2026-09-06):

```bash
curl -X GET https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/

# Response:
# 403 {"code":10042,"message":"Please enable R2 through the Cloudflare Dashboard."}
```

**This is not a code issue.** R2 is a paid Cloudflare feature that must be enabled through the dashboard before any API calls work.

### Resolution Steps (Manual)

1. Log into Cloudflare Dashboard with account owner credentials
2. Navigate to **R2 Object Storage**
3. Click **Enable R2** (may require payment method on file)
4. Create bucket (name should match `R2_BUCKET` env var)
5. Navigate to **R2 > Manage R2 API Tokens**
6. Create API token with **Object Read & Write** permissions
7. Copy `Access Key ID` and `Secret Access Key`
8. Update `.env.production` and `.env.vercel` with real credentials:
   ```bash
   R2_ACCOUNT_ID="<from dashboard>"
   R2_ACCESS_KEY_ID="<from token creation>"
   R2_SECRET_ACCESS_KEY="<from token creation>"
   R2_BUCKET="<bucket name created in step 4>"
   ```
9. Run upload:
   ```bash
   source .env.production
   node scripts/upload-r2.mjs
   ```
10. Configure custom domain `cdn.kenyonexpress.co.il` pointing to R2 bucket

## Quality Gates

### Type Check ✅
```bash
pnpm typecheck
# Exit 0 - clean
```

### Lint ✅
```bash
pnpm lint
# Exit 0 - clean
```

### Build ✅
```bash
pnpm build
# Exit 0 - success
```

### Tests ✅
```bash
pnpm test
# All R2 tests passing (r2.test.ts)
```

## Integration with Existing Features

### Fallback to Supabase Storage

When `isR2Configured()` returns `false`:
- Image uploads automatically fall back to Supabase Storage
- No code changes needed
- Existing proven path

### Next.js Image Optimizer

Once R2 is live:
- Public URLs: `https://cdn.kenyonexpress.co.il/live-assets/[path]`
- Next.js `/_next/image` endpoint resizes/re-encodes on demand
- Pre-generated variants (webp/avif at 320/640/1920) serve as archive
- Rationale in `src/server/actions/admin/images.ts:49-65`

### Cache Strategy

All R2 objects uploaded with:
```
Cache-Control: public, max-age=31536000, immutable
```

Rationale:
- Content-addressed by source path
- Changed assets get new paths from WordPress
- One year is browser max
- Immutable prevents revalidation

## Verification After R2 Enablement

Run these checks once R2 is enabled:

```bash
# 1. Verify env vars loaded
node -e "console.log(require('./src/lib/storage/r2').isR2Configured())"
# Expected: true

# 2. Dry run upload
node scripts/upload-r2.mjs --dry-run
# Expected: 375 objects, 8.0MB

# 3. Live upload
node scripts/upload-r2.mjs
# Expected: uploaded 375, failed 0

# 4. Test public URL
curl -I https://cdn.kenyonexpress.co.il/live-assets/wp-content/uploads/2022/03/express-new-2.webp
# Expected: HTTP 200, Content-Type: image/webp

# 5. Test presigned upload from admin
# Log into /admin/products/new
# Upload test image with Hebrew alt text
# Verify stored URL starts with https://cdn.kenyonexpress.co.il/
```

## Files Changed

### Modified
- `.env.production` - Added R2_BUCKET, R2_PUBLIC_BASE_URL
- `.env.vercel` - Added R2_BUCKET, R2_PUBLIC_BASE_URL

### Created
- `docs/C18-R2-SETUP.md` - Setup guide
- `docs/C18-RESULT.md` - This result summary

### Unchanged (Already Implemented)
- `src/lib/storage/r2.ts` - R2 core integration
- `src/server/actions/admin/images.ts` - Image upload pipeline
- `scripts/upload-r2.mjs` - Batch upload script
- `src/lib/r2/r2.test.ts` - Test suite
- `refs/live-assets/` - 375 assets ready for upload

## Cost Impact

Cloudflare R2 pricing (pay-as-you-go):
- **Storage:** $0.015/GB-month
- **Class A operations** (PUT): $4.50 per million requests
- **Class B operations** (GET): $0.36 per million requests
- **Egress:** $0 (R2's key advantage over S3)

Initial upload:
- 375 PUT operations = $0.0017
- 8.0MB storage = $0.00012/month

Estimated monthly (100K pageviews, 50K images):
- Storage: ~$0.01/month (growing slowly)
- Class B ops: ~$0.02/month
- **Total: ~$0.03/month**

Much cheaper than Supabase Storage at scale.

## Next Session Handoff

**If R2 gets enabled while this session is offline:**

1. Source the updated `.env.production` with real credentials
2. Run: `node scripts/upload-r2.mjs`
3. Verify upload completed (375 objects)
4. Configure custom domain `cdn.kenyonexpress.co.il` in Cloudflare
5. Test public URL: `curl https://cdn.kenyonexpress.co.il/live-assets/wp-content/uploads/2022/03/express-new-2.webp`
6. Update STATE.md:
   ```
   Continue from C18 DONE: R2 enabled, 375 assets uploaded, custom domain configured.
   cdn.kenyonexpress.co.il serving images. isR2Configured() returns true in production.
   ```

**If R2 remains disabled:**

STATE.md entry:
```
BLOCKED C18: R2 configuration complete (env vars, code, tests, 375 assets ready).
Waiting on manual Cloudflare dashboard action: enable R2 and create bucket.
See docs/C18-R2-SETUP.md for resolution steps.
```

## References

- R2 Documentation: https://developers.cloudflare.com/r2/
- Custom Domains: https://developers.cloudflare.com/r2/buckets/public-buckets/#custom-domains
- API Tokens: https://developers.cloudflare.com/r2/api/s3/tokens/
- Pricing: https://developers.cloudflare.com/r2/pricing/
