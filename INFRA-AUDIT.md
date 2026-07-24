# Infrastructure Audit — KenyonExpress

Branch: `infra/audit`. Stack: Next.js 16.2.4 (app router, `src/app`), React 19.2.4, Supabase SSR, next-intl, Vercel target.
Scope note: app dir is `src/app`, not `app`. Middleware is `src/proxy.ts` (Next 16 renamed `middleware` -> `proxy`). Route groups `(account)`, `(marketing)`, `(shop)` are empty scaffolds (`.gitkeep` only); the real storefront lives in `(store)` and `(main)`.

Severity legend: P0 = ship-blocking security/correctness. P1 = important, fix this sprint. P2 = hardening / nice-to-have.

RLS is out of scope per instructions and confirmed correct (26 tables, RLS on all; server-only tables have 0 policies by design; coupons/coupon_codes SELECT-only). Not re-audited.

---

## Findings table

| severity | file:line | current | risk | fix | status |
|---|---|---|---|---|---|
| P0 | next.config.ts:1-24 | no `headers()`; zero security headers | clickjacking, no HSTS, MIME sniffing, referrer leak, unrestricted feature policy on a site that takes payments | add `headers()`: CSP, HSTS 63072000 preload, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy | FIXED |
| P1 | src/app/(store)/product/[slug]/page.tsx:1 | default render, forced dynamic (reads cookies via server client + `(store)` layout `getCart`) | every product view hits Supabase + SSR; no CDN cache; poor TTFB/SEO | ISR: cookieless read client, `export const revalidate`, `generateStaticParams`, tag-based revalidation | OPEN |
| P1 | src/app/(store)/category/[slug]/page.tsx:1 | default render, forced dynamic | same as product; category pages are prime SEO landing pages | ISR + `generateStaticParams` + `revalidateTag('categories')` | OPEN |
| P1 | src/app/(main)/coupons/[id]/page.tsx, coupons/page.tsx | default render (dynamic) | deal pages (the "deal" surface) uncacheable | ISR + `generateStaticParams` + `revalidateTag('coupons')` | OPEN |
| P1 | src/app/(store)/layout.tsx:9 | `await getCart()` -> `cookies()` in shared layout | forces the ENTIRE `(store)` subtree dynamic; blocks ISR on product/category even if the pages opt in | hydrate cart client-side (Zustand/CartProvider fetches on mount) so the layout stays static | OPEN |
| P1 | app/api/revalidate — missing | no on-demand revalidation endpoint | ISR pages go stale until timer; content edits not reflected | create `src/app/api/revalidate/route.ts` (POST, timing-safe secret, `revalidateTag` by table) | OPEN |
| P1 | src/app/robots.ts — missing | no robots.txt | crawlers may hit `/admin`, `/api`, `/checkout` | add `app/robots.ts` disallowing `/admin`, `/api`, `/checkout` | OPEN |
| P1 | src/app/sitemap.ts — missing | no sitemap | weak discovery for product/category/coupon URLs | add `app/sitemap.ts` sourced from Supabase with `lastModified` | OPEN |
| P1 | src/app/error.tsx / global-error.tsx / not-found.tsx — missing | default Next error UI (LTR, English) | broken UX on error/404 for a he-IL RTL site | add Hebrew RTL `error.tsx`, `global-error.tsx`, `not-found.tsx` | OPEN |
| P1 | src/app/(admin)/layout.tsx:7 | no `robots`/noindex, no `force-dynamic` | admin surface not explicitly deindexed or forced dynamic | add `robots: { index: false }` to admin metadata + `export const dynamic = 'force-dynamic'` | OPEN |
| P1 | lib/logger.ts — missing | ad-hoc / no structured logging | no request-id correlation; risk of leaking tokens/emails/PAN in logs | add `src/lib/logger.ts` structured JSON with redaction | OPEN |
| P1 | .github/workflows/ci.yml — missing | no CI at all | broken typecheck/lint/test/build merges to main undetected | add CI (typecheck, lint, test, build) on PR + push main | OPEN |
| P2 | instrumentation.ts — missing | no Sentry / tracing | no server/edge/client error telemetry | add `src/instrumentation.ts`; requires `@sentry/nextjs` dependency (not installed) | OPEN (needs dep) |
| P2 | src/app/(store)/product/[slug]/page.tsx | no JSON-LD | no rich Product results in search | add Product+Offer+BreadcrumbList JSON-LD from DB | OPEN |
| P2 | src/app/layout.tsx:14 | metadata has `metadataBase` but no `openGraph`/`twitter`/Organization/WebSite | weak social + brand SERP presence | add openGraph, twitter, and Organization+WebSite JSON-LD | OPEN |
| P2 | .env.example | missing `CARDCOM_*`, `CARDCOM_WEBHOOK_SECRET`, `REVALIDATE_SECRET`, Sentry vars | onboarding gaps; secrets discovered at runtime failure | document all required env keys | OPEN |
| P2 | supabase/migrations/032_rls_coverage.sql — missing | no assertion migration | RLS coverage not enforced as code | add idempotent assertion migration (RLS already correct; this locks it) | OPEN |
| info | src/lib/supabase/admin.ts:5 | SERVICE_ROLE key used | none — server-only module, never imported client-side | no change; keep the "never import in client" invariant | OK |
| info | src/proxy.ts | protects `/account`, `/checkout`, `/admin`; admin role from `profiles` | none — correct | no change | OK |
| info | .env / .env.local | git-ignored (`.gitignore` blocks `.env*`), only `.env.example` tracked | none | no change | OK |

