# KenyonExpress: final report

Rewritten 2026-09-01. The previous version was written 2026-08-31 and its
headline claim, "**NOTHING HAS EVER DEPLOYED**", stopped being true a few hours
later. It is corrected below rather than quietly edited, because the reason it
was true and the reason it stopped being true are both worth keeping.

`main` is still not the mainline. It is roughly 300 commits behind and
**`phase5/homepage` is the branch this project lives on.** Branching off `main`,
or reading it to see what the product does, silently reverts every piece of
security work done since. See item 4.

Every number below was measured. Where a measurement has a date on it, that is
the date it was taken, and nothing is quoted from an earlier session without one.

---

## The one-line version

**The site is live in production and serving the real catalogue.** The code is
done and nothing that remains is code. Four things are left, all four need a
human with credentials, and none of them can be done from this machine:

1. The ten scheduled jobs, at cron-job.org.
2. A Cardcom production terminal.
3. The DNS cutover of `kenyonexpress.co.il`.
4. Merging PR #6, which is what moves `main` to the mainline.

To go live on the real domain, follow `docs/LAUNCH-RUNBOOK.md`. It is the
ordered, command-by-command procedure with a rollback beside every step. This
document is what is left and why; that one is what to do.

---

## Production, measured 2026-09-01

```
https://kenyonexpress.vercel.app/                200
/products                                        200
/sitemap.xml                                     200
/robots.txt                                      200
/api/health          {"ok":true,"database":"ok","latency_ms":307}
/api/cron/health     401 unauthenticated
```

Read the 401 as a pass. It proves `CRON_SECRET` is set on the deployment and
that the ten cron routes are closed to the internet. All ten answer 401 to an
unauthenticated GET; the value itself is not written in this repository.

`/api/health` reports three fields and no more, on purpose: it is public, so it
names no dependency and echoes no database error string. The detailed report
(`runHealthChecks`, with the rate limiter, Cardcom and mail) sits behind
`/api/cron/health` and the Bearer header.

Also verified live on that deployment: `/category/vacation`, `/cart`,
`/search?q=מסעדה` and `/terms-and-conditions` all 200, and
`/product/מלון-5-כוכבים-בטבריה` 200, which is one of the nineteen products
migration 128 published. That last one is the load-bearing check: it means the
**real** catalogue is being served in production, not the demo seed.
`/account/referrals` answers 307 to the login page, which is correct.

### Why it had never deployed, and what fixed it

The eleven earlier deployments all failed for two stacked reasons, and the
second one hid behind the first:

1. The Vercel project's Git connection pointed at a **different repository**
   (`kenyonexpress-web`) on branches nobody works on, so no commit from
   `phase5/homepage` was ever built.
2. Once that was repointed, the build still failed: **`.vercelignore` was
   deleting `src/lib/supabase` from every deployment.** That is a file the whole
   server depends on, and the symptom was a module-not-found error that looks
   like a code bug and is not one. Fixed in `a7b3c4c73`.

Neither was visible from a green local build, which is the general lesson: a
build that passes here says nothing about what Vercel is given to build.

---

## Gate status, measured 2026-08-31

Not re-run for this document. Only documentation and `.env.example` comments
have changed since, and neither is scanned by any of these gates.

| Gate | Result |
| --- | --- |
| `pnpm test` (Vitest) | **3126 / 3126**, 243 files |
| `pnpm type-check` | clean |
| `pnpm lint` (biome) | clean, 1005 files |
| `pnpm build` | exit 0 from an empty `.next` |
| `pnpm exec playwright test` | **393 passed**, 6 skipped |
| `compare.mjs --page=home` | **9.83%** (gate: under 11%) |
| `compare.mjs --page=cart` | **8.6%** |
| `compare.mjs --page=checkout` | **9.72%** |
| `compare.mjs --page=category` | **6.18%** |
| `compare.mjs --page=search` | **14.31%** (over the gate) |
| `compare.mjs --page=product` | **15.45%** (over the gate) |
| `compare.mjs --page=products` | **26.94%** (over the gate) |

`pnpm build` is a **separate gate** from the other three, not a formality:
`cacheComponents` rejects uncached page reads that tests, type-check and lint
all pass.

E2E must run against a production build. A bare `playwright test` starts
`pnpm dev` and fabricates failures that do not exist in a real build. Either
`E2E_WEB_COMMAND='pnpm start' pnpm exec playwright test`, or start the server
yourself and pass `E2E_BASE_URL`. **If you use `E2E_BASE_URL`, Playwright does
not start the server and therefore does not apply its own env block**, so
`CARDCOM_USE_MOCK=true`, `CARDCOM_WEBHOOK_SECRET` and `CHECKOUT_ENABLED=true`
have to be passed to the server by hand or the paid-flow specs fail for
environmental reasons.

