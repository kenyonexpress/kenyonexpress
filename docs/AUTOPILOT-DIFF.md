# Autopilot diff

Measured 2026-09-25 against `audit/final-audit` at `37826cd02`, read only
through git. No merge, no cherry-pick, no checkout of either branch. Every
count below came from `git rev-list --left-right --count`, `git diff
--name-status` or `git ls-tree`, not from a branch name or a commit message.

The question this answers: what do `autopilot` and `phase5/homepage-closeout`
contain that this branch lacks, and which of it is worth carrying over.

## The headline

| fact | value |
|---|---|
| common merge base of both branches with HEAD | `a3df275ed`, 2026-09-09, merge of PR #44 (vitest 4) |
| `autopilot` tip | `69bcbd5c7`, 2026-09-17, identical to `origin/autopilot` |
| commits on `autopilot` not in HEAD | **96** (18 of them are `autopilot residual` timer sweeps) |
| commits on HEAD not in `autopilot` | 395 |
| `phase5/homepage-closeout` tip | `7b2e5795b`, 2026-09-24, `autopilot residual` |
| what that branch adds beyond `autopilot` | **one commit**, on no remote, checked out in the `~/kenyonexpress-autopilot` worktree |
| `origin/main` versus `autopilot` | contains all 96 and 13 more (`Wave 5: search UI`, `Wave 6: build success`, auto-merger merges) |
| `origin/main` versus HEAD | 109 commits HEAD lacks (the 96 plus the 13); 395 commits of HEAD that `origin/main` lacks |
| local `main` | 202 behind HEAD, 0 ahead: stale, not a source of anything |

So the whole of `autopilot` already lives inside `origin/main`; the auto-merger
loop merged it there commit by commit between 09.09 and 17.09. The only
content that exists nowhere except the closeout worktree is `7b2e5795b`.

File level, since the merge base:

| side | files changed | insertions | deletions |
|---|---|---|---|
| `autopilot` | 543 | 51,735 | 1,936 |
| HEAD | 1,325 | 167,294 | 21,025 |
| touched by **both** | 181 | | |
| exist only on `autopilot` | 269 (219 in src, 22 migrations, 19 scripts, 3 infra, 3 docs, 1 root doc, 1 e2e, 1 load) | | |
| exist only in HEAD | 805 | | |

`autopilot` did not touch `src/lib/money.ts` or `packages/`. It did touch
`src/server/payments/finalize.ts`, `src/server/actions/payments/checkout.ts`,
`src/server/actions/payments/refund.ts` and
`src/lib/commerce/order-money-columns.ts`, and so did HEAD. Those four alone
rule out a mechanical merge of the money path.

## What `autopilot` has that HEAD lacks

### 1. Twenty-two migration files under numbers HEAD already uses

`autopilot` carries 19 pending files and 3 "applied" files whose numbers
collide with HEAD's own 210 to 242, with different content on every number:

