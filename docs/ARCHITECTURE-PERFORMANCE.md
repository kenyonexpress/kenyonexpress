# Architecture: Performance

Owner: Performance Architect
Stack: Next.js App Router (modified build), Hebrew RTL, Heebo font, Supabase backend, Vercel hosting.
Scope: image delivery, per-page rendering, caching layers, bundle budgets, Core Web Vitals, font loading, streaming.

This document is the performance contract for the storefront. It defines what each page type does at request time, how assets are delivered, and the numeric budgets a change must not regress. When citing an App Router API, confirm the exact signature against `node_modules/next/dist/docs/` first, because this is a modified build and some APIs differ from the public release.

Page types referenced throughout:

- `home` (`/`): marketing, mostly static, hero LCP.
- `category` (`/category/[slug]`): product listing with filters, sort, pagination.
- `product` (`/product/[slug]`): product detail page (PDP), gallery LCP.
- `cart` / `checkout`: dynamic, authenticated, never cached.

---

## 1. Image strategy

Product images live today in `products.images` (jsonb) as Unsplash placeholder URLs. They will move to a CDN backed origin (Supabase Storage with the image transform endpoint, or Cloudflare R2 fronted by a transform worker). Either way, `next/image` stays the single delivery component. No raw `<img>` in the storefront.

### 1.1 Origin and CDN

- Live product images: Supabase Storage bucket `product-images`, uploaded already normalized (max width 1600px, quality 80, WebP source). `next/image` handles per request resize and format negotiation on top of that source.
- Marketing assets (hero slides, static deal banners): `public/images/`, served through the same Vercel Image Optimization pipeline.
- Migration path from Unsplash: swap the origin host in `products.images` and update `remotePatterns` (see 1.4). Drop the Unsplash hosts before production; they are demo only.
- Version images by changing the file path or name, never by replacing bytes at an existing URL, because the cache TTL is long (see `minimumCacheTTL`).

### 1.2 Responsive sizes

Every image declares either explicit `width`/`height` or `fill` inside a parent that reserves space. The `sizes` attribute is mandatory on responsive images so the browser picks the smallest adequate candidate.

| Usage | `sizes` | quality | budget per image |
|-------|---------|---------|------------------|
| Product card in grid (2 to 4 cols) | `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw` | 60 | 40KB |
| Product gallery main image (PDP LCP) | `(max-width: 768px) 100vw, 600px` | 75 | 120KB |
| Gallery thumbnails | `80px` | 60 | 10KB |
| Hero slide | `(max-width: 1024px) 100vw, 1200px` | 75 | 200KB |
| Category icon / side banner | `100px` | 75 | 15KB |
| OG / share image | fixed 1200x630 | 75 | 300KB |

### 1.3 Formats, priority, lazy

- Formats: AVIF first, WebP fallback, via `formats: ['image/avif', 'image/webp']`. The browser gets AVIF where supported, WebP otherwise. No JPEG/PNG served to modern clients except the OG image.
- LCP images get eager priority: the active hero slide on home, the main gallery image on PDP. Use the priority prop this build exposes (confirm `priority` vs `preload` naming in `node_modules/next/dist/docs/`; some modified builds renamed it). One priority image per page, no more.
- Everything below the fold is lazy. `next/image` lazy-loads by default, so below-fold cards, thumbnails, and inactive hero slides simply omit the priority flag.

### 1.4 `remotePatterns` and config

```ts
// next.config.ts (images block)
images: {
  formats: ['image/avif', 'image/webp'],
  qualities: [60, 75, 90],       // this build defaults to [75]; declare every quality used above
  minimumCacheTTL: 2678400,      // 31 days; product image bytes are immutable per URL
  remotePatterns: [
    { protocol: 'https', hostname: '*.supabase.co' },
    // add the R2 / transform host here if that path is chosen; remove Unsplash before prod
  ],
},
```

Current `next.config.ts` ships `qualities: [75, 90, 95]` and allows the Unsplash hosts. Both change: `95` is dropped (invisible quality gain, real weight cost) and Unsplash hosts are removed before production.

### 1.5 Blur placeholders

- Static imports (hero, marketing) get an automatic blur placeholder from the build. Use `placeholder="blur"`.
- Remote product images cannot generate a blur at build time. Store a tiny base64 blur (a 10 to 16px wide LQIP) alongside each image record in `products.images` at upload time, and pass it as `blurDataURL` with `placeholder="blur"`. This removes the flash of empty box and stabilizes CLS on the grid.
- Do not compute blurs at request time; precompute on upload.

---

## 2. Rendering strategy per page type

Principle: the catalog is public and identical for every visitor, so it is cached and revalidated. Anything tied to a session (cart, checkout, account) is dynamic and never cached. Prices at checkout are always resolved server side, never from a cached layer.