### The three pages still above the pixel gate, and why only one is a defect

Migration 128 moved these substantially: `category` went from "live 2 cards,
local 12" to **2 against 2**, and `products` from **7 of 24** matching grid
slots to **17 of 24**. `category` crossed the gate at 6.18%.

- **`products` 26.94%** and **`search` 14.31%** are content, not fidelity, and
  `compare.mjs` says so itself: it refuses to score a grid whose two sides hold
  different products, because such a number "is a content difference wearing a
  fidelity number". `products` matches 17 of 24 slots and the two pages are
  different heights (3730 against 3253); `search` returns 5 results live and 3
  locally for the same word. Which products sit where is curation, not CSS.
- **`product` 15.45%** is the real one. Both sides render the same product,
  verified by reading the `<h1>` on each. Our gallery runs taller and pushes
  everything below it down, and we additionally show a `-49%` badge, a share row
  and "hot deal / physical" chips that the live page has not. Part of that gap
  is deliberate, including the two buttons that stay by decision.

No CSS was changed to chase these. The instruction was to fix fidelity and not
content, and in two of the three the difference is content.

---

## What is left, and all four are yours

### 1. The ten scheduled jobs, at cron-job.org

**Nothing is scheduled right now.** The routes are deployed and guarded, and no
scheduler is calling them. That is the single highest-value item on this list,
because `notifications` is the only path by which a customer ever receives their
voucher, and `invoices`, `reconcile` and `stranded-payments` are on the money
path.

They are no longer in `vercel.json`. Vercel's cron allowance is a plan feature
(two jobs, daily granularity, on Hobby), and declaring ten neither failed the
build nor warned: the platform ran what the plan covered and silently ignored
the rest. "Silently not scheduled" is not an acceptable state for any of those
four, so the schedule moved somewhere it can be seen.

`docs/CRON-EXTERNAL.md` has all ten as paste-ready lines (URL, method, schedule,
header), the schedules unchanged from what `vercel.json` carried, and the
cron-job.org setup step by step. Budget twenty minutes.

### 2. Cardcom, production terminal

Call **03-9436100** and ask for a production terminal, then set
`CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` and
`CARDCOM_WEBHOOK_SECRET` in Vercel Production.

Until then no money can move, and three jobs above are running against an
unconfigured provider. That is handled deliberately rather than as an error: a
run that finds the provider unconfigured changes nothing, counts no attempt and
applies no backoff, so the invoice queue does not eat itself while waiting for a
key.

Two facts about this integration that contradict the architecture document, and
the code is the authority:

- The live client is the **legacy `/Interface/*.aspx` API**, not v11 JSON, by a
  decision taken 2026-07-23. `docs/CARDCOM-ARCHITECTURE.md` describes v11, so
  the endpoint names there are not the ones the code calls.
- **Cardcom does not sign its webhooks.** There is no HMAC and no signature
  header. Authenticity rests on the unguessable `?s=` secret in the IndicatorUrl
  plus mandatory server-to-server re-verification through `GetLpResult`, which
  is the only trusted source of amount, status and token.

Then do step 5 of the runbook: one real payment with a real card, on the
`vercel.app` URL, **before** the domain moves. Refund it afterwards from the
Cardcom dashboard.

**⚠️ `CARDCOM_USE_MOCK` must never be set in production.** It makes payments
succeed without a card being charged.

### 3. The DNS cutover

`kenyonexpress.co.il` serves 200 today through Cloudflare and what it serves is
still the **old WordPress site**. Measured 2026-09-01:

```
kenyonexpress.co.il      A     104.21.55.125, 172.67.148.28   (Proxied)
kenyonexpress.co.il      AAAA  2606:4700:3035::6815:377d, 2606:4700:3036::ac43:941c
www.kenyonexpress.co.il  same four
NS   derek.ns.cloudflare.com, elma.ns.cloudflare.com
```

So this is not "DNS is unconfigured". It is a cutover, it is the one step in the
launch that is not reversible in seconds, and it is step 7 of the runbook for
exactly that reason. `docs/LAUNCH-RUNBOOK.md` section 7 has the record-by-record
surgery, the four AAAA that must be deleted, the mail records that must not be
touched, and the rollback that restores the state above.

**Do the R2 image work first.** All 32 product images are still served by the
WordPress install at `kenyonexpress.co.il`, so they 404 the moment the record
moves. That is now a live-site consequence rather than a hypothetical.