| number | autopilot file (not in HEAD) | HEAD file under the same number |
|---|---|---|
| 210 | applied/210_media_ingest_queue.sql | `migrations/pending/210_product_phases.sql` |
| 211 | pending/211_whatsapp_selfservice.sql | `migrations/pending/211_subscriptions_phase2.sql` |
| 212 | applied/212_rbac_truncate_and_search_path.sql | `migrations/pending/212_courses_phase2.sql` |
| 215 | applied/215_cashback_expiry.sql | `migrations/pending/215_push_deliveries.sql` |
| 217 | pending/217_coupon_qr_redemption.sql | `migrations/pending/217_profiles_phone_verified.sql` |
| 223 | pending/223_restock_on_refund.sql | `migrations/pending/223_notifications_outbox_link.sql` |
| 224 | pending/224_post059_price_cashback_twins.sql | `migrations/pending/224_grant_recent_search_execute.sql` |
| 226 | pending/226_fraud_controls.sql | `migrations/pending/226_gift_scheduling_and_wrap.sql` |
| 227 | pending/227_discount_claim_wiring.sql | `migrations/pending/227_voucher_expiry_engine.sql` |
| 228 | pending/228_invoice_sequences.sql | `migrations/pending/228_job_runs.sql` |
| 231 | pending/231_bell_fanout.sql | `migrations/pending/231_pending_exports_deletions.sql` |
| 232 | pending/232_reviews_admin_moderation_only.sql | `migrations/pending/232_supplier_self_service.sql` |
| 233 | pending/233_wishlist_alerts.sql | `migrations/pending/233_payout_statement_ready_kind.sql` |
| 234 | pending/234_gift_cards.sql | `migrations/pending/234_fraud_blocklist.sql` |
| 235 | pending/235_product_live_and_rating.sql | `migrations/pending/235_feature_flags.sql` |
| 236 | pending/236_orders_shipping_method.sql | `migrations/pending/236_contact_channels.sql` |
| 237 | pending/237_user_ban_and_store_settings.sql | `migrations/pending/237_deals_autopilot.sql` |
| 238 | pending/238_search_events_daily.sql | `migrations/pending/238_whatsapp_inbound_order_match.sql` |
| 239 | pending/239_push_deliveries_sms_log_opt_outs.sql | `migrations/pending/239_customer_invoice_settings.sql` |
| 240 | pending/240_perf_fk_indexes_and_cart_uniqueness.sql | `migrations/pending/240_app_consent_events.sql` |
| 241 | pending/241_rls_initplan_policies.sql | `migrations/pending/241_seed_product_city_from_title.sql` |
| 242 | pending/242_job_dlq.sql | `migrations/pending/242_product_price_source_google_reviews.sql` |

Two lineages of the same numbers. Anything ported from this list needs a new
number from 245 upward, a rewrite against HEAD's `docs/RUNBOOK.md` order, and
its own rolled-back dry run against production. None of it can move as a file.

What the commit messages claim versus what HEAD measured:

- `autopilot` moved 192, 194, 196, 197 and 201 from pending to applied.
  That agrees with HEAD's 21.09 dry run (`docs/GO-LIVE-DRY-RUN.md`), which
  found those five, plus 188 to 191 and 218, fully present in production.
  HEAD still keeps them under `migrations/pending/`; the ledger move is a
  bookkeeping correction HEAD has not made, and is the one thing in this
  section that is cheap and true.
- Commits `00aff36d4` and `821afb99a` say 223 (restock on refund) and 224
  (post-059 price and cashback twins) were applied via MCP. The same dry run
  recorded that 223 and 224 are **not** in production. Neither is any other
  object from this list: `src/types/database.ts`, which is the description of
  production this repo works from, has zero occurrences of `media_ingest`,
  `restock_order_stock`, `cashback_expir`, `invoice_sequences`, `gift_cards`,
  `wishlist_alert`, `job_dlq`, `search_events_daily`, `user_bans`,
  `store_settings`, `push_deliveries` and `sms_log`.

### 2. Cron scheduling through `vercel.json`

`autopilot` declares 25 crons in `vercel.json`; HEAD declares none and
schedules 21 jobs from `.github/workflows/cron.yml` via
`scripts/cron-jobs.json` (armed by the `CRON_SECRET` repository secret, which
is open blocker 10 in `STATE.md`). Ten of the 25 paths have no route in HEAD:

```
job-dlq  expire-cashback  search-outbox  search-reindex  expire-coupons
backup  wishlist-digest  daily-deals  email-retry  cashback-settlement
```

