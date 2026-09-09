# Performance, re-measured

Section 62 of `~/ke-goals/SECTIONS.md`. Measured 2026-09-09 against the build at
`b8aac3855` and against production's database.

Reproduce:

```
pnpm build && PORT=3319 pnpm start &
LOCAL_BASE=http://localhost:3319 node scripts/bundle-report.mjs
```

## 1. First-load JavaScript per route

`next build` under Turbopack no longer prints a "First Load JS" column and
writes no `app-build-manifest.json` to derive one from: the route table has 118
rows and not one byte count. `scripts/bundle-report.mjs` fetches each route,
reads every `<script src>` the HTML actually references, and adds up the bytes
on disk. That is closer to what matters anyway - what a browser downloads,
rather than what a bundler believes it grouped.

| route | chunks | raw | gzipped | HTML |
| --- | --- | --- | --- | --- |
| `/` | 20 | 1268.6 kB | **382.2 kB** | 578.8 kB |
| `/products` | 20 | 1262.2 kB | 380.4 kB | 213.6 kB |
| `/category/hot-deals` | 20 | 1265.2 kB | 381.3 kB | 130.1 kB |
| `/cart` | 20 | 1258.9 kB | 378.8 kB | 80.1 kB |
| `/checkout` | 22 | 1277.4 kB | **384.7 kB** | 86.9 kB |
| `/faq` | 19 | 1248.9 kB | 375.5 kB | 101.3 kB |
| `/account` | - | 307 to `/login` | | |
| `/admin/products` | - | 307 to `/login` | | |

26 distinct chunks, 405.5 kB gzipped in total across the eight routes.

**A measurement trap found while building the script.** With
`redirect: 'follow'`, `/account` and `/admin/products` both came back at exactly
290.2 kB with 16 chunks - the login page's number, twice, wearing two other
routes' labels. The script now uses `redirect: 'manual'` and reports the
redirect. Anything that measures a route behind authentication without saying so
is measuring the login page.

### The largest offenders

| gzipped | chunk | what is in it |
| --- | --- | --- |
| **131.9 kB** | `3ohg_tgqdyy_u.js` | Sentry (232 matches, 439 kB raw) |
| 63.0 kB | `1a_s_mjslntc0.js` | supabase-js (105 matches) |
| 38.5 kB | `0cz1d0mv5g_q7.js` | framework |
| 34.2 kB | `3d9b8_43nxuxw.js` | framework |

**Sentry is 34% of the first-load JavaScript on every route**, and it is not
being changed here. Its size was already measured and deliberately chosen, and
the note in `next.config.ts` records both the numbers and the trap:

- `withSentryConfig({ webpack: { treeshake } })` is inert under Turbopack -
  measured at 1,801,237 bytes of client JS with it on and 1,801,237 with it off.
- `compiler.define` does reach `node_modules`: `__SENTRY_DEBUG__: false` is
  worth 5,471 bytes and is set.
- `__SENTRY_TRACING__: false` was worth **53,322 bytes** and was **removed on
  purpose**, because it is a bundler constant: with it set, the span code is
  deleted at build time, the SDK reads `tracesSampleRate: 0.1`, reports no
  error, and emits no transaction. A config that looks enabled and is not.

Lazy-loading Sentry after hydration would move those 131.9 kB off the critical
path and lose what `instrumentation-client.ts` exists for: it runs **before
React hydrates**, which is what lets it catch an error thrown during hydration -
the class of bug that otherwise shows a blank page and reports nothing. That is
a trade for somebody to make deliberately, not a defect to fix quietly.

## 2. The homepage document

612,024 bytes raw, **55,894 bytes gzipped**. Composition:

| share | bytes | what |
| --- | --- | --- |
| 48.8% | 289,341 | inline `<script>`, almost all the RSC flight payload |
| 14.0% | 83,034 | inline `<svg>` |
| 14.0% | 82,697 | `/_next/image` URLs |
| 12.9% | 76,733 | `srcSet` attributes |
| 10.8% | 64,311 | `class` attributes |

85 `<img>` elements and 21 script tags.

### The finding that looked like 55 kB and is 1.1 kB

103 inline `<svg>` elements, **26 distinct**. One of them - the cart-plus icon
on the product cards - appears **64 times at 995 bytes each: 63,680 bytes, 10.7%
of the document.**

The obvious fix is one `<symbol>` and 64 `<use href="#i-cart-plus">`. Measured
rather than assumed:

```
raw    612,024 -> 556,891   saved 55,133 B  (9.0%)
gzip    55,285 ->  54,174   saved  1,111 B  (2.0%)
```

**Gzip already deduplicates the repeated string.** The 55 kB is 1.1 kB over the
wire. The change is not made: it is a real but small saving in parse time and
DOM nodes, against editing the markup of the one page whose fidelity was a gate
and which `scripts/compare.mjs` can no longer measure (exit 5 - see
`docs/REFS-POLICY.md`). Recorded so the next person does not spend a day on it
expecting 55 kB.

