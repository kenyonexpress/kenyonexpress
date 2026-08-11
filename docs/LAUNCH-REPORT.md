# Launch readiness report

Swept 2026-08-12. Branch `feat/product-type` at `9fd3d0d`, built with `pnpm build`
and served with `PORT=3311 pnpm start`. Every row below that says *measured* was
taken off that running server or off the live database, not read out of source.

## Go / no-go

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Homepage deal links | **NO-GO** | 8 of 32 deal cards answer 404 when clicked. Measured. |
| 2 | Sitemap URLs | GO | 86 URLs, all 200. Measured. |
| 3 | Internal links (off-sitemap) | GO, after #1 | 23 distinct hrefs, 15 ok, 8 broken — all 8 are #1. |
| 4 | robots.txt | GO | Live, absolute production origin, 12 sensitive paths disallowed. |
| 5 | 404 page | GO | HTTP 404, RTL, Hebrew, branded. |
| 6 | 500 pages | GO | `error.tsx` + `global-error.tsx`, both RTL Hebrew, `<html lang="he" dir="rtl">`. |
| 7 | Empty states | GO | Cart and zero-result search both render Hebrew copy. Measured. |
| 8 | Hebrew coverage | GO | No untranslated UI string found on 7 key pages. |
| 9 | Env vars vs `.env.example` | GO, after this sweep | One live defect found and fixed; 5 undocumented vars documented. |
| 10 | Sentry release + sourcemaps | GO on config, **UNVERIFIED** end to end | Config correct; no deploy could be run from here. |
| 11 | Uptime monitor | GO | 10 crons in `vercel.json`, health every 5 min, secret-gated. |
| 12 | Rollback runbook | **UNVERIFIED** | 780-line DR doc exists; untestable without a linked Vercel project. |
| 13 | Load test, 50 concurrent | GO on render, **UNVERIFIED** on payment | 1500 requests, 0 failures. Payment path not exercised. |
| 14 | Test suite / typecheck / lint / build | GO | 2341/2341, all clean, build compiles. |

