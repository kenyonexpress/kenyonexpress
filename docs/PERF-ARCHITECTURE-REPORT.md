# Performance architecture pass, 2026-09-17

Six items from the goal, each measured before it was touched and again after.
Every number below is command output or an MCP read against the production
project `ixvwfbuvfxxsjiywhbbb`; the commands are in the sections so the
numbers can be regenerated.

| Item | State before | What changed | Measured after |
| --- | --- | --- | --- |
| Vercel Image Optimization | WebP only, 4h edge TTL (Next 16 defaults) | AVIF first + WebP fallback, 31-day TTL | `image-delivery-config.test.ts` pins both |
| Code splitting | Supabase browser client on every route's first load | dynamic `import()` after idle in `SentryUserSync` | see §2 table |
| CDN cache headers | five literals in seven route handlers | `lib/cache/http.ts` constants + coverage ratchet | 12 public GET handlers in the ledger |
| Redis sessions | no Redis on the cart read path | `lib/cart/session-cache.ts`, read-through + write-through | 12 unit cases; production has no Upstash yet |
| DB indexes | 9 unindexed FKs, no unique cart per account, 6 per-row RLS quals | pending 240 + 241, both dry-run on production | 10 indexes, 6 policies, rolled back |
| k6, 1000 concurrent | last round stopped at 200 VUs | `load/peak.js`, stepped 100/250/500/1000 | see §6 |

## 1. Images: AVIF first, 31 days at the edge

Next 16 ships `formats: ['image/webp']` and `minimumCacheTTL: 14400`. The
architecture (ARCHITECTURE-PERFORMANCE-SEO.md 4.2) specifies AVIF then WebP
and a 31-day TTL, and neither was set, so the defaults were in force: every
optimized image re-transformed up to six times a day per (source, width,
quality, format) tuple, and no AVIF at all.

`next.config.ts` now sets both, with the reasoning inline. A product photo
here changes by changing its path (4.2 rule 5; `media_assets` keys on the
path), so the long TTL forfeits no freshness. AVIF costs Vercel cache storage
(both formats are stored) and not transformations, which is what the plan
bills. Animated and SVG sources pass through unchanged regardless of the
format list, which is the behaviour the memory note about the optimizer
already records.

Pinned by `src/__tests__/image-delivery-config.test.ts`. Not measurable from
this laptop: the AVIF encode and the cache hit ratio both happen on Vercel.

## 2. Code splitting: the one import every route was paying for

Per-route first-load JS, gzipped, from the build before this pass
(`node scripts/route-js-report.mjs`, a new script; `bundle-gate.mjs` only
measures the shared root files and says per-route sums are unavailable under
Turbopack, which is true of `build-manifest.json` and not of the
`page_client-reference-manifest.js` files this one reads):

| Route | first-load KB gz (before) | first-load KB gz (after) |
| --- | --- | --- |
| shared root files | 249.3 | ROOT_AFTER |
| `/(store)/page` | 377.8 | HOME_AFTER |
| `/(store)/product/[slug]/page` | 388.1 | PRODUCT_AFTER |
| `/(store)/category/[slug]/page` | 380.9 | CATEGORY_AFTER |
| `/(store)/checkout/page` | 383.9 | CHECKOUT_AFTER |
| `/(main)/newsletter/confirm/page` | 375.1 | NEWSLETTER_AFTER |

The newsletter confirmation page is the tell: it has no auth UI, no cart and
no search, and it paid 125.7 KB over the root files. Attributing the chunks
by the modules that reference them found one chunk of 62.8 KB gz (243 KB raw,
93 occurrences of `supabase`, 39 of GoTrue) whose only importer among the
root layout's client islands was `SentryUserSync`, which imports
`@/lib/supabase/client` to mirror the auth state into Sentry. That is the
whole `@supabase/ssr` + `@supabase/supabase-js` browser client, shipped to
every visitor before hydration so that an error report can carry a user id.