Lower the TTL to 2 minutes the day before, not on the day.

### 4. Merge PR #6

<https://github.com/kenyonexpress/kenyonexpress/pull/6>

Open as a **draft**, `phase5/homepage` into `main`, **MERGEABLE**, +53,478 /
-2,717. Its title names one docs commit and its content is the entire mainline.

This is what makes `main` mean something again. Until it merges, the default
branch on GitHub describes a product that does not exist, and every convention
that reaches for the default branch (a fresh clone, a CI default, anybody
reading the repo for the first time) gets the wrong one. Mark it ready for
review and merge it.

---

## Also open, but none of these block the launch

### Resend

<https://resend.com/domains/8cbce0e7-2334-40dc-aba6-fce92e80371f>

Copy the three DNS records into Cloudflare, then press **Verify**. Do it early:
until the domain verifies, every transactional mail is refused, which means no
buyer receives their voucher. Propagation is not instant and it cannot be done
during the cutover.

### Supabase

- **Authentication > Sign In / Providers > Email**: turn on **"Prevent use of
  leaked passwords"**. It is a dashboard toggle, not DDL, and there is no API
  for it. It is currently off.

### Five suppliers with no details own the real catalogue

| Supplier | Real active products |
| --- | --- |
| ביוטי לאב | 8 |
| ספורט מקס | 6 |
| טעמים גורמה | 6 |
| טק וורלד | 4 |
| סטייל הבית | 3 |

All five have null `city`, `contact_phone`, `address` and `logo_url`, and all
five are seed rows: none of their names appears anywhere on the live site. There
is nothing to backfill them from, and inventing details for five businesses is
not something a migration should do. Either fill them in the admin, or reassign
those 27 products to a supplier that is real.

The nineteen imported products were assigned to a single new supplier row,
**קניון אקספרס**, because that is what three independent checks say: every
product in the WordPress export is authored by the site admin,
`_dokan_vendor_id` appears only on orders and never on a product, and the only
`/store/` links on a live product page sit inside the vendor registration form.
Its `address` and `city` are NULL on purpose, because the live site publishes no
postal address on any page. **Setting that address is a launch task.**

### Data

- **11 suppliers, all 11 with no address and no logo.** They are seed rows.
- **The homepage deal grid: 30 of 32 links resolve** after 128. The remaining
  two have no product row at all: `reverse-withdrawal-payment` (the Dokan admin
  product, deliberately excluded from the import) and `קופון-טסט`.
- `/about` has no content.
- **The legal pages need a lawyer's approval.** The framework is built and the
  duplication is resolved: the better-sourced text (Amendment 13, the no-Escrow
  coupon model, sections 14ג and 14ח) now serves at `/terms-and-conditions`,
  `/privacy-policy`, `/refund_returns` and `/accessibility`, and `/legal/*` 308s
  onto those. `noindex` is gone because there is no longer a second set to hide.
  What remains is counsel signing the wording; each document carries a visible
  "not yet reviewed by a lawyer" line until they do.

### Load testing

The full 200-VU L1 profile has never been run here and needs a machine that is
not this laptop.

---

## Migrations: what is applied and what is not

**128 is applied.** `supabase/migrations/128_wp_publish.sql` went to production
on 2026-08-31 through MCP `apply_migration`, after a `BEGIN`/`ROLLBACK` dry run
whose counts matched its verification block exactly. Measured after:

```
active_total 46   active_picsum 0        active_no_supplier 0
active_no_rate 0  active_no_category 0   demo_active 0
coupons_no_price 0                       imported_active 19
suppliers: 6 active, 6 closed
```

Nineteen imported WordPress products published with a supplier, a category and
commercial terms; 34 demo products moved to `draft` and never deleted, because
four orders reference them.

Two things it settled that were not obvious going in. The "four coupons with no
price" were not a guess: four *live* products carried `is_coupon_enabled` with
`coupon_price_ils` NULL, which `buildCouponOffer` already models as unsellable,
so four things on the site said "coupon" and could not be bought. Three took the
live page's price. The fourth, `restaurants-meat-2`, deliberately got none: its
live card shows no price and its stored price is `0.00`, and writing
`coupon_price_ils = 0` would have made a coupon that is free to buy.

**127 is applied**, and the order it required was honoured. It revokes `EXECUTE`
on `check_rate_limit` from `anon` and `authenticated`, and both limiters fail
open to `return true`, so the code that calls it on the service key had to be
live in production **first**. It was applied after the deployment answered 200,
and the hole was then proven closed by a real call rather than by reading the
grants.

