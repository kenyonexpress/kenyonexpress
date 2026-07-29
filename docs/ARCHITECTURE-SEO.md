# ARCHITECTURE-SEO.md

KenyonExpress **SEO architecture** (binding metadata, JSON-LD, sitemap, CWV, WP redirects).

Status: BINDING · worktree `/Users/ofir/kenyonexpress-web/ke-arch-seo` · branch `arch/seo` (2026-07-30)
Scope: **docs only.** Full TypeScript below is the implementation contract.
Companions: live `src/app/sitemap.ts`, `src/app/robots.ts`, `docs/ARCHITECTURE-SEO.md` (phase5 Hebrew), `docs/ARCHITECTURE-GROWTH-SEO.md`.

Canonical host: `https://kenyonexpress.co.il` (env `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL`).
Locale: Hebrew RTL, `lang="he-IL"`, `dir="rtl"`, font **Heebo**.

Money on SEO surfaces:

| Product | Offer / meta price | Never |
|---|---|---|
| Coupon | On-site `coupon_price` (agorot→₪) | Escrow copy; inventing % of face |
| Physical | Discounted on-site charge | Live `platform_percent` in customer schema |

Never index: `/account/**`, `/checkout`, `/cart`, `/admin/**`, `/supplier/**`, `/redeem/[token]`, `/api/**`.

---

## 0. Constants

```typescript
// src/lib/seo/constants.ts
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://kenyonexpress.co.il'
).replace(/\/$/, '')

export const SITE_NAME_HE = 'קניון אקספרס'
export const LOCALE_OG = 'he_IL'
export const LOCALE_BCP47 = 'he-IL'

export function absoluteUrl(path = '/'): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const noTrailing = cleanPath === '/' ? '/' : cleanPath.replace(/\/$/, '')
  return `${SITE_URL}${noTrailing}`
}

export function heAlternates(canonicalPath: string) {
  const href = absoluteUrl(canonicalPath)
  return {
    canonical: href,
    languages: {
      'he-IL': href,
      he: href,
      'x-default': href,
    },
  }
}
```

---

## 1. Root layout: metadata, Heebo preload, CWV

```tsx
// src/app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { Heebo } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import {
  SITE_URL,
  SITE_NAME_HE,
  LOCALE_OG,
  LOCALE_BCP47,
} from '@/lib/seo/constants'
import { OrganizationJsonLd } from '@/components/seo/JsonLd'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fed700',
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'קניון אקספרס | שוברים ומוצרים במחירי קניון',
    template: '%s | קניון אקספרס',
  },
  description:
    'קניון אקספרס: מרקטפלייס שוברים ומוצרים פיזיים במחירים משתלמים, עם פרטי ספק מלאים ומשלוח לכל הארץ.',
  applicationName: SITE_NAME_HE,
  alternates: {
    canonical: '/',
    languages: {
      'he-IL': SITE_URL,
      he: SITE_URL,
      'x-default': SITE_URL,
    },
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME_HE,
    locale: LOCALE_OG,
    url: SITE_URL,
    images: [{ url: '/og/default.png', width: 1200, height: 630, alt: SITE_NAME_HE }],
  },
  twitter: { card: 'summary_large_image' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={LOCALE_BCP47} dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <OrganizationJsonLd />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

CWV notes (LCP):

1. Heebo via `next/font` with `preload: true` (self-hosted, no FOIT blocking beyond swap).
2. Hero / product primary image: `next/image` with `priority` + explicit `sizes`; width/height or `fill` with aspect box.
3. Avoid layout shift: reserve image aspect ratio; no late-injected fonts outside next/font.
4. LCP element on PDP is product image, not logo.

```tsx
// LCP product image pattern
import Image from 'next/image'

