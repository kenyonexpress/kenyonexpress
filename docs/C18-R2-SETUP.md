# C18: Cloudflare R2 Media Storage Setup

Status: CONFIGURED (awaiting R2 enablement on Cloudflare account)
Date: 2026-10-23

## Overview

Configured Cloudflare R2 for storing product images with AVIF/WebP variants. All code, env vars, and 375 assets are ready for upload once R2 is enabled on the Cloudflare account.

## Configuration Added

### Environment Variables

Added to `.env.production` and `.env.vercel`:

```bash
R2_ACCOUNT_ID="[SENSITIVE]"           # Cloudflare account ID
R2_ACCESS_KEY_ID="[SENSITIVE]"        # R2 API token access key
R2_SECRET_ACCESS_KEY="[SENSITIVE]"    # R2 API token secret
R2_BUCKET="[SENSITIVE]"               # Target bucket name (also aliased as R2_BUCKET_NAME)
R2_PUBLIC_BASE_URL="https://cdn.kenyonexpress.co.il"  # Public CDN URL
```

## Assets Ready for Upload

From `scripts/upload-r2.mjs --dry-run`:

- **375 objects** totaling 8.0MB
- **107 source images** from live WordPress site
- **268 derivatives** (AVIF/WebP variants at 380px width)
- **7 quarantined** Electro vendor assets (excluded from upload)

### Supported Formats

Source formats:
- JPEG, PNG, WebP, AVIF, GIF, SVG

Generated variants:
- AVIF (primary, modern browsers)
- WebP (fallback)
- Widths: 320px, 640px, 1920px (never upscaled)

## Integration Points

### 1. Image Upload Pipeline

**File:** `src/server/actions/admin/images.ts`

```typescript
// Admin uploads → sharp processing → R2 upload → media_assets table
async function runProcessAndUploadImage(formData: FormData)
```

Features:
- Hebrew alt text validation (mandatory)
- Size limit: 8MB original
- Dimension validation (min 200px, max 4000px)
- Automatic webp/avif conversion
- Blur placeholder generation
- 30s timeout for large uploads over slow connections

### 2. Presigned URLs

**File:** `src/lib/storage/r2.ts`

```typescript
export async function createR2PresignedPutUrl(
  key: string,
  expiresSeconds = 600
): Promise<{ uploadUrl: string; publicUrl: string }>
```

- SigV4 signing via Web Crypto (no AWS SDK dependency)
- 10-minute default expiry
- Browser uploads directly to R2 (bytes never pass through Next.js)

### 3. Public URL Generation

```typescript
export function r2PublicUrl(key: string): string {
  return `${R2_PUBLIC_BASE_URL}/${key}`
}
```

### 4. Configuration Check

```typescript
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    process.env.R2_PUBLIC_BASE_URL
  )
}
```

## Upload Script

**File:** `scripts/upload-r2.mjs`

### Dry Run (Safe to run anytime)

```bash
node scripts/upload-r2.mjs --dry-run
```

Shows what would be uploaded without sending anything.

### Live Upload (Run once R2 is enabled)

```bash
R2_ACCOUNT_ID=xxx \
R2_ACCESS_KEY_ID=xxx \
R2_SECRET_ACCESS_KEY=xxx \
R2_BUCKET=xxx \
node scripts/upload-r2.mjs --prefix=live-assets/
```

Features:
- Content-Type set per extension
- Cache-Control: `public, max-age=31536000, immutable`
- SigV4 signing without AWS SDK (60 lines node:crypto)
- Progress dots (one per upload)
- Exit 0 if all succeed, 1 if any fail

## Tests

**File:** `src/lib/r2/r2.test.ts`

Coverage:
- ✅ Presigned URL signing (GET vs PUT)
- ✅ Expiry clamping (1s to 7d)
- ✅ Path traversal rejection
- ✅ Variant width picking (320/640/1920)
- ✅ AVIF/WebP conversion (never upscales)

All tests passing.

## Current Blocker

**R2 not enabled on Cloudflare account**

From `scripts/upload-r2.mjs` header (measured 2026-09-06):

```
403 {"code":10042,"message":"Please enable R2 through the Cloudflare Dashboard."}
```

### To Resolve

1. Log into Cloudflare Dashboard
2. Navigate to R2 Object Storage
3. Enable R2 (may require payment method on file)
4. Create bucket (name should match `R2_BUCKET` env var)
5. Generate API token with R2 read/write permissions
6. Update env vars with real credentials (currently masked as [SENSITIVE])
7. Run upload script

## CDN Setup

Once R2 is enabled and assets uploaded:

1. Configure R2 custom domain: `cdn.kenyonexpress.co.il`
2. Point DNS CNAME to R2 bucket URL
3. Verify `R2_PUBLIC_BASE_URL` matches custom domain
4. Test image access via public URL

## Fallback Behavior

When R2 is not configured (`isR2Configured()` returns `false`):

- Image uploads fall back to Supabase Storage
- Existing code path, no changes needed
- Documented in `src/server/actions/admin/images.ts:49-65`

## Cache Control

All objects uploaded with:

```
Cache-Control: public, max-age=31536000, immutable
```

Rationale:
- Every object is content-addressed by source path
- Live assets that change get new paths from WordPress
- One year is the longest value browsers honor
- Immutable prevents revalidation checks

## Related Documentation

- `docs/ARCHITECTURE-MEDIA-R2.md` - Architecture binding
- `docs/MISSING-ASSETS.md` - Asset capture blockers
- `scripts/upload-r2.mjs` - Upload script (self-documented)
- `src/lib/storage/r2.ts` - Core R2 integration

## Next Steps

1. **Enable R2 on Cloudflare account** (manual, requires dashboard access)
2. **Update env vars** with real credentials (masked as [SENSITIVE] currently)
3. **Run upload script** to ingest 375 assets
4. **Configure CDN custom domain** `cdn.kenyonexpress.co.il`
5. **Verify image delivery** via R2 public URLs
6. **Update Vercel project** env vars to match production

## Verification Checklist

After R2 enablement:

- [ ] R2 enabled on Cloudflare account
- [ ] Bucket created (name matches `R2_BUCKET` env var)
- [ ] API token generated with R2 read/write permissions
- [ ] All 5 env vars set with real values
- [ ] `node scripts/upload-r2.mjs --dry-run` shows 375 objects
- [ ] `node scripts/upload-r2.mjs` uploads successfully
- [ ] Custom domain `cdn.kenyonexpress.co.il` configured
- [ ] Public URL `https://cdn.kenyonexpress.co.il/live-assets/[path]` resolves
- [ ] `isR2Configured()` returns `true` in production
- [ ] Admin image upload flow uses R2 (not Supabase Storage)
- [ ] Vercel project env vars updated
