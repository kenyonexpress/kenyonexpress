# ARCHITECTURE-PERFORMANCE.md

KenyonExpress storefront performance architecture (binding).

Status: BINDING for `arch/performance` (2026-07-30)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch-performance` only. **Documentation only.**
Stack: **Next.js 15** App Router (RSC), Hebrew RTL, Heebo via `next/font`, Supabase (Postgres + Storage), Vercel Edge Network, R2 CDN for product images.
Companions: `docs/ARCHITECTURE-SEO.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md` (in `ke-arch`), `docs/ARCHITECTURE-OBSERVABILITY.md`, `docs/ARCHITECTURE-SEARCH.md`.

Confirm App Router cache APIs against `node_modules/next/dist/docs/` before shipping. This repo may track a modified Next build; prefer documented exports over memory.

---

## 0. Non-negotiables

1. Public catalog HTML is cacheable (ISR + tags). Session HTML (cart, checkout, account, redeem, admin, supplier) is `private, no-store`.
2. Never put service-role Supabase keys on public RSC data paths. Anon + RLS only for storefront reads.
3. Prices shown on cached pages are **display** prices. Checkout always re-resolves money server-side from DB (agorot integers, snapshot `platform_percent` on line items).
4. One LCP image per page gets `priority`. Everything else lazy.
5. No raw `<img>` in storefront. `next/image` only.
6. Column-select every query. No `select('*')` on hot paths.
7. Tag-based revalidation is primary. Time-based `revalidate` is the safety net.
8. Bundle budgets below are gates. A PR that regresses them fails CI.

Money surfaces that must never be CDN-cached as personalized HTML:

| Route | Why |
|---|---|
| `/cart` | Cookie / guest cart |
| `/checkout/**` | Auth + payment |
| `/account/**` | PII |
| `/redeem/[token]` | One-time QR |
| `/admin/**`, `/supplier/**` | Staff |

---

## 1. Core Web Vitals (numeric targets)

Measured on production URLs via CrUX (field, 28-day) and lab (Lighthouse mobile + desktop) on every release. Field is the contract; lab is the early warning.

### 1.1 Field targets (CrUX p75, mobile + desktop separately)

| Metric | Mobile p75 | Desktop p75 | Fail (ship block) |
|---|---|---|---|
| **LCP** | ≤ 2.0s | ≤ 1.5s | > 2.5s mobile / > 2.0s desktop |
| **INP** | ≤ 150ms | ≤ 100ms | > 200ms |
| **CLS** | ≤ 0.05 | ≤ 0.05 | > 0.1 |
| **TTFB** (document) | ≤ 600ms | ≤ 400ms | > 800ms mobile |
| **FCP** | ≤ 1.5s | ≤ 1.0s | > 1.8s mobile |

### 1.2 Lab budgets (Lighthouse, throttled mobile Moto G Power / Slow 4G)

| Page | Performance score | LCP | TBT | CLS | Transfer (document+JS+CSS first load) |
|---|---|---|---|---|---|
| Home `/` | ≥ 90 | ≤ 2.2s | ≤ 200ms | ≤ 0.05 | ≤ 350 KB |
| Category `/category/[slug]` | ≥ 85 | ≤ 2.5s | ≤ 250ms | ≤ 0.08 | ≤ 400 KB |
| Product `/product/[slug]` | ≥ 90 | ≤ 2.2s | ≤ 200ms | ≤ 0.05 | ≤ 380 KB |
| Search `/search` | ≥ 80 | ≤ 2.8s | ≤ 300ms | ≤ 0.1 | ≤ 450 KB |
| Cart `/cart` | ≥ 85 | ≤ 2.5s | ≤ 250ms | ≤ 0.05 | ≤ 400 KB |

### 1.3 Resource budgets (first contentful viewport)

| Resource | Home | Category | Product |
|---|---|---|---|
| JS (compressed, first load JS) | ≤ 170 KB | ≤ 190 KB | ≤ 180 KB |
| CSS (compressed) | ≤ 40 KB | ≤ 45 KB | ≤ 40 KB |
| Fonts (Heebo subset, woff2) | ≤ 45 KB | ≤ 45 KB | ≤ 45 KB |
| LCP image (AVIF) | ≤ 200 KB | ≤ 40 KB (card) | ≤ 120 KB |
| Total critical path bytes | ≤ 350 KB | ≤ 400 KB | ≤ 380 KB |

### 1.4 How we measure

```ts
// scripts/perf/assert-cwv.ts
// Run after lighthouse CI artifact is written to .lighthouseci/

import { readFileSync } from 'node:fs'

type Lhr = {
  audits: Record<string, { numericValue?: number; score?: number | null }>
  categories: { performance: { score: number | null } }
}

const FAIL = {
  lcpMs: 2500,
  cls: 0.1,
  tbtMs: 300,
  perfScore: 0.85,
} as const

function assertPage(path: string, file: string) {
  const lhr = JSON.parse(readFileSync(file, 'utf8')) as Lhr
  const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? Infinity
  const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? Infinity
  const tbt = lhr.audits['total-blocking-time']?.numericValue ?? Infinity
  const score = lhr.categories.performance.score ?? 0

  const errors: string[] = []
  if (lcp > FAIL.lcpMs) errors.push(`${path} LCP ${lcp}ms > ${FAIL.lcpMs}`)
  if (cls > FAIL.cls) errors.push(`${path} CLS ${cls} > ${FAIL.cls}`)
  if (tbt > FAIL.tbtMs) errors.push(`${path} TBT ${tbt}ms > ${FAIL.tbtMs}`)
  if (score < FAIL.perfScore) errors.push(`${path} score ${score} < ${FAIL.perfScore}`)

  if (errors.length) {
    throw new Error(errors.join('\n'))
  }
}

assertPage('/', process.argv[2]!)
```

Wire in CI:

```yaml
# .github/workflows/perf.yml (excerpt)
- name: Lighthouse CI
  run: pnpm dlx @lhci/cli autorun
- name: Assert CWV budgets
  run: pnpm exec tsx scripts/perf/assert-cwv.ts .lighthouseci/lhr-*.json
```

---

## 2. Rendering model: SSG / ISR / Dynamic per page type

### 2.1 Route matrix (binding)

| Page | Route | Mode | `revalidate` (safety) | Cache tags | CDN Cache-Control |
|---|---|---|---|---|---|
| Home | `/` | **ISR** | **120s** | `home`, `catalog` | `public, s-maxage=120, stale-while-revalidate=600` |
| Category | `/category/[slug]` | **ISR** | **300s** | `category:{id}`, `catalog` | `public, s-maxage=300, stale-while-revalidate=900` |
| Product | `/product/[slug]` | **ISR** | **120s** | `product:{id}`, `catalog` | `public, s-maxage=120, stale-while-revalidate=600` |
| Products index | `/products` | **ISR** | **180s** | `catalog` | `public, s-maxage=180, stale-while-revalidate=600` |
| Sitemap | `/sitemap.xml` | **ISR** | **3600s** | `sitemap` | `public, s-maxage=3600` |
| Search | `/search` | Dynamic (short CDN) | n/a | none on HTML | `public, s-maxage=30, stale-while-revalidate=60` + `noindex` |
| Cart | `/cart` | Dynamic private | n/a | n/a | `private, no-store` |
| Checkout / account / redeem | `/checkout*`, `/account/**`, `/redeem/[token]` | Dynamic private | n/a | n/a | `private, no-store` |
| Admin / supplier | `/admin/**`, `/supplier/**` | Dynamic private | n/a | n/a | `private, no-store` |

Why these numbers:

- **Home 120s**: featured deals rotate; on-demand tag clears on publish. Short window catches `valid_until` expiry without waiting for admin action.
- **Category 300s**: listing churn is slower than PDP price edits. Pagination shells are identical across users.
- **Product 120s**: price / stock / gallery edits are common; tag `product:{id}` is the real path.
- Time-based revalidate alone is **not** enough for money-facing display after admin publish. Always call `revalidateTag`.

### 2.2 Shared cache helpers

```ts
// src/lib/cache/tags.ts
export const CacheTags = {
  home: 'home',
  catalog: 'catalog',
  sitemap: 'sitemap',
  category: (id: string) => `category:${id}` as const,
  product: (id: string) => `product:${id}` as const,
  supplier: (id: string) => `supplier:${id}` as const,
} as const

export const RevalidateSeconds = {
  home: 120,
  category: 300,
  product: 120,
  productsIndex: 180,
  sitemap: 3600,
} as const
```

```ts
// src/lib/cache/revalidate-catalog.ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { CacheTags } from '@/lib/cache/tags'

export async function revalidateAfterProductPublish(input: {
  productId: string
  slug: string
  categoryIds: string[]
  featuredOnHome: boolean
}) {
  revalidateTag(CacheTags.product(input.productId))
  revalidateTag(CacheTags.catalog)
  revalidateTag(CacheTags.sitemap)
  revalidatePath(`/product/${input.slug}`)

  for (const categoryId of input.categoryIds) {
    revalidateTag(CacheTags.category(categoryId))
  }

  if (input.featuredOnHome) {
    revalidateTag(CacheTags.home)
    revalidatePath('/')
  }
}

export async function revalidateAfterCategoryMutation(input: {
  categoryId: string
  slug: string
}) {
  revalidateTag(CacheTags.category(input.categoryId))
  revalidateTag(CacheTags.catalog)
  revalidateTag(CacheTags.sitemap)
  revalidatePath(`/category/${input.slug}`)
  revalidatePath('/products')
}
```

### 2.3 Home (`/`): ISR 120s

```ts
// src/app/(store)/page.tsx
import { unstable_cache } from 'next/cache'
import { CacheTags, RevalidateSeconds } from '@/lib/cache/tags'
import { createAnonClient } from '@/lib/supabase/anon'
import { HomeHero } from '@/components/home/HomeHero'
import { FeaturedProducts } from '@/components/home/FeaturedProducts'

export const revalidate = RevalidateSeconds.home

const getHomePayload = unstable_cache(
  async () => {
    const supabase = createAnonClient()

    const [{ data: hero }, { data: featured }] = await Promise.all([
      supabase
        .from('home_hero_slides')
        .select('id, title_he, subtitle_he, image_url, blur_data_url, href, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(6),
      supabase
        .from('products')
        .select(
          `
          id, slug, name_he, product_type,
          coupon_price_ils, price_ils, discount_percent,
          images, is_featured,
          supplier:suppliers!inner ( id, business_name_he, logo_url )
        `,
        )
        .eq('status', 'published')
        .eq('is_featured', true)
        .order('updated_at', { ascending: false })
        .limit(12),
    ])

    return {
      hero: hero ?? [],
      featured: featured ?? [],
    }
  },
  ['home-payload'],
  {
    revalidate: RevalidateSeconds.home,
    tags: [CacheTags.home, CacheTags.catalog],
  },
)

export default async function HomePage() {
  const { hero, featured } = await getHomePayload()

  return (
    <main>
      <HomeHero slides={hero} />
      <FeaturedProducts products={featured} />
    </main>
  )
}
```

### 2.4 Category (`/category/[slug]`): ISR 300s

```ts
// src/app/(store)/category/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { CacheTags, RevalidateSeconds } from '@/lib/cache/tags'
import { createAnonClient } from '@/lib/supabase/anon'
import { CategoryGrid } from '@/components/category/CategoryGrid'
import { parseCategorySearchParams } from '@/lib/catalog/category-params'

export const revalidate = RevalidateSeconds.category

type PageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

async function getCategoryBySlug(slug: string) {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('categories')
    .select('id, slug, name_he, description_he, image_url, parent_id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  return data
}

const getCategoryProducts = unstable_cache(
  async (categoryId: string, page: number, sort: string) => {
    const supabase = createAnonClient()
    const pageSize = 24
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let q = supabase
      .from('products')
      .select(
        `
        id, slug, name_he, product_type,
        coupon_price_ils, price_ils, discount_percent,
        images,
        supplier:suppliers!inner ( id, business_name_he )
      `,
        { count: 'exact' },
      )
      .eq('status', 'published')
      .eq('category_id', categoryId)
      .range(from, to)

    if (sort === 'price_asc') q = q.order('sort_price_agorot', { ascending: true })
    else if (sort === 'price_desc') q = q.order('sort_price_agorot', { ascending: false })
    else q = q.order('published_at', { ascending: false })

    const { data, count, error } = await q
    if (error) throw error
    return { products: data ?? [], total: count ?? 0, pageSize }
  },
  ['category-products'],
  {
    revalidate: RevalidateSeconds.category,
    // tags added per-call via wrapper below
  },
)

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const sp = parseCategorySearchParams(await searchParams)
  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  // Bind category tag into the cached fetch
  const cached = unstable_cache(
    () => getCategoryProducts(category.id, sp.page, sp.sort),
    [`category-${category.id}-${sp.page}-${sp.sort}`],
    {
      revalidate: RevalidateSeconds.category,
      tags: [CacheTags.category(category.id), CacheTags.catalog],
    },
  )

  const { products, total, pageSize } = await cached()

  return (
    <main>
      <h1>{category.name_he}</h1>
      <CategoryGrid
        products={products}
        total={total}
        page={sp.page}
        pageSize={pageSize}
        sort={sp.sort}
      />
    </main>
  )
}
```

Filter / sort query params: keep the **HTML shell** ISR-tagged by category. Prefer client filter for ephemeral UX (stock, brand chips) against an already-fetched page payload, or use short CDN for search-like filter URLs. Do not explode unique ISR entries for every filter combination.

### 2.5 Product (`/product/[slug]`): ISR 120s

```ts
// src/app/(store)/product/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { CacheTags, RevalidateSeconds } from '@/lib/cache/tags'
import { createAnonClient } from '@/lib/supabase/anon'
import { ProductGallery } from '@/components/product/ProductGallery'
import { ProductPurchasePanel } from '@/components/product/ProductPurchasePanel'
import { ProductJsonLd } from '@/components/seo/ProductJsonLd'

export const revalidate = RevalidateSeconds.product

type PageProps = { params: Promise<{ slug: string }> }

const getProductBySlug = (slug: string) =>
  unstable_cache(
    async () => {
      const supabase = createAnonClient()
      const { data, error } = await supabase
        .from('products')
        .select(
          `
          id, slug, name_he, description_he, product_type, status,
          coupon_price_ils, price_ils, discount_percent,
          valid_until, stock_qty,
          images, seo_title, seo_description,
          category:categories ( id, slug, name_he ),
          supplier:suppliers!inner (
            id, business_name_he, logo_url, phone, city_he, address_he
          )
        `,
        )
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle()

      if (error) throw error
      return data
    },
    [`product-by-slug:${slug}`],
    {
      revalidate: RevalidateSeconds.product,
      tags: [CacheTags.catalog],
      // product:{id} tag attached after we know id (see below)
    },
  )()

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params

  // First fetch to learn id, then pin tag. In practice wrap once you have id
  // from a lightweight slug→id lookup if you want stricter tagging.
  const product = await unstable_cache(
    async () => {
      const supabase = createAnonClient()
      const { data } = await supabase
        .from('products')
        .select(
          `
          id, slug, name_he, description_he, product_type,
          coupon_price_ils, price_ils, discount_percent,
          valid_until, stock_qty,
          images, seo_title, seo_description,
          category:categories ( id, slug, name_he ),
          supplier:suppliers!inner (
            id, business_name_he, logo_url, phone, city_he, address_he
          )
        `,
        )
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle()
      return data
    },
    [`pdp:${slug}`],
    {
      revalidate: RevalidateSeconds.product,
      tags: [CacheTags.catalog],
    },
  )()

  if (!product) notFound()

  // Ensure product-specific tag is associated for on-demand purge.
  // Call a no-op cached reader tagged with product id on the same request,
  // or revalidateTag(product:{id}) from admin after publish (preferred).
  void product.id

  return (
    <main>
      <ProductJsonLd product={product} />
      <ProductGallery
        images={product.images}
        alt={product.name_he}
        priority
      />
      <ProductPurchasePanel product={product} />
    </main>
  )
}

// Optional: generateStaticParams for top N products at build
export async function generateStaticParams() {
  const supabase = createAnonClient()
  const { data } = await supabase
    .from('products')
    .select('slug')
    .eq('status', 'published')
    .eq('is_featured', true)
    .limit(50)

  return (data ?? []).map((p) => ({ slug: p.slug }))
}
```

After admin publish, always:

```ts
revalidateTag(CacheTags.product(productId))
revalidateTag(CacheTags.catalog)
revalidatePath(`/product/${slug}`)
```

### 2.6 Private routes : never CDN-cache HTML

```ts
// src/app/(store)/cart/page.tsx
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Or headers in the page / layout:
import { headers } from 'next/headers'

export default async function CartPage() {
  // ensure private
  const h = await headers()
  void h
  // ...load cart by cookie / session
}
```

```ts
// src/proxy.ts (excerpt): set Cache-Control for private surfaces
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PRIVATE_PREFIXES = [
  '/cart',
  '/checkout',
  '/account',
  '/redeem',
  '/admin',
  '/supplier',
] as const

export function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const path = req.nextUrl.pathname

  if (PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    res.headers.set('Cache-Control', 'private, no-store')
    return res
  }

  return res
}
```

---

## 3. `next/image`: exact sizes, quality, config

### 3.1 Binding sizes table

| Usage | Component | Layout | `sizes` | `quality` | Max bytes (AVIF) | `priority` |
|---|---|---|---|---|---|---|
| Home hero slide | `HomeHeroImage` | `fill` aspect ~16/7 | `(max-width: 1024px) 100vw, 1200px` | 75 | 200 KB | first slide only |
| Product card grid | `ProductCardImage` | `fill` 1:1 | `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw` | 60 | 40 KB | never |
| PDP main gallery | `ProductMainImage` | `fill` | `(max-width: 768px) 100vw, 600px` | 75 | 120 KB | yes (page LCP) |
| Gallery thumb | `ProductThumb` | fixed 80×80 | `80px` | 60 | 10 KB | never |
| Category header | `CategoryHeaderImage` | `fill` | `(max-width: 768px) 100vw, 800px` | 70 | 80 KB | optional |
| Supplier logo | `SupplierLogo` | fixed 48×48 | `48px` | 75 | 8 KB | never |
| OG / share | static export | 1200×630 | n/a | 75 | 300 KB | n/a |

### 3.2 `next.config.ts` images block

```ts
// next.config.ts (images excerpt)
images: {
  formats: ['image/avif', 'image/webp'],
  // Only qualities we actually pass. Drop 95 (weight without visible gain).
  qualities: [60, 70, 75],
  deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  imageSizes: [48, 80, 96, 128, 256, 384],
  minimumCacheTTL: 2_678_400, // 31 days; immutable URLs
  remotePatterns: [
    { protocol: 'https', hostname: '*.supabase.co' },
    { protocol: 'https', hostname: '*.kenyonexpress.co.il' },
    { protocol: 'https', hostname: '*.r2.dev' },
    // Remove Unsplash / picsum before production launch.
  ],
},
```

### 3.3 Components (full)

```tsx
// src/components/media/ProductCardImage.tsx
import Image from 'next/image'

type Props = {
  src: string
  alt: string
  blurDataURL?: string | null
}

export function ProductCardImage({ src, alt, blurDataURL }: Props) {
  return (
    <div className="relative aspect-square w-full overflow-hidden bg-muted">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        quality={60}
        className="object-cover"
        placeholder={blurDataURL ? 'blur' : 'empty'}
        blurDataURL={blurDataURL ?? undefined}
      />
    </div>
  )
}
```

```tsx
// src/components/media/ProductMainImage.tsx
import Image from 'next/image'

type Props = {
  src: string
  alt: string
  blurDataURL?: string | null
  priority?: boolean
}

export function ProductMainImage({ src, alt, blurDataURL, priority = false }: Props) {
  return (
    <div className="relative aspect-square w-full max-w-[600px] overflow-hidden bg-muted">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, 600px"
        quality={75}
        priority={priority}
        className="object-cover"
        placeholder={blurDataURL ? 'blur' : 'empty'}
        blurDataURL={blurDataURL ?? undefined}
      />
    </div>
  )
}
```

```tsx
// src/components/media/HomeHeroImage.tsx
import Image from 'next/image'

type Props = {
  src: string
  alt: string
  blurDataURL?: string | null
  priority?: boolean
}

export function HomeHeroImage({ src, alt, blurDataURL, priority = false }: Props) {
  return (
    <div className="relative aspect-[16/7] w-full overflow-hidden">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 1200px"
        quality={75}
        priority={priority}
        className="object-cover"
        placeholder={blurDataURL ? 'blur' : 'empty'}
        blurDataURL={blurDataURL ?? undefined}
      />
    </div>
  )
}
```

```tsx
// src/components/media/ProductThumb.tsx
import Image from 'next/image'

type Props = { src: string; alt: string; selected?: boolean; onClick?: () => void }

export function ProductThumb({ src, alt, selected, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={selected ? 'ring-2 ring-foreground' : undefined}
      aria-label={alt}
    >
      <Image
        src={src}
        alt={alt}
        width={80}
        height={80}
        sizes="80px"
        quality={60}
        className="object-cover"
      />
    </button>
  )
}
```

### 3.4 Blur / LQIP

At upload (image pipeline), store:

```ts
type ProductImage = {
  url: string
  width: number
  height: number
  blurDataURL: string // ~10-16px wide base64 JPEG/WebP
  alt_he?: string
}
```

Never compute blur on the request path. Precompute on upload with sharp.

---

## 4. Heebo preload and font loading

### 4.1 Binding rules

1. Heebo is the **only** storefront font (Hebrew + Latin).
2. Load via `next/font/google` (self-hosted at build). No runtime Google Fonts CSS request.
3. `display: 'swap'` to avoid invisible text; pair with size-adjusted fallback to limit CLS.
4. Preload only the weights actually used on first paint: **400** and **700** (body + headings). Do not load 100-900 full axis unless UI needs it.
5. Subsets: `latin` + `hebrew` only.

### 4.2 Root layout (full)

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'

const heebo = Heebo({
  variable: '--font-heebo',
  subsets: ['latin', 'hebrew'],
  weight: ['400', '700'],
  display: 'swap',
  preload: true,
  // adjustFontFallback reduces CLS when swap kicks in
  adjustFontFallback: true,
  fallback: [
    'Segoe UI',
    'Tahoma',
    'Arial',
    'Helvetica Neue',
    'sans-serif',
  ],
})

export const metadata: Metadata = {
  title: {
    default: 'KenyonExpress',
    template: '%s | KenyonExpress',
  },
  description: 'קופונים, מבצעים ומוצרים במחיר הכי טוב',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'),
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  )
}
```

```css
/* src/app/globals.css (font wiring) */
:root {
  --font-sans: var(--font-heebo), 'Segoe UI', Tahoma, Arial, sans-serif;
}

