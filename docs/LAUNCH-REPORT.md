# Launch readiness report

Swept 2026-08-12. Branch `feat/product-type` at `9fd3d0d`, built with `pnpm build`
and served with `PORT=3311 pnpm start`. Every row below that says *measured* was
taken off that running server or off the live database, not read out of source.

## Go / no-go

| # | Item | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Homepage deal links | GO, closed 2026-08-12 | 0 of 32 cards lead anywhere dead. Measured on the rebuilt server. |
| 2 | Sitemap URLs | GO | 86 URLs, all 200. Measured. |
| 3 | Internal links (off-sitemap) | GO | 23 distinct hrefs, 15 ok, 8 were #1 and are no longer emitted. |
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

**Verdict: no NO-GO left.** #1 closed 2026-08-12 (see below). Everything else is
either green or green-on-config with an environment gap that this machine cannot
close.

---

## 1. CLOSED: the homepage deal grid no longer offers a dead target

The homepage renders 32 deal cards from `src/lib/ke-live-deals-data.ts`, a
verbatim mirror of the old live site's deal grid. Its hrefs were live's, and
nothing ever checked that this catalogue answers them. Measured against
production, the grid held three separate dead ends at once, not one:

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

**Two more, found while closing this one.**

*Four dead category links, invisible to the 404 test.* Four cards carry
`category: general` and there is no `general` category. `/category/general`
answers **HTTP 200** and streams the not-found body, because the category
route's `notFound()` fires inside a Suspense boundary after the shell is
committed. The visitor lands on "הדף שחיפשתם לא נמצא"; the response line says
200. `home.spec.ts` "reaching the footer costs no 404s" watches statuses, so it
could never have reported these. One of the four, `אוזניות-איירפודס-3`, has a
perfectly good product link — counting dead product slugs alone missed it.

*All 32 add-to-cart buttons were dead.* The fixture carries fixture ids
(`ke-deal-9132`), not product uuids, and `addToCartSchema` validates
`product_id` as a uuid. Every button in the grid failed validation before it
reached the cart, on every card, including the 24 whose product is live.

### What was done

`src/lib/deal-targets.ts` resolves the fixture against the catalogue behind
`use cache` + `cacheTag(CATALOGUE_TAG)` — one query for the 32 slugs, one for
the 8 category slugs — and returns, per card: the real uuid, whether the
product page renders, whether the category page renders. `ProductDealCard`
renders a link only where there is something to link to, and the add-to-cart
button now carries the uuid, so it works.

**No card was dropped, and the pixel gate did not move: `home` measures 11.03%
before and after**, three runs, same server. A dead target loses its `href` and
keeps its box, its image and its price; `<span>` and `<a>` measure identically
here because every rule that paints the card is on `.p_con__*`, and the
disabled cart button keeps the grey circle (`.p_con .atc a, .p_con .atc button`
styles both). Dropping 8 of 32 cards would have taken the grid from 8 rows to 6
and blown the 11% rule, which is why the report's first option was not taken.

Measured on the rebuilt server: 0 links to the 8 dead slugs, 0 links to
`/category/general`, 32 cards still in the DOM, 23 working add-to-cart buttons,
8 disabled ones, 1 "צפה במוצר" fallback (`restaurants-meat-2`, which live shows
without a price).

**The data gap itself is untouched and still open.** The six `draft` rows are a
subset of the 19 that migration 113 waits on, and they are unpublishable from
here: both percentages are per product and the admin's to set, per the
dynamic-percentages rule. When those six are completed and the `general`
category exists, the cards relink themselves on the next catalogue write — the
resolution is cached under `CATALOGUE_TAG`, which every admin write path
already invalidates. Nothing needs to be edited here for that to happen.

A read that FAILS is not a dead link: if the catalogue cannot be reached, every
card keeps its links and only loses its cart button, which is exactly how the
grid behaved before. One unreachable Supabase at build time may not strip the
homepage of its links.

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
