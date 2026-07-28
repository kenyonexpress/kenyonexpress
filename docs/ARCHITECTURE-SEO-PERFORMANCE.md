# ARCHITECTURE-SEO-PERFORMANCE.md

KenyonExpress SEO and performance architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-admin` on `arch/admin-supplier` (2026-07-28)
Scope: **docs only.** No application code, no installs, no changes outside `docs/` except `STATE.md` protocol updates.
Companions: `docs/ARCHITECTURE-ADMIN.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-ADMIN-DASHBOARD.md`.
Authority: App Router storefront on Next.js (repo on 16.x; design against App Router caching APIs). Hebrew RTL. Google Israel primary index market.

Money rules that affect visible price / JSON-LD (must not invent commissions):

| Type | Customer-facing price in meta / Offer | Not for customer price |
|---|---|---|
| Coupon | Absolute `coupon_price_ils` (admin, no default) | `platform_percent` (split only; dynamic, snapshotted at purchase) |
| Physical | On-site charge after `discount_percent` | Live recomputation from a later admin edit of `platform_percent` |

Never encode fixed 5%/10% into SEO. Never index `/redeem/[token]` (signed voucher).

---

## 0. Goals and non-goals

| Goal | Target |
|---|---|
| LCP p75 mobile (CrUX / field) | **under 2.5s** |
| CLS p75 | **under 0.1** |
| INP p75 | **under 200ms** |
| Indexation | Products, categories, coupon PDPs discoverable; private surfaces blocked |
| Equity | WP URLs preserved via `seo_redirects` + `proxy.ts` |

Non-goals: ranking guarantees; English storefront (unless **Q-SEO-EN** opens); indexing account/admin/supplier/checkout.

---

## 1. Dynamic meta tags

Implemented via `generateMetadata` on RSC pages. All public catalog HTML: `<html lang="he" dir="rtl">`.

### 1.1 Field sources

| Meta | Product PDP `/product/[slug]` | Category `/category/[slug]` | Coupon legacy `/coupons/[id]` or product type=coupon | Home `/` |
|---|---|---|---|---|
| `title` | `seo_title` or `{name_he} \| קניון אקספרס` | `{name_he} \| קניון אקספרס` | same as product when canonicalized | brand + short value prop Hebrew |
| `description` | `seo_description` or truncated `short_description_he` / `description_he` (Hebrew, 120–160 chars target) | category blurb Hebrew | emphasize deal + till balance wording carefully (no false "10% platform") | Hebrew default |
| `canonical` | `https://{host}/product/{slug}` | `https://{host}/category/{slug}` | prefer canonical → product slug if dual URL | `https://{host}/` |
| `og:title` / `og:description` | same as title/description | same | same | same |
| `og:image` | first gallery image (R2 absolute HTTPS) or supplier logo fallback then site OG | category image or site OG | product image | site OG / hero slide 1 |
| `og:locale` | `he_IL` | `he_IL` | `he_IL` | `he_IL` |
| `og:type` | `product` (or `website` if type unsupported) | `website` | `product` | `website` |
| `twitter:card` | `summary_large_image` | same | same | same |
| `robots` | `index,follow` if published/active | index if live | index if live | index |
| `alternates.languages` | see hreflang | | | |

### 1.2 hreflang / he-IL

- Emit `hreflang="he-IL"` (and `he`) pointing at the canonical URL for that page.
- Emit `x-default` → same Hebrew canonical until an EN storefront exists (**Q-SEO-EN**: no `en` alternate).
- Do **not** invent English URLs.

### 1.3 RTL / social considerations

- WhatsApp / iMessage unfurl uses `og:*`; image ≥ 1200×630 recommended; absolute URL on R2/CDN.
- Titles readable RTL; avoid leading LTR product codes without Hebrew name.
- Price in description optional; if present, format `₪X.XX` matching **on-site charge** (coupon_price or discounted physical), never platform split.

### 1.4 Private surfaces

| Path | robots |
|---|---|
| `/search` | `noindex,follow` |
| `/cart`, `/checkout*`, `/login`, `/account/**` | `noindex,nofollow` |
| `/admin/**`, `/supplier/**` | `noindex` + robots disallow |
| `/redeem/[token]` | `noindex` + disallow (token = spendable secret) |

Admin publish / money edit must call on-demand revalidation (`revalidateTag('product:'+id)`, `revalidatePath`) so meta and JSON-LD refresh after `coupon_price_ils` or content changes.

---

## 2. sitemap.xml strategy

### 2.1 Generation

App Router `src/app/sitemap.ts` (and optional split sitemaps if URL count grows):