body {
  font-family: var(--font-sans);
  font-synthesis: none; /* prevent faux-bold from inflating glyphs / CLS */
}
```

### 4.3 Manual preload (only if next/font preload is insufficient)

`next/font` already emits `<link rel="preload" as="font" type="font/woff2" crossorigin>`. Do **not** duplicate preload links unless you have measured a miss. If you must:

```tsx
// Prefer next/font. Manual example for a self-hosted file in /public/fonts:
<link
  rel="preload"
  href="/fonts/heebo-hebrew-latin-400.woff2"
  as="font"
  type="font/woff2"
  crossOrigin="anonymous"
/>
```

Budget: Heebo 400+700 subset ≤ **45 KB** compressed total.

### 4.4 Anti-patterns

- Loading Heebo from `fonts.googleapis.com` CSS (extra RTT, FOIT/FOUT).
- `display: block` (invisible text).
- Preloading unused weights (300, 500, 800, 900).
- Applying multiple font families on first viewport.

---

## 5. Bundle analysis and JS budgets

### 5.1 Scripts

```json
// package.json (scripts excerpt)
{
  "scripts": {
    "analyze": "ANALYZE=true next build",
    "analyze:bundle": "pnpm exec tsx scripts/perf/check-bundle-budgets.ts"
  }
}
```

```ts
// next.config.ts (analyzer excerpt)
import type { NextConfig } from 'next'
import bundleAnalyzer from '@next/bundle-analyzer'

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const nextConfig: NextConfig = {
  // ...existing config
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      'date-fns',
    ],
  },
}