export function ProductHeroImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-square w-full">
      <Image
        src={src}
        alt={alt}
        fill
        priority
        sizes="(max-width: 768px) 100vw, 50vw"
        className="object-cover"
      />
    </div>
  )
}
```

---

## 2. Dynamic metadata per page

### 2.1 Matrix

| Page | Route | Source | Canonical | Index |
|---|---|---|---|---|
| Home | `/` | static | `/` | yes |
| Category | `/category/[slug]` | `categories` | `/category/{slug}` | yes (page 1); `noindex` if `?page>=2` optional |
| Product | `/product/[slug]` | `products` | `/product/{slug}` | yes if active |
| Products | `/products` | static | `/products` (strip query) | yes |
| Search | `/search` | static | omit | **noindex** |
| Cart / Checkout / Account | | static | omit | **noindex** |
| Redeem token | `/redeem/[token]` | | omit | **noindex** |

### 2.2 Product `generateMetadata`

```typescript
// src/app/(store)/product/[slug]/page.tsx
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { absoluteUrl, heAlternates, LOCALE_OG, SITE_NAME_HE } from '@/lib/seo/constants'
import { formatIlsFromAgorot } from '@/lib/account/format'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: raw } = await params
  const slug = decodeURIComponent(raw)
  const supabase = await createClient()

  const { data: p } = await supabase
    .from('products')
    .select(
      `slug, name_he, description_he, type, status,
       coupon_price_agorot, kenyon_price, images,
       seo_title, seo_description,
       suppliers(name), categories(name_he)`,
    )
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()

  if (!p) {
    return { title: 'מוצר לא נמצא', robots: { index: false, follow: false } }
  }

  const kindHe = p.type === 'coupon' ? 'שובר' : 'מוצר'
  const onSiteAgorot =
    p.type === 'coupon'
      ? Number(p.coupon_price_agorot ?? 0)
      : Math.round(Number(p.kenyon_price ?? 0) * 100)
  const priceHe = onSiteAgorot > 0 ? `רק ${formatIlsFromAgorot(onSiteAgorot)} ` : ''

  const title = p.seo_title?.trim() || p.name_he
  const description =
    p.seo_description?.trim() ||
    (p.description_he?.slice(0, 155) ?? `${kindHe} ${p.name_he} ${priceHe}בקניון אקספרס.`).trim()

  const path = `/product/${p.slug}`
  const ogImage = absoluteUrl(`/product/${p.slug}/opengraph-image`)

  return {
    title,
    description,
    alternates: heAlternates(path),
    openGraph: {
      type: 'website',
      title: `${title} | ${SITE_NAME_HE}`,
      description,
      url: absoluteUrl(path),
      siteName: SITE_NAME_HE,
      locale: LOCALE_OG,
      images: [{ url: ogImage, width: 1200, height: 630, alt: p.name_he }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}
```

### 2.3 Category metadata

```typescript
// src/app/(store)/category/[slug]/page.tsx
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { absoluteUrl, heAlternates, LOCALE_OG, SITE_NAME_HE } from '@/lib/seo/constants'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = Number((await searchParams).page ?? '1') || 1
  const supabase = await createClient()
  const { data: c } = await supabase
    .from('categories')
    .select('slug, name_he, description_he')
    .eq('slug', decodeURIComponent(slug))
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle()

  if (!c) return { title: 'קטגוריה', robots: { index: false } }

  const path = `/category/${c.slug}`
  return {
    title: c.name_he,
    description: c.description_he?.slice(0, 160) ?? `${c.name_he} בקניון אקספרס`,
    alternates: heAlternates(path),
    robots: page > 1 ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: `${c.name_he} | ${SITE_NAME_HE}`,
      url: absoluteUrl(path),
      locale: LOCALE_OG,
      siteName: SITE_NAME_HE,
    },
  }
}
```

---

## 3. JSON-LD helpers (Product, Offer, BreadcrumbList, Organization)

```typescript
// src/lib/seo/json-ld.ts
import { absoluteUrl, SITE_NAME_HE, SITE_URL, LOCALE_BCP47 } from '@/lib/seo/constants'

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME_HE,
    url: SITE_URL,
    logo: absoluteUrl('/logo.png'),
    inLanguage: LOCALE_BCP47,
  }
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE_NAME_HE,
    inLanguage: LOCALE_BCP47,
    publisher: { '@id': `${SITE_URL}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}

export type BreadcrumbItem = { name: string; path: string }

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export type ProductJsonLdInput = {
  slug: string
  nameHe: string
  descriptionHe: string | null
  imageUrls: string[]
  /** On-site charge in agorot (coupon_price or physical charge). */
  priceAgorot: number
  currency?: string
  availability: 'InStock' | 'OutOfStock'
  productType: 'coupon' | 'physical'
  sku?: string | null
  supplierName?: string | null
}

export function productJsonLd(p: ProductJsonLdInput) {
  const url = absoluteUrl(`/product/${p.slug}`)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.nameHe,
    description: p.descriptionHe ?? undefined,
    image: p.imageUrls,
    sku: p.sku ?? undefined,
    inLanguage: LOCALE_BCP47,
    brand: p.supplierName
      ? { '@type': 'Brand', name: p.supplierName }
      : { '@type': 'Brand', name: SITE_NAME_HE },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: p.currency ?? 'ILS',
      price: (p.priceAgorot / 100).toFixed(2),
      availability: `https://schema.org/${p.availability}`,
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: p.supplierName ?? SITE_NAME_HE,
      },
    },
  }
}
```

```tsx
// src/components/seo/JsonLd.tsx
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/json-ld'

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export function OrganizationJsonLd() {
  return <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
}
```

```tsx
// On PDP (server component excerpt)
import { JsonLd } from '@/components/seo/JsonLd'
import { breadcrumbJsonLd, productJsonLd } from '@/lib/seo/json-ld'