Products and prices change only through the admin panel (no live sync), so the real invalidation is tag based on every mutation. Time based `revalidate` is a safety net, not the primary mechanism. Coupons and deals expire by the clock (`valid_until`), so they get a short window.

### 2.1 Route table

| Route | Mode | `revalidate` | tags |
|-------|------|--------------|------|
| `/` (home) | Static shell + ISR sections | 300s | `hero`, `products`, `deals` |
| `/category/[slug]` page 1, no filters | ISR | 3600s | `category:<id>`, `products` |
| `/category/[slug]` with `?sort` / `?page` | Dynamic SSR inside Suspense | none | none |
| `/products` | ISR | 3600s | `products` |
| `/product/[slug]` | ISR, tag based | 3600s | `product:<id>`, `category:<id>` |
| `/coupons`, `/coupons/[slug]` | ISR | 300s | `coupons`, `coupon:<id>` |
| `/search` | Dynamic SSR | none | none (noindex) |
| `/cart`, `/checkout*` | Dynamic SSR, no cache | none | none |
| `/account/*` | Dynamic SSR, no cache | none | none |
| `/admin/*` | Dynamic SSR, no cache | none | none |

### 2.2 Home: static with ISR

The hero, category strip, and deals section are stable marketing content. Render them as cached server components with a 300s revalidate window. Below-fold sections stream (section 7). Per-user pieces (header account state, cart count) are small client islands so the page body stays static.

```ts
// app/page.tsx
export const revalidate = 300 // seconds; hero/deals refresh window
```

### 2.3 Category: ISR plus on-demand revalidation

Page 1 with no filters is the hot, shareable URL (WhatsApp blasts land here). Cache it with a 3600s net and tag it so an admin product edit refreshes it immediately. Filtered, sorted, or paginated variants carry `searchParams`, which opt the route out of the static cache; render those dynamically inside a Suspense boundary while the page shell (title, filter chips) stays static.

```ts
// app/category/[slug]/page.tsx
export const revalidate = 3600

// data function
async function getCategoryPage1(categoryId: string) {
  'use cache'
  cacheTag(`category:${categoryId}`, 'products')
  // ...supabase read on the anon (cookieless) client
}
```

### 2.4 Product: ISR with tag based revalidation

PDPs are the highest traffic catalog page. Serve from cache and invalidate precisely when that product or its category changes.

```ts
async function getProductBySlug(slug: string) {
  'use cache'
  const p = await fetchProduct(slug)
  cacheTag(`product:${p.id}`, `category:${p.category_id}`, 'products')
  return p
}

// app/product/[slug]/page.tsx
export const revalidate = 3600
```

`generateStaticParams` returns the featured and home-listed products so the hottest PDPs are prebuilt; the rest render on-demand and then stay cached.

### 2.5 Cart / checkout: dynamic SSR

No cache at any layer. These read cookies and identity, and the checkout price must reflect current server state.

```ts
// app/checkout/page.tsx
export const dynamic = 'force-dynamic'
export const revalidate = 0
```

The whole `(account)`, `(cart)`, and `(admin)` route groups wrap `children` in `<Suspense>` and are dynamic by design.

### 2.6 `revalidateTag` usage

Invalidation runs on write, from the mutation path:

| Event | Where | Tags dropped |
|-------|-------|--------------|
| Admin creates/updates/deletes product | Server Action | `product:<id>`, `products`, `category:<id>` |
| Admin updates category | Server Action | `categories`, `category:<id>`, `products` |
| Admin updates hero slide | Server Action | `hero` |
| Admin updates deal/coupon | Server Action | `coupons`, `coupon:<id>` |
| Payment webhook adjusts stock / sold_out | Route Handler | `product:<id>` |

```ts
// server action after a successful product update
import { revalidateTag } from 'next/cache'

revalidateTag(`product:${id}`)
revalidateTag('products')
for (const c of affectedCategoryIds) revalidateTag(`category:${c}`)
```

If this build requires a second argument on `revalidateTag` (some modified builds do), pass it and confirm the signature in `node_modules/next/dist/docs/`. Use the immediate read-your-writes variant inside Server Actions so the admin sees the change in the same request; use plain `revalidateTag` inside Route Handlers (webhooks).

---

## 3. Redis caching (Upstash)

Redis is a layer above the Next data cache for expensive, shared reads that are costly to recompute and read far more than written: category listings, product facet aggregations, and homepage section payloads. It is not a session store and never touches cart or checkout pricing.

Rollout note: at the current scale (tens of products) Redis is optional; the Next data cache already absorbs catalog reads. Introduce Upstash when a measured trigger fires (DB CPU sustained high, rate-limit write volume, or a planned sale event). The design below is what to build when that happens.

### 3.1 Keys and TTLs