No hardcoded API keys, no SERVICE_ROLE in any `"use client"` file, no secret under `NEXT_PUBLIC_` found.

---

## 1. Rendering strategy

### Root cause blocking ISR
Two request-time cookie reads force dynamic rendering across the storefront:
1. `src/app/(store)/layout.tsx:9` — `await getCart()` calls `cookies()`; this makes the whole `(store)` subtree dynamic.
2. Pages call `createClient()` from `src/lib/supabase/server.ts`, which reads `cookies()` even for public product/category data.

To reach ISR on product/category/deal you must: (a) hydrate the cart client-side so the layout no longer reads cookies, and (b) fetch public catalog data with a cookieless anon client inside `generateStaticParams`/the page.

### Route table (current vs target)

| route | group | current | target |
|---|---|---|---|
| `/` | (store) | dynamic (layout cookies) | ISR 300s (after cart hydration moves client-side) |
| `/product/[slug]` | (store) | dynamic | ISR + `revalidate` + `generateStaticParams` + tag `products` |
| `/category/[slug]` | (store) | dynamic | ISR + `revalidate` + `generateStaticParams` + tag `categories` |
| `/products` | (store) | dynamic | dynamic (search/filter) |
| `/coupons` | (main) | dynamic | ISR + tag `coupons` |
| `/coupons/[id]` | (main) | dynamic | ISR + `generateStaticParams` + tag `coupons` |
| `/cart` | (store) | dynamic | `force-dynamic` |
| `/checkout` | (store) | dynamic | `force-dynamic` + noindex |
| `/checkout/return` | (store) | dynamic | `force-dynamic` + noindex |
| `/checkout/failed` | (store) | dynamic | `force-dynamic` + noindex |
| `/account/**` | (account) | empty scaffold | `force-dynamic` when built |
| `/login` `/signup` `/forgot-password` `/reset-password` `/signup/confirm` | (auth) | dynamic | dynamic + noindex |
| `/admin/**` (18 pages) | (admin) | default (auth-gated by proxy) | `force-dynamic` + noindex |

### Revalidate endpoint
Recommended `src/app/api/revalidate/route.ts` (OPEN, not yet created): POST only, `runtime = 'nodejs'`, constant-time compare of `x-revalidate-secret` against `REVALIDATE_SECRET` via `crypto.timingSafeEqual`, then `revalidateTag` keyed by the payload's `table`.

Tag map: `products` -> `products`, `product_variants` -> `products`, `categories` -> `categories`, `coupon_deals`/`coupons`/`coupon_codes` -> `coupons`.

Supabase Database Webhook config (copy-paste):
```
Name:            revalidate-nextjs
Table:           products            (create one webhook per table: products, product_variants, categories, coupon_deals)
Events:          Insert, Update, Delete
Type:            HTTP Request
Method:          POST
URL:             https://kenyonexpress.co.il/api/revalidate
HTTP Headers:
  Content-Type:        application/json
  x-revalidate-secret: <value of REVALIDATE_SECRET>
Body (default Supabase payload includes { type, table, record, old_record })
```
Pages must attach the matching cache tag when fetching (e.g. `{ next: { tags: ['products'] } }`) for `revalidateTag` to take effect.

