# Image Optimization (UX40)

Complete image optimization guide using Next.js Image component with responsive sizes, blur placeholders, and quality optimization.

## Overview

This project uses Next.js Image component throughout for automatic image optimization, including:
- **Responsive sizes**: Serve correct image dimensions for each breakpoint
- **Blur placeholders**: Show low-res placeholder while image loads
- **Quality compression**: Optimize file size without visible quality loss
- **Format negotiation**: AVIF/WebP fallback to JPEG/PNG based on browser support
- **Lazy loading**: Defer below-fold images; prioritize above-fold

## Configuration

### Next.js Image Settings (`next.config.ts`)

```typescript
images: {
  qualities: [50, 60, 75, 90, 95],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 288, 384],
  remotePatterns: [
    // Supabase, Unsplash, R2, etc.
  ],
}
```

**Quality Levels:**
- `50, 60`: Below-fold deal cards (157px renders)
- `75`: Default medium compression
- `90, 95`: Hero images, product details

**Image Sizes:**
- `288px`: Custom rung for dense 2-column grids (covers 277 device pixels at dpr 1.75)
- `256px`: Deal cards, thumbnails
- `384px`: Full-width sections

### Remote Image Hosts

Configured in `src/lib/images/remote-hosts.ts`:
- Supabase (product images)
- Unsplash (featured images)
- R2 (backups)

## Component Patterns

### 1. Product Cards (Deal Grid)

**File:** `src/components/ProductCard.tsx`

```typescript
const DEAL_IMAGE_SIZES = [
  `(max-width: 430px) 39vw`,
  `(max-width: 640px) 43vw`,
  `(max-width: 1023px) 46vw`,
  `240px`,  // Fixed width on desktop
].join(', ')

<Image
  src={thumb}
  alt={product.name_he}
  width={400}
  height={245}
  sizes={DEAL_IMAGE_SIZES}
  quality={50}  // Aggressive compression for below-fold
  loading="lazy"
  placeholder="blur"
  blurDataURL={asset?.blurDataURL}
/>
```

**Key Points:**
- `sizes` uses viewport-relative units for narrow devices, fixed px on desktop
- `quality={50}` for below-fold thumbnails
- `blurDataURL` prevents layout shift (CLS) during load
- `loading="lazy"` defers non-critical images

### 2. Hero Images

**File:** `src/components/category/CategoryHeroBanner.tsx`

```typescript
<Image
  src={imageUrl}
  alt={categoryName}
  fill
  priority  // LCP: fetch-high, drop loading="lazy"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1170px"
/>
```

**Key Points:**
- `priority` for above-fold images (triggers preload)
- Uses `fill` layout since container has known height
- Responsive breakpoints match CSS layout switches

### 3. Product Gallery

**File:** `src/components/storefront/ProductGallery.tsx`

```typescript
<Image
  src={activeUrl}
  alt={activeAsset?.alt ?? name}
  fill
  priority={active === 0}  // Only first image gets priority
  sizes="(max-width: 768px) 100vw, 40vw"
  placeholder="blur"
  blurDataURL={activeAsset?.blurDataURL}
/>
```

**Key Points:**
- `priority` gated on first image only (avoids over-prioritizing)
- Blur placeholder prevents CLS on image swap
- Covers both mobile (100vw) and desktop (40vw column) layouts

### 4. Thumbnail Grid

**File:** `src/components/category/CategoryProductCard.tsx`

```typescript
const THUMB_MAX_PX = 186
const THUMB_SIZES = `(max-width: 497px) calc(50vw - 63px), ${THUMB_MAX_PX}px`

<Image
  src={thumb}
  alt={asset?.alt ?? product.name_he}
  width={186}
  height={186}
  sizes={THUMB_SIZES}
  loading="lazy"
  placeholder="blur"
  blurDataURL={asset?.blurDataURL}
/>
```

**Key Points:**
- `calc()` in sizes keeps full srcset available (next ignores bare `50vw`)
- Breakpoint at 497px where `50vw - 63px` equals fixed `186px`
- Custom 288px rung covers gap between 256/384

## Best Practices

### Responsive Sizes

✅ **DO:**
```typescript
// Measured on actual grid at different breakpoints
sizes="(max-width: 640px) calc(50vw - 24px), (max-width: 1024px) 300px, 400px"

// Match CSS layout switches exactly
// If CSS is `md:max-w-lg`, sizes should use 768px boundary
```

