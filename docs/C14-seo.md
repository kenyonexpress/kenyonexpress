# C14 — SEO (sitemap, robots, og, schema.org, canonical)

Status: already shipped; audited 2026-10-27, no code change.

| Requirement | Where |
|---|---|
| Dynamic sitemap.xml | `src/app/sitemap.ts` — static routes, categories with active products, active products, suppliers, legal docs, blog; anon client, `use cache` + `CATALOGUE_TAG`, `orFail` on every read |
| robots.txt | `src/app/robots.ts` — disallows /redeem/, /coupon/, /voucher/, /debug/, /account/, /supplier/, /admin/, /scan, /checkout, /cart; sitemap + host from `siteUrl()` |
| og tags per route | `generateMetadata` on product and category pages, `opengraph-image.tsx` at root, root metadata |
| schema.org Product + Offer | `buildProductJsonLd` in `src/lib/seo/json-ld.ts`, rendered on `/product/[slug]` |
| BreadcrumbList | `buildBreadcrumbJsonLd`, rendered on product and category pages, mirrors visible breadcrumb |
| Canonical | per-route `alternates.canonical`; `src/app/canonical-coverage.test.ts` guards coverage |

Verification: `vitest run` on sitemap, robots, lib/seo, canonical-coverage, public-route-metadata, root-metadata — 10 files, 75 tests passed.

No forbidden files touched.