**059 is still deliberately NOT applied**, reaffirmed 2026-07-31 with the
evidence, so production remains the pre-059 lineage: numeric `*_ils` columns,
not integer `*_agorot`. Code that names the wrong generation raises 42703 and
takes down the whole statement rather than failing partially. The probe in
`src/lib/commerce/order-money-columns.ts` is how the order path stays correct on
either lineage, and new code on that path must use it.

**129 is applied.** `supabase/migrations/129_catalogue_cleanup.sql` went to
production on 2026-09-01 through MCP `apply_migration`, after a `BEGIN`/`ROLLBACK`
dry run whose counts matched its verification block exactly. Measured after:
`active 45, zero_priced 0, no_supplier 0, no_category 0, picsum 0`, and the
platform supplier's logo set. It drafts the product priced at zero and says in
the file what it will not invent. It was moved out of `migrations/pending/` when
it landed, because that directory means "not run anywhere" and
`pending-migrations-inventory.test.ts` fails on an applied file left in it.

Everything else waiting is in `migrations/pending/` and that directory's README.
There are **two** pending locations: `migrations/pending/`, and three
`PENDING-`-prefixed files still sitting in `supabase/migrations/`
(`PENDING-109-recurring-subscriptions.sql`, `PENDING-110-supplier-coordinates.sql`,
`PENDING-money-integer-fix.sql`). Read both before concluding the schema is
settled.

---

## Environment variables

`.env.example` is the full table, with a read site and a source named on every
variable. It was regenerated against HEAD on 2026-09-01 by reading the code: if
a variable is listed, something reads it, and if something reads a variable, it
is listed. The only names deliberately left out are the ones the platform
injects (`NODE_ENV`, `NEXT_RUNTIME`, `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA`,
`CI`), and those are documented in their own section rather than as settable
lines.

Three traps in that file fail silently rather than loudly, so they are repeated
here:

- **`NEXT_PUBLIC_SENTRY_DSN` is read at build time.** A build without it
  produces a bundle whose SDK is `dsn: undefined` and reports nothing. Adding
  the variable later requires a redeploy, not a restart. Every `NEXT_PUBLIC_*`
  behaves this way.
- **`VOUCHER_QR_SECRET` is not casually rotatable.** Every voucher already
  issued is signed with it. Rotating invalidates them all unless the old value
  moves to `VOUCHER_QR_SECRET_PREVIOUS` first.
- **`NEXT_PUBLIC_WHATSAPP_PHONE`, unset, is not absent.** Every WhatsApp link
  falls back to `972524635550`, which is the number published by the only store
  on the live WordPress site, and that store is called "Test Store".

---

## Known, measured, and not defects

Recorded so nobody spends a day rediscovering them.

- **A long-lived local `next start` can wedge one image-optimizer cache entry
  permanently.** Symptom: `/products` never reaches `networkidle` and a
  Playwright test fails in `page.goto`, not in its assertion. Measured: the file
  is valid (sharp encodes it to AVIF in 101ms), 25 concurrent optimizer requests
  wedge nothing, and on a freshly started server the same URL answers 200 in
  104ms and the page idles in 2.3s. Restart the server. There is no code to fix.
- **Lighthouse LCP on localhost is a Lantern simulation**, not an observation. A
  2.7 second real improvement showed up as noise. Judge LCP changes on a
  deployment, not here.
- **`npm install` cannot work in this repo.** It dies inside `buildIdealTree`,
  ahead of every lifecycle hook, so no error message can be improved from inside
  the repo. Use `pnpm`. `AGENTS.md` explains the mechanism.
- **`next start` on a laptop is `NODE_ENV=production`.** Production-only boot
  guards therefore brick the local E2E suite and the Lighthouse runs.
  `ALLOW_INCOMPLETE_ENV=true` is the documented escape hatch, and Vercel must
  never set it.

---

## Operational notes for whoever runs this next

- Install with **`pnpm`**.
- Read the guide in `node_modules/next/dist/docs/` before writing Next code.
  This version has breaking changes from what most training data contains.
- **`STATE.md` is the source of truth for what happened and why.** It is long on
  purpose: most entries record a measurement that refuted an assumption, and
  those are the entries that stop the same mistake being made twice.
- The mainline branch is `phase5/homepage`. `main` is about 300 commits behind
  until PR #6 merges.
- Backups are written to `~/Desktop/kenyonexpress-backup-<stamp>.tar.gz`, `.git`
  included, `node_modules` excluded. Keep the three newest.
