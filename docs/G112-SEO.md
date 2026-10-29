# G112 — SEO (2026-10-30)

Audit found the SEO layer already shipped; this item verified it and closed one gap.

## Present and verified
- **JSON-LD** (`src/lib/seo/json-ld.ts`): `Product` + `Offer` (price from `CouponOffer`/integer agorot converted via money helpers, `availability`, no zero-price offers), `BreadcrumbList`, `Organization` + `WebSite` (with `SearchAction` -> `/search?q=`). `<` escaped in `jsonLdScript`.
- **Wired in**: home (Organization/WebSite), `/product/[slug]` (Product + Breadcrumb), `/c`, `/c/[slug]`, `/category/[slug]`, city, supplier, blog, faq.
- **Sitemap** (`src/app/sitemap.ts`): read from DB (anon client; active products, active categories that have products, active suppliers) plus static, blog and legal pages. Cached with `CATALOGUE_TAG`; a failed read throws so the last good sitemap keeps serving.
- **robots** (`src/app/robots.ts`): disallows private/tokenised paths (`/redeem/`, `/coupon/`, `/account/`, `/admin/`, `/api/` ...), points to `/sitemap.xml`. Live robots.txt confirmed serving.
- **Canonical**: `siteUrl()` defaults to `https://www.kenyonexpress.co.il`; `alternatesFor(path)` per page; `canonical-coverage.test.ts` guards it.
- **OG / Twitter**: root metadata in layout (not edited); per-page OG on product/category.

## Changed
- `src/app/(store)/product/[slug]/page.tsx`: added `twitter` metadata (Next does not merge it from the root, so product cards showed the site title).

## Verification
- tsc clean; `vitest run src/app` 671 pass (incl. sitemap, robots, root-metadata, canonical-coverage, json-ld).
- Not run: compare.mjs visual gate (no visual change), external Rich Results validator.
- No forbidden files touched (layout.tsx read only).