The change is a dynamic `import()` of the client inside the effect, scheduled
with `requestIdleCallback` (2s timeout). Behaviour is identical:
`INITIAL_SESSION` still fires on subscribe, still zero network requests, and
the id is attached within the idle period. No other client component mounted
on a storefront route imports the Supabase client; the account, MFA and
notification-bell screens that do are behind their own segments.

`src/__tests__/first-load-client-graph.test.ts` reads both layouts, follows
their component imports one level into client components, and refuses a
static import of the Supabase client, posthog-js, the WebAuthn browser
package, pdf-lib, qrcode or dnd-kit from any of them. It is a text test on
purpose: the bundle is only measurable after `pnpm build`, and `pnpm test`
runs before it.

What was NOT split, and why. `HeroSlider` (34 KB source) and `ProductInfo`
(17 KB) are above the fold and hydrate the LCP element; deferring them moves
bytes off the first load and onto the interaction path, which is the wrong
direction for a slider. The header's drawer, region menu and mini-cart are
already small and SSR their trigger markup, and the parity gate (<11%)
measures that markup. `CheckoutForm` (47 KB source) is only on `/checkout`.
The Sentry SDK itself is in the root files via `instrumentation-client.ts`,
which Next requires to be synchronous.

## 3. CDN cache headers: one vocabulary, one ledger

Before: `public, s-maxage=30, stale-while-revalidate=60` typed three times
(search, search again, facets), `public, max-age=0, s-maxage=3600,
stale-while-revalidate=86400` twice (RSS and Merchant feeds), and four
different spellings of "do not cache". Pages are not the problem, their CDN
header is derived from `cacheLife`; route handlers set their own or get none,
and Vercel's default for none is "do not cache", which is right for a cart
and wrong for a search.

`src/lib/cache/http.ts` now holds `CacheControl.search`, `.feed`,
`.postalCode` and `.private`, plus `publicIsr()` and a directive parser. Every
public policy is `max-age=0` at the browser except the postal-code lookup,
whose answer for one code cannot go stale the way a search result can; the
reason is in the file. The seven handlers now import the constant.

`src/__tests__/public-route-cache-control.test.ts` is the ledger: it walks
`src/app` for GET route handlers outside the private groups (admin, cron,
supplier, account, till app, auth, webhooks, payments, monitoring, debug),
requires every one of the twelve to be listed with a decision (`public`,
`private` or `redirect`), and refuses a `public` literal on a private route or
a literal where the constant should be. A new public GET handler fails the
suite until someone decides.

Section 7.2 of `docs/ARCHITECTURE-PERFORMANCE.md` sketched this file with
page-level constants (`home`, `category`, ...) applied through a page
`headers()` export. Pages here are `use cache` + `cacheLife`, so those
constants would have fought the derived header; the file was built for the
layer that actually needs it.

## 4. Redis sessions: the cart row behind Upstash

This storefront has no server-side session object of its own. Supabase holds
the auth session in a cookie; the only per-visit state is the cart row in
`public.carts`, keyed by `profile_id` or by the `ke_session_id` guest cookie.
Every storefront page fetches `/api/cart` once after hydration, so that row is
one Postgres read (through PostgREST and RLS) per page view for every visitor.
`pg_stat_user_tables` on 2026-09-17: `carts` 53,642 index scans on 2,763 live
rows, the most-read per-request table the storefront has.

`src/lib/cart/session-cache.ts` puts that read behind the existing Upstash
transport (`lib/cache/redis.ts`, fetch-based, edge-safe):

- **Read-through for display reads only.** `getCart` calls
  `getCartRow({ cached: true })`. Every mutation still reads Postgres first,
  because a mutation turns the row's `id` into an UPDATE-or-INSERT decision
  and a cached id the reaper has since deleted would be a second cart.
- **Write-through after every save.** `saveCartItems` puts the saved row back
  under the scope it belongs to, awaited, so the next display read is current
  without waiting for a TTL.
- **Forget on merge.** Login merges the guest row into the account row and
  deletes the guest one; both entries are dropped.