export default withBundleAnalyzer(/* withNextIntl(nextConfig) */)
```

### 5.2 First-load JS budgets (compressed)

| Route group | Max first-load JS | Notes |
|---|---|---|
| Store shell (layout + home) | 170 KB | No admin/supplier code |
| Category | 190 KB | Filters client island only |
| Product | 180 KB | Gallery + add-to-cart island |
| Cart / checkout | 220 KB | Cardcom frame is iframe, not in JS |
| Admin | uncapped in this doc | Must be separate route group / no shared store chunks |

### 5.3 Budget checker

```ts
// scripts/perf/check-bundle-budgets.ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BUDGETS: Record<string, number> = {
  '/': 170_000,
  '/category/[slug]': 190_000,
  '/product/[slug]': 180_000,
  '/cart': 220_000,
}

type BuildManifest = {
  pages?: Record<string, string[]>
  // App Router uses different artifacts; adapt to .next/app-path-routes
}

function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}

// Prefer reading Next build traces / client manifests produced by `next build`.
// Exact file layout depends on Next version; confirm under .next/ after build.
const OUT = join(process.cwd(), '.next')

try {
  readdirSync(OUT)
} catch {
  fail('Run next build before check-bundle-budgets')
}

// Placeholder: integrate with @next/bundle-analyzer JSON export or
// experimental build stats. Keep CI red if first-load JS exceeds BUDGETS.
console.log('Bundle budget table (manual gate until analyzer export wired):')
for (const [route, bytes] of Object.entries(BUDGETS)) {
  console.log(`  ${route}: ≤ ${bytes} bytes gzip`)
}
```

### 5.4 Split rules

1. Admin and supplier code must live under separate route groups and never import into storefront layouts.
2. Heavy client widgets (filters, gallery lightbox, map) are `'use client'` islands with dynamic import:

```tsx
import dynamic from 'next/dynamic'

