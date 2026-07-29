# ARCHITECTURE-SEO-PERFORMANCE.md

KenyonExpress SEO and performance architecture (binding).

Status: BINDING for `arch/admin-supplier` (2026-07-29)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
Stack: **Next.js 15** App Router (RSC), Hebrew RTL, canonical host `kenyonexpress.co.il`.
Companions: `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-MOBILE-APP.md`.

---

## 0. Money rules on SEO surfaces

| Product type | Customer-facing Offer / meta price | Never in customer price |
|---|---|---|
| Coupon | Absolute online `coupon_price_ils` (paid **in full on site**) | Live `platform_percent`; Escrow language; inventing a % of face |
| Physical | On-site charge after `discount_percent` | Later edits of `platform_percent` (use snapshot only after purchase) |

Invariants:

1. Platform ≠ supplier. JSON-LD `seller` = supplier business; home `Organization` = KenyonExpress marketplace.
2. No fixed commission in meta, schema, or copy.
3. Every indexable PDP shows supplier identity (publish gate).
4. Never index `/redeem/[token]`, cart, checkout, account, admin, supplier.
5. Till remainder (`price_ils - coupon_price_ils`) is cash at the merchant on QR scan; do not imply it flows through KE.

---

## 1. Next.js 15 App Router: SSR / ISR per page type

| Page | Route | Mode | `revalidate` / cache | Why |
|---|---|---|---|---|
| Home | `/` | **ISR** | 120s; tag `home` | Fresh deals without per-request DB hit |
| Category | `/category/[slug]` | **ISR** | 300s; tags `category:{id}`, `catalog` | Catalog churn slower than PDP |
| Product (coupon + physical) | `/product/[slug]` | **ISR** | 120s; tags `product:{id}`, `catalog` | Price/content change via on-demand revalidate |
| Products index | `/products` | **ISR** | 180s; tag `catalog` | Listing |
| Cart | `/cart` | **Dynamic SSR** (private) | `private, no-store` | Session/cookie cart; never CDN-cache HTML |
| Checkout / account | `/checkout*`, `/account/**` | Dynamic private | `private, no-store` | Auth + money |
| Search | `/search` | Dynamic | `public, s-maxage=30, stale-while-revalidate=60` | noindex; Meilisearch-backed |
| Sitemap | `/sitemap.xml` | ISR | 3600s; tag `sitemap` | Built from Supabase reads |
| Admin / supplier | `/admin/**`, `/supplier/**` | Dynamic private | `private, no-store` | Staff only |

Rules:

- Public catalog data path uses anon/RLS-safe client with `next: { tags, revalidate }`. **Never** service-role on public HTML.
- Admin publish / money edit: `revalidateTag('product:'+id)`, `catalog`, `sitemap`, and `home` if featured.
- Cart is SSR for first paint of empty/shell + client cart hydration; HTML must not be shared across users at the edge.

---

## 2. Hebrew RTL SEO

Root layout: `lang="he"` `dir="rtl"`.

### 2.1 Meta (`generateMetadata`)

| Meta | Product | Category | Home | Cart |
|---|---|---|---|---|
| `title` | `seo_title` or `{name_he} \| קניון אקספרס` | `{name_he} \| קניון אקספרס` | brand + Hebrew value prop | noindex page title |
| `description` | `seo_description` or 120–160 Hebrew chars | category blurb | Hebrew default | n/a |
| `canonical` | `/product/{slug}` | `/category/{slug}` | `/` | omit or self + noindex |
| `og:locale` | `he_IL` | `he_IL` | `he_IL` | |
| `og:image` | first gallery absolute R2 HTTPS | category / site OG | site OG / hero | |
| `robots` | `index,follow` if published | index if live | index | `noindex,nofollow` |

Price in description (optional): `₪X.XX` = **on-site charge only** (coupon_price or discounted physical).

### 2.2 hreflang

```html
<link rel="alternate" hreflang="he-IL" href="https://kenyonexpress.co.il/..." />
<link rel="alternate" hreflang="he" href="https://kenyonexpress.co.il/..." />
<link rel="alternate" hreflang="x-default" href="https://kenyonexpress.co.il/..." />
```

No English alternate until an EN storefront exists. Do not invent `/en` URLs.

### 2.3 On-page Hebrew

- Single H1 = `name_he`
- Hebrew breadcrumbs
- Stable ASCII `slug`; Hebrew in visible titles
- Supplier name / phone / address / logo on every PDP

