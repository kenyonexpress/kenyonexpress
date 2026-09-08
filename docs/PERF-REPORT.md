# Performance report

Measured 2026-09-08 against a production build (`pnpm build` + `pnpm start`)
on `localhost:3390`, commit `e8603d9e0`.

Read the caveat section before quoting any number here.

---

## 1. The four budgets

| Budget | Target | Measured | Verdict |
| --- | --- | --- | --- |
| Shared first-load JS | < 180 KB gz | **255.8 KB gz** | ❌ over by 42% |
| LCP | < 2.0 s | 1.2 s home, 0.9 s product, 1.2 s checkout | ✅ (see caveat) |
| CLS | < 0.05 | 0.011 home, 0.012 product, **0.357 `/cart`** | ❌ on `/cart` (see §4: this was misreported as checkout) |
| TTFB | < 200 ms | 10 ms | ✅ (see caveat) |

Two pass, two do not, and the two that fail fail for unrelated reasons.

---

## 2. Lighthouse, the three routes the step names

Desktop preset, headless Chrome, production build.

| Route | Perf | A11y | Best practices | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 97 | 96 | 96 | 100 | 1.2 s | 0.011 | 0 ms |
| `/product/<slug>` | 99 | 100 | 96 | 100 | 0.9 s | 0.012 | 0 ms |
| `/checkout` -> **actually `/cart`** | **80** | 100 | 96 | 69 | 1.2 s | **0.357** | 0 ms |

**That row is mislabelled and section 4 explains why:** an unseeded
`/checkout` redirects to `/cart`, so these are the cart's numbers. The SEO 69
is still not a defect - `robots.ts` disallows both routes and neither sets a
canonical, so Lighthouse is scoring a document it was never meant to score.

---

## 3. The bundle: 255.8 KB against a 180 KB target

Nine shared chunks:

```
    4.6 KB  static/chunks/04cftuypms-ym.js
   17.5 KB  static/chunks/325gupte89gew.js
    9.2 KB  static/chunks/06nvizxfh2jge.js
   28.0 KB  static/chunks/1-vuxjyw-1dw7.js
  130.1 KB  static/chunks/28u3rfooq48dn.js     <- half the budget in one chunk
   14.8 KB  static/chunks/36vf13lm6qy9h.js
    8.7 KB  static/chunks/22g-9uh_dj6hz.js
    4.2 KB  static/chunks/turbopack-1nx7bn1zaw2_h.js
   38.5 KB  static/chunks/0cz1d0mv5g_q7.js
```

The 130 KB chunk is 424 KB raw and carries 232 Sentry markers, so the browser
SDK dominates it.

**THE OBVIOUS LEVER IS ALREADY PULLED, and this is worth writing down so the
next person does not spend an afternoon on it.** Session replay is the usual
reason a Sentry browser bundle is large, and the natural assumption is that
`replaysSessionSampleRate: 0` disables it at runtime while still shipping the
code. Checked in the built chunk:

```
replayIntegration    0
rrweb                0
session-replay       0
maskAllText          0
blockAllMedia        0
```

Replay is not in the bundle. Neither is `browserTracingIntegration`. What is
left is Sentry core, and getting from 255.8 to 180 needs a real investigation
rather than a flag.

### Addendum, 2026-09-08: the Sentry bundle is currently pure cost

Measured against the deployed site rather than a local build — the 18 client
chunks `kenyonexpress.vercel.app` actually links from its homepage, 1,079,737
bytes downloaded and grepped:

```
sentry              305 markers
captureException      9
ingest.sentry.io      0     <- no DSN was baked in at build time
posthog               0
phc_                  0
```

So production **ships the whole Sentry browser SDK and gives it nowhere to
report.** This is the same measurement from the other side of the wire as the
Sentry finding in STATE.md: the project's issue stream holds 49 events over 90
days and every one is from `MacBook-Air.local`.

That reframes section 3 rather than contradicting it. The 130 KB chunk is
Sentry-dominated and the SDK is not removable by a flag — both still true. What
is new is that today the bundle pays for it and buys nothing. The fix is not to
strip the SDK, which would be the wrong lever the moment reporting is switched
on; it is to set the DSN, which `scripts/deploy-preflight.mjs` now refuses to
deploy without.

PostHog is absent from the bundle entirely, so there is no browser analytics
payload to weigh either way.

`scripts/bundle-gate.mjs` currently ratchets at 260 KB against a 255.6 KB
baseline taken 2026-09-02. Today's build is 255.8 KB - a 0.2 KB rise from the
CSS added for the 44px hit areas. The ratchet is doing its job; the gap to the
spec target is a known, tracked shortfall and not a regression.

---

## 4. CORRECTED 2026-09-08: the 0.357 is the CART's, not checkout's

**This section previously read "The one real defect: CLS 0.357 on checkout" and
hypothesised the shared header logo. Both halves were wrong.** It is left
rewritten rather than deleted, because the number reached
`docs/LAUNCH-READINESS-2026-09-08.md` as a high-severity launch risk and the
retraction has to be as findable as the claim.

### What actually happened

`src/app/(store)/checkout/page.tsx` line 109:

```ts
if (cart.items.length === 0) redirect('/cart')
```