const ProductLightbox = dynamic(
  () => import('@/components/product/ProductLightbox').then((m) => m.ProductLightbox),
  { ssr: false, loading: () => null },
)
```

3. Do not import entire `lucide-react`. Use per-icon imports or `optimizePackageImports`.
4. Prefer RSC for data; client only for interactivity.

---

## 6. Supabase query optimization

### 6.1 Column select only

```ts
// BAD
await supabase.from('products').select('*').eq('slug', slug).single()

// GOOD
await supabase
  .from('products')
  .select(
    `
    id, slug, name_he, product_type,
    coupon_price_ils, price_ils, discount_percent,
    images, status,
    supplier:suppliers!inner ( id, business_name_he, logo_url )
  `,
  )
  .eq('slug', slug)
  .eq('status', 'published')
  .maybeSingle()
```

Ban list on hot paths:

- `select('*')`
- Selecting large `description_he` / HTML on listing queries
- Selecting payment / internal columns on public reads
- Nested `select` of unused relations

### 6.2 Listing DTO (narrow)

```ts
// src/server/catalog/product-list-select.ts
export const PRODUCT_CARD_SELECT = `
  id,
  slug,
  name_he,
  product_type,
  coupon_price_ils,
  price_ils,
  discount_percent,
  images,
  supplier:suppliers!inner ( id, business_name_he )
` as const