| Key pattern | Contents | TTL |
|-------------|----------|-----|
| `cat:list:<slug>:p1` | Serialized page-1 product listing (no filters) | 3600s |
| `cat:facets:<slug>` | Filter facet counts for a category | 1800s |
| `home:sections` | Hero + deals + category strip payload | 300s |
| `product:<slug>` | PDP core payload (product + variants + category) | 3600s |
| `related:<id>` | Related products list | 3600s |

Namespace every key and include a schema version prefix (for example `v1:cat:list:...`) so a shape change is a prefix bump, not a manual flush.

### 3.2 Read path and invalidation

```ts
// pseudocode: cache-aside with stampede protection
async function cachedCategoryPage1(slug: string) {
  const key = `v1:cat:list:${slug}:p1`
  const hit = await redis.get(key)
  if (hit) return hit

  // stampede protection: single-flight lock so only one request recomputes
  const lock = await redis.set(`${key}:lock`, '1', { nx: true, ex: 10 })
  if (!lock) {
    await sleep(50)
    return cachedCategoryPage1(slug) // brief retry; another request is filling
  }

  const fresh = await queryCategoryPage1(slug) // Supabase
  await redis.set(key, fresh, { ex: 3600 })
  await redis.del(`${key}:lock`)
  return fresh
}
```

Invalidation is write driven, mirroring the tag map in section 2.6. The same Server Action that calls `revalidateTag` also deletes the matching Redis keys:

```ts
await redis.del(`v1:product:${slug}`, `v1:related:${id}`)
for (const slug of affectedCategorySlugs) {
  await redis.del(`v1:cat:list:${slug}:p1`, `v1:cat:facets:${slug}`)
}
await redis.del('v1:home:sections') // only if the product is home-listed
```

### 3.3 Stampede protection

Two defenses, both above:

1. Single-flight lock (`SET NX EX`): on a miss, only the lock holder recomputes; concurrent requests retry briefly and read the freshly written value. This matters during a WhatsApp blast where hundreds of requests hit a cold key in seconds.
2. Soft TTL / early recompute (optional): store a `staleAt` timestamp inside the value earlier than the hard TTL. When a reader sees `now > staleAt`, it serves the stale value and triggers one background refresh, so the hard expiry never causes a synchronous miss storm.

---

## 4. Bundle budget per route

Server Components are the default. A component becomes a client component (`'use client'`) only when it needs interactivity, and it is pushed as deep in the tree as possible so its JS does not pull siblings client-side. Heavy client-only widgets are dynamically imported with `ssr: false` so they never enter the initial bundle.

### 4.1 Budgets

Storefront routes share a hard ceiling of 200KB gzipped initial JS. Admin is exempt from the storefront ceiling but must be code-split out of storefront bundles entirely.

| Route | Initial JS (gzip) target | Notes |
|-------|--------------------------|-------|
| `/` home | <= 120KB | Header island + hero controls only; sections are server-rendered |
| `/category/[slug]` | <= 140KB | Filter/sort controls are the only client JS |
| `/product/[slug]` | <= 150KB | Gallery interactions + add-to-cart island |
| `/cart` | <= 160KB | Quantity controls, line-item mutations |
| `/checkout` | <= 180KB | Payment form; QR / camera widgets dynamically imported |
| `/admin/*` | not counted against storefront | dnd-kit, tables, charts stay in this group's chunks only |

### 4.2 Code splitting rules

- Never import an admin module (dnd-kit, admin tables) from a storefront route. Verify with the bundle analyzer that admin chunks do not appear in storefront route output.
- Dynamically import heavy, rarely-first-paint client components:

```ts
import dynamic from 'next/dynamic'

// QR scanner needs camera + a decode library: never in the initial bundle
const QrScanner = dynamic(() => import('@/components/QrScanner'), {
  ssr: false,
  loading: () => <ScannerSkeleton />,
})

// charts (admin dashboards) load only when the panel mounts
const SalesChart = dynamic(() => import('@/components/admin/SalesChart'), {
  ssr: false,
})
```

- Radix and other interactive primitives are imported per component that uses them, not barrel-imported, so tree-shaking keeps unused primitives out.

---

## 5. Core Web Vitals targets

Targets are p75, mobile, Israeli 4G, mid-tier device.

| Metric | Target | Primary lever |
|--------|--------|---------------|
| LCP | < 2.5s (home <= 2.0s) | Static shell from CDN + prioritized, weight-capped LCP image + font swap |
| INP | < 200ms | Minimal client JS, deep/small islands, no blocking main-thread work |
| CLS | < 0.1 (home <= 0.05) | Reserved image dimensions, blur placeholders, `font-display: swap` with a matched fallback |

### 5.1 LCP

The LCP element is the active hero slide on home and the main gallery image on PDP. It is served from the static shell, marked priority, and weight-capped (hero 200KB, PDP gallery 120KB). Home LCP budget breakdown:

