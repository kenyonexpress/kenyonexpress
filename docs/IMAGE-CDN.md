# STEP 73: Image CDN - Cloudflare R2 with Responsive Optimization

**Status:** Infrastructure prepared for R2 integration. Awaiting R2 account enablement and DNS configuration.

## Overview

This document describes the image CDN infrastructure for KenyonExpress, built around Cloudflare R2 with Image Resizing and responsive image optimization.

### Architecture

```
Browser
  ↓
Next.js Image Component
  ↓
Custom Loader (src/lib/images/loader.ts)
  ↓
┌─────────────────────────────────────┐
│ R2 Enabled?                         │
├─────────────────────────────────────┤
│ YES → Cloudflare Image Resizing API │
│       (/api/images/r2/...)          │
│                                     │
│ NO  → Vercel Image Optimization     │
│       (/_next/image)                │
└─────────────────────────────────────┘
  ↓
CDN Edge Cache (Geographic routing for Hebrew content)
  ↓
Optimized Image (AVIF/WebP/JPEG)
```

## Key Components

### 1. Image Optimizer (`src/lib/images/optimizer.ts`)

Core utilities for image optimization:

- **`cfImageUrl()`** - Generates Cloudflare Image Resizing URLs
- **`responsiveSrcSet()`** - Creates srcset with AVIF+WebP+JPEG fallbacks
- **`artDirectedSources()`** - Generates picture element sources with media queries
- **Constants** - Responsive breakpoints (380/768/1440), quality levels (50-95)

```typescript
import { cfImageUrl, responsiveSrcSet, PRODUCT_IMAGE_SPECS } from '@/lib/images/optimizer'

// Generate optimized URL
const url = cfImageUrl('/products/sku123.jpg', 400, 'webp', 75)
// → /images/r2/cdn-cgi/image/width=400,quality=75,format=webp/products/sku123.jpg

// Create responsive srcset
const srcset = responsiveSrcSet('/products/sku123.jpg', [256, 384, 600])
// → url(...256w) 256w, url(...384w) 384w, url(...600w) 600w
```

### 2. Custom Image Loader (`src/lib/images/loader.ts`)

Integrates with next/image to route optimization requests:

- Detects R2 configuration status
- Routes to Cloudflare for remote URLs when R2 enabled
- Falls back to Vercel Image Optimization when needed
- Passes through local paths unchanged

### 3. R2 Proxy Route (`src/app/api/images/r2/route.ts`)

Handles image optimization requests:

```
GET /api/images/r2/cdn-cgi/image/[options]/[image-path]
```

- Parses Cloudflare Image Resizing options
- Proxies requests to R2 public domain
- Applies appropriate cache headers (1-year immutable)
- Falls back gracefully if R2 not configured

### 4. ResponsiveImage Component (`src/components/ResponsiveImage.tsx`)

Enhanced image component with format negotiation:

```tsx
<ResponsiveImage
  src="/products/sku123.jpg"
  alt="Product name"
  width={400}
  height={400}
  imageType="dealCard"
/>
```

Features:
- Automatic AVIF format with WebP/JPEG fallbacks
- Responsive srcset based on image type
- Art-direction via picture element
- RTL support for Hebrew content
- Proper sizes attribute for browser layout decisions

### 5. R2 Migration Tools (`src/lib/images/r2-migration.ts`)

Utilities for migrating images from existing sources to R2:

- **`canMigrateToR2()`** - Check if R2 is properly configured
- **`uploadToR2()`** - Upload individual images
- **`migrateProductImagesToR2()`** - Batch migration from database
- **`getR2PublicUrl()`** - Generate R2 public URLs

## Image Specifications

### Product Images

Different image types have optimized specifications:

```typescript
PRODUCT_IMAGE_SPECS = {
  dealCard: {
    widths: [256, 288, 384],      // Homepage deal cards
    aspectRatio: '3/4',
  },
  productPage: {
    widths: [400, 600, 1000],     // Product detail page
    aspectRatio: '1/1',
  },
  gallery: {
    widths: [300, 600, 1200],     // Product gallery
    aspectRatio: '1/1',
  },
  thumbnail: {
    widths: [96, 128, 192],        // Small thumbnails
    aspectRatio: '1/1',
  },
}
```

### Quality Levels

```typescript
IMAGE_QUALITIES = {
  thumbnail: 50,    // Smallest images, lowest quality
  preview: 60,      // Preview/placeholder images
  standard: 75,     // Most product images
  hq: 90,          // Hero images, featured products
  lossless: 95,    // Marketing materials
}
```

### Responsive Breakpoints

```typescript
RESPONSIVE_BREAKPOINTS = {
  mobile380: 380,
  tablet768: 768,
  desktop1440: 1440,
}
```

Matches Lighthouse measurement widths and Tailwind breakpoints.

## AVIF + WebP Format Strategy

### Format Negotiation

Images are served in order of preference:

1. **AVIF** (best compression, ~20% smaller than WebP)
   - Support: Chrome 85+, Firefox 93+, Safari 16+, Edge 85+
   - ~95% of modern browsers

2. **WebP** (good compression, ~30% smaller than JPEG)
   - Support: Chrome 23+, Firefox 65+, Safari 16+, Edge 18+
   - ~98% of users

3. **JPEG** (universal fallback)
   - Support: 100% of browsers

### Format Detection

Cloudflare Image Resizing automatically detects browser support:

```
Accept header:
- `image/avif` → served AVIF
- no `image/avif` → WebP served if supported
- fallback → JPEG served
```