export type ProductCardRow = {
  id: string
  slug: string
  name_he: string
  product_type: 'coupon' | 'physical'
  coupon_price_ils: number | null
  price_ils: number | null
  discount_percent: number | null
  images: Array<{ url: string; blurDataURL?: string }>
  supplier: { id: string; business_name_he: string }
}
```

### 6.3 Indexes (migration sketch)

```sql
-- supabase/migrations/YYYYMMDDHHMMSS_perf_catalog_indexes.sql

-- Published catalog by category (listing)
CREATE INDEX IF NOT EXISTS products_published_category_published_at_idx
  ON public.products (category_id, published_at DESC)
  WHERE status = 'published';

-- Featured home rail
CREATE INDEX IF NOT EXISTS products_published_featured_updated_idx
  ON public.products (updated_at DESC)
  WHERE status = 'published' AND is_featured = true;

-- PDP / sitemap by slug
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_uidx
  ON public.products (slug);

-- Sort helper (materialized display price in agorot; maintain via trigger)
CREATE INDEX IF NOT EXISTS products_published_sort_price_idx
  ON public.products (sort_price_agorot ASC)
  WHERE status = 'published';

-- Category slug lookup
CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_uidx
  ON public.categories (slug)
  WHERE is_active = true;

-- Active hero slides
CREATE INDEX IF NOT EXISTS home_hero_slides_active_sort_idx
  ON public.home_hero_slides (sort_order ASC)
  WHERE is_active = true;
