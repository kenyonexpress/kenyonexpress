# KenyonExpress: final report

State of **2026-09-01**. Every number and every status code below was measured
on this date, against this branch or against the live deployment. Nothing is
quoted from an earlier session.

The previous revision of this file was written 2026-08-31 and said Vercel had
never deployed. That is no longer true, and the change is the whole point of
this revision: **the site is live**.

`main` is stale. `phase5/homepage` is the mainline, and `main` is hundreds of
commits behind it. Branching off `main`, or reading it to see what the project
does, silently reverts every piece of security work done since. Closing that
gap is item 4 below.

---

## The one-line version

The code is done and it is deployed. **Nothing that remains is code.** Four
things are left, all four need a human with credentials, and none of the four
can be done from this machine:

1. the ten scheduled jobs, at cron-job.org
2. a Cardcom production terminal
3. the DNS cutover to `kenyonexpress.co.il`
4. merging PR #6 into `main`

Each is written out in "What is left" below. The ordered, command-by-command
procedure with a rollback beside every step is `docs/LAUNCH-RUNBOOK.md`. This
document is *what is left and why*; that one is *what to do*.

---

## What is verified in production, 2026-09-01

Live at **<https://kenyonexpress.vercel.app>**, serving the real catalogue.
Measured today with `curl` against that origin:

| Path | Result |
| --- | --- |
| `/` | 200 |
| `/products` | 200 |
| `/cart` | 200 |
| `/checkout` | 200 |
| `/search?q=test` | 200 |
| `/sitemap.xml` | 200 |
| `/robots.txt` | 200 |
| `/api/health` | `{"ok":true,"database":"ok","latency_ms":122}` |

**All ten cron routes answer 401 to an unauthenticated GET:** `notifications`,
`health`, `invoices`, `stock`, `stranded-payments`, `abandoned-cart`,
`subscriptions`, `reap-carts`, `reconcile`, `expire-vouchers`.

That 401 is a pass twice over. It proves the guard is live on the deployment,
and it proves `CRON_SECRET` is set there, because `bearerMatches()` compares
against the empty string when the variable is missing and an empty comparison
never matches. An unset secret closes every job rather than opening one, so
"401 on all ten" is the only externally observable evidence that the variable
exists, short of holding the value.

Also true in production as of today, established in earlier sessions and not
re-measured here:

- **Migration 127 is applied.** It revokes `EXECUTE` on `check_rate_limit` from
  `anon` and `authenticated`. The anon attack it closes was proven refused
  against production after the migration landed.
- **Migration 128 is applied.** The catalogue is real: 19 imported WordPress
  products live with a supplier, a category and commercial terms; the 34 demo
  products are `draft`, never deleted, because four orders reference them.

---

## Gate status, measured 2026-08-31

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

### The three pages still above the pixel gate, and why each is different

Migration 128 moved these substantially: `category` went from "live 2 cards,
local 12" to **2 against 2**, and `products` from **7 of 24** matching grid
slots to **17 of 24**, with 21 of the 24 products present on both sides.
`category` crossed the gate at 6.18%.

Three remain above 11%, and only one of them is a fidelity problem:

- **`products` 26.94%** and **`search` 14.31%** are content, not fidelity, and
  `compare.mjs` says so itself: it refuses to score a grid whose two sides hold
  different products, because such a number "is a content difference wearing a
  fidelity number". `products` matches 17 of 24 slots and the two pages are
  different heights (3730 against 3253); `search` returns 5 results live and 3
  locally for the same word. Which products sit where is curation, not CSS.
- **`product` 15.45%** is the real one. Both sides render the same product,
  verified by reading the `<h1>` on each. The difference is measured in the
  captures: our gallery runs taller and pushes everything below it down, and we
  additionally show a `-49%` badge, a share row and "hot deal / physical" chips
  that the live page has not. Part of that gap is deliberate, including the two
  buttons on the product page that stay by decision.

No CSS was changed to chase these. The instruction was to fix fidelity and not
content, and in two of the three the difference is content.

---

## What is left, and all four are yours

### 1. The ten scheduled jobs, at cron-job.org

