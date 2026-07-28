# ARCHITECTURE-SEO-PERFORMANCE.md

KenyonExpress SEO and performance architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-admin` on `arch/admin-supplier` (2026-07-28)
Scope: **docs only.** No application code, no installs, no edits outside `docs/` and `STATE.md`.
Companions: `docs/ARCHITECTURE-ADMIN.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-WP-MIGRATION.md`.
Stack: Next.js App Router, Hebrew RTL, Google Israel primary market. Canonical host: `kenyonexpress.co.il`.

---

## 0. Money rules that touch SEO surfaces

| Product type | Customer-facing Offer / meta price | Never in customer price |
|---|---|---|
| **Coupon** | Absolute online `coupon_price_ils` (admin-set, no default) | `platform_percent` (split only; dynamic; snapshotted at purchase) |
| **Physical** | On-site charge after `discount_percent` | Later live edits of `platform_percent` |

Invariants:

1. KenyonExpress is a **platform**, never a supplier. JSON-LD `seller` = supplier business; Organization on home is the marketplace brand.
2. No fixed commission in copy, meta, or schema.
3. Every PDP shows supplier details (name, phone, address, logo). Publish gate enforces this (`ADMIN-PRODUCT-PAGE-SPEC`).
4. Never index `/redeem/[token]` or other spendable secrets.
5. Coupon: customer paid full coupon price on site; till remainder is at merchant after QR; voucher expires on scan. Do not imply the till amount flows through the platform.

---

## 1. Goals and non-goals

| Goal | Target |
|---|---|
| LCP p75 mobile (CrUX) | **&lt; 2.5s** |
| CLS p75 | **&lt; 0.1** |
| INP p75 | **&lt; 200ms** |
| Indexation | Published products, categories, home discoverable |
| SEO equity | WP URLs preserved via `seo_redirects` + edge proxy (see WP migration doc) |

Non-goals: ranking guarantees; English storefront unless **Q-SEO-EN** opens; indexing account / admin / supplier / checkout / cart / redeem.

---

## 2. Dynamic meta tags

Implemented with `generateMetadata` on RSC pages. Public HTML root: `lang="he"` `dir="rtl"`.

### 2.1 Per page type

| Meta | Product `/product/[slug]` | Category `/category/[slug]` | Home `/` | Coupon type PDP |
|---|---|---|---|---|
| `title` | `seo_title` or `{name_he} \| קניון אקספרס` | `{name_he} \| קניון אקספרס` | brand + short Hebrew value prop | same as product |
| `description` | `seo_description` or truncated Hebrew body (120–160 chars) | category blurb Hebrew | Hebrew default | emphasize deal; never invent platform % |
| `canonical` | `https://{host}/product/{slug}` | `https://{host}/category/{slug}` | `https://{host}/` | prefer product slug if dual URL exists |
| `og:title` / `og:description` | mirror title/description | same | same | same |
| `og:image` | first gallery (absolute R2 HTTPS) → supplier logo → site OG | category image → site OG | site OG / hero | product image |
| `og:locale` | `he_IL` | `he_IL` | `he_IL` | `he_IL` |
| `og:type` | `product` (or `website` if unsupported) | `website` | `website` | `product` |
| `twitter:card` | `summary_large_image` | same | same | same |
| `robots` | `index,follow` if published | index if live | index | index if live |

### 2.2 hreflang (he-IL) and RTL

- Emit `hreflang="he-IL"` and `hreflang="he"` → canonical URL.
- Emit `x-default` → same Hebrew canonical until an EN storefront exists (**Q-SEO-EN**: no `en` alternate).
- Do not invent English URLs.
- Social unfurl (`og:*`): image ≥ 1200×630, absolute HTTPS on R2/CDN.
- Titles readable RTL; Hebrew H1; optional price in description as `₪X.XX` matching **on-site charge only**.

### 2.3 Private surfaces

| Path | robots |
|---|---|
| `/search` | `noindex,follow` |
| `/cart`, `/checkout*`, `/login`, `/account/**` | `noindex,nofollow` |
| `/admin/**`, `/supplier/**` | `noindex` + robots disallow |
| `/redeem/[token]` | `noindex` + disallow |

Admin publish / money edit must on-demand revalidate (`revalidateTag('product:'+id)`, `revalidatePath`, sitemap tags) so meta and JSON-LD refresh after `coupon_price_ils` or content changes.

---

## 3. sitemap.xml generation and revalidation

### 3.1 Generation

App Router `src/app/sitemap.ts` (split files if URL count grows):

| Segment | Source | `lastModified` | `changeFrequency` | `priority` |
|---|---|---|---|---|
| Static | `/`, legal/marketing | deploy or CMS `updated_at` | weekly | 1.0 / 0.5 |
| Categories | live categories, not deleted | `updated_at` | weekly | 0.8 |
| Products (incl. coupon type) | published/active, `deleted_at IS NULL` | `updated_at` | daily | 0.9 |
| Legacy `/coupons/[id]` | only while still public; else omit + 301 | `updated_at` | daily | 0.7 |