```

### 6.4 `sort_price_agorot` (display sort only)

```sql
-- Trigger maintains integer agorot for ORDER BY (not checkout money)
CREATE OR REPLACE FUNCTION public.products_set_sort_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.product_type = 'coupon' THEN
    NEW.sort_price_agorot := ROUND(COALESCE(NEW.coupon_price_ils, 0) * 100)::int;
  ELSE
    NEW.sort_price_agorot := ROUND(
      COALESCE(NEW.price_ils, 0) * (1 - COALESCE(NEW.discount_percent, 0) / 100.0) * 100
    )::int;
  END IF;
  RETURN NEW;
END;
$$;
```

Checkout **must not** trust `sort_price_agorot`. Recompute from source columns in the payment action.

### 6.5 Count and pagination

```ts
const pageSize = 24
const from = (page - 1) * pageSize
const to = from + pageSize - 1

const { data, count } = await supabase
  .from('products')
  .select(PRODUCT_CARD_SELECT, { count: 'exact' })
  .eq('status', 'published')
  .eq('category_id', categoryId)
  .order('published_at', { ascending: false })
  .range(from, to)
```

For very large categories, switch count to estimate / cursor pagination once `count` becomes hot.

### 6.6 Connection and client rules

```ts
// src/lib/supabase/anon.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export function createAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            // Allow Next fetch cache when called from unstable_cache / tagged fetches
            next: { revalidate: 60 },
          } as RequestInit),
      },
    },
  )
}
```

Prefer wrapping data loaders in `unstable_cache` / `fetch` tags rather than relying on Supabase client fetch alone.

### 6.7 Explain checklist (before merge)

For every new hot query:

1. `EXPLAIN (ANALYZE, BUFFERS)` on staging with realistic data.
2. Index used (Index Scan / Bitmap), not Seq Scan on `products`.
3. Rows removed by filter before join.
4. Payload columns match UI needs only.

---

## 7. Vercel Edge caching

### 7.1 Layers

```
Browser → Vercel Edge (HTML / RSC payload) → Origin (Next server) → Supabase / R2
                ↑
         Cache-Control + tags