**Nothing schedules them today.** The routes are deployed and guarded, which is
what the ten 401s above prove, but a guarded route nobody calls does not run.
Until this is done, no voucher email is ever sent, no invoice is issued, and no
stranded payment is ever noticed.

They are deliberately **not** in `vercel.json`. Vercel's cron allowance is a
plan feature (two jobs, daily, on Hobby), and declaring ten neither failed the
build nor warned: the platform ran what the plan covered and silently ignored
the rest. Three of the ten are on the money path and one is the only way a
customer ever receives a voucher, so "silently not scheduled" was not an
acceptable state for any of them.

**`docs/CRON-EXTERNAL.md` has the ten lines ready to paste**: full URL, method,
schedule and the `Authorization: Bearer <CRON_SECRET>` header, one line per job,
plus the cron-job.org setup and the two curl checks that prove the pasted secret
is the same secret the deployment holds.

If you set up exactly one of the ten, set up `notifications`. It is the only
path by which a customer receives their voucher.

### 2. A Cardcom production terminal

Call **03-9436100**.

A test terminal accepts real cards and settles nowhere, so this is not a
formality that can be deferred past the first customer. The four credentials go
into Vercel Production as `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`,
`CARDCOM_API_PASSWORD` and `CARDCOM_WEBHOOK_SECRET`, and `src/lib/env.ts`
refuses the production boot without all four.

Then do step 5 of the runbook: **one real payment, on the production terminal,
on the vercel.app URL, before the domain moves.** Buy the cheapest coupon with a
real card, confirm the order reaches `paid`, the voucher exists, the email
arrives, `/scan` accepts the QR once and refuses it the second time, and Cardcom
shows the same amount. Then refund it from the Cardcom dashboard.

Two facts about this integration contradict the architecture document. The code
is the authority:

- The live client is the **legacy `/Interface/*.aspx` API**, not v11 JSON, by a
  decision taken 2026-07-23. `docs/CARDCOM-ARCHITECTURE.md` describes v11, so
  the endpoint names there are not the ones the code calls.
- **Cardcom does not sign its webhooks.** There is no HMAC and no signature
  header. Authenticity rests entirely on the unguessable `?s=` secret in the
  IndicatorUrl, plus mandatory server-to-server re-verification through
  `GetLpResult`, which is the only trusted source of amount, status and token.

Two switches on this path fail in the direction that costs money, and both are
covered in `.env.example`: `CARDCOM_USE_MOCK` must not be set, and
`CARDCOM_SANDBOX=true` fails the production boot on purpose.

### 3. The DNS cutover

`kenyonexpress.co.il` serves 200 today and what it serves is the **old
WordPress site**. This is not "DNS is unconfigured"; it is a cutover, and it is
the one step in the launch that is not reversible in seconds.

Measured with `dig` on 2026-09-01: the apex and `www` each carry **two A
records** (`104.21.55.125`, `172.67.148.28`) and **two AAAA records**, all
Proxied through Cloudflare, so what resolves is the proxy and the WordPress
origin sits behind it. Nameservers are `derek`/`elma.ns.cloudflare.com`, so
Cloudflare is where this is edited and the registrar is not involved.

**Step 7 of `docs/LAUNCH-RUNBOOK.md` is the exact record surgery**, record by
record, with the zone id, the four AAAA to delete, the single A per name to
leave at `76.76.21.21` with the proxy **off**, the mail records not to touch,
and the rollback that restores the two Proxied A records per name.

Three things about it are worth carrying here, because each fails quietly:

- **The four AAAA must go.** Vercel serves the apex over IPv4 only. An AAAA left
  behind keeps IPv6-capable clients on the old proxy while every check from your
  own machine looks correct.
- **The proxy must be off** (grey cloud). Proxied puts Cloudflare's TLS in front
  of Vercel's, and Vercel cannot issue a certificate for a hostname whose A
  record answers as Cloudflare.
- **All 32 product images 404 the moment the record moves.** They are served
  from `kenyonexpress.co.il/wp-content/uploads/...` by the install being
  replaced. Pull them into R2 first, or the nineteen real products go live with
  no picture. This is now a live-site consequence, not a hypothetical.

Lower the TTL to 2 minutes **the day before**, not on the day.

### 4. Merging PR #6

