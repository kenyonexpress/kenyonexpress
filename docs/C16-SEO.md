# C16 — SEO schema (JSON-LD, sitemap, robots, canonical, OG/Twitter)

Status: DONE (2026-10-30). Most of this shipped in C14/C31; C16 audited it end to end and closed one gap.

| Requirement | Where |
|---|---|
| Product + Offer | `buildProductJsonLd`, `/product/[slug]` |
| BreadcrumbList | `buildBreadcrumbJsonLd`, product, `/category/[slug]`, `/c/[slug]`, `/c`, city |
| Organization + WebSite | `buildSiteJsonLd`, home only (deliberate: repeating them on every route adds nothing; `src/app/layout.tsx` is locked anyway) |
| sitemap.xml from DB | `src/app/sitemap.ts` (anon client, `use cache`, `orFail`); 46 product URLs in the local build |
| robots.txt | `src/app/robots.ts` |
| Canonical | per-route `alternates.canonical`, guarded by `canonical-coverage.test.ts` |
| OG + Twitter | root metadata + per-route `generateMetadata`, `opengraph-image.tsx` |

## Change in C16
Removed `aggregateRating` from the product JSON-LD. The storefront has no reviews UI, and a rating with no visible reviews behind it breaks structured-data policy. `buildProductJsonLd` still accepts `rating` but the product page no longer passes it.

## Verification
- `tsc --noEmit` clean; 10 vitest files / 76 tests pass (seo, sitemap, robots, canonical, metadata).
- `next build` ok; served with `next start`.
- Lighthouse SEO (local): `/` 100, `/c` 100, a real product 100. Not run on a `/c/<slug>` page: the local sitemap has no `/c/` entries.
- Local canonical/sitemap host is `localhost:3417` from `NEXT_PUBLIC_APP_URL` in `.env.local`; production uses the env value.

No forbidden files touched.