**Excluded:** drafts, pending_review, archived, needs-pricing unpublished, `/redeem/*`, search, account, admin, supplier, checkout, cart, API.

### 3.2 robots.txt

`src/app/robots.ts`:

- Allow catalog
- Disallow: `/admin`, `/account`, `/supplier`, `/api`, `/checkout`, `/cart`, `/login`, `/search`, `/redeem`
- `Sitemap: https://{canonical-host}/sitemap.xml`

### 3.3 Revalidation

| Trigger | Action |
|---|---|
| Admin publish / unpublish / archive | `revalidateTag('product:'+id)`, `revalidateTag('sitemap')` |
| Category edit | `revalidateTag('category:'+id)`, sitemap |
| Cron (optional) | Soft rebuild; sitemap route ISR |
| Bulk WP import / project | End-of-job revalidate sitemap + affected tags |

Sitemap route: ISR **`revalidate = 3600`** plus on-demand tags. Do not rebuild every request.

Post-cutover: submit sitemap in the **same** Google Search Console property as the legacy WP domain. Monitor coverage vs `seo_redirects` hits.

---

## 4. Schema.org JSON-LD (exact per page type)

Emit `<script type="application/ld+json">` from RSC. Prices: decimal ILS string for **on-site charge**. `priceCurrency`: `"ILS"`.

### 4.1 Organization (home + optional layout)

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

### 4.2 WebSite + SearchAction (home)

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

### 4.3 BreadcrumbList (category + PDP)

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

Omit position 3 on category-only pages.

### 4.4 Product + Offer (PDP)

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

- Coupon: `price` = `coupon_price_ils` (2 decimals). Never face value as Offer price.
- Physical: `price` = discounted on-site amount from `discount_percent`.
- `seller` = supplier (marketplace disclosure matches PDP).
- Out of stock: `OutOfStock` / `SoldOut` as applicable.

### 4.5 AggregateRating

Only when real review aggregates exist (**Q-SEO-RATING**). Never fabricate.

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

### 4.6 Checklist

| Page | JSON-LD |
|---|---|
| Home | Organization + WebSite |
| Category | BreadcrumbList (+ optional CollectionPage) |
| Product / coupon PDP | BreadcrumbList + Product/Offer (+ AggregateRating if real) |
| Search / cart / checkout / account / redeem | none (noindex) |

---

## 5. Image pipeline (R2, next/image, AVIF/WebP)

### 5.1 Storage

- **Cloudflare R2** preferred public HTTPS (`R2_PUBLIC_BASE_URL`). Supabase Storage acceptable until cutover with the same key layout.
- Admin upload via staff image actions; store keys on `products.images` / `media_assets`.
- `next.config` `images.remotePatterns` must allow R2 (and Storage) hosts.

### 5.2 next/image rules

| Concern | Rule |
|---|---|
| Formats | Negotiate **AVIF** then **WebP** via Next optimizer |
| Quality | 75–80 default; hero may 85 |
| `sizes` cards | `(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw` |
| `sizes` PDP main | `(max-width: 768px) 100vw, 50vw` |
| `sizes` home hero | `100vw` |
| LCP image | `priority` + explicit dimensions or `fill` + aspect wrapper |
| Below fold | default lazy |
| Blur | `placeholder="blur"` + `blurDataURL` when media pipeline provides it |
| Alt | Hebrew product/category name; never empty on content images |

Srcset candidates roughly: 320, 640, 960, 1280, 1920 for full-bleed; cards max ~640.

### 5.3 Lazy strategy

1. First viewport: hero + first PDP image eager/`priority`.
2. Listing grids: native lazy; never `priority` on every card.
3. OG meta uses absolute R2 URL (not next/image).

---

## 6. ISR, cache headers, Vercel edge

### 6.1 ISR / revalidate by page type

| Page type | Mode | `revalidate` (s) | Cache tags |
|---|---|---|---|
| Home | ISR | **120** | `home` |
| Category | ISR | **300** | `category:{id}`, `catalog` |
| Product / coupon PDP | ISR | **120** | `product:{id}`, `catalog` |
| `/products` | ISR | **180** | `catalog` |
| Sitemap | ISR | **3600** | `sitemap` |
| Search | Dynamic | `public, s-maxage=30, stale-while-revalidate=60` | short |
| Cart / checkout / account / admin / supplier | Dynamic private | `private, no-store` | |

On admin publish: revalidate product, catalog, sitemap, and `home` if featured.

### 6.2 Edge headers

| Asset | Header |
|---|---|
| `/_next/static/*` | immutable long cache |
| Optimized images | long cache + content hash |
| HTML ISR | CDN TTL aligned with revalidate; SWR OK |
| API search | short s-maxage |

### 6.3 Vercel edge intent