---

## 2. Security headers (next.config.ts) — FIXED

Added `async headers()` returning, for all routes:
- `Content-Security-Policy`: `default-src 'self'`; `script-src 'self' 'unsafe-inline'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://plus.unsplash.com`; `font-src 'self'`; `connect-src 'self' https://*.supabase.co`; `frame-src https://secure.cardcom.solutions`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self' https://secure.cardcom.solutions`; `object-src 'none'`; `upgrade-insecure-requests`.
- `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options`: `DENY`
- `X-Content-Type-Options`: `nosniff`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Permissions-Policy`: `camera=(), microphone=(), geolocation=(), payment=(self)`

Deviation from spec (documented): the spec asks for `strict-dynamic` + per-request nonce. A per-request nonce cannot be expressed in a static `next.config.ts` header; it requires generating a nonce in `src/proxy.ts` and threading it into the CSP header + every inline `<script>`. `proxy.ts` is outside the allowed edit set for this audit, so the shipped CSP uses `'unsafe-inline'` for script/style (functional and non-breaking) instead of `'strict-dynamic'` + nonce. Upgrade path is recorded as a P1 follow-up (touch `proxy.ts`). `next/font` self-hosts Heebo, so no `fonts.googleapis.com`/`fonts.gstatic.com` origin is needed.

---

## 3. Secrets

| item | result |
|---|---|
| Hardcoded API keys | none found (grep for key/secret/token/password across `src`) |
| SERVICE_ROLE in `"use client"` | none — only `src/lib/supabase/admin.ts:5` (server-only helper) |
| Secrets under `NEXT_PUBLIC_` | none — only URL + anon key + app URL are public (correct) |
| `.env` tracked in git | no — `.gitignore` blocks `.env`, `.env.local`, `.env*.local`; only `.env.example` tracked |
| `.env.example` gaps | missing `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, `CARDCOM_WEBHOOK_SECRET`, `CARDCOM_API_BASE_URL`, `CARDCOM_USE_MOCK`, `REVALIDATE_SECRET`, `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` |

---

## 4. SEO (he-IL)

- `src/app/layout.tsx`: `lang="he" dir="rtl"` present; `metadataBase` present. Missing `openGraph`, `twitter`, and Organization+WebSite JSON-LD. (P2)
- `generateMetadata` exists on product, category, coupon detail from real Supabase data. Good, keep and extend with openGraph.
- Product JSON-LD (Product+Offer, `priceCurrency: ILS`, availability, `priceValidUntil`, seller = supplier name) — missing. (P2)
- BreadcrumbList JSON-LD — missing (breadcrumb UI exists, no structured data). (P2)
- `app/sitemap.ts` — OPEN (recommend Supabase-sourced with `lastModified`).
- `app/robots.ts` — OPEN (recommend disallow `/admin`, `/api`, `/checkout`).

---

## 5. Observability

- `lib/logger.ts` — OPEN (recommend): structured JSON, `request-id` support, redacts `token`, `authorization`, `password`, email addresses, and card/PAN-like digit runs.
- `instrumentation.ts` (Sentry server+edge+client + `tunnelRoute`) — OPEN: requires `@sentry/nextjs` (not in `package.json`). Do not add an importing `instrumentation.ts` until the dep is installed, or the build breaks. Tracked as P2.
- `error.tsx`, `global-error.tsx`, `not-found.tsx` — OPEN (recommend Hebrew RTL).

---

## 6. CI

`.github/workflows/ci.yml` — OPEN (recommended). Would trigger on `pull_request` and `push` to `main`. Node 20, pnpm with cache, `concurrency` with `cancel-in-progress`. Jobs: typecheck (`tsc --noEmit`), lint (`biome lint`), test (`vitest run`), build (`next build`).

---

## Execution log

Per instructions: only P0 is auto-fixed on this branch, one commit each, `pnpm build` between fixes. Everything else is authored where safe and listed above with status, or left OPEN when it needs out-of-scope files or new dependencies.