❌ **DON'T:**
```typescript
// Generic guesses (wrong for this project)
sizes="50vw"  // Ignored by next; matches nothing; srcset floored at 640*smallest-ratio

// Fixed sizes for responsive layouts
sizes="400px"  // Upscales on mobile, wastes bytes on desktop

// Unmatched CSS breakpoints
// CSS: min-width 1024px
// sizes: (max-width: 1024px) ...  // One pixel off!
```

### Blur Placeholders

Blur placeholders are critical for:
- **CLS Prevention**: Reserved space avoids layout shift during load
- **LCP Improvement**: Perceived performance boost while loading
- **Cache Hit Bonus**: Tiny LQIP (low-quality image placeholder) cached separately

**Generate with:** `scripts/placeholders-gen.mjs` (or manual via image processor)

### Quality Settings

| Context | Quality | Example |
|---------|---------|---------|
| Hero, product detail | 90–95 | Main product photo on /product/[slug] |
| Grid cards (mobile) | 50–60 | Deal card (157px renders) |
| Thumbnails | 75 | Related products grid |
| Default | 75 | Most images |

> Quality 50 for 157px renders was measured: same perceived quality as 75 at normal resolution.

### Priority Loading

```typescript
// Hero above fold
<Image priority ... />

// Gallery: only active image
<Image priority={active === 0} ... />

// Below fold: no priority (default loading="lazy")
<Image loading="lazy" ... />
```

## Debugging

### Check Srcset Generation

```bash
# Build and start
pnpm build && pnpm start

# Inspect Image in DevTools
# Source tab → Network → img → Headers: dimensions, quality
# Sources → .next → static → media → [hash].avif (or webp/jpeg)
```

### Measure Impact

```bash
# Compare to live (refs/ke_live_singlefile.html)
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home

# Check individual widths
curl 'http://localhost:3000/_next/image?url=...&w=256&q=50'
```

### Common Issues

**"Image size too large" warning:**
- Reduce `quality` (start at 75, drop to 50 for below-fold)
- Check `sizes` matches actual layout width
- Confirm source image is optimized (no EXIF, remove metadata)

**Layout shift (CLS):**
- Add `placeholder="blur"` with `blurDataURL`
- OR ensure container has explicit `width` and `height`
- OR use `fill` layout on a `position:relative` parent

**Srcset missing expected widths:**
- Check `sizes` attribute—regex in next matches tokens exactly
- `calc()` expressions work but must not match bare `NNvw` pattern
- Verify `imageSizes` in config includes your target width

## Testing

### Unit Tests

```typescript
// Check Image component receives correct props
it('renders with responsive sizes', () => {
  render(<ProductCard product={...} />)
  const img = screen.getByAltText(/product name/)
  expect(img).toHaveAttribute('sizes', expect.stringContaining('50vw'))
})

// Verify blur placeholder is applied
it('includes blur placeholder when asset available', () => {
  const { container } = render(<ProductCard product={mockWithAsset} />)
  const img = container.querySelector('img')
  expect(img).toHaveAttribute('src', expect.stringMatching(/blurDataURL/))
})
```

### Integration Tests

```bash
# Run build to verify all components can be prerendered
pnpm build

# Launch and inspect network (check image bytes)
PORT=3311 pnpm start &
open http://localhost:3311

# Measure homepage with Lighthouse
node scripts/lighthouse-local.mjs
```

## Component Checklist

### Already Optimized ✅

- `ProductCard.tsx` — Responsive sizes, blur, quality=50
- `CouponCard.tsx` — Responsive sizes, calculated
- `CategoryHeroBanner.tsx` — Responsive sizes, priority
- `ProductGallery.tsx` — Responsive sizes, blur, priority
- `LeftSidebar.tsx` — Responsive sizes
- `CategoryProductCard.tsx` — Responsive sizes, blur
- `BrandsRow.tsx` — Responsive sizes, lazy loading (UX40)
- `WishlistCard.tsx` — Responsive sizes, lazy loading (UX40)

### To Review / Optimize

Check components with `import Image from 'next/image'`:
```bash
grep -r "from 'next/image'" src/components --include="*.tsx" | cut -d: -f1 | sort -u
```

## References

- **Next.js Image Optimization:** https://nextjs.org/docs/app/api-reference/components/image
- **Responsive Image Sizes:** https://mdn.org/en-US/docs/Web/HTML/Element/img#sizes
- **Core Web Vitals:** https://web.dev/vitals/
- **KenyonExpress Refs:** `docs/SOURCING-RULES.md`, `docs/LIGHTHOUSE-AUDIT.md`
