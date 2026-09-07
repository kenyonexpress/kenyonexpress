# Performance notes

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only. Numbers below are **read from existing measurements** in this worktree (2026-09-01 index report, 2026-09-06 Lighthouse smoke, 2026-09-02 bundle-gate comment). This session does not run
`pnpm`
or Lighthouse.

Companions:

```
docs/PERFORMANCE-BUDGET.md
docs/INDEX-USAGE-REPORT.md
docs/ARCHITECTURE-PERFORMANCE.md
scripts/bundle-gate.mjs
docs/adr/0009-cache-via-next-use-cache.md
docs/cursor/DEPENDENCY-AUDIT.md
```

---

## 0. What is actually slow vs what the dashboard says

Local Lighthouse **simulate** scores 70–75 / 90 threshold and exits 1.
The same build with
`--throttling-method=provided`
scores **100**. CLS ~0. Unused JS ~60 KiB inside one framework chunk. No render-blocking CSS. Hero animation that used to be 777 KB WebP is gone.

**Do not optimise against Lantern on localhost.** A 2.7 s real improvement already showed up as noise; two identical runs differed by 5 points.

The budget that matters after DNS cutover is **field** RUM (
`web_vital`
events + Vercel Speed Insights), not a laptop model.

Shared first-load JS gate:
`scripts/bundle-gate.mjs`
default **260 KB gzip** (measured 255.6 KB on 2026-09-02). Spec wish is 180 KB (
`docs/KNOWN-ISSUES.md`).
Turbopack emits no per-route
`app-build-manifest`,
so the gate is
`rootMainFiles + polyfills`
only. That is "what every route pays", not "what checkout pays".

---

## 1. Slow paths (ranked by user pain after launch)

### P-S1. `/search` without Meilisearch (ILIKE)

- **Where:**
  `src/lib/search-server.ts`
  when
  `MEILISEARCH_HOST`
  or
  `MEILISEARCH_API_KEY`
  is unset.
- **What happens:** Postgres
  `ILIKE`
  (or
  `search_products`
  RPC if present). Same
  `ProductCard`
  shape. No typo tolerance, no synonyms, no facets (there is no facet UI anyway).
- **Cheapest fix:** Set hosted Meilisearch env on Production and keep the drain cron/QStash healthy. Do **not** build marketplace search chrome. ILIKE is the correct fallback, not a bug.
- **Do not:** Sequential-scan "optimisation" that adds
  `pg_trgm`
  without a human migration.

### P-S2. RLS helpers vs `profiles` sequential scans

- **Where:** production measure 2026-09-01:
  `profiles`
  **212,800 seq scans** vs 10 idx scans, **10 rows**.
  `is_admin()`,
  `has_role()`,
  `current_user_role()`,
  `is_support()`
  run from policies.
- **Why it is fine today:** planner is right at 10 rows.
- **Why it is the incident shape later:** at 10k profiles every RLS query pays it. Symptom is "the site is slow", not "this query".
- **Cheapest fix:** Re-measure after real users. Confirm
  `profiles_pkey`
  is used (
  `(SELECT auth.uid())`
  InitPlan). Do not drop indexes because
  `idx_scan = 0`
  pre-traffic (178/281 unused; empty
  `vouchers`).

### P-S3. Unindexed foreign keys on money tables

From
`docs/INDEX-USAGE-REPORT.md`
§3 (still a **pending migration**, human apply):

| Child | Column | Why it will hurt |
|---|---|---|
| `refunds` | `payment_id` | Every refund reads its payment |
| `subscriptions` | `payment_token_id` | Recurring charge job every cycle |

- **Cheapest fix:** One pending SQL file, two indexes. Do not `db push`.

### P-S4. Duplicate unique + non-unique indexes

Five pairs (affiliates code/user, orders invoice_number, rate_limits key, fossil
`wallet_balances`
user_id). The **hot** duplicate:
`rate_limits_key_idx`
unscanned while
`rate_limits_key_key`
has thousands of scans. Every auth-adjacent write maintains both.

- **Cheapest fix:** Drop the non-unique twin in a pending migration. `rate_limits` is the only one that pays today.

### P-S5. Catalogue without cache tag discipline

- **Where:**
  `'use cache'`
  +
  `cacheTag(CATALOGUE_TAG)`
  on category/product reads (
  `src/lib/category-page.ts`,
  reviews queries). Admin mutations
  `updateTag`.
- **Failure mode:** a new read that **skips** the tag serves stale prices, **or** a session cookie on a cached path personalises the CDN blob (test:
  `catalogue-render-path.test`).
- **Cheapest fix:** Put the new read in the existing helper. Do not add Redis page cache (ADR 0009).

### P-S6. Search index drain inline