HEAD in turn has six routes `autopilot` never had: `anonymize-user-data`,
`deals-autopilot`, `payout-run`, `price-schedule`, `price-snapshot`,
`settlement-reconcile`. The Vercel project is on the Hobby plan (measured in
the closeout's own DEPLOY-PIPELINE document), and Hobby caps cron jobs at two,
run once a day, so the 25-entry block would not have scheduled anything on
that project anyway. HEAD's Actions scheduler is the working design; nothing
to take here beyond the reminder that the secret is still unset.

### 3. Source only on `autopilot` (219 files, about 120 of them not tests)

Grouped by what they are for, with the HEAD counterpart that already exists.

| area | autopilot adds | HEAD already has | verdict |
|---|---|---|---|
| jobs queue and dead letter | src/lib/jobs (contracts, dlq, queue, runner), api/jobs/run, api/jobs/dlq, cron/job-dlq, migration 242 | `src/server/payments/webhook-dlq.ts`, `src/app/api/search/index-dlq/route.ts`; no general queue | no consumer in HEAD; skip until one exists |
| scalability seams, all off by default | read-replica, redis-queue, qstash, cache/http, cart session-cache, rate-limit edge-shield and graduated, workers/async-offload plus a Cloudflare Worker under infra/ | `src/lib/rate-limit/` with upstash and sliding window | no environment here has a replica, Upstash, QStash or even R2; skip |
| gift cards | store page, redeem form, code lib, issue path, actions, migration 234 | nothing (`gift_cards` absent from types and tree) | a feature, not in the final queue; would need its own item and migration |
| cashback tracker, expiry, settlement | account/cashback page, cron expire-cashback and cashback-settlement, migration 215 | `src/lib/cashback/engine.ts`, `rules.ts`, admin cashback page, per-product `cashback_percent`, credit at finalize | overlap; HEAD's engine is the one the money path uses |
| invoices with sequential numbering and own Hebrew PDF | lib/invoices issuer and pdf, migration 228 | `src/server/payments/invoices.ts`, `src/app/api/invoices/[orderId]/download/route.ts`, admin invoices | overlap; numbering needs a migration HEAD does not have |
| order receipt PDF | account/orders/[id]/receipt route, lib/orders/receipt-pdf | `src/app/(account)/account/orders/[id]/invoice/route.ts` | overlap |
| postal-code autofill | api/checkout/postal-code, lib/checkout/postal-autofill | `src/lib/checkout/israeli-postal-code.ts` | overlap |
| reviews UI and moderation | ReviewForm, ReviewFormGate, Reviews, RatingStars, admin ReviewActionsClient, migration 232 | `src/components/reviews/ReviewForm.tsx`, `src/server/queries/reviews.ts`, pending 221 and 222 | overlap, different component tree |
| wishlist alert prefs, digest, unsubscribe | WishlistAlertPrefs, unsubscribe page and token, cron wishlist-digest, migration 233 | `src/lib/wishlist/alerts.ts`, `src/app/api/cron/wishlist-alerts/route.ts` | partial; digest and unsubscribe are new |
| faceted search UI | faceted-server, facet-links, category-scope, query-locale, SearchFacetNav, CategoryAutocomplete, crons search-outbox and search-reindex, migration 238 | `src/app/api/search/`, `src/lib/search/outbox-drain.ts` | violates the standing rule: no search field, filter chips only; drop |
| SMS OTP | lib/sms/otp, migration 239 | `src/lib/auth/phone-otp.ts`, `src/app/(auth)/login/PhoneOtpForm.tsx`, Twilio webhook | overlap |
| privacy self-service | account/privacy page, ConsentSettings, DeleteAccountForm, deletion lib, actions/privacy | `src/app/api/account/export/route.ts`, `src/server/account/export-data.ts`, `src/server/account/anonymize-user-data.ts`, cron | overlap; HEAD lacks only the self-service page |
| account extras | ChangePasswordForm, NotificationBell, ReplayOptInToggle, SentryUserSync | bell in `src/app/(account)/layout.tsx`, `src/components/analytics/PostHogReplay.tsx` | overlap |
| analytics and experiments | posthog-funnel, experiments, experiment-stats, feature-flags, checkout-variant, cashback-tier cohorts, revenue-fact, server/analytics | `src/lib/analytics/` (17 modules), admin analytics pages, pending 235 feature flags | overlap |
| fraud | coupon-stacking, review-queue, FraudActions, user-bans query, migration 226 and 237 | `src/lib/fraud/velocity.ts`, pending 234 blocklist, `src/lib/admin/user-ban.ts` | overlap |
| product live and rating, coupon expiry countdown and QR expiry, flash deals | product-live lib, CouponExpiryCountdown, CouponQrExpiry, pricing/flash-deals, cron daily-deals, migrations 217 and 235 | `src/lib/coupons/qr-pdf.ts`, deals-autopilot and price-snapshot crons | partial |
| shipping methods at cart | CartShippingSelector, lib/shipping/methods, shipping-cookie, migration 236 | 197 shipping zones live, `src/server/actions/admin/shipping.ts` | partial |
| alerting | lib/observability/telegram, lib/alerts/uptimerobot, api/alerts/uptimerobot, scripts/telegram-verify.mjs, scripts/uptimerobot/, scripts/axiom/monitors.mjs plus a revenue dashboard | `scripts/axiom/setup.mjs` with four dashboards and `monitors.json`; Sentry live | **candidate**: small, env-gated, Sentry is currently unread |
| PWA | install-surface (iOS instructions), bounded image cache in the service worker | `src/components/pwa/InstallPrompt.tsx`, `src/app/offline/page.tsx`; `public/sw.js` changed on both sides | partial |
| supplier scanner at /scan | src/app/(supplier)/scan/page.tsx | HEAD moved the screen to `/supplier/scan` on 21.09 to end a redirect loop | contradicts HEAD; drop |
| media ingest | scripts/media-ingest (WXR images, derivatives, store) and migration 210 | nothing under that path | store step needs R2, which is not enabled; skip |
| tests only | cookie-attributes, inline-html, parameterized-queries, e2e/topbar.spec.ts, load/peak.js | k6 spike exists (`docs/FINAL-REPORT-V2.md`) | port only if the subject exists; see section 5 |

### 4. Documents only on `autopilot`

| document | lines | what | verdict |
|---|---|---|---|
| docs/RLS-AUDIT-2026-09-09.md | 127 | every public table's RLS and grants, queried live against production on 09.09 | **worth keeping** as a dated measurement; needs an index row and a pass through the path audit |
| docs/ARCHITECTURE-SCALABILITY.md | 116 | the four seams in section 3, all inert without env | describes code HEAD does not have; skip |
| docs/PERF-ARCHITECTURE-REPORT.md | 213 | six perf items measured before and after on 17.09 | numbers are for that tree; skip |
| ARCHITECTURE-USER-ACCOUNT.md (repo root) | 188 | the account area on that branch, marked BINDING | describes autopilot components; would trip the docs gates; skip |

## What only the closeout commit has (`7b2e5795b`, local only)

72 files, 19,242 insertions, 37 deletions. Three things in it.

### 5. Fifty-nine new test files

33 are `*-actions.test.ts` files beside `src/server/actions/`. 29 of those
name a module that exists in HEAD. Of the HEAD modules, nine have **no test
anywhere in HEAD that imports them**:

```
src/server/actions/admin/cashback.ts       src/server/actions/admin/categories.ts
src/server/actions/admin/discounts.ts      src/server/actions/admin/fraud.ts
src/server/actions/admin/product-import.ts src/server/actions/admin/suppliers.ts
src/server/actions/admin/vendors.ts        src/server/actions/newsletter.ts
src/server/actions/reviews.ts
```

This is the one clearly portable asset in either branch. Two caveats decide
how: the tests were written against the autopilot versions of those modules,
and 23 files under `src/server/` changed on both sides since the base
(`auth.ts`, `cart.ts`, `admin/fraud.ts`, `admin/orders.ts`, `admin/users.ts`,
`notifications.ts` among them), so each file has to be re-read against HEAD's
signatures and run, one module per item. The remaining 26 test files target
modules HEAD does not have (the deploy scripts below, qstash, redis-queue,
faceted-server, sms/otp, gift-cards) or already-covered ones.

The same commit raises `vitest.config.ts` to a global 80% line floor over
`src/lib` and `src/server`. HEAD floors the money path per file and nothing
else, by decision recorded in that file; the floor does not port.

### 6. A blue-green deploy pipeline and two hosted checks

.github/workflows/deploy-promote.yml (on push to `main`),
`auto-rollback.yml`, eight scripts under scripts/deploy (promote, rollback,
smoke, mark-release, migrate-plan, notify, vercel, lib) with seven test files,
a Lighthouse CI job (`@lhci/cli`, lighthouserc.cjs) and a Percy visual job
(`@percy/cli`, `@percy/playwright`, .percy.yml, e2e/visual.spec.ts,
playwright.cross-browser.config.ts).

The pipeline targets Vercel project `prj_oqr4NKtSaB2h3szrxnT0DknAv9Xk`, which
the closeout's own DEPLOY-PIPELINE document records as linked to
`kenyonexpress/kenyonexpress-web`, not this repository. HEAD deploys by REST
with an explicit git sha for exactly that reason (`docs/RUNBOOK.md`). Percy
and Lighthouse CI need accounts and tokens the repository does not hold.
Skip all of it; the migrate-plan idea is already covered by
`migrations/pending/APPLY-ORDER.md` and the rolled-back dry run.

### 7. Regressions the closeout commit would carry in

- `pnpm lint` is cut to three gates. HEAD runs twelve; the nine dropped are
  raw-html, postgrest-or, cache-invalidation, rtl-logical, i18n, locale-format,
  input-dir, docs-index and docs-path-audit.
- `.github/workflows/security.yml` and `synthetic.yml` are deleted.
- `audit:catalogue`, `audit:final`, `gate:secret-leak` and the eight `seed:*`
  scripts are gone from `package.json`.
- docs/DNS-INCIDENT-2026-09-17.md diagnoses a lame delegation to two
  Cloudflare pairs. On 25.09 the registrar delegates to `ns1.vercel.com` and
  `ns2.vercel.com` instead of `ns1.vercel-dns.com` (`STATE.md`, blocker 1).
  The document is a snapshot of a state that no longer holds.

## What is worth keeping, ranked

1. **The nine action test files** in section 5, ported by hand one module at a
   time against HEAD's signatures, each with the four gates. Value: real
   coverage on admin money-adjacent actions that have none.
2. **The applied-ledger correction**: 188 to 191, 194, 196, 197, 201 and 218
   are live in production and still sit under `migrations/pending/` in HEAD.
   `autopilot` moved five of them. HEAD should move all nine, with checksums,
   and nothing else in that directory.
3. **Telegram alert channel and UptimeRobot relay** (section 3, alerting row).
   Small and inert without a bot token; worth an item only if Ofir wants a
   phone-side alert, since Sentry already exists and is unread.
4. **docs/RLS-AUDIT-2026-09-09.md** as a dated measurement, copied with an
   index row. Everything it names was queried live, which is rarer here than
   it should be.

Everything else in both branches is either already in HEAD in another form,
contradicts a standing rule (search UI, `/scan` path), depends on services
this project does not have (replica, QStash, R2, Percy, LHCI, Vercel crons on
Hobby), sits under a migration number HEAD has already spent, or is a
regression (lint, deleted workflows, dropped scripts).

## How to redo this measurement

```bash
git rev-list --left-right --count HEAD...autopilot
git rev-list --left-right --count autopilot...phase5/homepage-closeout
git merge-base HEAD autopilot
git diff --stat a3df275ed autopilot | tail -1
comm -12 <(git diff --name-only a3df275ed autopilot | sort) \
         <(git diff --name-only a3df275ed HEAD | sort) | wc -l
git diff --diff-filter=A --name-only HEAD autopilot | wc -l
git diff --name-status autopilot phase5/homepage-closeout
git branch -r --contains 7b2e5795b
```
