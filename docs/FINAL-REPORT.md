# KenyonExpress: final report

Rewritten 2026-08-31. The previous version was written 2026-08-07 and said
"`main` is at the state described here". That has not been true for some time:
**`main` is 303 commits behind and `phase5/homepage` is the mainline.** Branching
off `main`, or reading it to see what the project does, silently reverts every
piece of security work done since.

Every number below was measured on this machine, against this branch, on the
date given. Nothing is quoted from an earlier session.

---

## The one-line version

The code is done. **Nothing that remains is code.** What is left is a set of
environment variables, a Cardcom production terminal, one database migration
waiting for approval, and a DNS cutover: all of it needs a human with
credentials, and none of it can be done from this machine.

To go live, follow `docs/LAUNCH-RUNBOOK.md`. It is the ordered, command-by-command
procedure with a rollback beside each step. This document is what is left and
why; that one is what to do.

---

## Gate status, measured 2026-08-31

| Gate | Result |
| --- | --- |
| `pnpm test` (Vitest) | **3122 / 3122**, 243 files |
| `pnpm type-check` | clean |
| `pnpm lint` (biome) | clean, 1005 files |
| `pnpm build` | exit 0 from an empty `.next` |
| `pnpm exec playwright test` | **393 passed**, 6 skipped |
| `compare.mjs --page=home` | **9.83%** (gate: under 11%) |
| `compare.mjs --page=cart` | **8.6%** |
| `compare.mjs --page=checkout` | **9.72%** |
| `compare.mjs` on `category`, `products`, `search`, `product` | **refuses to score.** See below. |

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

### Why four of the seven pixel gates refuse to score

Not a failure, and not a number being hidden. `compare.mjs` will not put a
percentage on a comparison whose two sides hold different products, because
that number would be about data and would invite someone to move CSS until the
wrong content lined up. What it reports instead:

```
category   live shows 2 product cards, local shows 12
products   24 cards on both sides, but only 7 of 24 slots hold the same product
search     live shows 5, local shows 3
product    live shows 1, local shows 4
```

One cause: **the catalogues differ**, which is exactly what migration 128 fixes.
Once it is applied these four become measurable, and only then is it meaningful
to chase geometry on them.

---

## What is left, and all of it is yours

### 1. Supabase

- **Project Settings > API Keys**: copy the secret key (`sb_secret…` or `eyJ…`).
  It goes into `.env.local` as `SUPABASE_SECRET_KEY` and into Vercel Production
  under the same name. Never with a `NEXT_PUBLIC_` prefix.
- **Authentication > Sign In / Providers > Email**: turn on
  **"Prevent use of leaked passwords"**. It is a dashboard toggle, not DDL, and
  there is no API for it. It is currently off.

### 2. Resend

<https://resend.com/domains/8cbce0e7-2334-40dc-aba6-fce92e80371f>

Copy the three DNS records into Cloudflare > kenyonexpress.co.il > DNS > Add
record, then return to Resend and press **Verify**.

Do this early. Until the domain verifies, every transactional mail is refused,
which means **no buyer ever receives their voucher**. Propagation is not
instant and it cannot be done during the cutover.

### 3. Vercel

The GitHub App needs to see the repo first:
<https://github.com/apps/vercel> > Configure > kenyonexpress > Repository
access > **Only select repositories** > add `kenyonexpress` > Save.

Then **Project Settings > Environment Variables > Production**:

