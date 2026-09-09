# Launch readiness


> <!-- v1-final-historical:2026-09-01 -->
> 🕯️ **Historical snapshot. Not current guidance.**
>
> This is a launch-readiness assessment, true on the date it carries. It is kept as a record of what
> was measured and decided then, and it is **not** maintained against
> production. Numbers, table names and statuses in it may since have changed.
>
> For the current state see `docs/ARCHITECTURE-OVERVIEW.md`, and
> `docs/INDEX.md` for which document is authoritative on a given subject.

Measured on `main` at `dd10a9504`, 2026-09-01. Every number below is command
output or a live query against the production database, not a recollection.
Where a claim from the audit brief disagreed with the measurement, the
measurement is what is recorded, and the disagreement is named.

## Verdict

**NOT READY — and every remaining blocker needs Ofir, not code.**

Rewritten 2026-09-06. The previous version was from 09-03 and its blocker list
has been overtaken: two of its four were measured and turned out to be different
problems than they were described as, and a third shrank from fourteen files to
five reviewed ones.

The single sentence that matters: **nothing in this repository has ever been
deployed anywhere.** The site being looked at is the old WordPress installation.

## Gates

Re-measured 2026-09-06 at `18a62e13c`.

| Gate | Command | Result |
| --- | --- | --- |
| Types | `pnpm type-check` | PASS, `tsc --noEmit` clean |
| Lint | `pnpm lint` | PASS, biome 1202 files + tokens/copy/asset gates, 1 pre-existing warning |
| Unit | `pnpm test` | PASS, **3989 tests in 324 files** |
| Build | `pnpm build` | PASS |
| E2E | `E2E_WORKERS=1 playwright test` | PASS serially — cart 21/21, a11y 80/80, rtl-mobile 162/162, smoke+purchase 6/6 both projects. **Read the note below before trusting a parallel run.** |
| Pixel | `compare.mjs --page=home` | PASS, **10.68 / 7.72 / 8.12** at 380 / 768 / 1440 |
| Deps | `pnpm audit --audit-level high` | **no known vulnerabilities** |
| Perf | `pnpm lighthouse:smoke` | **FAILS at 70-75 against 90 — see "What is NOT a blocker"** |

Three of these moved materially since 09-03 and the movement is the point:

**Dependencies went from 8 findings to zero.** `main` turned out to be 284
commits behind and **9 ahead**, and those nine were GHSA fixes — one critical
(vitest `GHSA-5xrq-8626-4rwp`) and four high. Merging them in was the fix;
`docs/BRANCH-AUDIT.md` has the reasoning, including why "resolve in favour of
the newer work" could not be applied literally to the lockfile.

**The pixel gate is quoted at three widths, not one.** The old single 9.83%
figure was the 1440 measurement; 380 is the tight one and always has been.

**The E2E suite must be believed serially, not in parallel.** At two workers a
full run failed ~20 cases, and **19 of the 21 errors were the identical
sentence** — "add-to-cart did not stick: the header badge went 0 -> 0". That is
Supabase contention between workers, not a product defect: every one of those
specs passes at one worker. `playwright.config.ts` previously claimed "the same
suite passes 53/53 at two workers", which was true of a 53-case suite and is not
true of the 530-case one it grew into; the comment now names the sentence to
look for and says to believe the serial answer.

The default stays at two workers deliberately. Serial is ~45 minutes against 8,
which is too much to pay on every run for a failure mode that announces itself
in one repeated sentence.

**Every gate result is now recorded automatically.** `docs/UI-PARITY-REPORT.md`
was empty on 09-03 while three measurements sat in a commit message, because
writing the row was a step a person had to remember. `scripts/parity-log.mjs`
is called from inside the gate, with the commit hash and a `-dirty` suffix when
the tree is not clean.

## Database, queried live## Database, queried live

| Check | Expected by the brief | Measured | Verdict |
| --- | --- | --- | --- |
| Public tables | 50+ | 53 | PASS |
| RLS enabled | all | 61 of 61, 0 without | PASS |
| Tables with RLS and no policy | 3 | 8 | see B2 |
| `SECURITY DEFINER` functions | "0 or minimal" | 61 of 69 | by design, see B3 |
| EXECUTE grants to anon/authenticated | 13 | 20 | see B3 |
| Money columns held as numeric | 31 | **32** | confirmed, see B1 |
| Applied migration head | >= 125 | `20260831193325` | PASS |

### B1. RETRACTED. The audit was right and this document was wrong