- Region close to IL users (**Q-SEO-REGION**: often `fra1`).
- No auth middleware blocking public catalog HTML caching.
- `proxy.ts` (or middleware): apply `seo_redirects` **301** before render; do not cache those as 200 HTML.
- `metadataBase` = production canonical host only.
- Public RSC fetches: anon/RLS-safe client with `next: { tags, revalidate }`. Never service-role on public page data path.

---

## 7. Core Web Vitals (per-page strategy)

### 7.1 Binding targets

- **LCP &lt; 2.5s** (p75 mobile)
- **CLS &lt; 0.1**
- **INP &lt; 200ms**

### 7.2 By page

| Page | LCP | CLS | INP |
|---|---|---|---|
| **Home** | Priority hero/`next/image`; limit slide JS; Heebo via `next/font` | Fixed hero aspect; reserved consent height | Minimal client; defer analytics |
| **Category / products** | First-row images sized | Card `aspect-ratio`; skeleton = card size | RSC list; filters progressive |
| **PDP / coupon** | Gallery[0] `priority` | Gallery aspect box; stable price block | Small ATC island; no admin widgets |
| **Search** | Lightweight results (noindex) | Same card geometry | Debounced query |
| **Checkout** | Private; INP over SEO | Stable forms | Few client islands; Cardcom iframe isolated |

### 7.3 Forbidden on catalog

- Unsized images / late ads above LCP
- Blocking third-party chat on browse templates (**Q-SEO-3P**)
- Flash of unstyled RTL
- Client-only product title/price (hurts LCP + SEO)

### 7.4 Monitoring

- CrUX / GSC Core Web Vitals (Israel)
- Lab: Lighthouse on `/`, sample category, sample PDP
- Alert if LCP p75 mobile &gt; 2.5s for 7 days

---

## 8. Hebrew / Google Israel SEO

1. Primary language `he` / `he-IL` on every public page.
2. Titles and meta descriptions written in Hebrew.
3. Single H1 = `name_he`; Hebrew breadcrumbs.
4. Slugs: stable ASCII `products.slug`; Hebrew in visible titles.
5. Local signals: supplier name/address/phone/logo on every PDP.
6. Canonical between `/coupons/[id]` and `/product/[slug]` to kill duplicates.
7. Internal links with Hebrew anchors from home/category.
8. Consent banner must not block first paint (CLS + LCP).
9. GSC property geo-target Israel.

---

## 9. Migrations (077+, MCP only)

**Never** `supabase db push`. Apply only via Supabase MCP `apply_migration`.

Ordinals **077+** may already be used (supplier RLS). Choose the **next free** ≥ 077 from hosted `schema_migrations` (**Q-SEO-MIG**; may be 093+).

| Object | Purpose |
|---|---|
| `seo_redirects` | `from_path` / `to_path`, `status_code` default 301, hits, timestamps |
| UNIQUE `(from_path)` | live redirect map |
| RLS | admin/service write; no anon PostgREST read required (proxy uses service/edge cache) |

Sitemap/robots/metadata/JSON-LD are application concerns once `products` / `categories` exist. No money-table changes for SEO.

---

## 10. Acceptance checklist

- [ ] Every public PDP: unique Hebrew title/description, canonical, `og:image` HTTPS, `og:locale=he_IL`, `hreflang=he-IL`
- [ ] JSON-LD Offer price = on-site charge (coupon_price or discounted physical); seller = supplier
- [ ] Sitemap lists only indexable URLs; `/redeem/` absent; robots disallow private trees
- [ ] R2 → `next/image` AVIF/WebP; LCP image prioritized on home/PDP
- [ ] ISR TTLs per §6; publish revalidates product + sitemap tags
- [ ] Field CWV targets monitored; no fabricated AggregateRating
- [ ] Redirects applied via MCP only after ordinal confirmed

---

## 11. Open questions

| ID | Question |
|---|---|
| Q-SEO-EN | English storefront / hreflang en? (default no) |
| Q-SEO-RATING | Real reviews source for AggregateRating? |
| Q-SEO-REGION | Vercel region pin for IL |
| Q-SEO-3P | Third-party scripts on catalog? |
| Q-SEO-MIG | Exact first free migration number on hosted |
| Q-SEO-HOST | www vs apex canonical |
| Q-SEO-COUPON-URL | Retire `/coupons/[id]` to redirect-only when? |

---

## 12. Related

| Path / doc | Role |
|---|---|
| `(store)/page.tsx` | home |
| `(store)/product/[slug]/page.tsx` | PDP + metadata |
| `(store)/category/[slug]/page.tsx` | category |
| `proxy.ts` | 301 redirects + headers |
| `docs/ARCHITECTURE-ADMIN.md` | publish → revalidate |
| `docs/ARCHITECTURE-NOTIFICATIONS.md` | keep redeem tokens out of crawlable mail |
| `docs/ARCHITECTURE-WP-MIGRATION.md` | `seo_redirects` inventory + cutover |
| `docs/ADMIN-PRODUCT-PAGE-SPEC.md` | price fields feeding Offer |
