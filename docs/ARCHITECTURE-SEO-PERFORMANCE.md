# ARCHITECTURE-SEO-PERFORMANCE.md

KenyonExpress storefront SEO and performance architecture (Hebrew RTL).

Status: BINDING for `arch/admin-supplier` (2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only (docs). No application code.
Companions: `docs/ARCHITECTURE-ADMIN-DASHBOARD.md`, WP migration docs in main repo (`WP-DATA-MIGRATION.md`, `docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md`).

**Stack note:** The running app uses **Next.js 16.2.x** (`package.json`), App Router, Turbopack in dev. The user brief said "Next.js 15"; treat App Router caching APIs below as the contract and flag version drift as **Q-SEO-1**. Do not design for Pages Router.

Money/catalog context: coupons-first; PDP always shows supplier identity; prices from admin money knobs / snapshots.

---

## 0. Goals

| Metric | Target (binding until product changes) | How |
|---|---|---|
| LCP | ≤ 2.5s p75 mobile | prioritized hero/PDP image via `next/image`, ISR HTML, CDN |
| INP | ≤ 200ms p75 | lean client JS; Server Components default; defer non-critical |
| CLS | ≤ 0.1 | fixed image dimensions / aspect boxes; no late font swap jank (`next/font` Heebo) |
| TTFB HTML | ≤ 800ms p75 origin+edge | cache product/category/home at edge |
| Indexation | preserve WP equity | `seo_redirects` + sitemap parity |

---

## 1. Rendering strategy by route

Real route groups today: `(store)`, `(main)`, `(account)`, `(admin)`, `(supplier)`, `(auth)`.

| Route | Example | Mode | Cache | Notes |
|---|---|---|---|---|
| Homepage | `(store)/page.tsx` `/` | ISR | `revalidate` 60–300s | marketing blocks + featured coupons |
| Category | `/category/[slug]` | ISR | 300s + tag `category:{id}` | listing |
| Products index | `/products` | ISR | 120s | shop archive |
| Product PDP | `/product/[slug]` | ISR | 60–300s + tag `product:{id}` | `generateMetadata` exists |
| Legacy coupons | `/coupons`, `/coupons/[id]` | ISR | 300s | bridge → product coupons over time |
| Search | `/search` | Dynamic SSR | `Cache-Control` short (API already `s-maxage=30`) | **noindex** |
| Cart / checkout | `/cart`, `/checkout*` | Dynamic | private, no store | noindex |
| Account / admin / supplier | `/account/**`, `/admin/**`, `/supplier/**` | Dynamic | private | disallow robots |
| Auth | `/login`, `/signup`, … | Dynamic | private | noindex |

On-demand revalidation: planned `POST /api/admin/revalidate` after product publish (admin architecture). Prefer `revalidateTag('product:'+id)` over blanket path nukes.

**Open Q-SEO-2:** Exact ISR seconds per template (legal price freshness vs CDN hit rate).

---

## 2. Caching strategy

```
Browser
  -> CDN / Vercel edge (HTML ISR + immutable hashed assets)
  -> Next data cache (fetch to Supabase with next: { tags, revalidate })
  -> Supabase (source of truth)
```

Rules:

1. Anonymous catalog reads use a **publishable** Supabase key / RLS-safe views only (no service role in RSC for public pages).
2. Mutating admin actions call `revalidatePath` / `revalidateTag` (already used in admin actions).
3. Personalized fragments (cart badge) via client fetch or Suspense; do not disable ISR for whole PDP.
4. Search API: keep short `s-maxage` (`src/app/api/search/route.ts`).

---

## 3. Core Web Vitals: concrete controls

| Vital | Controls in this codebase |
|---|---|
| LCP | `ProductGallery` / home hero with `next/image` priority on first image; blur placeholder from `media_assets` where available; avoid lazy on LCP image |
| INP | Minimize client components on PDP; scanner/camera only on `/supplier/scan`; no heavy analytics on main thread without idle |
| CLS | Reserve aspect ratio for gallery; font via `next/font` (Heebo self-hosted per `next.config.ts` CSP notes) |
| Bandwidth | WebP/AVIF through image optimizer; responsive `sizes` on cards |

Budget: ship no third-party chat widgets on catalog templates without **Q-SEO-3**.

---

## 4. Images and R2 CDN

Admin upload: `src/server/actions/admin/images.ts` supports R2 when configured (`R2_BUCKET`, public base URL).

Binding:

1. Store object keys in `products.images` / media tables; public URL = `R2_PUBLIC_BASE_URL + key` (or Supabase Storage until cutover).
2. `next.config.ts` `images.remotePatterns` must allow R2 host (today allowlist includes Supabase + Unsplash; **add R2 host** or PDP breaks).
3. CSP `img-src` must include R2 (`ARCHITECTURE-DEPLOYMENT.md` notes this).
4. Never hotlink WP uploads long-term; migrate binaries in WP migration pipeline.

---

## 5. Structured data (JSON-LD)

Emit in RSC for:

| Type | Where | Fields |
|---|---|---|
| `Organization` + `WebSite` | homepage | name, url, logo, `SearchAction` → `/search?q=` |
| `BreadcrumbList` | category + PDP | home → category → product |
| `Product` + `Offer` | PDP | `name`, `image`, `description`, `sku`, `brand`, `offers.price` / `priceCurrency=ILS`, `availability`, seller = supplier name (not KenyonExpress as manufacturer) |
| `Coupon` / offer validity | coupon PDP | `validThrough` from `offer_valid_until` / expiry |

Price in JSON-LD must match **on-site charge** (coupon → `coupon_price_ils`; physical → discounted price). Never invent 10% defaults.

**Gap:** no shared `JsonLd` component enforced today; add one module and use on `(store)/product/[slug]` and category pages.

---

## 6. Hebrew RTL SEO specifics

1. `<html lang="he" dir="rtl">` on storefront layouts.
2. Primary content in `name_he` / Hebrew descriptions; `name_en` secondary.
3. hreflang: **Open Q-SEO-4** whether English storefront exists; if not, do not emit `en` alternates.
4. URL slugs: prefer ASCII slugs (`products.slug`) for stability; Hebrew titles in H1/meta.
5. WhatsApp/OG: Hebrew `og:title` / `og:locale=he_IL`.
6. Avoid duplicate `/coupons/[id]` vs `/product/[slug]` without canonical; canonical → product slug when dual-published.

---

## 7. Sitemap and robots

**Current gap (INFRA-AUDIT):** `src/app/sitemap.ts` and `src/app/robots.ts` missing.

Binding design:

### `app/robots.ts`

- Allow `/`, `/products`, `/product/`, `/category/`, `/coupons` (while live)
- Disallow `/admin`, `/account`, `/supplier`, `/api`, `/checkout`, `/cart`, `/login`, `/search`
- Sitemap URL: `https://<domain>/sitemap.xml`

### `app/sitemap.ts`

Sources from Supabase:

- Active categories (`categories.slug`)
- Active/published products (`products.slug`, `updated_at`)
- Static marketing URLs

Split sitemap index if >50k URLs. Only indexable statuses; exclude `deleted_at` and drafts.

---

## 8. Metadata strategy

Already started: `generateMetadata` on product, category, search.

| Page | title | description | robots |
|---|---|---|---|
| PDP | `seo_title` or `name_he` + brand suffix | `seo_description` or truncated | index,follow |
| Category | category name | curated or generated | index,follow |
| Search | query echo | | **noindex,follow** |
| Checkout/account | minimal | | noindex |

Open Graph images: product first gallery image on R2; fallback site OG.

---

## 9. WordPress SEO preservation and redirects

Grounded in `WP-DATA-MIGRATION.md` / `seo_redirects` design:

1. Inventory: Yoast `sitemap_index.xml` + GSC click URLs → `wp_import.url_inventory`.
2. Map each old path → new App Router path.
3. Persist `public.seo_redirects` (`from_path`, `to_path`, `status_code` default 301, `hits`).
4. Enforce in `src/proxy.ts` (middleware) **before** page render; preserve query string only when safe.
5. After launch: submit new sitemap in **same** GSC property; monitor 404s.

**Open Q-SEO-5:** final production domain cutover date and whether `www` canonical is forced.

---

## 10. Monitoring

| Signal | Tool |
|---|---|
| CWV field data | CrUX / GSC Core Web Vitals |
| Lab | Lighthouse CI on `/`, sample PDP, `/products` |
| Index coverage | GSC |
| 404 / redirect | logs on `seo_redirects.hits` + edge logs |
| Uptime TTFB | existing health/cron when added |

Alert when LCP p75 mobile > target for 7 days.

---

## 11. Rollout

1. Add `robots.ts` + `sitemap.ts`.
2. Expand `images.remotePatterns` + CSP for R2.
3. Shared JSON-LD helpers on PDP/category/home.
4. Tag-based revalidation on product publish.
5. Load `seo_redirects` from WP inventory; enable proxy redirects.
6. Decommission duplicate coupon URLs with canonicals.
7. Baseline Lighthouse + GSC after cutover.

---

## 12. Open questions

| ID | Question |
|---|---|
| Q-SEO-1 | Document against Next 16 vs require Next 15 wording |
| Q-SEO-2 | Exact ISR TTLs |
| Q-SEO-3 | Third-party scripts allowed on catalog? |
| Q-SEO-4 | English locale / hreflang? |
| Q-SEO-5 | Canonical host and cutover window |
| Q-SEO-6 | Keep `/coupons/[id]` indefinitely or redirect-only? |

---

## 13. Related routes and files

| Path | Role |
|---|---|
| `src/app/(store)/page.tsx` | home |
| `src/app/(store)/product/[slug]/page.tsx` | PDP + metadata |
| `src/app/(store)/category/[slug]/page.tsx` | category |
| `src/app/(store)/products/page.tsx` | archive |
| `src/app/(store)/search/page.tsx` | search |
| `src/app/(main)/coupons/**` | legacy coupon browse |
| `src/proxy.ts` | redirect / auth edge |
| `src/server/actions/admin/images.ts` | R2 upload |
| `next.config.ts` | headers, image config |
