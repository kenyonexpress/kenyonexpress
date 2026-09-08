# Launch readiness, 2026-09-08

Assessed across STEP 05 to STEP 19 on 2026-09-08, branch `closeout/v1-final`.

Supersedes `docs/LAUNCH-READINESS.md`, which carries its own banner marking it a
frozen snapshot from 2026-09-01. That file is not edited here: it is a record of
what was true then, and overwriting it would destroy a record somebody
deliberately preserved.

---

## Verdict

> **NOT READY — and the blocker is not the code. 121 commits on this branch have
> never reached a customer, and the host that serves them is not visible from
> this account.**

Everything below is measured. Where a number could not be measured, it says so
rather than estimating.

---

## Verdict, re-derived after 22 maintenance passes

This document has been amended in six separate passes since it was written, and
a verdict assembled from eight corrections is not a verdict. Re-derived here
from what is now known.

### The corrected tally

```
                     as written    now
step verdicts   ✅        11         7
                ⚠️         4         8
open risks                 8         8
MANUAL items               8        10
```

**NOTHING REGRESSED.** Not one of those four steps got worse; the measurements
got better. STEP 13 was ticked on a check that read `/api/health` being
database-only as a shortfall when it is a reasoned decision. STEP 16 was ticked
without noticing that `/api/account/export` does not exist. STEP 17 was ticked
while every one of the suite's 25 skipped tests was an RLS test that skipped in
CI as well. STEP 18 was ticked with the secrets audit it names never written.
STEP 19 moved the other way and is genuinely closed.

Each tick was honest about what it had checked. None of them had checked
everything the step asks for.

### The one line, sharpened

> **NOT READY. Two decisions block the rest, and neither of them is code:
> which host serves production, and which branch is the mainline.**

The first was already risk 1. The second was risk-free bookkeeping when it was
found in pass 7 and is not any more:

- seven migration numbers name two different schema changes, and **four of
  `main`'s are already applied in production**;
- the cron scheduler runs from the default branch, so it calls a `whatsapp` job
  that 404s (**20% of runs red, ongoing**) and **has never once called
  `retention`**, whose migration is applied and whose function therefore exists
  and is never invoked.

That is one undecided question producing three live failures in three unrelated
subsystems.

### One correction to this document's own opening

It opened with "the blocker is not the code". For LAUNCH that is still true and
144 commits still have not reached a customer. As a statement about code
quality it was too generous: the passes since found roughly a dozen genuine
defects, including three admin mutations writing no audit row, a `slugify` that
returned the empty string for every Hebrew name, and the two most important
audit rows in the money path swallowing their own write failures.

The launch blocker is not the code. The code was not as finished as the ticks
implied. Both are true and the document should say both.

### Not re-tagged

`v1.0.0-rc1` still points at `77d81c95c` and is still not an ancestor of this
branch. Moving a published tag rewrites history other clones hold. The
repository is at `v5.5.3`.

---

## 1. The blocker that outranks the rest

Production serves a build from **before 2026-09-02 12:03**.

```
host                       /api/ready  /api/health  /suppliers  /cookie-policy
kenyonexpress.vercel.app   404         200          307         404
www.kenyonexpress.co.il    404         200          307         404
```

`/api/ready` was added in commit `64728ff8d` at 2026-09-02 12:03 and exists in
BOTH branches. It 404s, so the live build predates it.

**What that costs right now, in front of real customers:** `/suppliers` still
answers 307 to `/login`. That is the public join-us page carrying the supplier
lead form, linked from the footer and published in `sitemap.xml` at priority
0.7. Every prospective supplier who clicks it is shown a login form. The fix is
committed and not deployed.

### Why it cannot be deployed from here

In the Vercel project this account can see, `kenyonexpress-web`:

- 11 deployments, **all in state ERROR**
- the only one with `target: "production"` is from 2026-05-18, commit
  `3ae5eaefa` ("Change font to Rubik")
- no deployment has ever succeeded