`scripts/lighthouse-sweep.mjs` runs unseeded, so its cart is always empty.
Lighthouse followed the redirect and reported `/cart`'s metrics. The row was
filed under the name `checkout`, and I quoted it as checkout's.

Every number in the `/checkout` row of section 2 - perf 80, SEO 69, CLS 0.357 -
is `/cart`'s. The SEO 69 explanation still holds, because `robots.ts` disallows
both and neither sets a canonical; only the label was wrong.

### The mechanism I guessed was wrong too

I proposed the header logo: explicit `width={300} height={79}` plus
`h-handheld-logo-h w-auto`. The arithmetic refutes it - the intrinsic ratio is
300/79, so a CSS height of 79px with `w-auto` reproduces exactly 300x79 and
cannot shift.

### The real checkout CLS was already found and already fixed

`src/app/(store)/checkout/CheckoutShell.tsx` is the Suspense fallback, and its
docblock records the genuine defect: the fallback used to be the heading alone,
the footer painted under the `h1`, and the form pushed it ~700px down -
**measured at CLS 0.2190 on a seeded cart**. It now reserves the real boxes
using the real classes.

That docblock also names this exact trap, before I fell into it:

> it survived here because the CLS sweep visits `/checkout` with an EMPTY cart,
> which bounces to `/cart` and measures the cart under this route's name. The
> gate that found it seeds first.

`e2e/layout-stability.spec.ts` carries that gate. It adds a product through the
UI, then asserts the URL before the budget:

```ts
expect(page.url(), 'checkout bounced to the cart; the seed did not stick').toContain('/checkout')
expect(cls, `/checkout shifted ${cls.toFixed(4)}`).toBeLessThan(CLS_GOOD)   // 0.1
```

Not skipped. So the page where money changes hands has cover, and it is under
0.1.

### What is still open, stated narrowly

**`/cart` shifted 0.357 and that is a real number on a real page.** It is not
the money page, so it does not carry the severity the original entry claimed,
but it is seven times the budget on the last step before checkout. It has not
been re-measured here: doing so needs `pnpm build` plus Lighthouse, and a
parallel agent is holding uncommitted work in this checkout, where concurrent
builds are recorded as OOMing each other. Measuring `/cart` properly is the
next performance task.

### Fixed at the source

`scripts/lighthouse-sweep.mjs` now records `finalPath` and `redirected` on every
row, prints `-> MEASURED /cart, NOT /checkout` inline, and lists every bounced
route at the end. The sweep could not previously tell anyone which page it had
measured.

## 5. Caveats, so these numbers are not quoted as production truth

- **LCP and TTFB are localhost figures.** Lighthouse's LCP under Lantern is a
  simulation over a request graph, and on a loopback interface with no network
  latency it is optimistic. A previously measured real-world improvement of
  2.7 s once showed up here as noise. Treat 1.2 s as "not obviously bad", not
  as a field measurement.
- **TTFB of 10 ms is a warm local server.** It excludes DNS, TLS, the network,
  and cold-start on the edge. The 200 ms budget is a production budget and this
  number does not test it.
- **Desktop preset.** The mobile budgets in STEP 09 are a separate measurement.
- **These ran against the local build, not production.** Production is
  currently serving a build from before 2026-09-02 (see STATE.md), so its
  numbers would describe different code.

---

## 6. Query plans, measured 2026-09-08

This section previously read "not measured": `EXPLAIN ANALYZE` needs a database
connection, the Supabase MCP tool was disconnected, and `.env.local` carries a
stale key. The MCP tool reconnected, so the plans below are real, read from
production, read-only.

They were chosen by evidence rather than by guess. Sentry held six
`SupabaseTimeoutError: Supabase request exceeded 10000ms` issues; these are the
three distinct queries behind them.

| Query | Plan | Execution |
| --- | --- | --- |
| product by slug (`product_detail.read_failed`) | Index Scan `products_slug_key`, 2 buffers | **0.176 ms** |
| related products by category (`related_products.by_category_failed`) | Bitmap Index Scan `products_category_id_idx` -> sort, 15 buffers | **2.085 ms** |
| guest cart by session (`cart.row_read_failed`) | Index Scan `carts_session_id_idx`, 5 buffers | **2.051 ms** |

**Every one is an index scan in single-digit milliseconds. None of the three
timeouts was query cost.** All seven product-detail events landed inside a
thirteen-minute window on 2026-09-05 against `localhost:3311` — the port the
pixel gate runs `pnpm start` on — from a laptop in Bangkok reaching a database
in `eu-north-1`. That is the network path, not the plan.

So no index was added on performance grounds, which is what the "covering
indexes only if measured" rule exists to force. One migration was written this
pass, `178_carts_one_row_per_owner.sql`, and it is deliberately **not** a
performance change: it is a uniqueness constraint the application already
compensates for at runtime. It is in `migrations/pending/` and unapplied.

One honest footnote: planning cost is the same order as execution here
(planning 1.3-3.8 ms, reading 144-458 buffers, against 0.2-2.1 ms of execution).
On these three that is hidden behind `use cache`, so it is recorded rather than
acted on.

### Still not measured

The remaining seven of the "top ten" queries. The three above were picked
because Sentry named them; ranking the rest needs `pg_stat_statements` over a
period with real traffic, and production has none yet.
