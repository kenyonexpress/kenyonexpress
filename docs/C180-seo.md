# C180 - SEO schema, social cards, sitemap, robots, WordPress 301s

Date: 2026-11-03. Branch `closeout/v1-final`. Code commit `cf95c0eeb`.

## What already shipped (G112, C108)
- JSON-LD builders in `src/lib/seo/json-ld.ts`: `Organization` + `WebSite` (home only, on purpose:
  see the comment in `src/app/(store)/page.tsx`), `Product` + `Offer` (integer agorot through the
  money helpers), `BreadcrumbList`, `LocalBusiness`. `FAQPage` is built in `src/app/(store)/faq/page.tsx`
  from the same array the page renders. `jsonLdScript` escapes every `<`.
- Wired: home (Organization, WebSite), `/product/[slug]` (Product, BreadcrumbList), `/c`, `/c/[slug]`,
  `/category/[slug]` (BreadcrumbList, ItemList), `/faq` (FAQPage), city, supplier, blog.
- `src/app/sitemap.ts` (DB-backed, cached) and `src/app/robots.ts` (private paths disallowed, Sitemap line).
- WordPress shapes answer 301 from `src/proxy.ts` via `src/lib/seo/wp-legacy.ts` and `docs/redirects.map.ts`
  (exact paths plus `/product-category/*` and `/product-tag/*`), after any `seo_redirects` table row.

## Fixed in C180
1. **Social cards.** `/category/[slug]` set `openGraph` without images (a page-level `openGraph` drops the
   root `opengraph-image` card) and no `twitter`, so X cards showed the site-wide title. `/c`, `/c/[slug]`
   and `/faq` set neither, so both cards carried the site title. New `src/lib/seo/social.ts`
   (`socialMetadata`) builds `openGraph` + `twitter` together and re-claims `/opengraph-image` unless the
   segment owns a card file (`ownCard: true`, product page). Applied to all five pages.
2. **301, not 308.** The five WordPress legal paths in `next.config.ts` used `permanent: true` (308). They
   answer before the proxy, so they now use `statusCode: 301` like the proxy's WP redirects.
   `src/content/legal/legal-routes.test.ts` updated to require 301.
3. `scripts/seo-verify.mjs`: reads the served HTML for JSON-LD types, og/twitter tags, robots, sitemap,
   and follows every old WordPress path's redirect chain.

## Decision taken alone
Old WordPress URLs end in `/`. Next answers them with its built-in 308 to the slash-less path, and then
the proxy answers 301, so a real old link is `308 -> 301 -> 200`. Both hops are permanent and search
engines treat them as one move. Collapsing that into a single 301 would mean `skipTrailingSlashRedirect`
and owning trailing-slash normalisation for every URL on the site in the proxy. That is a global change I
could not build or E2E-test during the outage below, so it was not made.

## Proof

### Unit / static gates
```
$ node node_modules/vitest/vitest.mjs run src/lib/seo src/app/robots.test.ts src/app/sitemap.test.ts src/app/canonical-coverage.test.ts src/app/public-route-metadata.test.ts src/app/root-metadata.test.ts src/content/legal
 Test Files  15 passed (15)
      Tests  126 passed (126)

$ node node_modules/vitest/vitest.mjs run src/__tests__ scripts
 Test Files  100 passed (100)
      Tests  1120 passed | 1 skipped (1121)

$ pnpm type-check   -> tsc rc=0
$ pnpm lint         -> lint rc=0
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
```

### pnpm build: failed on the production DB outage, not on code
```
$ pnpm build
{"level":"error","event":"supabase.timeout","timeoutMs":10000,"url":"https://ixvwfbuvfxxsjiywhbbb.supabase.co/rest/v1/categories"}
Error: Failed to collect page data for /coupons/[id]
build rc=1

$ curl https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/health?services=db&services=rest   (06:58 +07)
[{"name":"db","healthy":false,"status":"UNHEALTHY"},{"name":"rest","healthy":false,"status":"UNHEALTHY"}]
github 200
(07:39 +07) [{"name":"db","healthy":true,"status":"ACTIVE_HEALTHY"},{"name":"rest","healthy":false,"status":"UNHEALTHY"}]
REST /rest/v1/categories polled 06:59 to 08:26 +07: only 000 and 503, never 200.
```