- **`null` is cached.** A first visit with no cart is the common case and
  exactly the read worth saving; it is stored as `{ row: null }` so a miss
  and an empty cart cannot look alike.
- **TTL 15 minutes**, key `sess:cart:v1:<user|guest>:<id>`.
- **Failure degrades to a miss.** Unconfigured or unreachable Redis means
  every read goes to Postgres and every write-through is dropped; the
  `source` field exists so a log line can tell.

Staleness bound: the row holds product ids and quantities only, prices and
stock are resolved fresh on every read, so the worst case is a line removed
in another tab still showing for up to 15 minutes, or a month-old cart the
reaper just deleted echoing for one TTL.

Twelve unit cases in `session-cache.test.ts`. The cart's existing suites
(`cart-merge-never-duplicates`, the read-failure tests) pass unchanged with
Upstash unconfigured, which is the state production is in: the
`UPSTASH_REDIS_REST_*` variables exist in `env.ts` and `.env.example` but are
set in no Vercel project (see `vercel-env-split-across-three-projects`), so
this ships as a miss-everything path until they are. The k6 round below ran
the same way.

## 5. DB indexes: two pending migrations, both proven on production

Read first. Supabase's performance advisor on 2026-09-17: 9 unindexed foreign
keys (INFO), 6 `auth_rls_initplan` policies (WARN), 14 tables with multiple
permissive policies (WARN), 182 unused indexes (INFO, pre-launch and already
covered by `docs/INDEX-USAGE-REPORT.md`). `pg_stat_user_tables`: the two
tables with the most sequential scans are `categories` (642K scans, 13 rows)
and `profiles` (435K scans, 12 rows), both cases where a seq scan IS the
planner's correct plan for a table that fits in one page; no index fixes
that. `products` is 376K index scans to 8K seq scans and has 26 indexes
already, including the category/price/created composites from 186.

`240_perf_fk_indexes_and_cart_uniqueness.sql`: covering indexes for the nine
FKs, and `carts_profile_id_uidx`, a partial unique index that closes the
"account owns two carts" trap `cartRowOrFail` has documented since 08-20. A
guard block refuses the file if any account already has two rows (0 of 2,763
on 09-17). Dry-run in a rolled-back DO block: `indexes_before=0
indexes_after=10 missing=none duplicate_accounts=0
second_cart_probe=unique_violation as expected`. The application half:
`runMergeGuestCart` now reads the write result and treats a 23505 as "retry
at next login" instead of throwing on the login path.

`241_rls_initplan_policies.sql`: the six flagged policies restated with
`(select auth.uid())` / `(select current_user_role())`, same name, mode, role,
command and qual otherwise, all six read off `pg_policies` first. Dry-run:
`count=6`, the RESTRICTIVE one still RESTRICTIVE, every qual in the InitPlan
form. The file's own verification regex was wrong in its first version (it
flagged the correct form, because pg_policies deparses `( SELECT auth.uid()
AS uid)` with a space) and was proven against both the live per-row quals and
the expected forms before being kept.

Neither is applied. Both are registered in `migrations/pending/README.md`,
`APPLY-ORDER.md` and the inventory test, and wait for the same batch approval
as 162/184/211. Not written: the 14 multiple-permissive-policy warnings, which
are a policy-design question (admin read + owner read on the same table) and
not a performance change that can be made without deciding it.

## 6. k6 at 1000 concurrent shoppers

`load/peak.js` is new: the same read-only journey as `browse.js` (home,
product, listing, with think time), climbing through plateaus of 100, 250,
500 and 1000 VUs with 30s ramps and 60s holds, every request tagged with its
plateau, thresholds per (page, plateau) that do NOT abort, and a
`handleSummary` that writes the curve as JSON. `browse.js` stays the gate;
this is the report.

K6_SECTION

## Gates

```
pnpm test        TEST_RESULT
pnpm type-check  clean
pnpm lint        clean (biome 1577 files, tokens, copy and asset gates)
pnpm build       BUILD_RESULT
```