## 3. Images

Already audited, and the audit holds:

- `priority` appears on exactly two paths, both LCP elements: the first hero
  slide (`HeroSlider`) and the first product image (`ProductGallery`), each with
  a comment recording the measurement that justified it.
- `HeroSlider` renders two art-directed boxes, one per breakpoint, and
  deliberately marks **only the visible one** `priority` - a `hidden` box with
  `priority` is a high-priority fetch of an image nobody sees.
- The animated hero is fetched at **low** priority after `window` load, with a
  still frame as the real first paint.

No defect found. Recorded because "no defect" is only worth anything when
somebody looked.

## 4. Fonts

Heebo through `next/font/google`, so self-hosted: no Google Fonts origin, and
the CSP does not need one.

- `subsets: ['latin', 'hebrew']`
- `display: 'swap'`
- `preload: false`, **deliberately** - the LCP paragraph renders in Arial on
  purpose, and preloading Heebo onto that path competes with the LCP image.

Zero `<link rel="preload" as="font">` in the served homepage, which is what that
setting should produce.

## 5. Third-party scripts

**There are none.** The served homepage references 21 scripts and every one is
same-origin `/_next/static/...`. The only external `<link>` host is
`kenyonexpress.co.il` itself. Sentry, Vercel Analytics and Speed Insights are
bundled rather than loaded from a third-party origin.

One stylesheet, which is the result of an earlier decision recorded in
`next.config.ts`: three small route stylesheets were moved into the root layout
so the browser makes one CSS request instead of four. `experimental.inlineCss`
was tried for the same audit and **reverted on measurement** - the document went
from 267,631 to 542,125 bytes because the styles are emitted twice, and TTFB
went from 360-460 ms to 1,140-4,930 ms.

## 6. The database

### There is no slow query

`pg_stat_statements`, since 2026-07-16. The top consumers of database time:

| total | calls | mean | what |
| --- | --- | --- | --- |
| 270,194 ms | 384 | 703.6 ms | PostgREST's schema-cache introspection |
| 143,194 ms | 283 | 506.0 ms | `SELECT name FROM pg_timezone_names` (the same reload) |
| 38,615 ms | 128 | 301.7 ms | `pg_available_extensions` (Studio) |
| 20,804 ms | 576,294 | **0.04 ms** | PostgREST's per-request `set_config` preamble |
| 8,097 ms | 3,249 | 2.49 ms | the rate-limit RPC |
| 4,691 ms | 1,150 | 4.08 ms | a per-product RPC |

**Roughly 430 seconds of the total is PostgREST reloading its schema cache**, at
283 to 384 events. Every DDL statement triggers it, which includes every
migration - and every rolled-back `DO` block used to probe one, this session's
included. It is not an application problem and it is not free.

**Not one application query has a mean above 10 ms.** [62] asks for `EXPLAIN` on
the twenty slowest; there are not twenty slow ones. The storefront's reads are
behind `use cache`, the catalogue is 44 rows, and the largest application
statements in the whole history are one-off admin and probe statements from
development sessions at 80-230 ms each, run once.

### The indexes are the finding

| | |
| --- | --- |
| tables | 91 |
| indexes | 390 |
| never scanned since 16.07 | **253 (65%)** |
| whole database | 9,856 kB |
| of which indexes | **5,920 kB (60%)** |
| of which never scanned | 3,168 kB |
| sequential scans | 902,672 |
| index scans | 645,867 |

**253 unused indexes is not a finding and nothing is dropped for being unused.**
At 44 rows Postgres will not use an index at all, because scanning one page is
cheaper, so "never scanned" here mostly means "the query that would use it has
never run". Dropping on that basis is optimising for a scale the business is
trying to leave.

**Redundancy is the finding, and it is wrong at every scale.** An index on `(a)`
buys nothing beside an index on `(a, b)`: a B-tree is scannable on any prefix of
its key, so the composite serves every query the narrow one serves, while the
narrow one costs a write on every insert and planning time on every query.
Fourteen such pairs exist. `migrations/pending/208_drop_redundant_indexes.sql`
drops them, **written and not applied**.

Two look backwards on the scan counts and are correct anyway:

```
products_status_idx      (status)          55,593 scans   <- dropped
carts_session_id_idx     (session_id)      49,714 scans   <- dropped
```

The planner used the narrow index because it existed, not because nothing else
could serve the query. Verified by dropping all fifteen inside a rolled-back
transaction with `enable_seqscan = off` and re-reading `EXPLAIN`:

```
products.status = 'active'  ->  idx_products_published
carts.session_id = ...      ->  carts_session_profile_idx
orders.user_id = ...        ->  idx_orders_user_status
vouchers.order_item_id      ->  vouchers_order_item_issued_idx
```

**The first is not what the pair-wise analysis predicted.** `products` carries
four status-leading or status-filtered indexes, and with the plain one gone the
planner takes the **partial** index `idx_products_published`
(`(published_at DESC) WHERE status = 'active'`), which matches the predicate
exactly and is smaller than the composite. A better answer than the file was
written expecting, and the only way to know was to drop it and look.