| Segment | Source query | `lastModified` | `changeFrequency` | `priority` |
|---|---|---|---|---|
| Static | `/`, legal/marketing static routes | deploy time or CMS `updated_at` | weekly | 1.0 / 0.5 |
| Categories | `categories` where live / not deleted | `updated_at` | weekly | 0.8 |
| Products (incl. coupon type) | `products` where published/active, `deleted_at IS NULL` | `updated_at` | daily | 0.9 |
| Legacy coupon URLs | only while `/coupons/[id]` still public; else omit and 301 | `updated_at` | daily | 0.7 |

**Excluded:** drafts, pending_review, archived, `/redeem/*`, search, account, admin, supplier, checkout, cart, API.

### 2.2 robots.txt

`src/app/robots.ts`:

- `Allow: /` for catalog
- `Disallow: /admin`, `/account`, `/supplier`, `/api`, `/checkout`, `/cart`, `/login`, `/search`, `/redeem`
- `Sitemap: https://{canonical-host}/sitemap.xml`

### 2.3 Revalidation schedule

| Trigger | Action |
|---|---|
| Admin publish / unpublish / archive product | `revalidateTag('product:'+id)`, `revalidateTag('sitemap')` or path `/sitemap.xml` |
| Category edit | `revalidateTag('category:'+id)`, sitemap tag |
| Cron (optional) | Daily soft rebuild of sitemap cache (ISR on sitemap route `revalidate: 3600`) |
| Bulk import | End-of-job revalidate sitemap + affected tags |

Sitemap route itself: ISR **`revalidate = 3600`** (1h) plus on-demand tag. Do not rebuild every request.

### 2.4 Post-cutover

Submit sitemap in the **same** Google Search Console property as the legacy WP domain. Monitor coverage vs `seo_redirects` hits.

---

## 3. Schema.org JSON-LD (exact shapes)

Emit as `<script type="application/ld+json">` from RSC. One graph or multiple script tags. Prices: decimal string ILS matching on-site charge. `priceCurrency`: `"ILS"`.

### 3.1 Organization (home + optionally layout)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "קניון אקספרס",
  "url": "https://{host}/",
  "logo": "https://{r2}/brand/logo.png",
  "sameAs": []
}
```

### 3.2 WebSite + SearchAction (home)

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "קניון אקספרס",
  "url": "https://{host}/",
  "inLanguage": "he-IL",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://{host}/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

### 3.3 BreadcrumbList (category + PDP)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "בית", "item": "https://{host}/" },
    { "@type": "ListItem", "position": 2, "name": "{category_name_he}", "item": "https://{host}/category/{cat_slug}" },
    { "@type": "ListItem", "position": 3, "name": "{product_name_he}", "item": "https://{host}/product/{slug}" }
  ]
}
```

(Omit position 3 on category-only pages.)