If QStash is unset, index jobs run inline on the request or wait for cron. Catalogue writes feel slow; `/search` lags Meilisearch.

- **Cheapest fix:** Configure QStash **or** accept cron lag. Do not block PDP render on Meili.

### P-S7. Image optimizer falling back to original bytes

Nested Next
`sharp@0.34`
could not decode repo AVIF (`source: bad seek`), caught, **silent full-size**. Override
`sharp: ^0.35.3`
in
`pnpm-workspace.yaml`.

- **Cheapest fix:** Keep the override. Verify Production actually uses it (Vercel install). One oversized AVIF on home wrecks LCP more than any query.

### P-S8. Admin
`recharts`

One chart,
`SalesChart.tsx`.
Does not belong on storefront JS if imported from a shared layout.

- **Cheapest fix:** Keep it behind
  `/admin/reports`
  only. Do not put it on home "to see if we have sales".

---

## 2. Pages that ship the most JavaScript (what we can say without a new build)

This pack did not read
`.next/`.
From source and the gate:

| Surface | Why it is heavy | Cheapest cut |
|---|---|---|
| Shared first load (every route) | Next + React + lucide on masthead/header | Stop adding lucide icons to
`Header.tsx`.
Gate is already a ratchet. |
| `/checkout` | Cardcom iframe is **not** our JS. Our cost is the stepper + cart store (zustand persist). | Do not load admin form libs on checkout. |
| `/admin/*` | radix + react-hook-form + recharts + sonner | Acceptable. Must not leak into `(store)` layout. |
| `/search` | Results page + header field (ADR 0010) | No facet widgets. That is the performance feature. |
| `/product/[slug]` | Gallery + add to cart. R2 images, not JS. | Width params; AVIF via sharp 0.35. |
| Home | Electro rhythm, category grid, no 777 KB hero | Leave it. Pixel gate <11% at 380/768/1440 is the constraint, not TTI heroics. |

`@dnd-kit`
is not in the bundle today (zero imports). Do not "finish" drag-and-drop on the category tree without measuring.

---

## 3. Queries that lack indexes (actionable vs noise)

**Actionable now (shape, independent of traffic):**

1. `refunds(payment_id)`
2. `subscriptions(payment_token_id)`
3. Drop duplicate non-unique
   `rate_limits_key_idx`

**Noise until traffic:** 178 never-scanned indexes on empty money tables. Dropping them "to go faster" deletes the first-purchase indexes.

**Watch after week 1 of real charges:**
`vouchers`
(13 indexes),
`payment_events`,
`voucher_redemptions`
(IP lookups for fraud).

Guest cart is already healthy:
`carts_session_id_idx`
was hot on 2026-09-01 (33k scans) with almost no real buyers. That path is exercised.

---

## 4. Caching topology (so you do not add a fourth)

| Layer | Job | Not for |
|---|---|---|
| Next `'use cache'` + `CATALOGUE_TAG` | Public catalogue HTML/data | Session, cart, prices at **Pay** (Pay re-resolves agorot) |
| Browser / zustand persist | Cart | Server money |
| Upstash Redis | Rate limit | HTML |
| Upstash QStash | Index jobs | User requests |
| Meilisearch | Search documents | Source of truth (Postgres is) |
| R2 public base | Bytes of images | Auth |

Pay and redeem **must not** read a cached
`platform_percent`.
Snapshot is on
`order_items`.

---

## 5. Cron and quota (performance as availability)

Twelve jobs in
`scripts/cron-jobs.json`,
GitHub Actions, hitting
`https://kenyonexpress.vercel.app`.
Hobby Vercel cron is **not** used (silent 2-job cap).

Cheap reliability > micro-optimising the drain:

- Notifications every 5 min: voucher email SLA.
- Stranded payments every 10 min: charged-unfinalized.
- Expire vouchers 23:15: till truth.

If Actions quota dies, the site still renders and still charges; **email and stranded recovery stop**. That is a launch risk (
`docs/cursor/RISK-REGISTER.md`),
not an index problem.

---

## 6. What not to do

- Turn on
  `pg_stat_statements`
  drop-unused-index automation pre-launch.
- Add Redis cache "because Upstash is already there".
- Split the home bundle to chase Lighthouse 90 on a laptop.
- Fetch Meilisearch from the client with a master key.
- Compute money in SQL with
  `numeric`
  percents to "go faster". Conservation CHECKs are the point.

After cutover, the cheapest honest measurement is: one production trace of
`beginCheckout` → webhook → `finalizeOrder` → voucher row, with
`request_id`
(
`docs/cursor/OBSERVABILITY-MAP.md`).
If that chain is <2 s server-side, search ILIKE is a marketing problem, not a till problem.
