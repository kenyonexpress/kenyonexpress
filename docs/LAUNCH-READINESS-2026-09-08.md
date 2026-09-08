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
| 06 IMAGES | ⚠️ partial, blocked | 320 renditions produced and proven idempotent (rerun `produced 0, reused 320`) and resumable (delete 3, `produced 3, reused 317`). Crawl source gone (403), R2 disabled (`10042`). Only 18 of 82 sources are wide enough for all four tiers; 168 tiers skipped as upscales rather than faked. |
| 07 CATALOG | ✅ | Union, synonyms, typo tolerance and sync pipeline all present. `discount_percent` facet was missing and was added, DERIVED from the two prices via `deriveDiscountPercent` so it cannot contradict the badge. |
| 08 STOREFRONT | ✅ fixed | 18 routes verified 200 on real data. `/suppliers` demanded a login because `startsWith('/supplier')` matches `/suppliers`; fixed and verified against a production build. |
| 09 MOBILE | ⚠️ improved | 44px violations 168 → 90. Both primary commerce controls fixed via a centred `::after`, so the boxes stay 40x40 and 37x34 and the pixel gate is untouched. |
| 10 ADMIN | ✅ | Content-Uploader pricing block enforced server-side in two layers. `AUTO_APPROVAL_LIMIT = 3` over 365 days, capping automation rather than the customer's statutory right. |
| 11 PAYMENTS | ✅ | State machine is `pending → paid → split_executed`; `authorized`/`captured` belong to the escrow model migration 085 removed. Cardcom sends no signature to verify. |
| 12 VOUCHERS | ✅ | `randomBytes` Crockford base32, rate-limited manual entry, immutable redemption log. |
| 13 OBSERVABILITY | ⚠️ **rewritten 2026-09-08** | The old wording called `/api/health` being database-only a shortfall. It is not: the route argues the choice at length, and a liveness probe that names every dependency is a public inventory of the stack. The real state is (a) `/api/ready` 404s in production, which is risk 1, not a code gap; (b) all five named PostHog events exist, four under different names — `view_product`, `purchase`, `voucher_redeemed`, `order_refunded`, pinned by `src/lib/analytics/step13-event-names.test.ts`; (c) the four server money events are dropped by the DB whitelist until migration 169 applies, and `trackServerEvent` logs `analytics.event_rejected` when that happens; (d) Sentry, PostHog and Axiom are all inert in production for want of keys — MANUAL, and `deploy-preflight` now refuses a deploy with no `SENTRY_DSN`. |
| 14 PERFORMANCE | ⚠️ | LCP and TTFB pass. Bundle 255.8 KB against a 180 KB target (42% over). **`/cart` CLS 0.357** against a 0.05 budget — corrected 2026-09-08, this was reported as checkout and was the cart all along. Query plans measured; no index warranted. |
| 15 SEO | ✅ fixed | hreflang and the RSS feed link were configured in the root layout and served on ZERO routes: 16 pages replaced the whole `alternates` field. Fixed via `alternatesFor()` and verified in the served HTML. |
| 16 LEGAL | ✅ | No PAN in schema or data, verified by counting matches without selecting values. Five Hebrew RTL policies. GDPR deliberately not claimed. |
| 17 TESTS | ✅ | Every named journey has a spec; k6 present with a real threshold table. The `access-control-allow-origin: *` seen in production is on Vercel's edge-cached HTML only, never on an API route. |
| 18 CICD | ✅ fixed | `bundle-gate`, `migration-lint` and `lighthouse` existed and appeared in no workflow. The first two are now a CI job. |
| 19 BI | ⚠️ | Four of six metrics. Refund rate is shown as an amount, not a rate; redemption rate is absent. Neither is derivable from `loadSalesLines`, which loads paid order lines only. |

---

## 3. Open risks, by severity

| # | Severity | Risk | Evidence |
| --- | --- | --- | --- |
| 1 | **critical** | Production runs a 6-day-old build; the deploying host is invisible from this account | `/api/ready` 404; 11 ERROR deploys; no `kenyonexpress` project in the team |
| 2 | **high** | `/suppliers` turns away every prospective supplier, live now | prod 307 → `/login` |
| 3 | ~~high~~ **medium, CORRECTED 2026-09-08** | The 0.357 is **`/cart`**, not checkout. An unseeded sweep follows `/checkout` -> `/cart` (empty-cart redirect) and files the cart's metrics under checkout's name. Real checkout CLS is covered by a seeded test at < 0.1 and was fixed by `CheckoutShell` | `checkout/page.tsx:109`; `e2e/layout-stability.spec.ts`; `docs/PERF-REPORT.md` §4 |
| 4 | medium | Cron alarm red on 20% of runs, masking any real failure | 6 of last 30 runs; `whatsapp=404` every time |
| 5 | medium | Shared JS 42% over budget | 255.8 KB vs 180 KB |
| 6 | medium | 8 active products whose slug and name describe different products | `/product/שעון-אפל...` renders "ארוחת בוקר זוגית" |
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