**An earlier revision of this file claimed the finding was false. That claim came
from a broken query and it has been withdrawn.** The query filtered with
`format_type(atttypid, atttypmod) in ('numeric', ...)`. `format_type` returns
`numeric(12,2)` for a precision-qualified column, which is not the string
`numeric`, so the test silently skipped every money column in the database and
returned only the five columns that happen to carry no precision. Re-run against
`pg_type.typname` instead:

```
numeric/float columns in public : 74
  money-like                    : 32
  percent-like                  : 25
  true floats (float4/float8)   :  2   (coupon_deals.lat, coupon_deals.lng)
```

The audit's count of 31 was substantially correct. Thirty-two money columns are
held as `numeric`, across fifteen tables:

| Table | Money columns held as numeric |
| --- | --- |
| `products` | `price_ils`, `coupon_price_ils`, `cost_ils`, `full_price`, `kenyon_price`, `compare_at_price`, `compare_at_price_ils` |
| `order_items` | `unit_price_ils`, `total_price_ils`, `supplier_payout_ils`, `coupon_price_ils` |
| `orders` | `subtotal_ils`, `total_ils`, `discount_ils` |
| `product_variants` | `price`, `price_ils`, `price_modifier` |
| `coupon_codes` | `collect_amount_ils`, `face_value_ils` |
| `coupon_deals` | `original_price`, `platform_price` |
| `coupons` | `discount_value`, `original_price` |
| `wallet_transactions` | `amount_ils`, `gross_amount_ils` |
| `wallet_accounts` | `balance_ils` |
| `wallet_balances` | `balance_ils` |
| `wallet_entries` | `amount_ils` |
| `payments` | `amount_ils` |
| `profiles` | `wallet_balance` |
| `affiliates` | `total_earnings_ils` |
| `referrals` | `bonus_paid_amount_ils` |

**One word in the finding is still wrong, and it matters for severity.** These
are `numeric(p,s)`, not floats. `numeric` is exact decimal: it has no binary
rounding error, so there is no money currently being lost to floating point.
Only two true floats exist in the schema and both are coordinates, where
`double precision` is correct. So this is a **standards and dual-representation**
problem, not live corruption.

The real hazard is that the same tables carry both representations at once.
`order_items` holds `total_price_ils numeric(12,2)` beside `commission_agorot
integer`, `face_value_agorot`, `paid_on_site_agorot` and six more. Two sources of
truth for the same money, with no constraint tying them together, is how a
rounding disagreement becomes a payout dispute.

`migrations/pending/131` through `135` carry the conversion. They are **additive
and unapplied**: each adds an `_agorot bigint` column, backfills it with
`round(x * 100)`, and constrains it, leaving the existing column in place so no
current reader breaks. Rewriting the readers is the follow-up, and cutting the
old columns is the step after that. Rationale recorded in `docs/DECISIONS.md`.

### B2. Eight tables carry RLS and no policy, and all eight are already closed

```
payment_webhook_events   rate_limits   user_rate_limits      <- named as by-design
legacy_percent_archive_112   referral_signals
search_index_dlq   settlement_events   stock_reservations    <- the other five
```

RLS enabled with zero policies is deny, not allow: Postgres returns no rows and
rejects every write from `anon` and `authenticated`. All eight are written by
the service role, which bypasses RLS. So the effective permissions are already
correct and this is a legibility problem, not a hole.

`migrations/pending/122_deny_all_on_server_only_tables.sql` makes the intent
explicit for the five unclassified tables with a restrictive `using (false)`
policy. It changes no effective permission. It is **not applied**.

### B3. The seven "extra" EXECUTE grants are load-bearing

The grant audit returns 20 rows, which matches the brief's count. The brief then
asks to revoke the surplus. That cannot be done blind, and the instruction to
verify the caller first is the correct one:

```
redeem_voucher          -> authenticated
supplier_app_context    -> authenticated
verify_supplier_staff_pin -> authenticated
```

`apps/mobile` is a second RPC caller and it is not `src/`. It builds its client
with the anon key plus a user session, so every call arrives as `authenticated`:

```
apps/mobile/src/lib/supplier/api.ts:64   supabase.rpc('supplier_app_context')
apps/mobile/app/supplier/index.tsx:16    redeem_voucher derives the supplier from membership
```

Revoking those grants from `authenticated` takes down every till. No revoke was
written. An audit that greps only `src/` will keep proposing this, and will keep
being wrong.

## Blockers

Four, in the order they should be cleared. None is code.

| # | Blocker | Who | Evidence |
|---|---|---|---|
| 1 | The Vercel project for this repo does not exist | Ofir | Vercel API: the only project is `kenyonexpress-web`, wired to the OLD repo, and **all 11 of its deployments are ERROR** |
| 2 | Migration batch A is unapplied | Ofir approves | `docs/MIGRATION-REVIEW.md`, apply order in `docs/RUNBOOK.md` |
| 3 | The Supabase secret key was exposed during setup | Ofir | Working key, bypasses every RLS policy; the build refuses to ship it |
| 4 | R2 is not enabled and no bucket was named | Ofir | `403 code 10042`; 375 objects wait in `refs/live-assets/` |