**The probe also caught a defect in itself.** Its first run used
`user_id = gen_random_uuid()` and reported a sequential scan on `orders`.
`gen_random_uuid()` is VOLATILE, so no index scan is possible against it: the
schema was fine and the test was wrong. A less suspicious reading would have
kept an index on the strength of it.

## Before and after

Nothing in this pass changed a byte of what a visitor downloads, and that is the
honest summary. Every candidate was measured and each was rejected for a stated
reason:

| candidate | measured | verdict |
| --- | --- | --- |
| Lazy-load Sentry | 131.9 kB gzipped, 34% of first load | Rejected: loses pre-hydration error capture |
| Sentry tree-shake flags | inert under Turbopack, 0 bytes | Already known, already recorded |
| `__SENTRY_TRACING__: false` | 53,322 bytes | Rejected: silently disables the sampling that is configured |
| SVG `<symbol>` on the homepage | 55,133 B raw, **1,111 B gzipped** | Rejected: 2% of the wire cost for a change to measured markup |
| `experimental.inlineCss` | TTFB 360 ms to 4,930 ms | Rejected earlier, recorded here |
| Drop 253 unused indexes | 3,168 kB | Rejected: unused at 44 rows means untested, not useless |
| Drop 14 redundant indexes | verified by `EXPLAIN` | **Accepted**, written as 208, not applied |

What this pass produced is `scripts/bundle-report.mjs`, so the first number is
reproducible, and a set of numbers to compare the next one against.

---

## 7. SECTIONS 36 (PERFORMANCE-SEO), measured 2026-09-10

Sections 1-6 above were written for SECTIONS 62 on 2026-09-09. This section
covers what SECTIONS 36 asks for that they did not, and every line is command
output or a browser reading, against `pnpm start` on a **freshly built** server
on a free port.

### 7.1 Lighthouse, three routes, today

`node scripts/lighthouse-smoke.mjs`, default (simulated) throttling:

| route | performance | accessibility | SEO |
|---|---|---|---|
| `/` | 84 | **100** | **100** |
| `/product/צימר-מאסטר` | 83 | **100** | **100** |
| `/products` | **95** | **100** | **100** |

**Accessibility 100 and SEO 100 on all three**, which are deterministic audits
and are the part of "90+" this section can actually assert.

The performance column is Lantern, and `docs/PERFORMANCE-BUDGET.md` section 2
already settles what it is worth here: the same build measured with
`--throttling-method=provided` scored 100 with LCP 0.2s, and the simulated
number is a model being asked to extrapolate from a machine that is
simultaneously building, serving and measuring. It moved from 70-75 on
2026-09-06 to 83-95 today, which is the right direction and is not evidence of
anything on its own.

**The section's "~3s LCP" is therefore NOT claimed here.** A localhost Lantern
LCP is not a field LCP, and asserting one would be exactly the sort of number
that reads as measured and is not. The only honest source is field data, and
Vercel Speed Insights is wired (section 5) into a deployment that is currently
serving nothing to Sentry either.

### 7.2 The SEO markup, read out of the served HTML

Not from the builders, from the page. `/product/צימר-מאסטר`:

| claim | reading |
|---|---|
| `Product` JSON-LD | present, parseable |
| `BreadcrumbList` JSON-LD | present |
| `AggregateRating` | **absent, and correct** - the builder refuses to publish a rating over zero approved reviews, and this product has none |
| canonical | present, absolute, points at its own slug |
| `meta robots` | absent, so indexable |
| images | 9; the LCP image gets `<link rel="preload" as="image" imageSrcSet=...>` in the head, the 7 below the fold are `loading="lazy"` |

**A false finding, caught before it was written down.** Six of the nine images
carry no `width`/`height`, and the LCP image carries no `fetchpriority="high"`
even though `ProductGallery.tsx` sets `priority` and its comment says that
emits exactly that attribute. Both looked like real CLS and LCP defects.

Neither is. The six are `next/image` with `fill`, whose parents carry
`aspect-ratio: 1 / 1` and `position: relative`, so the box is reserved and
there is no shift. And `priority` in this Next version expresses itself as the
head preload above rather than as an attribute on the `<img>` - the
optimisation is applied, only the comment's description of HOW is out of date.
Reading the rendered DOM is what separated the two.

### 7.3 What now guards it

`e2e/seo-markup.spec.ts`. The builders were already unit-tested and nothing
proved the page renders them: deleting the `jsonLdScript` line from the product
page would have left every unit test green and every rich result gone. That is
the third time this shape turned up today, after the 170 reporting layer and
`fn_pay_referral`.

The `noindex` direction is the one with teeth and is asserted separately: a
missing `Product` block costs a rich result, a missing `noindex` on
`/redeem/<token>` puts a live voucher URL into a search index.

Five tests, all passing against a fresh build.