| Component | Budget |
|-----------|--------|
| TTFB (shell from CDN) | 300ms |
| Hero image download (4G p75, <= 200KB) | 1200ms |
| Render + decode | 500ms |
| Total LCP p75 | 2.0s |

Animated GIF is banned in the hero (unbounded weight, served unoptimized). Replace with `<video muted autoplay loop playsinline poster>` (H.264/WebM) or a static AVIF.

### 5.2 INP

- Ship the least client JS that satisfies the interaction. Every route stays under its section 4 budget.
- Islands are small and deep, so hydration cost is spread and no single handler blocks the main thread.
- Heavy widgets (QR camera, charts) are dynamically imported, so they never delay first interaction on the pages that do not use them.

### 5.3 CLS

- Every image reserves space via explicit `width`/`height` or `fill` in a sized container. Zero unsized images.
- Blur / LQIP placeholders hold the box before bytes arrive (section 1.5).
- Fonts use `swap` with a size-matched fallback stack, so the swap from fallback to Heebo does not reflow (section 6).
- No content injected above existing content after load (banners, consent bars) without pre-reserved height.

---

## 6. Font loading

Heebo is the only font, and it drives all text site-wide (Hebrew and Latin), wired through `--font-heebo` into `--font-sans` in `globals.css`. Do not add a second font.

Current setup uses `next/font/google` with both subsets and `display: 'swap'`:

```ts
// src/app/layout.tsx
import { Heebo } from 'next/font/google'

const heebo = Heebo({
  variable: '--font-heebo',
  subsets: ['latin', 'hebrew'], // Hebrew is required; Latin covers prices, SKUs, brand names
  display: 'swap',
  preload: true,                // default true for subsetted google fonts; keep it explicit
})
```

Rules and rationale:

- `next/font` self-hosts the font files at build time and inlines a preload link plus a scoped `@font-face`, so there is no request to a third-party font host and no render-blocking external stylesheet.
- `display: 'swap'` renders text immediately in the fallback and swaps to Heebo when ready, so text is never invisible (no FOIT). This protects LCP when the LCP element is text.
- To keep the swap from shifting layout (CLS), rely on the automatic `adjustFontFallback` metrics `next/font` generates, which size-match the fallback to Heebo. Keep the fallback chain (`Arial, sans-serif`) in `--font-sans` consistent with those metrics.
- Preload only the one weight/subset actually used above the fold. If additional weights are added later, do not preload every weight; preload the display weight and let the rest load on demand.
- If a switch to `next/font/local` is ever made (to pin exact `.woff2` files), keep the same subsets, `display: 'swap'`, and a preload of the primary weight.

---

## 7. Lazy sections and streaming

The home page and PDP stream: the static shell (header, hero, first meaningful section) flushes immediately from the CDN, and below-fold sections resolve inside Suspense boundaries so a slow data read never blocks first paint.

### 7.1 Streaming the homepage

```tsx
// app/page.tsx
import { Suspense } from 'react'

export default function Home() {
  return (
    <>
      <Hero />                    {/* in the static shell, LCP lives here */}
      <CategoryStrip />           {/* static */}

      <Suspense fallback={<DealsSkeleton />}>
        <DealsOfTheDay />         {/* streamed: its own data read */}
      </Suspense>

      <Suspense fallback={<GridSkeleton />}>
        <FeaturedGrid />          {/* streamed below the fold */}
      </Suspense>
    </>
  )
}
```

### 7.2 Rules

- Every Suspense fallback reserves the final layout height (skeletons match the real component dimensions), so streaming in the content causes no CLS.
- The dynamic parts of otherwise-static pages (category page-1 shell static, filtered results dynamic) sit inside their own Suspense boundary, so the shell is cacheable and only the personalized/filtered hole streams.
- Per-user pieces in a shared layout (header cart count, account menu) are client islands or their own Suspense boundary, so they do not force the whole page dynamic.
- Do not wrap the LCP element in Suspense. The LCP image/section must be in the immediately flushed shell.

---

## Appendix: current-state gaps to close

- `next.config.ts` ships `qualities: [75, 90, 95]` and allows Unsplash hosts. Change to `[60, 75, 90]`, add `formats` and `minimumCacheTTL`, drop Unsplash before production.
- Product cards and the gallery use raw `<img>` without `srcset` or dimensions. Migrate to `next/image` with the `sizes` matrix in section 1.2.
- Hero serves an animated GIF unoptimized as the first slide, with priority pinned to index 0 while the actual starting slide differs. Replace the GIF (video or static AVIF), and prioritize the real starting slide.
- No caching configuration exists in the repo today; every Supabase-touching page is full SSR per request. Sections 2 and 3 are the remediation.