### 1. There is no deployment, and that is why the site still looks wrong

This was previously written as "unconfirmed which Vercel project the domain will
point at". Measured through the Vercel API on 2026-09-06, it is worse than
unconfirmed: the project `kenyonexpress` pointing at `kenyonexpress/kenyonexpress`
**does not exist**. What exists is `kenyonexpress-web`, connected to the previous
repository, and every one of its eleven deployments is in state `ERROR`, the most
recent from May.

So every report of "the Electro images are back" and "the search field returned"
is a report about the old WordPress site. `scripts/shell-audit.mjs` settles it
for any URL: our build reports CLEAN, `kenyonexpress.co.il` reports nine
problems including `input[type=search]` and the iPhone/AirPods GIF.

**Everything else waits behind this.** The cron schedule (migration 162) needs a
deployed URL for its vault secret. The performance budget cannot be closed
because every number available locally is a simulation on a laptop. The domain
cannot be pointed at a project that does not exist.

`docs/DEPLOY.md` is the click-by-click.

### 2. Four migrations, reviewed, waiting on approval

Down from "14 unapplied files": the directory now holds five, one of which is
blocked behind blocker 1. Each was reviewed against the live production schema
rather than against what its file claims. `docs/MIGRATION-REVIEW.md`.

**172 first, because it is the only one with a live money consequence.**
`מוצר ראשי מאסטר Master Product` is in the production catalogue at ₪1 against a
₪400 compare-at with ten in stock. It can no longer be *bought* — a
discount-ratio guard shipped on 09-06 — but it is still `active`, still answers
a direct query, and still renders in listings that do not go through the cart.
Stopping it being bought and removing it from the catalogue are different
claims, and only the second survives someone querying the database.

**169 next.** Four funnel events are being silently discarded by the database
right now: `purchase`, `begin_checkout`, `voucher_redeemed`, `order_refunded`
each return 0 rows inserted with HTTP 200. The site reports no purchases. Every
day this stays unapplied is a day of funnel data that does not exist.

**170 and 171** are safe and can ride the same batch. **162 is blocked** behind
blocker 1.

### 3. The exposed key

It works, which is the danger. A Supabase secret key bypasses every RLS policy
and this one was handled outside a secret store. `scripts/compromised-keys.mjs`
carries its SHA-256 — the digest, never the key — `src/lib/env.ts` refuses to
boot a deployment with it, and `scripts/deploy-preflight.mjs` refuses to build.
Rotation procedure in `docs/RUNBOOK.md`. Mint first, verify with the boot probe,
revoke last.

### 4. R2

`403 code 10042 "Please enable R2 through the Cloudflare Dashboard"`, and the
instruction that asked for the upload ended mid-sentence without naming a
bucket. 107 assets and 268 derivatives are ingested and waiting;
`scripts/upload-r2.mjs` is written and dry-run verified at 375 objects.

### What is NOT a blocker any more

- **The cron jobs.** Previously "no external scheduler exists". Migration 162
  schedules all twelve in the database with pg_cron, so no external scheduler is
  needed — it is blocked on the deployment URL for its vault secret, not on
  infrastructure that has to be bought.
- **The performance budget.** `pnpm lighthouse:smoke` exits 1 at 70-75 against
  its 90 threshold, and the application is not slow: the same build with
  `--throttling-method=provided` scores 100, with FCP 0.1s and TBT 0ms. The gap
  is Lighthouse's Lantern simulation running on a laptop that is also serving
  the page; three runs on an unchanged tree gave 75, 70, 70. Recorded OPEN in
  `docs/PERFORMANCE-BUDGET.md` and not closeable until there is a deployment.
  **The threshold was not lowered.**

## What is verified working

The site answers `200`, `/api/health` reports `{"ok":true,"database":"ok"}`, the
cron guard answers `401` to an unauthenticated call, and the catalogue served in
production is the real one. RLS is on for all 61 tables. The rate limit layer,
a sliding window with a Postgres fallback behind all thirty callsites, is merged
to `main` and green.

## Production smoke, 2026-09-02

Run against `https://kenyonexpress.vercel.app` from this machine.

| Path | Status | Time | Bytes |
| --- | --- | --- | --- |
| `/` | 200 | 4.89s | 379,811 |
| `/products` | 200 | 2.22s | 217,874 |
| `/sitemap.xml` | 200 | 0.84s | 12,893 |
| `/robots.txt` | 200 | 0.83s | 342 |
| `/checkout` | 200 | 2.08s | 74,853 |
| `/cart` | 200 | 0.95s | 67,385 |