export default async function ProductPage({ params }: Props) {
  // ...load product
  const images = Array.isArray(product.images)
    ? product.images.filter((x: unknown): x is string => typeof x === 'string')
    : []
  const priceAgorot =
    product.type === 'coupon'
      ? Number(product.coupon_price_agorot ?? 0)
      : Math.round(Number(product.kenyon_price ?? 0) * 100)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'עמוד הבית', path: '/' },
            { name: category?.name_he ?? 'קטגוריה', path: `/category/${category?.slug ?? ''}` },
            { name: product.name_he, path: `/product/${product.slug}` },
          ]),
          productJsonLd({
            slug: product.slug,
            nameHe: product.name_he,
            descriptionHe: product.description_he,
            imageUrls: images,
            priceAgorot,
            availability: product.stock_quantity === 0 ? 'OutOfStock' : 'InStock',
            productType: product.type,
            supplierName: supplier?.name ?? null,
          }),
        ]}
      />
      {/* page UI */}
    </>
  )
}
```

No `aggregateRating` unless real reviews exist in DB.

---

## 4. Dynamic `sitemap.xml` from Supabase

```typescript
// src/app/sitemap.ts
import { createAdminClient } from '@/lib/supabase/admin'
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/constants'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/coupons`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
  ]

  const admin = createAdminClient()
  const [{ data: products }, { data: categories }] = await Promise.all([
    admin
      .from('products')
      .select('slug, updated_at')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('slug', 'is', null)
      .limit(45_000),
    admin
      .from('categories')
      .select('slug, updated_at')
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('slug', 'is', null),
  ])

  return [
    ...staticEntries,
    ...(categories ?? []).map((c) => ({
      url: `${base}/category/${c.slug}`,
      lastModified: c.updated_at ? new Date(c.updated_at) : now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...(products ?? []).map((p) => ({
      url: `${base}/product/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ]
}
```

On publish: `revalidateTag('sitemap')` / `revalidatePath('/sitemap.xml')`.

---

## 5. `robots.txt`

```typescript
// src/app/robots.ts
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/constants'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/redeem/',
          '/account/',
          '/supplier/',
          '/admin/',
          '/checkout',
          '/cart',
          '/auth/',
          '/api/',
          '/login',
          '/signup',
          '/reset-password',
          '/forgot-password',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
```

---

## 6. Canonical + hreflang `he-IL`

Binding for every indexable page:

```typescript
alternates: heAlternates(`/product/${slug}`)
// expands to:
// canonical: https://kenyonexpress.co.il/product/...
// languages: { 'he-IL': same, he: same, 'x-default': same }
```

Rules:

1. One locale storefront today: self-referencing `he-IL` / `he` / `x-default` only.
2. Do not invent `/en` URLs.
3. Canonical never includes tracking query (`utm_*`, `fbclid`) or `?page=` for page 1.
4. `www` vs apex: pick one host in env; redirect the other at edge (Vercel domain / proxy).

---

## 7. OG images (dynamic)

```typescript
// src/app/(store)/product/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

type Props = { params: Promise<{ slug: string }> }

export default async function Image({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: p } = await supabase
    .from('products')
    .select('name_he, type, images')
    .eq('slug', decodeURIComponent(slug))
    .maybeSingle()

  const title = p?.name_he ?? 'קניון אקספרס'
  const kind = p?.type === 'coupon' ? 'שובר' : 'מוצר'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: '#333e48',
          color: '#fed700',
          padding: 64,
          fontSize: 56,
          fontWeight: 700,
        }}
      >
        <div style={{ fontSize: 28, color: '#fff', marginBottom: 16 }}>{kind}</div>
        <div style={{ lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: 24, color: '#fff', marginTop: 24 }}>קניון אקספרס</div>
      </div>
    ),
    { ...size },
  )
}
```

Default static fallback: `public/og/default.png` (1200×630).

---

## 8. Core Web Vitals checklist

| Metric | Binding practice |
|---|---|
| **LCP** | `priority` on hero/PDP image; Heebo `preload`; avoid huge hero JS |
| **CLS** | fixed aspect boxes for images; font via next/font |
| **INP** | keep cart drawer light; no heavy sync work on tap |
| Images | WebP/AVIF via `next/image`; R2 CDN; `sizes` correct |
| JS | no client JSON-LD generators; RSC for metadata |

```css
/* globals.css excerpt */
:root {
  --font-sans: var(--font-heebo), 'Arial Hebrew', Arial, sans-serif;
}
body {
  font-family: var(--font-sans);
}
```

---

## 9. WordPress → Next 301 map (`seo_redirects`)

### 9.1 Schema

```sql
-- already from catalog migrations; harden if missing
CREATE TABLE IF NOT EXISTS public.seo_redirects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path   text NOT NULL,
  to_path     text NOT NULL,
  status_code int NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302, 410)),
  hits        bigint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_redirects_from_uniq UNIQUE (from_path)
);

CREATE INDEX IF NOT EXISTS seo_redirects_from_idx ON public.seo_redirects (from_path);
```

### 9.2 Typical WP patterns

| Old (WP) | New |
|---|---|
| `/product/slug/` | `/product/slug` |
| `/product-category/hot-deals/` | `/category/hot-deals` |
| `/shop/` | `/products` |
| `/?s=q&post_type=product` | `/search?q=q` |
| `/cart/` | `/cart` |
| `/checkout/` | `/checkout` |
| `/my-account/` | `/account` |

### 9.3 Enforce in `proxy.ts`

```typescript
// src/proxy.ts (excerpt)
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  // Normalize trailing slash (except root)
  if (path.length > 1 && path.endsWith('/')) {
    const url = request.nextUrl.clone()
    url.pathname = path.replace(/\/+$/, '')
    return NextResponse.redirect(url, 301)
  }

  const supabase = createClient(supabaseUrl, anon)
  const { data } = await supabase
    .from('seo_redirects')
    .select('to_path, status_code')
    .eq('from_path', path)
    .maybeSingle()

  if (data?.status_code === 410) {
    return new NextResponse('Gone', { status: 410 })
  }
  if (data?.to_path) {
    const url = request.nextUrl.clone()
    url.pathname = data.to_path
    // fire-and-forget hit counter via edge-safe route if needed
    return NextResponse.redirect(url, data.status_code === 302 ? 302 : 301)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### 9.4 Seed loader

```typescript
// scripts/seo/import-wp-redirects.ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

type Row = { from_path: string; to_path: string; status_code?: number }

async function main() {
  const rows = JSON.parse(readFileSync('refs/wp-redirects.json', 'utf8')) as Row[]
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  for (const row of rows) {
    await admin.from('seo_redirects').upsert(
      {
        from_path: row.from_path.replace(/\/$/, '') || '/',
        to_path: row.to_path.replace(/\/$/, '') || '/',
        status_code: row.status_code ?? 301,
      },
      { onConflict: 'from_path' },
    )
  }
}

void main()
```

Collapse chains at import time (A→B, B→C becomes A→C).

---

## 10. Acceptance

- [ ] Every indexable page has `generateMetadata` + canonical + `he-IL` alternates
- [ ] PDP emits Product + Offer + BreadcrumbList JSON-LD
- [ ] Root emits Organization + WebSite
- [ ] `/sitemap.xml` lists active products + categories from Supabase
- [ ] `/robots.txt` disallows redeem/account/checkout/api
- [ ] OG image route returns 1200×630
- [ ] Heebo preload via next/font; PDP LCP image has `priority`
- [ ] WP paths 301 via `seo_redirects` + proxy
- [ ] Redeem/account/checkout are noindex

---

## 11. Related paths

```
src/lib/seo/constants.ts
src/lib/seo/json-ld.ts
src/components/seo/JsonLd.tsx
src/app/layout.tsx
src/app/sitemap.ts
src/app/robots.ts
src/app/(store)/product/[slug]/page.tsx
src/app/(store)/product/[slug]/opengraph-image.tsx
src/app/(store)/category/[slug]/page.tsx
src/proxy.ts
scripts/seo/import-wp-redirects.ts
supabase/migrations/*seo_redirects*
```

---

## 12. Open questions

1. Apex vs `www` as the single canonical host in production DNS?
2. Should paginated category pages be `noindex` or `rel=next/prev` only?
3. When reviews ship: add AggregateRating only from verified DB rows?