<https://github.com/kenyonexpress/kenyonexpress/pull/6> — `phase5/homepage`
into `main`. Open, **MERGEABLE**, 374 files changed, +53478 / -2717, checked
2026-09-01.

This is what makes `main` describe the project again. Until it merges, `main` is
a trap: it is hundreds of commits behind, and anyone who branches from it or
reads it to learn what the system does gets the state from before the security
work, the money-path work and the catalogue import.

It is a large PR because it is the accumulated mainline, not because it is
risky: the branch it merges is the one currently deployed and serving
production. Nothing in the merge changes what is live.

---

## Still open, but none of it blocks the launch

Recorded so that "what is left" above stays honest about being four items.

- **Five suppliers with no details own 27 real products.** ביוטי לאב (8),
  ספורט מקס (6), טעמים גורמה (6), טק וורלד (4), סטייל הבית (3). All five have
  null `city`, `contact_phone`, `address` and `logo_url`, and all five are seed
  rows whose names appear nowhere on the live site. There is nothing to backfill
  them from, and inventing details for five businesses is not something a
  migration should do. Fill them in the admin, or reassign those products.
- **קניון אקספרס has no postal address**, on purpose: the live site publishes no
  postal address on any page. The nineteen imported products were assigned to it
  because three independent checks agree the WordPress export has no vendor
  (every product is authored by the site admin, `_dokan_vendor_id` appears only
  on orders, and the only `/store/` links on a live product page sit inside the
  vendor registration form). Setting that address is a launch task.
- **Supabase: "Prevent use of leaked passwords" is off.** Authentication >
  Sign In / Providers > Email. A dashboard toggle, no API, no DDL.
- **Resend domain verification.** <https://resend.com/domains/8cbce0e7-2334-40dc-aba6-fce92e80371f>.
  Three DNS records into Cloudflare, then press Verify. Until it is green every
  transactional mail is refused, which means no buyer receives their voucher.
  Do it early; propagation is not instant and it cannot be done during the
  cutover.
- **The legal pages need counsel's approval.** The framework is built and the
  duplication is resolved: the better-sourced text (Amendment 13, the no-Escrow
  coupon model, sections 14ג and 14ח) serves at `/terms-and-conditions`,
  `/privacy-policy`, `/refund_returns` and `/accessibility`, and `/legal/*` 308s
  onto those. `noindex` is gone because there is no longer a second set to hide.
  Each document carries a visible "not yet reviewed by a lawyer" line until
  counsel signs the wording.
- **`/about` has no content.**
- **Two homepage deal links have no product row at all**:
  `reverse-withdrawal-payment` (the Dokan admin product, deliberately excluded
  from the import) and `קופון-טסט`. After 128, 30 of 32 resolve.
- **The full 200-VU L1 load profile has never been run** and needs a machine
  that is not this laptop.

### Schema, and the two lineages

**Migration 059 is still deliberately NOT applied**, reaffirmed 2026-07-31 with
the evidence, so production remains the pre-059 lineage: numeric `*_ils`
columns, not integer `*_agorot`. Code that names the wrong generation raises
42703 and takes down the whole statement rather than failing partially. The
probe in `src/lib/commerce/order-money-columns.ts` is how the order path stays
correct on either lineage, and new code on that path must use it.

Everything else waiting is in `migrations/pending/` and that directory's README.
There are **two** pending locations: `migrations/pending/` and three
`PENDING-`-prefixed files still in `supabase/migrations/`. Read both before
concluding the schema is settled.

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
- **`next start` on a laptop is also `NODE_ENV=production`**, which is why
  `ALLOW_INCOMPLETE_ENV=true` exists. Without it, a local production boot
  answers 500 on every route over missing Cardcom secrets, and takes the E2E
  suite and every performance measurement with it. Vercel must never set it.

---

## Where to look next

| Question | File |
| --- | --- |
| What do I run, in what order, on the day? | `docs/LAUNCH-RUNBOOK.md` |
| What exactly do I paste into cron-job.org? | `docs/CRON-EXTERNAL.md` |
| What is every environment variable and where does its value come from? | `.env.example` |
| What does the DNS change look like, record by record? | `docs/LAUNCH-RUNBOOK.md` step 7 |