All ten cron endpoints answer **401**, which is the correct answer and the
useful one: the routes are deployed and `CRON_SECRET` is set in production. A
404 would have meant the routes were missing; a 200 would have meant the secret
was not being checked.

```
notifications 401   health 401   invoices 401   stock 401
stranded-payments 401   abandoned-cart 401   subscriptions 401
reap-carts 401   reconcile 401   expire-vouchers 401
```

### `/checkout` returning 200 does not mean checkout works

The launch brief expects `/checkout` to stop returning "404/disabled" once
`CHECKOUT_ENABLED=true` is set. It was never going to return either. The page
renders regardless, with `<title>תשלום | קניון אקספרס</title>` and no
disabled-state text in the body.

`CHECKOUT_ENABLED` gates the **server action**, not the page:

```
src/server/actions/payments/checkout.ts:252   if (!env.checkoutEnabled) { ... }
src/lib/payments/env.ts:76                    NODE_ENV === 'production'
                                                ? CHECKOUT_ENABLED === 'true'
                                                : CHECKOUT_ENABLED !== 'false'
```

It fails **closed** in production: unset means payments are refused. So the
observable symptom of the variable being unset is not a 404 on the page, it is a
customer filling in the whole form and being refused at submit. A smoke test
that only fetches `/checkout` cannot see it, and the only honest check is either
reading the variable in the Vercel dashboard or driving a real submit.

Two cron routes carry the same gate (`reconcile`, `stranded-payments`), so they
no-op while it is unset even though they answer 401 to an unauthenticated call.

### Front page timing

4.89s to first byte-through-completion on a cold path is slow enough to be worth
a look before launch, though it is one sample from one machine over the public
internet and is not a Lighthouse measurement.

## Visual gate, 2026-09-02

Measured against a clean `pnpm build` on a server started for the run, so no
stale-server reading. Ceiling is 11%.

| Page | 1440 | 768 | 380 |
| --- | --- | --- | --- |
| home | **9.83%** | 40.81% | 42.44% |
| cart | **8.60%** | 14.17% | 19.74% |
| checkout | **9.72%** | 13.11% | 14.64% |
| product | refused | refused | refused |

**1440 passes on every page that can be measured. 768 and 380 fail on every
page.** This is not a regression: those two widths had never been measured
before this week, because `compare.mjs` hung on them. Every three-width figure
ever quoted for this gate was a 1440 figure.

`home` at 380 additionally trips the script's own structural guard — live is
17,825px tall against our 10,358px, a ratio of 0.58 — and the script says so
itself: at that ratio the percentage is not a pixel gate, it is two different
pages. So the mobile numbers are a statement that the mobile layouts diverge
structurally from live, not a styling delta anyone can close by moving tokens.

`product` refuses at every width and the refusal is correct: live renders **1**
related-product card and our page renders **4**. That is a catalogue difference
wearing a fidelity number, which is exactly what the guard exists to stop.

`account` and `supplier` were not measured: the live site has no comparable
authenticated pages to score against.

### What this means for launch

The 11% gate is met at desktop and is nowhere near met at mobile. Closing the
mobile gap is a layout project, not a tuning pass, and it is the largest single
piece of work left. Most Israeli shoppers are on mobile.

## Quality gates, 2026-09-02

```
pnpm type-check   clean
pnpm biome check  984 files, no findings
pnpm test         3478 passed, 258 files
pnpm build        green
```

## BLOCKER: production checkout is enabled and wired to the mock provider

Found 2026-09-02, by reading the production environment directly after
`vercel link`. Both facts are from `vercel env pull --environment=production`.

```
CHECKOUT_ENABLED = "true"
CARDCOM_USE_MOCK = "true"
```

`CHECKOUT_ENABLED=true` was **already set** — the launch task to add it was
done a day earlier. The dangerous variable is the other one.

`src/lib/payments/env.ts:61`:

```js
const useMock =
  source.CARDCOM_USE_MOCK === 'true' ||
  source.NODE_ENV === 'test' ||
  (!source.CARDCOM_TERMINAL_NUMBER && source.NODE_ENV !== 'production')
```

`CARDCOM_USE_MOCK === 'true'` is tested first and **there is no production
override**. So `getPaymentProvider()` returns `getSharedMockCardcom()`, and the
mock answers `success: true` to `createLowProfile`, `verifyLowProfile`,
`chargeWithToken` and `refundByTransactionId` alike.