| Variable | Value |
| --- | --- |
| `SUPABASE_SECRET_KEY` | the key from step 1 |
| `VOUCHER_QR_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32`, same value into the scheduler |
| `RESEND_API_KEY` | Resend > API Keys |
| `NEXT_PUBLIC_WHATSAPP_PHONE` | the real business number |
| `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, `CARDCOM_WEBHOOK_SECRET` | after the Cardcom call |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Sentry, see `docs/SENTRY-SETUP.md` |

The full table with a note on every variable is `.env.example`, which was
verified against the code on 2026-08-31: every `process.env.*` in `src/` and
`apps/` is documented there, and the only two names left out are `NODE_ENV` and
`NEXT_RUNTIME`, which the runtime supplies.

Three traps in that list are worth repeating, because each one fails silently
rather than loudly:

- **`NEXT_PUBLIC_SENTRY_DSN` is read at build time.** A build without it
  produces a bundle whose SDK is `dsn: undefined`. Adding the variable later
  requires a redeploy, not a restart.
- **`VOUCHER_QR_SECRET` is not casually rotatable.** Every voucher already
  issued is signed with it. Rotating invalidates them all unless the old value
  moves to `VOUCHER_QR_SECRET_PREVIOUS` first.
- **`NEXT_PUBLIC_WHATSAPP_PHONE`, unset, is not absent.** Every WhatsApp link
  falls back to `972524635550`, which is the number published by the only store
  on the live site, and that store is called "Test Store".

### 4. Cardcom

Call **03-9436100** for a production terminal.

Two facts about this integration that contradict the architecture document, and
the code is the authority:

- The live client is the **legacy `/Interface/*.aspx` API**, not v11 JSON, by a
  decision taken 2026-07-23. `docs/CARDCOM-ARCHITECTURE.md` describes v11, so
  endpoint names there are not the ones the code calls.
- **Cardcom does not sign its webhooks.** There is no HMAC and no signature
  header. Authenticity rests on the unguessable `?s=` secret in the IndicatorUrl
  plus mandatory server-to-server re-verification through `GetLpResult`, which
  is the only trusted source of amount, status and token.

### 5. Migration 128, and the two lineages behind it

`migrations/pending/128_wp_publish.sql` is written, **not applied**, and is
waiting on your approval. It publishes the 19 real imported products, fills
their categories and commercial terms, and moves the 34 demo products to draft.

Measured against production on 2026-08-31, before it runs:

```
19 products  draft, all physical, all supplier_id NULL   (the WP import)
34 products  active, attributes.demo = true              (seed data)
27 products  active and real
```

The shop is currently serving 34 invented products and hiding all 19 real ones.

**Three things the file deliberately does not do**, each because the data does
not exist rather than because it was overlooked:

- **No `supplier_id`.** All 48 products in the WXR are authored by the site
  admin; `_dokan_vendor_id` appears only on orders, never on a product; the
  export has two authors and the second is the Dokan placeholder; and the live
  store listing contains exactly one store, "Test Store". `supplier_id` decides
  who gets paid, so **assigning suppliers to the 19 products is your task**, in
  the admin, after 128.
- **No coupon classification.** Seventeen of the nineteen are services that
  cannot ship. Section 5 of the file writes the reclassification out per slug,
  commented out, because `type` decides the money route and no source says.
- **No supplier detail backfill.** All 11 existing supplier rows are seed data
  themselves and none of their names appears anywhere on the live site.

**Two measurements gate it**, both in the file header: all 32 homepage deal
slugs were resolved (24 active and not demo, 6 draft, 2 with no row), so the
demo retirement breaks no deal card and the grid goes from 24/32 reachable to
30/32; and **all 32 product image URLs return 200 today and are all served by
the WordPress install this project replaces**, so they all 404 on the day of the
DNS cutover unless they are pulled into R2 first.

Everything else waiting in `migrations/pending/` is listed in that directory's
README. Note there are **two** pending locations: `migrations/pending/` and
three `PENDING-`-prefixed files still in `supabase/migrations/`. Read both before
concluding the schema is settled.

**Migration 059 is deliberately NOT applied**, reaffirmed 2026-07-31 with the
evidence, and production is therefore the pre-059 lineage: numeric `*_ils`
columns, not integer `*_agorot`. Code that names the wrong generation raises
42703 and takes down the whole statement rather than failing partially. The
probe in `src/lib/commerce/order-money-columns.ts` is how the order path stays
correct on either lineage; new code on that path must use it.

### 6. The ten scheduled jobs

They are no longer in `vercel.json`. Vercel's cron allowance is a plan feature
(two jobs, daily, on Hobby), and declaring ten neither failed the build nor
warned: the platform ran what the plan covered and ignored the rest. Three of
the ten are on the money path and one is the only way a customer ever receives
a voucher, so "silently not scheduled" was not acceptable for any of them.

`docs/CRON-EXTERNAL.md` has all ten URLs, their schedules unchanged, and the
cron-job.org setup with the `Authorization: Bearer CRON_SECRET` header.

### 7. Data

- **11 suppliers, all 11 with no address and no logo.** They are seed rows.
- **The homepage deal grid: 24 of 32 links resolve.** After 128, 30 of 32. The
  remaining two have no product row at all: `reverse-withdrawal-payment` (the
  Dokan admin product, deliberately excluded from the import) and `קופון-טסט`.
- `/about` has no content.
- The legal pages need a lawyer's approval. The framework is built; the binding
  text is not code.

### 8. Domain

`kenyonexpress.co.il` is live and serving 200 today through Cloudflare
(`172.67.148.28`, `104.21.55.125`, NS `derek`/`elma.ns.cloudflare.com`), and what
it serves is still the **old WordPress site** (`wp-content`, `wp-includes`),
verified 2026-08-31.

So this is not "DNS is unconfigured". It is a cutover, it is the one step that
is not reversible in seconds, and it is step 7 of the runbook for that reason.
Lower the TTL the day before.

### 9. Load testing

The full 200-VU L1 profile has never been run here and needs a machine that is
not this laptop.

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
  ahead of every lifecycle hook, so no error message can be improved from
  inside the repo. Use `pnpm`. `AGENTS.md` explains the mechanism.

---

## Operational notes for whoever runs this next

- Install with **`pnpm`**.
- Read the guide in `node_modules/next/dist/docs/` before writing Next code.
  This version has breaking changes from what most training data contains.
- **`STATE.md` is the source of truth for what happened and why.** It is long on
  purpose: most entries record a measurement that refuted an assumption, and
  those are the entries that stop the same mistake being made twice.
- The mainline branch is `phase5/homepage`. `main` is 303 commits behind.
- Backups are written to `~/Desktop/kenyonexpress-backup-<stamp>.tar.gz`, `.git`
  included, `node_modules` excluded. Keep the three newest.