---

## 3. JSON-LD (Product / Offer / Organization)

Emit from RSC as `<script type="application/ld+json">`. Prices: decimal ILS strings. `priceCurrency`: `"ILS"`.

### 3.1 Organization (home + sitewide optional)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "קניון אקספרס",
  "url": "https://kenyonexpress.co.il/",
  "logo": "https://cdn.example/brand/logo.png",
  "sameAs": []
}
```

### 3.2 Product + Offer (PDP)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{name_he}",
  "image": ["https://r2…/…"],
  "description": "{short Hebrew}",
  "sku": "{sku or id}",
  "brand": { "@type": "Brand", "name": "{supplier name}" },
  "offers": {
    "@type": "Offer",
    "url": "https://kenyonexpress.co.il/product/{slug}",
    "priceCurrency": "ILS",
    "price": "{on_site_charge_ils}",
    "availability": "https://schema.org/InStock",
    "seller": {
      "@type": "Organization",
      "name": "{supplier.name}",
      "telephone": "{supplier.phone}",
      "address": "{supplier.address}"
    }
  }
}
```

| Type | `offers.price` |
|---|---|
| Coupon | `coupon_price_ils` (full on-site payment) |
| Physical | `price_ils * (1 - discount_percent/100)` |

Do not put `platform_percent` in Offer. Do not fabricate `AggregateRating` without real review rows.

### 3.3 BreadcrumbList

Home → category → product on PDP; home → category on category pages.

### 3.4 Pages without JSON-LD Product

Cart, checkout, account, search, redeem, admin, supplier: none (and noindex).

---

## 4. Core Web Vitals and image strategy

### 4.1 Targets (binding)

| Metric | Target (p75 mobile CrUX) |
|---|---|
| LCP | &lt; 2.5s |
| CLS | &lt; 0.1 |
| INP | &lt; 200ms |

### 4.2 Per page

| Page | LCP | CLS | INP |
|---|---|---|---|
| Home | Priority hero via `next/image` | Fixed hero aspect; reserved consent | Minimal client; defer analytics |
| Category | First-row images sized | Card `aspect-ratio` | RSC list; progressive filters |
| Product | Gallery[0] `priority` | Stable gallery + price block | Small ATC island |
| Cart | Private; INP over SEO | Stable line items | Client cart; no heavy third parties |

### 4.3 Images: Cloudflare R2 + `next/image`

- Store originals/derivatives on **Cloudflare R2**; public base `R2_PUBLIC_BASE_URL`.
- `next.config` `images.remotePatterns` allow R2 host.
- Formats: AVIF → WebP → fallback.
- Srcset candidates: ~320, 640, 960, 1280, 1920 (full-bleed); cards max ~640.
- Alt: Hebrew product/category name; never empty on content images.
- OG uses absolute R2 URL (not the optimizer URL).
- First viewport only: `priority` / eager. Listing cards: lazy.

Forbidden on catalog: unsized images, client-only title/price, blocking chat widgets above LCP.

---

## 5. Sitemap + robots from Supabase

### 5.1 `src/app/sitemap.ts`

Read published rows from Supabase (RLS-safe or build-time service with published filter only):

| Segment | Source | priority | changeFrequency |
|---|---|---|---|
| `/` + legal | static | 1.0 / 0.5 | weekly |
| Categories | live categories | 0.8 | weekly |
| Products | `status` published/active, not deleted | 0.9 | daily |

`lastModified` = `updated_at`. ISR `revalidate = 3600` + tag `sitemap`.

**Exclude:** drafts, archived, needs-pricing unpublished, `/redeem/*`, `/search`, `/cart`, `/checkout`, `/account`, `/admin`, `/supplier`, API.

### 5.2 `src/app/robots.ts`

- Allow catalog
- Disallow: `/admin`, `/account`, `/supplier`, `/api`, `/checkout`, `/cart`, `/login`, `/search`, `/redeem`
- `Sitemap: https://kenyonexpress.co.il/sitemap.xml`

### 5.3 Revalidation

| Trigger | Action |
|---|---|
| Admin publish / unpublish | `revalidateTag('product:'+id)`, `sitemap`, `catalog` |
| Category edit | `revalidateTag('category:'+id)`, `sitemap` |
| Bulk import end | revalidate `sitemap` + affected tags |

Submit sitemap in Google Search Console (Israel). Preserve WP equity via `seo_redirects` 301 at the edge.