**A customer would complete checkout, the payment would "succeed", the order
would finalize and a voucher would be issued, and no card would ever be
charged.** The shop would give away goods.

There are also no real terminal credentials in production. The only Cardcom
variables present are `CARDCOM_USE_MOCK` and `CARDCOM_WEBHOOK_SECRET`;
`CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME` and `CARDCOM_API_PASSWORD` are
absent.

### Why this was not fixed here

Deleting `CARDCOM_USE_MOCK` on its own makes it **worse, not better**. The
non-mock branch calls `required('CARDCOM_TERMINAL_NUMBER', ...)`, which throws
when the variable is missing, so checkout would move from silently-fake to
hard-failing.

The two changes are one change and they are Ofir's:

1. add `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`
   from the production terminal (Cardcom, 03-9436100), then
2. remove `CARDCOM_USE_MOCK`, then
3. redeploy, then place one real low-value order and confirm it appears in the
   Cardcom dashboard.

**Until then, the safe state is `CHECKOUT_ENABLED=false`.** A checkout that
refuses is a bad shop; a checkout that fakes success is a shop that ships goods
for free. That flip was not made here because the launch instruction was
explicitly to set it to `true`, and choosing the opposite is a business call.

**This is a DNS-cutover blocker.** Pointing the real domain at this deployment
today would open a shop that charges nobody.

## v1.1.0 closeout, 2026-09-02

Gates at the tag: 3539 vitest passed, type-check clean, biome clean (984
files), build green. Branch `release/v1.1` (= `closeout/v1-final` tip), PR into
main open; merging is Ofir's hard stop.

### The recurring finding of this closeout

Five whole subsystems existed on one side of the wire only, every one now
closed: payment_events (table, no writers -> wired), refunds (statutory table,
no writers -> wired), subscriptions (renewal+cancel, no creator -> built),
analytics ingest (caller, no function -> 151), payouts (four verbs + page, no
tables/functions -> 152).

### migrations/pending — 29 files, apply through MCP in APPLY-ORDER.md order

- 122_deny_all_on_server_only_tables.sql
- 123_products_whatsapp_enabled.sql
- 124_categories_sort_order.sql
- 125_expire_vouchers_drop_escrow.sql
- 126_percent_range_checks.sql
- 127_homepage_cms.sql
- 130_payment_events.sql
- 131_refunds.sql
- 132_search_index_outbox.sql
- 133_supplier_branches.sql
- 134_order_items_delivered_at.sql
- 135a_product_type_recurring.sql
- 135b_recurring_subscriptions.sql
- 136_supplier_coordinates.sql
- 137_order_transition_guard.sql
- 138_money_agorot_money_path.sql
- 139_money_agorot_wallet.sql
- 140_money_agorot_catalog.sql
- 141_money_agorot_growth.sql
- 143_revoke_unused_definer_execute.sql
- 144_revoke_authenticated_dml.sql
- 145_revoke_check_rate_limit_execute.sql
- 146_wallet_balance_floor.sql
- 147_money_agorot_remaining_twins.sql
- 148_refund_destination.sql
- 149_audit_log_append_only.sql
- 150_account_deletion.sql
- 151_analytics_ingest.sql
- 152_payout_machinery.sql

The six from this closeout (147-152) each carry a rolled-back dry run against
production in their headers. None is applied. 122-146: see APPLY-ORDER.md.

### No longer manual: the cron scheduler