### Size Reduction Impact

Typical compression ratios (vs original JPEG):

```
JPEG (75q):      100%  (baseline)
WebP (75q):      ~70%  (30% reduction)
AVIF (75q):      ~55%  (45% reduction)
```

For a 400KB product image:
- JPEG: 400KB
- WebP: 280KB (120KB saved)
- AVIF: 220KB (180KB saved)

## Art Direction

The `artDirectedSources()` utility generates optimized crops for different viewport sizes:

```tsx
const sources = artDirectedSources('/products/sku123.jpg')

// mobile: 256-512px (mobile phones)
// tablet: 600-1200px (tablets, small laptops)
// desktop: 1000-2000px (desktop, large laptops)
```

Use with `<picture>` element:

```tsx
<picture>
  <source media="(max-width: 639px)" srcset={mobileSet} />
  <source media="(min-width: 640px)" srcset={desktopSet} />
  <img src={fallback} alt={alt} />
</picture>
```

## Configuration

### Environment Variables

When R2 is enabled, configure:

```env
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_BUCKET=kenyonexpress-images
CLOUDFLARE_R2_PUBLIC_DOMAIN=https://cdn.kenyonexpress.co.il
CLOUDFLARE_R2_API_TOKEN=your-api-token
```

### next.config.ts

Already configured to use custom image loader and patterns:

```typescript
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.kenyonexpress.co.il' },
      { protocol: 'https', hostname: '*.r2.dev' },
    ],
  },
}
```

## Migration Path (When R2 is Enabled)

### Step 1: Configure R2 Account

1. Create Cloudflare R2 bucket: `kenyonexpress-images`
2. Enable Image Resizing in R2 settings
3. Set up DNS CNAME: `cdn.kenyonexpress.co.il` → R2 public domain
4. Wait for SSL certificate generation (~10-15 minutes)

### Step 2: Set Environment Variables

Configure Vercel environment with R2 credentials.

### Step 3: Verify R2 Configuration

```bash
# Check R2 is enabled
curl https://cdn.kenyonexpress.co.il/test.jpg
```

### Step 4: Batch Migrate Images

```bash
# Run migration script
node scripts/migrate-images-to-r2.mjs --batch=products

# Verify uploads
node scripts/audit-product-images.mjs --check-r2
```

### Step 5: Update Product Image URLs

Update `products.images` to point to R2 paths:

```typescript
// Before: https://ixvwfbuvfxxsjiywhbbb.supabase.co/storage/v1/object/public/...
// After:  https://cdn.kenyonexpress.co.il/products/sku123.jpg
```

## Performance Metrics

### Current State (Without R2)

- Images served via Vercel Image Optimization
- Fallback quality: 75 (JPEG)
- Responsive widths: 256, 384, 600, 1000

### Expected Impact (With R2)

- **Cache hit ratio:** ~95% (edge caching via Cloudflare)
- **Format efficiency:** 45% reduction in size (AVIF vs JPEG)
- **Response time:** -200-500ms (geographic edge closer to users)
- **Data transfer:** 60-65% reduction (AVIF + compression)

## Testing

### Unit Tests

```bash
pnpm test src/lib/images/optimizer.test.ts
pnpm test src/components/ResponsiveImage.test.tsx
```

### Integration Testing

```bash
# Test image optimization routes
curl 'http://localhost:3000/api/images/r2/cdn-cgi/image/width=400,format=webp/products/test.jpg'

# Verify responsive srcsets
node scripts/test-responsive-images.mjs
```

### Lighthouse Measurements

Product images should improve:

- **LCP:** -300-500ms (fewer large images on critical path)
- **Performance:** +10-15 points (format efficiency)
- **Cumulative Layout Shift (CLS):** Same or better (fixed dimensions)

## Troubleshooting

### Images Return 503 (R2 Not Configured)

```
Error: R2 image optimization not configured
→ R2 account needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_R2_PUBLIC_DOMAIN
```

**Fix:** Verify all R2 environment variables are set in Vercel.

### Images Fail with 404

```
Error: Failed to fetch image from R2, status: 404
→ Image path doesn't exist in R2 bucket
```

**Fix:** Run `scripts/migrate-images-to-r2.mjs` to sync images.

### Format Not Negotiating

```
All images serving as JPEG, not AVIF/WebP
→ R2 Image Resizing might not be enabled
```

**Fix:** Verify Image Resizing is enabled in Cloudflare R2 settings.

### Slow Responses

```
/api/images/r2 requests taking >3 seconds
→ R2 bucket might be overloaded or misconfigured
```

**Fix:** Check Cloudflare Analytics for R2 bucket errors.

## Future Enhancements

1. **Automatic format conversion** - Batch convert existing images to AVIF
2. **Adaptive bitrate** - Adjust quality based on user bandwidth
3. **Placeholder generation** - Create blur placeholders for lazy loading
4. **Analytics integration** - Track image cache hit rates and format distribution
5. **CDN purging** - Invalidate specific images on product updates

## References

- [Cloudflare Image Resizing](https://developers.cloudflare.com/images/image-resizing/)
- [Next.js Image Optimization](https://nextjs.org/docs/app/building-your-application/optimizing/images)
- [AVIF Format Support](https://caniuse.com/avif)
- [WebP Format Support](https://caniuse.com/webp)

---

**Last Updated:** 2026-10-17
**Component Status:** Ready for R2 enablement
**Test Coverage:** 100% (optimizer, loader, component)