---

## 6. Meilisearch-driven internal linking

Meilisearch is the **search and related-products** engine; Postgres remains source of truth.

| Surface | Behavior |
|---|---|
| `/search` | Query Meilisearch; `noindex`; Hebrew UI |
| PDP "מוצרים דומים" | Meilisearch related / filter by category + attributes; render as real `<a href="/product/{slug}">` with Hebrew anchors |
| Category empty / thin | Suggest sibling categories + top hits from Meilisearch |
| Home rails | Featured from DB; optional Meilisearch "popular" ids resolved to links |

Rules:

1. Every internal link is a crawlable `<a href>` (not JS-only navigation for primary related blocks).
2. Index documents include: `id`, `slug`, `name_he`, `category_ids`, `coupon_price_ils` / display price, `status`, supplier city (optional).
3. On publish: upsert Meilisearch document + revalidate product HTML (search index lag ≤ worker SLA; HTML must not wait on Meili for ISR).
4. Do not put unpublished or needs-pricing products in the index.

---

## 7. Caching layers

```
Browser
  -> Vercel Edge CDN (ISR HTML, static, optimized images)
  -> Next.js data cache / fetch tags
  -> Upstash Redis (optional hot keys)
  -> Supabase Postgres / Meilisearch
```

| Layer | What | TTL / invalidation |
|---|---|---|
| Vercel Edge | ISR HTML per §1; `/_next/static` immutable; `next/image` long cache | On-demand tags on publish |
| Next fetch cache | RSC catalog reads with `tags` | `revalidateTag` |
| Upstash Redis | Hot: category product id lists, Meili result cache for popular queries, rate-limit counters, session-ish non-PII flags | Short TTL (30–300s) + explicit delete on publish |
| Meilisearch | Search documents | Upsert/delete on product status change |

Do not cache cart/checkout HTML or authenticated account HTML at the edge. Do not store card data or service-role keys in Redis.

---

## 8. Lighthouse CI budget (GitHub Actions)

Job on PRs that touch `src/app/**`, `src/components/**`, `public/**`, or SEO config (non-blocking at first; promote to required when stable).

```yaml
# sketch: .github/workflows/lighthouse.yml
# pnpm build + start; lhci autorun against /, /category/{demo}, /product/{demo}
```

### 8.1 Budgets (lab, mobile emulation)

| Path | Performance | LCP | CLS | TBT | Notes |
|---|---|---|---|---|---|
| `/` | ≥ 0.85 | ≤ 2500ms | ≤ 0.1 | ≤ 300ms | Hero priority |
| Category demo | ≥ 0.85 | ≤ 2500ms | ≤ 0.1 | ≤ 300ms | |
| Product demo | ≥ 0.85 | ≤ 2500ms | ≤ 0.1 | ≤ 350ms | Gallery[0] priority |
| `/cart` | ≥ 0.80 | n/a SEO | ≤ 0.1 | ≤ 400ms | Private; INP-focused |

Assertions also check: `document` has `lang=he` / `dir=rtl` (custom gather or smoke script alongside LHCI).

Secrets: none beyond public demo URLs. Use seeded local or preview deployment. Fail the gate only on regressions beyond budget (same spirit as diff-scoped lint).

---

## 9. Edge redirects and host

- `metadataBase` = production canonical host only.
- `proxy.ts` / middleware: apply `seo_redirects` **301** before render; do not cache those responses as 200 HTML.
- Prefer edge region close to IL users (often `fra1`).

---

## 10. Acceptance checklist

- [ ] Next.js 15 ISR/SSR modes match §1 for home, category, product, cart
- [ ] Public PDP: Hebrew title/description, canonical, `og:locale=he_IL`, `hreflang=he-IL`
- [ ] JSON-LD Offer price = on-site charge (ILS); seller = supplier
- [ ] Sitemap from Supabase published rows only; robots disallow private trees
- [ ] R2 + `next/image` AVIF/WebP; LCP image prioritized on home/PDP
- [ ] Meilisearch related/search links are crawlable `<a href>`
- [ ] Vercel edge + optional Upstash; cart never publicly cached
- [ ] Lighthouse CI budgets defined and wired in GitHub Actions
- [ ] No Escrow / fixed-commission copy in meta or schema

---

## 11. Related

`docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-MOBILE-APP.md`, `docs/ARCHITECTURE-WP-MIGRATION.md` (redirect equity).