### Served render (`next dev` on :3317, raw output of `scripts/seo-verify.mjs`)
    200 /c
      ld+json: BreadcrumbList
      og:title=דילים לפי עיר | og:image=http://localhost:3417/opengraph-image
      twitter:card=summary_large_image | twitter:title=דילים לפי עיר | twitter:image=http://localhost:3417/opengraph-image
      FAIL no sitemap entry for BreadcrumbList page
      FAIL no sitemap entry for BreadcrumbList page
    200 /faq
      ld+json: FAQPage
      og:title=שאלות נפוצות | og:image=http://localhost:3417/opengraph-image
      twitter:card=summary_large_image | twitter:title=שאלות נפוצות | twitter:image=http://localhost:3417/opengraph-image
    
    200 /robots.txt
      User-Agent: *
      Allow: /
      Sitemap: http://localhost:3417/sitemap.xml
    
    500 /sitemap.xml  urls=0
      /product/: 0
      /category/: 0
      /c/: 0
      /blog: 0
      /faq: 0
      FAIL sitemap empty
    
    old WordPress paths:
      301 /shop -> 200 /products
      308 /shop/ -> 301 /shop -> 200 /products
      FAIL /account hop 307 is not permanent
      FAIL /account moved with 307, want 301
      308 /my-account/ -> 301 /my-account -> 307 /account -> 200 /login?next=/account
      308 /contact-us/ -> 301 /contact-us -> 200 /contact
      308 /about-us/ -> 301 /about-us -> 200 /about
      308 /home/ -> 301 /home -> 500 /
      FAIL /home/ ends on 500
      308 /cart-2/ -> 301 /cart-2 -> 200 /cart
      308 /checkout-2/ -> 301 /checkout-2 -> 200 /checkout
      301 /terms-and-conditions -> 200 /terms
      308 /terms-and-conditions/ -> 301 /terms-and-conditions -> 200 /terms
      308 /privacy-policy/ -> 301 /privacy-policy -> 200 /privacy
      308 /refund_returns/ -> 301 /refund_returns -> 200 /returns
      308 /cancellation-policy/ -> 301 /cancellation-policy -> 200 /returns
      301 /product-category/electronics -> 500 /category/electronics
      FAIL /product-category/electronics ends on 500
      308 /product-category/electronics/ -> 301 /product-category/electronics -> 500 /category/electronics
      FAIL /product-category/electronics/ ends on 500
      308 /product-tag/sale/ -> 301 /product-tag/sale -> 200 /search?q=sale
    
    SEO VERIFY: 12 failure(s)
    500 /
      ld+json: (none)
      og:title=קניון EXPRESS | קופונים ומבצעים | og:image=http://localhost:3317/opengraph-image?d4f91b2122f4c517
      twitter:card=summary_large_image | twitter:title=קניון EXPRESS | קופונים ומבצעים | twitter:image=http://localhost:3317/opengraph-image?d4f91b2122f4c517
      FAIL / status 500
      FAIL / missing Organization
      FAIL / missing WebSite
      FAIL no sitemap entry for Product+BreadcrumbList page

Reading it:
- `/c` and `/faq` now carry their own `og:title`, `twitter:title`, `og:image` and `twitter:image`
  (before C180 both showed `קניון EXPRESS | קופונים ומבצעים`, as `/` still does by design).
- Every old WordPress path reaches its target through a 301; trailing-slash forms go 308 then 301.
- Every 500 (`/`, `/sitemap.xml`, `/category/electronics`) is the outage: the dev log shows
  `catalogue.shop_products_failed: Could not query the database for the schema cache`.
- The `/account` 307 to `/login` is the account auth gate, after the 301. That run predates the script
  fix that stops judging a chain after its 301 hop; the fix is in `cf95c0eeb`.

## Not measured in this run
Home (Organization, WebSite), `/product/<slug>` (Product, BreadcrumbList), `/category/<slug>`, and
`/sitemap.xml` all render from the DB, which never answered during the session. Their builders are
unchanged and unit-tested (`src/lib/seo/json-ld.test.ts`, `src/app/sitemap.test.ts`). Rerun once REST answers 200:

    pnpm build && PORT=3317 pnpm start &
    LOCAL_BASE=http://localhost:3317 node scripts/seo-verify.mjs

No visual change (metadata and redirects only), so compare.mjs was not run. No forbidden file touched.

RESULT: BLOCKED supabase-rest-down, served proof for home/product/category/sitemap pending
