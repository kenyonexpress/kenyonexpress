# ARCHITECTURE-SEO-PERFORMANCE.md

KenyonExpress storefront SEO and performance architecture (Hebrew RTL).

Status: BINDING for `arch/admin-supplier` (2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
Authority: `MASTER-ARCHITECTURE-v2.md` (business model §1; system diagram `proxy.ts` + seo_redirects; launch track **C** catalog/search/SEO; gates for sitemap/robots/consent). Domain sources: `ARCHITECTURE-CATALOG-SEARCH-SEO.md`, performance notes in v2/related PERFORMANCE docs.

Stack reality: Next.js App Router (repo currently on Next 16.x). Design against App Router caching. **Q-SEO-1:** document version pin vs "Next 15" wording elsewhere.

Money display for SEO/JSON-LD must follow v2 §1: coupon offer price = absolute `coupon_price`; physical price = full on-site charge; never invent fixed commission; never use live `platform_percent` to invent a customer price after the fact. `platform_percent` is dynamic admin config for **split**, snapshotted on purchase; it is not a substitute for `coupon_price`.

---

## 0. Goals

| Metric | Target | How |
|---|---|---|
| LCP p75 mobile | ≤ 2.5s | priority `next/image`, ISR HTML, R2/CDN |
| INP p75 | ≤ 200ms | RSC default; thin client |
| CLS | ≤ 0.1 | aspect boxes; `next/font` Heebo |
| TTFB HTML | ≤ 800ms p75 | edge cache home/category/PDP |
| Equity | preserve WP | `seo_redirects` via `proxy.ts` (v2 diagram) |

Launch gate from v2: consent banner counsel-approved; **sitemap + robots + redirects live**.

---

## 1. Rendering by route

Align with actual App Router groups `(store)`, `(main)`, `(account)`, `(admin)`, `(supplier)`, `(auth)`.

| Route | Mode | Cache | Index |
|---|---|---|---|
| `/` home | ISR | revalidate 60–300s | yes |
| `/category/[slug]` | ISR | 300s + tag `category:{id}` | yes |
| `/products` | ISR | 120s | yes |
| `/product/[slug]` (v2 also cites `/products/[slug]` migration path) | ISR | 60–300s + tag `product:{id}` | yes |
| `/coupons`, `/coupons/[id]` | ISR | 300s | yes until canonicalized to product |
| `/search` | Dynamic | short `s-maxage` | **noindex** |
| `/cart`, `/checkout*` | Dynamic private | no store | noindex |
| `/account/**`, `/admin/**`, `/supplier/**`, auth | Dynamic private | | disallow |

On publish: `revalidateTag('product:'+id)` / path (admin actions). **Q-SEO-2:** exact TTL numbers.

Canonical URL strategy after WP cutover: one host (**Q-SEO-3** www vs apex).

---

## 2. Caching layers

```
Browser -> CDN/edge (ISR HTML + hashed assets)
  -> Next data cache (tagged fetch)
  -> Supabase (RLS-safe anonymous catalog reads; never service role in public RSC)
```

Personalized chrome (cart) must not disable whole-page ISR. Search stays short-cache.

Money: HTML and JSON-LD prices computed server-side from `coupon_price` / list price fields, not from guessing `platform_percent`.

---

## 3. Core Web Vitals controls

| Vital | Controls |
|---|---|
| LCP | First gallery/hero `priority`; blur from media assets; R2 URLs in `images.remotePatterns` + CSP `img-src` |
| INP | Avoid heavy third parties on catalog (**Q-SEO-4**) |
| CLS | Fixed aspect ratios; self-hosted font |
| JS weight | No checkout/Cardcom scripts on pure browse templates |

Analytics: batch + `sendBeacon` (v2 client SDK) without blocking LCP.

---

## 4. Images and R2

Admin uploads to R2 when configured (`R2_BUCKET`, public base). Store keys on products/media. Migrate off WP hotlinks. Document CSP/R2 allowlist as a required config change (description only; no code in this worktree).

---

## 5. Structured data (JSON-LD)

| Type | Pages | Rules |
|---|---|---|
| `Organization` + `WebSite` + `SearchAction` | home | Hebrew name; search target `/search?q=` |
| `BreadcrumbList` | category, PDP | |
| `Product` + `Offer` | PDP | `priceCurrency=ILS`; coupon `offers.price` = **`coupon_price`**; physical = on-site full price; `seller` = supplier identity (platform is marketplace) |
| Validity | coupon PDP | `validThrough` from offer/expiry fields |

Never encode a fake "10% off" from a hardcoded commission. Dynamic `platform_percent` is **not** the customer-facing discount; `discount_percent` / price pair is.

---

## 6. Hebrew RTL SEO

- `lang="he"` `dir="rtl"` on storefront.
- Primary fields `*_he`; ASCII `slug` for stable URLs.
- `og:locale=he_IL`; WhatsApp-friendly OG image from gallery.
- hreflang only if EN storefront exists (**Q-SEO-5**).
- Duplicate coupon vs product URLs: `rel=canonical` to chosen PDP form.

---

## 7. Sitemap and robots

v2 launch gate requires both.

**robots (design):** allow catalog; disallow `/admin`, `/account`, `/supplier`, `/api`, `/checkout`, `/cart`, `/login`, `/search`; point to sitemap.

**sitemap (design):** Supabase-sourced active categories + published products (`slug`, `updated_at`); split index if large; exclude drafts/`deleted_at`.

Submit sitemap in the **same** GSC property as the legacy domain after cutover.

---

## 8. Metadata

`generateMetadata` on PDP/category/search (patterns already in app). Prefer `seo_title` / `seo_description`; fallback `name_he`. Search: noindex. Checkout/account: noindex.

---

## 9. WordPress equity and redirects

v2: `proxy.ts` applies `seo_redirects` 301 + CSP.

1. Inventory from Yoast sitemap + GSC (WP migration docs).
2. Table `seo_redirects` (`from_path`, `to_path`, status, hits).
3. Middleware/proxy match before render.
4. Monitor 404s post-launch.

Preserve money-accurate landing pages so redirected coupon URLs still show correct `coupon_price` (admin dynamic pricing), not legacy hardcoded percents.

---

## 10. Monitoring

CrUX/GSC CWV; Lighthouse on `/`, sample PDP, `/products`; `v_web_vitals_daily` (v2 analytics); redirect hit counts; uptime via Better Stack (v2 externals).

---

## 11. Rollout sequence (docs)

1. robots + sitemap live (gate).
2. R2 + CSP image allowlist.
3. JSON-LD module on home/category/PDP with v2 price rules.
4. Tag revalidation on admin publish (includes when admin changes `coupon_price` or `platform_percent` for future HTML; past orders unaffected).
5. Load redirects; cutover; GSC sitemap submit.
6. Canonicalize legacy `/coupons/[id]` if product PDP is canonical (**Q-SEO-6**).

---

## 12. Open questions

| ID | Question |
|---|---|
| Q-SEO-1 | Next version wording |
| Q-SEO-2 | Exact ISR TTLs |
| Q-SEO-3 | Canonical host |
| Q-SEO-4 | Third-party scripts on browse |
| Q-SEO-5 | English locale |
| Q-SEO-6 | Long-term fate of `/coupons/[id]` |

---

## 13. Related

`MASTER-ARCHITECTURE-v2.md` §1, §2, launch track C, gates 4–6; `ARCHITECTURE-CATALOG-SEARCH-SEO.md`; WP migration docs; `docs/ADMIN-PRODUCT-PAGE-SPEC.md` for dynamic money fields that feed visible price.