Armed and verified 2026-09-02: repository secret + master-switch variable set,
one dispatched health run green against production. The ten jobs now run from
GitHub Actions (best-effort timing; see cron.yml's own header).

### Still manual for Ofir

Cardcom prod terminal + removing CARDCOM_USE_MOCK (**the blocker** -- checkout
is live against the mock), DNS
cutover (the editable zone is NOT the serving zone), merging the release PR,
the 14 wrong product slugs, and the 768/380 mobile layout project.

---

## נספח מתוארך: מגה-בלוק 2 (‏STEPS 14–22), נמדד 02.09.2026

ה-snapshot למעלה קפוא; הנספח הזה הוא מדידה חדשה על ‏`closeout/v1-final`.

| Gate | תוצאה |
| --- | --- |
| `pnpm type-check` | PASS |
| `pnpm lint` | PASS (biome, 0 findings) |
| `pnpm test` | PASS — ‏3555 בדיקות ב-264 קבצים |
| `pnpm build` | PASS |
| `node scripts/migration-lint.mjs` | PASS — ‏31 קבצים, ‏0 hard, ‏0 soft |
| `node scripts/bundle-gate.mjs` | PASS — ‏255.6KB gz מול ratchet ‏260KB (יעד ‏180KB = ‏KNOWN-ISSUES ‏#9) |
| ‏e2e מלא, ‏chromium + ‏mobile-chrome, מול ‏`pnpm start` | ‏453 עברו, ‏8 דולגו, ‏1 flake (‏coupons a11y ב-mobile; ‏3/3 ירוק בחזרה ממוקדת) |
| `compare.mjs --page=home` ‏1440 | ‏9.08% מול תקרת ‏11% |

| STEP | מה קרה |
| --- | --- |
| 14 | ‏migration-lint + ‏bundle-gate + ‏smoke-all-routes; לולאה ירוקה ×3 |
| 15 | נסגר בסריקה — עגלות נטושות חיות (‏fn_due + ‏UNIQUE + הסכמה); תזכורת שנייה נדחתה |
| 16 | נסגר בסריקה — ‏fn_complete_referral שלם ומחווט |
| 17 | נסגר בסריקה — קמפיינים אוטומטיים נדחו (פיצול מקור אמת למחיר) |
| 18 | **נבנה** — ביקורות מאומתות + רשימת משאלות (מיגרציה 154, ‏RLS היא האימות) |
| 19 | סורק קיים; נוספו סיכומי היום/30 יום למימושים |
| 20 | ‏SEO קיים; נוסף ‏BreadcrumbList לקטגוריה |
| 21 | ‏WP import הושלם 07.08; ‏seed מוצרים בדויים נדחה; נכתב ‏SEED.md |
| 22 | תוקנו שתי רגרסיות מעבודת ה-fold (‏320px overflow, שני sliders); לולאה ×3 + ‏e2e; תג ‏v1.4.0-rc1-block2 |

## נספח מתוארך: מגה-בלוק 3 (‏STEPS 23–27), נמדד 02.09.2026

לולאת הביקורת ירוקה ×3 (‏type-check / lint / 3568+ בדיקות / migration-lint
33 קבצים / bundle-gate 255.6KB). ‏build ירוק.

| STEP | מה קרה |
| --- | --- |
| 23 | נסגר בסריקה — הארנק חי מקצה לקצה; הכלל המחייב חזק מהספק (מוגבל לתשלום-באתר, לא "פיזי בלבד") |
| 24 | **נבנה** — מכונת משלוחים על המודל הפרוס (‏item_status פר שורה), מיגרציה 155 (‏carrier/tracking + ‏order_shipped kind, אחרי 150), פעולות אדמין מבוקרות-audit עם מחסום מרוץ, ‏UI אדמין + צ'יפ ללקוח |
| 25 | נסגר בסריקה + ‏CSV ספק (‏/api/supplier/payouts/csv, אותו fold של העמוד) |
| 26 | נסגר בסריקה + עשרת הספקים המובילים + מיגרציה 156 (שני אינדקסים חלקיים) |
| 27 | לולאה ×3, תג ‏v1.5.0-rc1-block3 |

## נספח מתוארך: מגה-בלוק 4 (‏STEPS 28–32), נמדד 02.09.2026

לולאת הביקורת ירוקה ×3; ‏build ירוק; ‏migration-lint ‏34 קבצים נקיים.

| STEP | מה קרה |
| --- | --- |
| 28 | נסגר בסריקה + תיקון: ‏Permissions-Policy סטטי חסם מצלמה גם על סורק ה-QR — עכשיו ‏camera=(self) רק על מסלולי הסורק, אומת חי |
| 29 | **נבנה** — ‏TOTP צוות על ה-MFA המובנה של Supabase (‏aal2 בשערי rbac, עמוד אתגר, ‏/account/security); טבלת admin_totp נדחתה |
| 30 | נסגר בסריקה + ‏mutating-route-guards.test (כל מסלול משנה מחזיק שער; ‏11/11 כבר מוגנים) |
| 31 | **נבנה** — מיגרציה 157 (הזדקנות IP על audit append-only) + ‏cron ‏retention (ה-11) + ‏SECRETS-ROTATION.md |
| 32 | לולאה ×3, תג ‏v1.6.0-rc1-block4 |

## נספח מתוארך: מגה-בלוק 5 (‏STEPS 33–37), נמדד 02.09.2026

לולאת הביקורת ירוקה ×3; ‏build ירוק.

| STEP | מה קרה |
| --- | --- |
| 33 | נדחה — ‏use cache+CATALOGUE_TAG הוא שכבת ה-cache; ‏Redis שני = שני מנגנוני פינוי מתבדרים |
| 34 | נדחה — ‏notification_outbox (‏backoff, ‏dedupe, ‏dead+Retry) הוא התור; ‏QStash push היה מחליף עובד-ונמדד |
| 35 | נדחה — ‏568 שורות audit אינן צריכות פרטישן; האינדקסים המוכחים נוספו ב-156 |
| 36 | **נמדד** — ‏browse ירוק ב-40VU (בית p95 691ms, ‏0% כשלים), נקודת קריסה מקומית ~68VU תועדה, חיפוש 979ms על ‏ILIKE fallback; תרחישי כתיבה לא רצים בהעדר staging (guard חוסם פרודקשן) |
| 37 | לולאה ×3, תג ‏v1.7.0-rc1-block5 |

## נספח מתוארך: מגה-בלוק 6 (‏STEPS 38–42), נמדד 02.09.2026

לולאת הביקורת ירוקה ×3.

| STEP | מה קרה |
| --- | --- |
| 38 | ‏DR-RUNBOOK.md (שחזור מגיבוי Supabase, ‏RTO<2h/RPO 24h); ‏tar יומי רץ (‏770MB, 3 נשמרים); ‏backup-verify ב-API נדחה (אין token) |
| 39 | **‏monitor חי**: ‏Sentry Uptime על ‏/api/health (‏60s, ‏id 2159284, דרך MCP); ‏ops/sentry-alerts.json — ‏live מול desired |
| 40 | **נבנה** — ‏weekly-digest, ה-job ה-12 (שישי בוקר, ‏Resend ישיר למפעיל) |
| 41 | נסגר בסריקה — הקונסולה קיימת (‏payments/queues/status); ledger פרסיסטנטי נדחה עד שיש עסקאות אמת |
| 42 | לולאה ×3, תג ‏v1.8.0-rc1-block6 |

---

## הרגרסיה הסופית (‏STEP 46), נמדדה 02.09.2026 ערב

| Gate | תוצאה |
| --- | --- |
| ‏type-check / lint / test / migration-lint / bundle-gate | ירוק ×3 (‏3573+ בדיקות, ‏34 קבצי מיגרציה נקיים, ‏255.6KB מול ratchet) |
| ‏build | ירוק |
| ‏e2e מלא, ‏chromium + ‏mobile-chrome, מול ‏pnpm start | **‏454 עברו, ‏0 נכשלו**, ‏8 דולגו |
| ‏פיקסלים ‏1440 | בית ‏8.07%, עגלה ‏8.6%, ‏checkout ‏9.58% — כולם מתחת ל-11% (‏VISUAL-PARITY.md; מוצר לא-מדיד בשל ווידג'ט קשורים שונה בחי) |
| ‏k6 | ‏browse ירוק ב-40VU, ‏0% כשלים (‏LOAD-TEST-RESULTS.md) |
| ‏Uptime | ‏Sentry monitor 2159284 על ‏/api/health, פעיל |

## פסק דין אחד

**הקוד סגור.** ‏47 השלבים של שבעת מגה-הבלוקים הסתיימו — מה שנבנה נבנה
(ביקורות+משאלות, משלוחים, ‏TOTP, ‏retention, ‏digest, ‏CSV, אינדקסים,
תיקוני ‏320px/סורק-מצלמה), מה שכבר היה זוהה ותועד, ומה שסתר את המודל
הפרוס נדחה בנימוק כתוב (‏MEGA-BLOCK-AUDIT.md). מה שנשאר אינו קוד:
‏docs/OWNER-CHECKLIST.md — מיגרציות ‏147–157 + ‏db:types, ‏Cardcom ייצור,
‏DNS, מיזוג ה-PR.

## נספח מתוארך: מגה-בלוק 8 (‏STEPS 48–52), נמדד 02.09.2026

| STEP | מה קרה |
| --- | --- |
| 48 | **נאכף** — גבול הכסף של מעלי תוכן (‏applyUploaderPolicy: פיצול העמלה מופשט, ‏approval_status נכפה ל-pending; ברירת המחדל הפרוסה הייתה 'approved' ודילגה על התור) |
| 49 | נדחה — ‏wp-import הוא הייבוא המרוכז; ‏UI CSV לצד מעלה יחיד = ערוץ עוקף-טופס |
| 50 | **נבנה** — שער ממדי תמונה צד-שרת (‏≥800px, יחס 1:2–2:1, ‏sharp); ‏dedupe/crop נדחו |
| 51 | נדחה עד שיש יותר ממעלה אחד |
| 52 | לולאה ×3, תג ‏v2.1.0-rc1 |

## נספח מתוארך: מגה-בלוק 9 (‏STEPS 53–57), נמדד 02.09.2026

‏contact (‏zod+honeypot+rate-limit+reply-to) ו-FAQ (‏12 שאלות, ‏JSON-LD)
קיימים ומכסים את הספק; מערכת טיקטים מלאה נדחתה כמשטח מוצר מוקדם מדי לערוץ
עם אפס פניות (‏MEGA-BLOCK-AUDIT). תג ‏v2.2.0-rc1.

## נספח מתוארך: מגה-בלוק 10 (‏STEPS 58–62), נמדד 02.09.2026

‏supplier_members עם scanner/manager/owner + ייחוס מימושים פר-משתמש הם
המודל המבוקש, פרוס וחי; רב-סניפיות ואנליטיקות פר-עובד נדחו כמוקדמים.
תג ‏v2.3.0-rc1.

## נספח מתוארך: מגה-בלוק 11 (‏STEPS 63–67), נמדד 02.09.2026

וריאנטים, שריון מלאי אטומי והתראות מלאי נמוך — כולם פרוסים וחיים;
‏ledger נגזר ו-CSV נדחו. תג ‏v2.4.0-rc1.

## נספח מתוארך: מגה-בלוק 12 (‏STEPS 68–72), נמדד 02.09.2026

ניוזלטר-בהסכמה ו-UTM קיימים; ‏react-email וסגמנטים נדחו. תג ‏v2.5.0-rc1.

## נספח מתוארך: מגה-בלוק 13 (‏STEPS 73–77), נמדד 02.09.2026

המסמכים מונפקים ב-Cardcom (קבלה/חשבונית/זיכוי) עם תור+cron+התראת מסמך-מת;
‏VAT באגורות; ייצוא ב-/admin/reports. ‏PDF עצמאי נדחה. תג ‏v2.6.0-rc1.

## נספח מתוארך: מגה-בלוק 14 (‏STEPS 78–82), נמדד 02.09.2026

‏axe אפס-הפרות כבר עומד על 19 מסלולים; נוסף שער מטרות-מגע (‏2.5.8) שמצא
ותיקן 10 מטרות קטנות בנתיבי הליבה; הצהרת הנגישות עודכנה. תג ‏v2.7.0-rc1.

## נספח מתוארך: מגה-בלוק 15 (‏STEPS 83–87), נמדד 02.09.2026

‏DEAD-CODE.md (מחיקה מחכה לאישור), ‏12 ‏ADRs, ‏ONBOARDING.md; ‏hotspots
נדחה. לולאה ×3 ירוקה. תג ‏v2.8.0-rc1.

## נספח מתוארך: מגה-בלוק 16 (‏STEPS 88–92), נמדד 02.09.2026

שכבת המניעה (חוסמת) פרוסה: ‏rate-limits, מחסומי replay, הונאות הפניות
בעומק; טבלאות פורנזיקה ודשבורד נדחו עד מסוף אמיתי. תג ‏v2.9.0-rc1.

## נספח מתוארך: מגה-בלוק 17 (‏STEPS 93–97), נמדד 02.09.2026

‏chaos קיים; ‏DEPENDENCIES.md + ‏HANDOVER.md נכתבו; לולאה אחרונה ×3 +
‏build ירוקים. תג ‏v3.0.0-rc1.

# הפסקה הסופית

**הקוד סגור. ‏STEPS 2–97 הושלמו.** מה שנשאר אינו קוד ונמצא כולו
ב-`docs/OWNER-CHECKLIST.md`.

## Design run — 2026-09-03 (D1-D17, tags v3.1.0-design1 … v4.0.0-rc1)

| item | state | evidence |
| --- | --- | --- |
| Design tokens single-source (`src/styles/tokens.css`) | done | tokens.test.ts: no raw hex, no rgb(), no Tailwind default palette in the storefront, PDP tracks SITE |
| Responsive shell 1:1 (380/768/1440) | done | shell-band.mjs 9.47% / 7.98% / in-pass |
| Mobile drawer (did not exist) | done | MobileDrawer.tsx, 44px targets, Escape/focus return |
| Home 1:1 | done | 5.99% at 1440; 380 volatile 11-28% with live's catalogue, geometry exact to 1-2px |
| Cart / checkout | 768+1440 pass | 380 blocked by the shell-reference conflict (COMPARE-RESULTS.md) |
| Category / product / products | unmeasurable | compare.mjs content guard; refs/ is 2026-08-12 |
| Search UI removed everywhere | done | header field deleted, 404 link repointed; only orphan /search route remains |
| axe WCAG A/AA | zero violations | e2e/a11y.spec.ts 80 passed |
| Global focus ring + reduced motion | done | two-tone ring (yellow fails 3:1 alone), near-zero durations |
| Checkout errors aria-describedby | done | 8 fields + zip + terms wired |
| Full e2e | 412 passed / 0 failed | chromium + mobile-chrome, production build |
| Bundle gate | green | 255.8 KB gz / 260 KB budget |