```

| Asset | Where cached | TTL |
|---|---|---|
| ISR HTML / RSC | Vercel Edge | `s-maxage` from section 2.1 |
| `next/image` optimized | Vercel Image Optimization CDN | `minimumCacheTTL` 31d |
| R2 product bytes | R2 public / CDN | long; immutable URL |
| Fonts (next/font) | Immutable hashed URLs | 1y |
| Static `/_next/static` | Edge | immutable |

### 7.2 Recommended Cache-Control helpers

```ts
// src/lib/cache/http.ts
export function publicIsr(sMaxAge: number, swr: number) {
  return `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`
}

export const CacheControl = {
  home: publicIsr(120, 600),
  category: publicIsr(300, 900),
  product: publicIsr(120, 600),
  productsIndex: publicIsr(180, 600),
  sitemap: publicIsr(3600, 86400),
  search: 'public, s-maxage=30, stale-while-revalidate=60',
  private: 'private, no-store',
} as const
```

Apply via route `headers()` when needed:

```ts
// src/app/(store)/page.tsx
import type { Metadata } from 'next'
import { CacheControl } from '@/lib/cache/http'

export async function headers() {
  return {
    'Cache-Control': CacheControl.home,
  }
}
```

### 7.3 On-demand purge

Admin mutations call `revalidateTag` / `revalidatePath` (section 2.2). That is the Vercel Data Cache + path purge path for App Router ISR.

Do not invent a custom CDN purge API unless R2 HTML is involved (it is not; HTML is Vercel).

### 7.4 Cookie fragmentation

Any `Cookie` that varies HTML will bust shared Edge cache. Rules:

1. Cart cookie may exist; cart **page** is private. Home/category/product HTML must not branch on cart cookie at the document level.
2. Auth session cookie: public catalog pages stay identical for anon and logged-in users at HTML layer. Personalization (name in header) is a client island or a separate streamed hole, not a full document variant.
3. Prefer `Vary` avoidance: do not set `Vary: Cookie` on public ISR routes.

### 7.5 Edge Config / Middleware cost

Keep `src/proxy.ts` (middleware) **cheap**:

- Path prefix checks only for Cache-Control / CSP framing.
- No Supabase round-trip in middleware on public catalog paths.
- Auth gating for `/account` / `/admin` may read session cookie locally; do not query DB there.

---

## 8. Streaming and Suspense (LCP protection)

```tsx
// src/app/(store)/product/[slug]/page.tsx (streaming shape)
import { Suspense } from 'react'
import { ProductGallerySkeleton } from '@/components/product/skeletons'

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params

  return (
    <main>
      {/* LCP gallery resolves first in the same RSC tree when data is ready */}
      <Suspense fallback={<ProductGallerySkeleton />}>
        <ProductMainColumn slug={slug} />
      </Suspense>
      <Suspense fallback={null}>
        <RelatedProducts slug={slug} />
      </Suspense>
    </main>
  )
}
```

Rules:

1. LCP element (hero / main image) must not wait on related products / reviews.
2. Skeletons reserve exact aspect ratio to protect CLS.
3. Do not stream the LCP image behind a late Suspense if the data is already in the primary query.

---

## 9. Third parties

| Script | Load | Notes |
|---|---|---|
| Analytics | after consent, `lazyOnload` / idle | Never block LCP |
| Cardcom iframe | checkout only | Isolated; not on catalog |
| Sentry browser | sample rate low on storefront | Deferred |

```tsx
// Example: defer analytics
useEffect(() => {
  if (!consent) return
  const id = requestIdleCallback(() => {
    void import('@/lib/analytics/client').then((m) => m.init())
  })
  return () => cancelIdleCallback(id)
}, [consent])
```

---

## 10. Invalidation map (admin → cache)

| Admin event | Tags | Paths |
|---|---|---|
| Publish / unpublish product | `product:{id}`, `catalog`, `sitemap`, `home` if featured | `/product/{slug}`, `/`, category paths |
| Edit price / images | `product:{id}`, `catalog` | `/product/{slug}` |
| Category rename / product move | `category:{id}`, `catalog`, `sitemap` | `/category/{slug}` |
| Home hero edit | `home` | `/` |
| Bulk import | `catalog`, `home`, `sitemap` | `/`, `/products` |

---

## 11. Implementation checklist (PR gate)

- [ ] Page declares correct `revalidate` + tags (section 2.1)
- [ ] Private routes set `private, no-store`
- [ ] Images use binding `sizes` + quality; one `priority` LCP image
- [ ] Heebo weights 400+700 only; `preload: true`; no Google CSS
- [ ] No `select('*')` on new queries; indexes exist for filters / sorts
- [ ] First-load JS within route budget
- [ ] Lab LCP / CLS / TBT within section 1.2
- [ ] Admin mutation calls `revalidateTag` for affected entities
- [ ] No service-role on public RSC path
- [ ] Checkout still re-resolves money server-side (never from ISR HTML)

---

## 12. Out of scope (this doc)

- SEO meta / JSON-LD details → `ARCHITECTURE-SEO.md`
- Observability / RUM wiring details → `ARCHITECTURE-OBSERVABILITY.md`
- Search FTS internals → `ARCHITECTURE-SEARCH.md`
- Payment latency / Cardcom → payment architecture / cardcom skill

---

## 13. Revision

| Date | Change |
|---|---|
| 2026-07-30 | Initial binding performance architecture on `arch/performance` |