### 3.4 Product + Offer (PDP, coupon or physical)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{name_he}",
  "description": "{seo_description or short_description_he}",
  "image": ["https://{r2}/..."],
  "sku": "{sku or product id}",
  "brand": { "@type": "Brand", "name": "{brand or supplier_name}" },
  "offers": {
    "@type": "Offer",
    "url": "https://{host}/product/{slug}",
    "priceCurrency": "ILS",
    "price": "{coupon_price_ils OR physical_on_site_ils}",
    "availability": "https://schema.org/InStock",
    "seller": {
      "@type": "Organization",
      "name": "{supplier_name}"
    },
    "priceValidUntil": "{offer_valid_until ISO date if set}"
  }
}
```

Rules:

- Coupon: `price` = `coupon_price_ils` (string with 2 decimals). Do not use face/`price_ils` as the offer price.
- Physical: `price` = discounted on-site amount from `discount_percent`.
- `seller` = supplier business (platform is marketplace), matching PDP disclosure.
- Out of stock: `SoldOut` / `OutOfStock` as applicable.

### 3.5 AggregateRating

Only when real review aggregates exist in DB (**Q-SEO-RATING**). Never fabricate.

```json
{
  "@type": "AggregateRating",
  "ratingValue": "{avg}",
  "reviewCount": "{n}",
  "bestRating": "5",
  "worstRating": "1"
}
```

Nest under `Product` when `n >= 1` and source is trusted.

### 3.6 Page-type checklist

| Page | JSON-LD |
|---|---|
| Home | Organization + WebSite |
| Category | BreadcrumbList (+ optional CollectionPage) |
| Product / coupon PDP | BreadcrumbList + Product/Offer (+ AggregateRating if real) |
| Search / cart / checkout / account | none (noindex) |

---

## 4. Image pipeline

### 4.1 Storage

- **Cloudflare R2** (or Supabase Storage until cutover): public HTTPS base `R2_PUBLIC_BASE_URL`.
- Admin upload via existing admin images action pattern; store object keys on `products.images` / media tables.
- CSP / `next.config` `images.remotePatterns` must allow R2 host (required config; described, not coded here).

### 4.2 next/image

| Concern | Rule |
|---|---|
| Formats | Negotiate **AVIF** then **WebP** via Next image optimizer |
| Quality | Default 75–80; hero may 85 |
| `sizes` (cards) | `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw` (tune to grid) |
| `sizes` (PDP gallery main) | `(max-width: 768px) 100vw, 50vw` |
| `sizes` (home hero) | `100vw` |
| LCP image | `priority` + explicit `width`/`height` or `fill` + aspect wrapper |
| Below fold | default lazy (`loading` deferred by next/image) |
| Blur | `placeholder="blur"` with `blurDataURL` from media pipeline when available |
| Alt | Hebrew product/category name; never empty on content images |

### 4.3 Breakpoint width hints (srcset via next/image)

Serve intrinsic candidates roughly: 320, 640, 960, 1280, 1920 for full-bleed; cards max ~640.

### 4.4 Lazy loading strategy

1. First viewport: hero + first PDP image eager/`priority`.
2. Listing grids: native lazy; avoid `priority` on every card.
3. Do not lazy-load OG-critical assets server-side (meta uses absolute URL, not next/image).

---

## 5. Caching

### 5.1 ISR / revalidate by page type

| Page type | Mode | `revalidate` (seconds) | Cache tags |
|---|---|---|---|
| Home | ISR | **120** | `home` |
| Category | ISR | **300** | `category:{id}`, `catalog` |
| Product / coupon PDP | ISR | **120** | `product:{id}`, `catalog` |
| Products index `/products` | ISR | **180** | `catalog` |
| Coupons archive (legacy) | ISR | **300** | `catalog` |
| Sitemap | ISR | **3600** | `sitemap` |
| Search | Dynamic | `Cache-Control: public, s-maxage=30, stale-while-revalidate=60` | none long |
| Cart / checkout / account / admin / supplier | Dynamic private | `private, no-store` | |

On admin publish: `revalidateTag('product:'+id)`, `revalidateTag('catalog')`, `revalidateTag('sitemap')`, `revalidateTag('home')` if featured.

### 5.2 Cache headers (edge)

| Asset | Header |
|---|---|
| `/_next/static/*` | immutable long cache (framework default) |
| Optimized images | long cache with content hash |
| HTML ISR | CDN TTL aligned with revalidate; SWR acceptable |
| API search | short s-maxage as above |

### 5.3 Vercel edge config (binding intent)

- Region: prefer close to IL users (**Q-SEO-REGION**: `fra1` vs other; match MASTER v2 if still fra1).
- No auth middleware blocking public catalog HTML caching.
- `proxy.ts`: apply `seo_redirects` 301 before rendering; do not mark those responses cacheable as 200 HTML.
- Environment: production canonical host only in metadataBase.

### 5.4 Data cache

Public RSC fetches use anon/RLS-safe client with `next: { tags, revalidate }`. Never service-role in public page data path.

---

## 6. Core Web Vitals: how each page type hits targets

### 6.1 Targets (binding)

- **LCP < 2.5s** (p75 mobile)
- **CLS < 0.1**
- **INP < 200ms**

### 6.2 By page type

| Page | LCP | CLS | INP |
|---|---|---|---|
| **Home** | Priority hero/`next/image`; limit slide JS; font via `next/font` (Heebo self-hosted) | Fixed hero aspect; no late-injected banners above fold without reserved space; consent banner reserved height | Minimal client; defer analytics to idle/`sendBeacon` |
| **Category / products grid** | First row images sized; avoid huge carousels above fold | Card aspect-ratio CSS; skeleton same size as card | RSC list; filters as progressive enhancement |
| **PDP / coupon** | Gallery image 0 `priority`; preload not required if priority set | Gallery aspect box; price block stable (no layout jump when preview loads) | Add-to-cart as small client island; no heavy admin widgets |
| **Search** | Lightweight results; noindex so CWV less SEO-critical but still UX | Same card geometry | Debounced query; avoid layout thrash |
| **Checkout** | Private; optimize for INP (forms) more than SEO | Stable form layout | Few client components; Cardcom iframe isolated |

### 6.3 Shared anti-patterns (forbidden on catalog)

- Unsized images / ads injecting above LCP
- Blocking third-party chat on browse templates (**Q-SEO-3P**)
- Flash of unstyled RTL
- Client-only rendering of product title/price (hurts LCP + SEO)

### 6.4 Monitoring

- CrUX / GSC Core Web Vitals (Israel)
- Lab: Lighthouse on `/`, sample category, sample PDP
- Optional: `v_web_vitals_daily` analytics views when present
- Alert if LCP p75 mobile exceeds 2.5s for 7 days

---

## 7. Hebrew / RTL SEO (Google Israel)

1. Primary language `he` / `he-IL` everywhere public.
2. Meta descriptions and titles **written in Hebrew** (not machine-English leftovers).
3. H1 = `name_he` (single H1); breadcrumbs Hebrew.
4. Slugs: prefer stable ASCII `products.slug` for URLs; Hebrew in visible titles only.
5. Local business signals: supplier name/address on PDP (also legal); Organization on home.
6. Avoid duplicate content between `/coupons/[id]` and `/product/[slug]` via canonical.
7. Internal links in Hebrew anchor text from home/category.
8. Consent / cookie banner must not block first paint indefinitely (CLS + LCP).
9. Indexing geo: GSC property set to target Israel; do not geo-target unrelated countries without product decision.

---

## 8. Schema / migrations (077+)

**Never** `supabase db push`. Apply only via **Supabase MCP `apply_migration`**.

Note: numbers **077–078** already used on some hosts for supplier order RLS. Choose the **next free** ordinal ≥ 077 on the target journal (may be **093+** if 077–092 occupied). Read `schema_migrations` at apply time (**Q-SEO-MIG**).

### 8.1 Tables / objects

| Object | Purpose | Needed? |
|---|---|---|
| `seo_redirects` | `from_path`, `to_path`, `status_code` default 301, `hits`, `created_at` | Yes if not already present from WP migration track |
| Indexes | `(from_path)` UNIQUE for live redirects | Yes with table |
| Optional `seo_redirects` RLS | admin service write; no public read via PostgREST required (proxy uses service/edge config) | Yes |
| Reviews aggregate tables | Enable AggregateRating | Only if product reviews ship |
| No change to money tables for SEO | Prices come from existing `products` columns | |

### 8.2 Proposed migration sketch (description only)

Name example: `{NNN}_seo_redirects.sql` where NNN = next free ≥ 077.

Contents (intent):

- `CREATE TABLE IF NOT EXISTS public.seo_redirects (...)`
- UNIQUE `from_path`
- Index on `to_path` optional
- ENABLE RLS; no anon policies; admin/service only
- Comment: used by `proxy.ts` for 301 after WP cutover

Sitemap/robots/metadata/JSON-LD are **application** concerns (no DB) once `products`/`categories` exist.

### 8.3 Revalidation hook (app, not SQL)

Admin product upsert already `revalidatePath`; Core admin goal must also `revalidateTag` for SEO tags listed in §5.

---

## 9. Acceptance checklist

- [ ] Every public PDP has unique Hebrew title/description, canonical, `og:image` HTTPS, `og:locale=he_IL`, `hreflang=he-IL`
- [ ] JSON-LD Product offer price equals on-site charge (coupon_price or discounted physical)
- [ ] Sitemap lists only indexable URLs; `/redeem/` absent; robots disallow private trees
- [ ] R2 images flow through `next/image` with AVIF/WebP; LCP image prioritized on home/PDP
- [ ] ISR TTLs per §5; publish revalidates product + sitemap tags
- [ ] Field CWV targets documented and monitored; no fabricated AggregateRating
- [ ] Redirects table applied via MCP only when ordinal confirmed

---

## 10. Open questions

| ID | Question |
|---|---|
| Q-SEO-EN | English storefront / hreflang en? (default no) |
| Q-SEO-RATING | Real reviews source for AggregateRating? |
| Q-SEO-REGION | Vercel region pin for IL |
| Q-SEO-3P | Third-party scripts allowed on catalog? |
| Q-SEO-MIG | Exact first free migration number on hosted |
| Q-SEO-HOST | www vs apex canonical |
| Q-SEO-COUPON-URL | Retire `/coupons/[id]` to redirect-only when? |

---

## 11. Related routes and docs

| Path / doc | Role |
|---|---|
| `(store)/page.tsx` | home |
| `(store)/product/[slug]/page.tsx` | PDP + metadata |
| `(store)/category/[slug]/page.tsx` | category |
| `(store)/products/page.tsx` | archive |
| `(main)/coupons/**` | legacy coupon browse |
| `proxy.ts` | redirects + headers |
| `docs/ARCHITECTURE-ADMIN.md` | admin publish → revalidate |
| `docs/ARCHITECTURE-NOTIFICATIONS.md` | no SEO impact; keep redeem tokens out of email links that get crawled |
| `docs/ADMIN-PRODUCT-PAGE-SPEC.md` | price fields feeding Offer |