Yet the live site works, with Heebo and current pages, so it is built by
something else. Looking up a project named `kenyonexpress` in the team returns
404, and `list_teams` returns one team.

**The host serving customers cannot be deployed to, rolled back, or inspected
from this account.** That is worse than a failing deploy, because a failing
deploy is at least visible.

---

## 2. Step by step

| Step | Verdict | Evidence |
| --- | --- | --- |
| 05 HOME | ⚠️ built, gate unmet | 1440 = 7.2% PASS; 380 = 30.33%, 768 = 29.55%. Heights agree to 0.2%, so section count and height are right. The reference's hero is an uninitialised Slider Revolution (42 `revslider` refs, no JS under `file://`) and its icon font did not localise. |
| 06 IMAGES | ⚠️ partial, blocked — **rechecked 2026-09-08** | 320 renditions produced and proven idempotent (rerun `produced 0, reused 320`) and resumable (delete 3, `produced 3, reused 317`). Crawl source gone (403), R2 disabled (`10042`). Only 18 of 82 sources are wide enough for all four tiers; 168 tiers skipped as upscales rather than faked. **The catalogue side is healthy and was verified, not assumed:** all 49 referenced image URLs are relative, all 49 exist under `public/`, and all five AVIF sources decode with the pinned sharp — so the documented `/_next/image` silent-passthrough does not apply here. The 321 renditions sit in gitignored `.image-staging`; `--publish` is deliberately not run, because `next/image` optimises the sources on demand and the script refuses to commit binaries for a destination nobody has chosen. `scripts/audit-product-images.mjs` demanded an admin key that answers 401 here, so **the tool written to notice broken images could not be run by anyone**; it now accepts the anon key and reports UNCHECKED tables instead of clean. Run that way: 49 references, all resolve, nothing unchecked. |
| 07 CATALOG | ✅ | Union, synonyms, typo tolerance and sync pipeline all present. `discount_percent` facet was missing and was added, DERIVED from the two prices via `deriveDiscountPercent` so it cannot contradict the badge. |
| 08 STOREFRONT | ✅ fixed — **rechecked 2026-09-08** | 18 routes verified 200 on real data. `/suppliers` demanded a login because `startsWith('/supplier')` matches `/suppliers`; fixed and verified against a production build. **Category integrity rechecked:** 12 categories, no bad slugs, no duplicates, no orphan parents, and every one of the 45 active products points at a category that exists. One finding: 5 of 12 categories have zero active products and answer 200 with an empty state, while the sitemap advertised all 12 at priority 0.8 daily — five soft-404s pushed to Google. Empty archives are now excluded from the sitemap (not 404'd: an empty shelf is not a missing aisle). |
| 09 MOBILE | ⚠️ improved — **PWA half verified 2026-09-08** | 44px violations 168 → 90. Both primary commerce controls fixed via a centred `::after`, so the boxes stay 40x40 and 37x34 and the pixel gate is untouched. **The PWA requirements this row never assessed are present and wired:** all three manifest icons exist, `public/sw.js` precaches exactly `/offline` and one icon and both are real, `/offline` is a route, and `ServiceWorkerRegistrar` and `InstallPrompt` are both mounted in the root layout with `appleWebApp` and `themeColor` set. One fix: `/offline` carried no `robots` directive and was indexable — a page whose whole content is "no connection" competing for the brand name. Now `index: false`, and deliberately NOT disallowed in `robots.txt`, because a blocked path's noindex is never read. |
| 10 ADMIN | ✅ — **two unassessed requirements verified 2026-09-08** | Content-Uploader pricing block enforced server-side in two layers. `AUTO_APPROVAL_LIMIT = 3` over 365 days, capping automation rather than the customer's statutory right. **"Coupon-Partner read-only"** has no role of that name; it maps to `support`, which is genuinely read-only — `isAdminRole` and `isStaffRole` both exclude it, so `requireAdminSession` and the catalogue writers refuse it, while `isPanelRole` admits it to read. **Authorization coverage:** all 43 mutating admin actions are behind a role guard, verified by resolving the two-hop pattern (`requireCatalogWriter` in products/categories, `guard()` wrapping `requireSection('payments','write')` in payouts) rather than by name. |
| 11 PAYMENTS | ✅ **verified against production 2026-09-08** | State machine is `pending → paid → split_executed`; `authorized`/`captured` belong to the escrow model migration 085 removed. Cardcom sends no signature to verify. **Webhook idempotency was never assessed and is now the open item.** It is implemented correctly — the handler inserts into `payment_webhook_events` first and treats 23505 as "Cardcom delivered this twice" — but all of that correctness is borrowed from a UNIQUE constraint on `(provider, external_event_id)`, and **whether that constraint exists in production cannot be established from this checkout**: `supabase/migrations/` declares it and does not describe production, the generated types cannot express uniqueness, anon sees none of these tables, and the admin key answers 401. Without it a redelivered callback finalises an already-charged card a second time. **Answered the same day by running it:** `payment_webhook_events_dedup UNIQUE (provider, external_event_id)` IS present in production, as are `payments.idempotency_key` and `wallet_entries.idempotency_key`. A redelivered Cardcom callback cannot re-finalise a charged card. Migration 060 lists a fourth, `ledger_journals.event_key` — that table does not exist in production and is referenced by no code and by no generated type, so it is an unbuilt design from LEDGER-DESIGN.md rather than a missing guard, and `scripts/audit-money-constraints.mjs` records it as n/a rather than crying wolf every run. |
| 12 VOUCHERS | ✅ | `randomBytes` Crockford base32, rate-limited manual entry, immutable redemption log. |
| 13 OBSERVABILITY | ⚠️ **rewritten 2026-09-08** | The old wording called `/api/health` being database-only a shortfall. It is not: the route argues the choice at length, and a liveness probe that names every dependency is a public inventory of the stack. The real state is (a) `/api/ready` 404s in production, which is risk 1, not a code gap; (b) all five named PostHog events exist, four under different names — `view_product`, `purchase`, `voucher_redeemed`, `order_refunded`, pinned by `src/lib/analytics/step13-event-names.test.ts`; (c) the four server money events are dropped by the DB whitelist until migration 169 applies, and `trackServerEvent` logs `analytics.event_rejected` when that happens; (d) Sentry, PostHog and Axiom are all inert in production for want of keys — MANUAL, and `deploy-preflight` now refuses a deploy with no `SENTRY_DSN`. |
| 14 PERFORMANCE | ⚠️ | LCP and TTFB pass. Bundle 255.8 KB against a 180 KB target (42% over). **`/cart` CLS 0.357** against a 0.05 budget — corrected 2026-09-08, this was reported as checkout and was the cart all along. Query plans measured; no index warranted. |
| 15 SEO | ✅ fixed | hreflang and the RSS feed link were configured in the root layout and served on ZERO routes: 16 pages replaced the whole `alternates` field. Fixed via `alternatesFor()` and verified in the served HTML. |
| 16 LEGAL | ⚠️ **corrected 2026-09-08** | No PAN, five Hebrew RTL policies, GDPR deliberately not claimed — all still true. Two things the tick hid: (a) **`/api/account/export` does not exist.** Deletion does; there is no export. The section 13 right of access is met instead by the documented email process answered within 30 days, which is lawful, but it is a deviation from the brief and was not recorded. (b) The recipients table named Supabase as the only storage provider while `invoices.ts` mirrors the customer's invoice PDF into **Cloudflare R2**. Accurate only because R2 is disabled; enabling it (MANUAL item 3) would have made the policy incomplete. Cloudflare is now disclosed and `src/app/(legal)/processor-disclosure.test.ts` holds the table against the integrations. (c) **Found and fixed 2026-09-08:** the cookie policy promised withdrawal "at any time", naming the consent banner as the mechanism — and the banner is hidden before paint the moment the cookie exists, with nothing anywhere to re-open it. The first click was final. A `resetConsent` action now clears the cookie, and a control on `/cookie-policy` calls it; the policy text names that control instead of an unreachable one. |
| 17 TESTS | ⚠️ **corrected 2026-09-08** | Journeys, k6 and the CORS reading all still stand. What the tick hid: **every one of the suite's 25 skipped tests is a database authorization test** — `rls-role-boundaries` 13/13, `anon-catalog` 8/9, `wallet-rls` 4/5, and nothing else in the repo skips. They gate on `SUPABASE_URL`/`SUPABASE_ANON_KEY`, and the CI unit-test job passed neither, so OWASP "RLS bypass" had no automated coverage anywhere. The job now reads two repository variables (`vars.RLS_SUPABASE_*`); until an owner sets them the suites skip exactly as before. **Run for the first time on 2026-09-08 (`pnpm test:rls`): 27 pass, 11 skip.** Anon cannot insert into `wallet_balances` or `wallet_transactions`, `wallet_transactions` leaks no rows to an anon SELECT, the anonymous catalogue reads work, and `is_admin()`/`is_supplier_member()` answer an anon caller `false` rather than erroring. RLS holds on every assertion that could be checked. See MANUAL item 9. |
| 18 CICD | ⚠️ **corrected 2026-09-08** | `bundle-gate` and `migration-lint` are a CI job. **Lighthouse is excluded deliberately**, and the workflow argues it: it needs a booted server and its numbers on a shared runner are noise against a 95 threshold, so a required check would teach everyone to ignore a red one. Rollback is documented (`RUNBOOK.md §5`) including the honest part — no Vercel token in this checkout, so it is a manual action. **The secrets audit the step names did not exist**; `compromised-keys` checks the environment at deploy, nothing looked at what is committed. Added `scripts/audit-secrets.mjs`, wired into the `gates` job. It found one real thing — see MANUAL item 10. |
| 19 BI | ✅ **closed 2026-09-08** | Six of six. Refund rate and redemption rate added as `src/lib/analytics/rates.ts` + `loadRateCounts`, windowed on `paid_at` and `issued_at` respectively. A zero denominator renders `—`, never `0%`. Redemption is read from `vouchers.status`/`redeemed_at` and deliberately NOT from `voucher_redemptions`, which records refused scans and would put failures in a success numerator. |

---

## 3. Open risks, by severity

| # | Severity | Risk | Evidence |
| --- | --- | --- | --- |
| 1 | **critical** | Production runs a 6-day-old build; the deploying host is invisible from this account | `/api/ready` 404; 11 ERROR deploys; no `kenyonexpress` project in the team |
| 2 | **high** | `/suppliers` turns away every prospective supplier, live now | prod 307 → `/login` |
| 3 | ~~high~~ **medium, CORRECTED 2026-09-08** | The 0.357 is **`/cart`**, not checkout. An unseeded sweep follows `/checkout` -> `/cart` (empty-cart redirect) and files the cart's metrics under checkout's name. Real checkout CLS is covered by a seeded test at < 0.1 and was fixed by `CheckoutShell` | `checkout/page.tsx:109`; `e2e/layout-stability.spec.ts`; `docs/PERF-REPORT.md` §4 |
| 4 | **high, rediagnosed 2026-09-08** | The scheduler runs from the DEFAULT branch, so it uses `main`'s job list, not this one's. Two effects: `whatsapp` is called and 404s (6 of last 30, exactly 20%, latest 04:53 today), and **`retention` and `weekly-digest` are never called at all** — `main`'s list omits them. `retention` ages `audit_log` IPs past 365 days via `fn_audit_retention_sweep()`, and migration 157 IS applied, so the function exists and has simply never been invoked. The red alarm was at least visible; the unscheduled job is silent. `scripts/audit-cron-drift.mjs`; the fix is the mainline decision. |
| 5 | medium | Shared JS 42% over budget | 255.8 KB vs 180 KB |
| 6 | medium | 8 active products whose slug and name describe different products | `/product/שעון-אפל...` renders "ארוחת בוקר זוגית". **Related, found 2026-09-08 and fixed:** the admin slug rule was `^[a-z0-9-]+$`, Latin only, while 36 of 45 active products carry a Hebrew slug from the WordPress import — so **80% of the catalogue could not be saved through the admin form at all**, failing on a field the editor never touched. |
| 7 | low | 90 touch targets still under 44px, 32 of them one homepage label. **Corrected 2026-09-08:** the probe that produced this includes `/checkout`, which bounces to `/cart` unseeded, so part of that total is the cart counted twice. `scripts/_touch-targets.mjs` now records `finalPath`; the figure needs one re-run to be exact | measured at 380px |
| 8 | low | `set_updated_at` has no pinned `search_path` (52 triggers) | migration 177, pending |

Risk 1 makes risks 2, 3 and 5 undeployable rather than unfixed. **The fixes exist
and cannot ship.**

---

## 4. MANUAL — only the owner can do these

| # | Action | Evidence it is blocked |
| --- | --- | --- |
| 1 | **Find who serves `kenyonexpress.vercel.app`** and deploy this branch | no such project in the visible team; 11 ERROR deploys in the one that is visible |
| 2 | Decide whether `whatsapp` belongs in `main` or out | `prod /api/cron/whatsapp → 404`; the route exists on main and not on this branch |
| 3 | Enable R2 in the Cloudflare dashboard | `403 {"code":10042,"message":"Please enable R2..."}` |
| 4 | Provision a Meilisearch instance | `MEILISEARCH_HOST` set nowhere outside `.env.example` |
| 5 | Rotate `SUPABASE_SECRET_KEY` | listed in `scripts/compromised-keys.mjs` |
| 6 | Supply a working Resend key | the local one answers `API key is invalid` |
| 7 | box.co.il NS, Cardcom production keys, Vercel Pro | from `AGENT-RULES.md` |
| 8 | Deployed URL for the vault, to unblock migration 162 | 162 sits in `migrations/pending/` |
| 10 | **Delete the tracked file `^[A-Z_]* .env.local`** | 15,915 bytes of the `less` help screen, committed in `8dd678d18` by an unquoted grep pattern in a broad `git add`. It holds no credentials — checked — but its NAME claims to, so every future secret scan stops at it. Deleting files is one of the four conditions reserved for a human, so it is recorded in `audit-secrets.mjs` as a known finding instead. |
| 9 | Set repo **variables** `RLS_SUPABASE_URL` and `RLS_SUPABASE_ANON_KEY` to this project's public URL and anon key | **Verified safe 2026-09-08 by running them: 27 pass, 11 skip.** Un-skips **14** of the 25, not the 12 first estimated, and every one passes — so this will not produce a red gate. The 11 that remain need seeded fixture users and name themselves in the skip reason; they stay skipped until there is a database `pnpm seed:test` may write to. Both values are already public (the anon key ships in every page's client bundle), so variables not secrets, and `secrets.CI_SUPABASE_*` is untouched. Reproduce with `pnpm test:rls`. |

`CRON_SECRET` is **not** on this list: it and `CRON_SCHEDULER_ENABLED=true` have
been set since 2026-09-02 and the schedules fire.

---

## 5. Gate status

```
type-check   clean
lint         clean
tests        4321 passing, 25 skipped
```

One test is red and it is not from this work: a second agent holds uncommitted
edits to `src/styles/tokens.ts` and `tokens.css`. Verified by stashing only
those two files - 24/24 green without them, and their work restored intact.

---

## 6. On the tag

STEP 20 asks for `v1.0.0-rc1`. **That tag already exists**, pointing at
`77d81c95c` (2026-09-02) whose message reads "verdict still NOT READY", and it
is not an ancestor of this branch. The repository is at `v5.3.1`.

Moving a published tag onto a different commit rewrites history that other
clones already hold, and it would overwrite a record of a previous assessment.
Tagged `v5.3.2` instead, following the project's own convention.