**Verdict: NO-GO on one item (#1).** Everything else is either green or is
green-on-config with an environment gap that this machine cannot close.

---

## 1. NO-GO: eight homepage deal cards 404

The homepage renders 32 deal cards from `src/lib/ke-live-deals-data.ts`, a
verbatim mirror of the old live site's deal grid. Eight of those slugs have no
reachable product:

| Slug | State in production |
| --- | --- |
| `reverse-withdrawal-payment` | no such product; a bookkeeping row, not merchandise |
| `קופון-טסט` | no such product; a test coupon |
| `צימר-מאסטר-copy-copy` | `draft`, no supplier, no percents |
| `מלון-4-כוכבים-פלוס-ארוחת-בוקר` | `draft`, no supplier, no percents |
| `מלון-5-כוכבים-בטבריה` | `draft`, no supplier, no percents |
| `ארוחת-בוקר-זוגית-בקפה-קפה` | `draft`, no supplier, no percents |
| `עוזרת-אישית-שירותי-משרד` | `draft`, no supplier, no percents |
| `תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה` | `draft`, no supplier, no percents |

This is already known: `ProductDealCard.tsx` names all eight in a comment and
sets `prefetch={false}` on the links so the grid stops firing 404 server renders
on scroll. That fix addressed the *cost* of the dead links. It did not make them
not dead — a customer who clicks one still lands on the 404 page.

Six of the eight are `draft` with no `supplier_id` and no `platform_percent`,
which makes them a subset of the same 19 rows that migration 113 is waiting on.
They are unpublishable as they stand: the bulk-publish gate refuses them.

Nothing was changed here, on purpose. The grid is pixel-matched to
`refs/ke_live_singlefile.html` under a project rule, so removing cards is a
decision about that rule, not a bug fix. Two ways to close it:

- Import or complete the six draft products (supplier + both percents), and drop
  the two that are not merchandise from `KE_LIVE_DEALS`. Restores 30 of 32.
- Or filter `KE_LIVE_DEALS` at render time to slugs that resolve, accepting a
  grid shorter than live until the data lands.

---

## 2. Fixed during this sweep: wallet passes shipped with a blank origin

The env audit compared every key in `.env.example` against every identifier the
source actually reads. The first pass was wrong and was redone: env is threaded
through this codebase as `source: NodeJS.ProcessEnv` and read as `source.NAME`,
so grepping `process.env.NAME` missed most of it and produced a long list of
false "unused" keys.

The real finding: **`NEXT_PUBLIC_SITE_URL` is in no `.env.example`**, and two
files read it directly instead of going through `siteUrl()`, the helper the
other eight call sites use:

- `src/app/api/wallet/apple/[id]/route.ts` — `?? ''`
- `src/components/coupon/WalletButtons.tsx` — `?? ''`

Both feed `origin` into the Apple and Google pass builders. Unset — which it is,
because nothing documents it — the origin is the empty string. Google compares
`origins` as an exact string, so the Save-to-Wallet link is misconfigured rather
than missing, and the Apple pass carries a blank origin. Both fail as a *wrong*
value, which is why no error surfaced anywhere.

Both now read `siteUrl()`, which resolves `NEXT_PUBLIC_APP_URL` (documented) and
falls back to the production origin. `NEXT_PUBLIC_SITE_URL` has no references
left, and `.env.example` says not to reintroduce it.

Five further vars were read by non-test runtime code and documented nowhere.
They are now in `.env.example`, with `CARDCOM_USE_MOCK` flagged as the dangerous
one: `true` in production means no real invoice is ever issued.

`CARDCOM_USE_MOCK`, `CARDCOM_PLATFORM_LABEL`, `INVOICE_VAT_PERCENT`,
`HEALTH_NTFY_TOPIC`, `LOG_LEVEL`.

No documented key is unused: everything in `.env.example` is read by `src/`,
`scripts/`, `next.config.ts` or a `sentry.*.config.ts`.

---

## 3. Measured results

### Links

```
PASS 1 — 86 sitemap URLs        ok 86   broken 0
PASS 2 — 23 internal hrefs      ok 15   broken 8   (all 8 are section 1)
REDIRECTS                       3, all correct auth gates:
  307  /suppliers      -> /login?next=%2Fsuppliers
  307  /account        -> /login?next=%2Faccount
  307  /account/orders -> /login?next=%2Faccount%2Forders
```

Both passes issue GET, not HEAD: a Next route can answer HEAD from a different
code path, and GET is what a crawler and a customer both do.

### Load, 50 concurrent

`ab -n 500 -c 50` against the production build on localhost.

| Route | req/s | p50 | p95 | p99 | Failed |
| --- | --- | --- | --- | --- | --- |
| `/` | 105.7 | 453 ms | 598 ms | 654 ms | 0 |
| `/products` | 148.1 | 312 ms | 461 ms | 475 ms | 0 |
| `/checkout` | 131.1 | 324 ms | 545 ms | 1210 ms | 0 |

**These numbers do not clear the checkout for launch.** They measure page render
on one laptop. The payment path was not exercised: the local
`SUPABASE_SECRET_KEY` is the stock local-dev demo key that the hosted project
rejects, so every admin-client path (guest cart, checkout address write, wallet
balance) fails locally, and no Cardcom call was made. A real checkout load test
needs a preview deploy with working credentials and Cardcom in sandbox.

### Empty states and Hebrew

| Surface | Rendered |
| --- | --- |
| Empty cart | `סל הקניות שלך ריק כרגע` |
| Search, 0 results | `לא נמצאו מוצרים עבור "…". נסו מילת חיפוש` |
| 404 | `הדף שחיפשתם לא נמצא` |

Scanning visible text on `/`, `/products`, `/cart`, `/checkout`, `/search`,
`/faq` and `/contact` for English turned up only `American Express` and
`Google Analytics` (brand names) and product/supplier names that are English in
the data. No untranslated UI string.

`/search` answers in 0.8 s with and without a query, and 0.98 s for a
URL-encoded Hebrew query. An earlier reading of "3 minutes, hung" was a bad
regex in the measuring shell pipeline, not the server.

### Observability

Sentry is wired on all three runtimes — `sentry.server.config.ts`,
`sentry.edge.config.ts`, `instrumentation-client.ts` — each with DSN,
environment and release, server and edge falling back to
`VERCEL_GIT_COMMIT_SHA`. `next.config.ts` uploads sourcemaps with
`deleteSourcemapsAfterUpload: true`, so a `.map` is never served publicly, and
tunnels the browser SDK through `/monitoring` so ad blockers cannot drop reports.

Config is correct. It is marked UNVERIFIED because confirming a release actually
appears in Sentry requires a deploy, and no deploy could be run from here.

`vercel.json` declares 10 crons, including `/api/cron/health` every 5 minutes.
The endpoint is `CRON_SECRET`-gated (401 without), and the health check itself
asserts the secret is set, with the Hebrew failure text
`אין CRON_SECRET; כל ה-cron מחזיר 401 ואף תור לא מתנקז`.

---

## 4. What could not be tested here, and why

**Vercel is not linked to this working copy.** No `.vercel/project.json`, no
`VERCEL_TOKEN`, and `vercel login` is interactive. The CLI itself is reachable
(`pnpm dlx vercel@latest`, 58.9.0). Until someone runs `vercel login && vercel
link`, three things stay unverified: the deploy itself, the Sentry release
upload, and the rollback runbook. The DR doc is 780 lines and describes the
procedure; a runbook nobody has executed is a plan, not a tested rollback, and
this report will not claim otherwise.

**Migration 113 is still pending** from the previous goal, and 19 physical
products still carry no percentages. Six of them are the draft products in
section 1.

---

## 5. Suggested order

1. Close section 1. It is the only NO-GO and it is on the homepage.
2. `vercel login && vercel link`, then deploy to preview.
3. Against that preview: confirm the Sentry release lands, run the checkout load
   test with real credentials and Cardcom sandbox, and execute the rollback
   runbook once so row 12 can move off UNVERIFIED.
4. Repair the 19 products, then apply 113 and validate it.
