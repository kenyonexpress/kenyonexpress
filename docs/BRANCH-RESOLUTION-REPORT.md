# Branch Resolution Report: audit/final-audit vs main

**Date:** 2026-10-19  
**Status:** AUDIT ONLY (NO PUSH, NO MERGE, NO CHERRY-PICK)  
**Prepared by:** Claude Autopilot

---

## Executive Summary

The repository is in a critical branch divergence state:

- **Production Branch:** `audit/final-audit` (wired to Vercel since 2026-10-05)
- **Protected Branch:** `main` (requires PR + 4 checks, GitHub protected)
- **Divergence:** Significant split with **1,243 commits** reachable from main but not audit/final-audit, and **145 commits** reachable from audit/final-audit but not main
- **Merge Base:** `a3df275ed` (Merge PR #44 chore/vitest-4)
- **No Automatic Merge Path:** The branches have truly diverged; a simple merge will create conflicts

---

## Vercel Production Configuration

| Property | Value |
|----------|-------|
| **Project ID** | prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP |
| **Project Name** | kenyonexpress |
| **Production Branch** | `audit/final-audit` |
| **Branch Changed On** | 2026-10-05 (L02 in queue) |
| **Previous Production Branch** | `phase5/homepage` |
| **Preview Deployments** | Disabled |
| **Current Deployment Trigger** | Every push to `audit/final-audit` triggers automatic production deployment |

**Source:** Memory record `vercel-git-autodeploy-wired-to-audit-branch.md` (verified via Vercel CLI)

---

## Commit Analysis

### Branch HEADs

| Branch | HEAD | Commit Message |
|--------|------|-----------------|
| **origin/main** | `e4220ba9c` | L10 row 25: second abandoned-cart reminder (pending 244) (#85) |
| **origin/audit/final-audit** | `337d1a2a4` | docs(m08-c113): seller line carries ח.פ 033798513 (#89) |

### Commit Counts

```
Commits ONLY in main (not reachable from audit/final-audit):  145
Commits ONLY in audit/final-audit (not reachable from main): 1,243
Merge base: a3df275ed (chore/vitest-4)
```

### Commit Type Distribution

#### On audit/final-audit (1,243 commits) — primarily documentation and measurements:

| Type | Count | Notes |
|------|-------|-------|
| docs(state) | 387 | STATE.md updates (Q11-Q18) |
| docs(perf) | 25 | Performance measurements |
| docs(db) | 15 | Database documentation |
| docs(seo) | 14 | SEO verification |
| docs(security) | 14 | Security audits |
| docs(e2e) | 11 | E2E test documentation |
| chore(deps) | 10 | Dependency updates |
| docs(a11y) | 9 | Accessibility verification |
| perf(images) | 5 | Image optimization |
| fix(a11y) | 5 | Accessibility fixes |
| **feat*** | ~180 | Various features (reviews, product, deals, auth, admin, etc.) |
| **fix*** | ~100 | Various fixes across all areas |
| **test*** | ~40 | Test coverage additions |
| **refactor*** | 3 | Code refactoring |
| **ci*** | 3 | CI/CD changes |
| **style*** | 1 | Code style |
| **Phase tags** | 19 | Phase 11–19 markers |
| **Merge commit** | 1 | Merge of origin/main into audit/final-audit |

**Pattern:** audit/final-audit is an audit branch with extensive measurement documentation (387 docs(state) entries), staged features, and verification records.

#### On main (145 commits) — primarily new features and automated merges:

| Type | Count | Notes |
|------|-------|-------|
| autopilot residual | 17 | Autopilot cleanup commits |
| [autopilot] docs(state) | 16 | STATE.md updates (newer phase) |
| docs(state) | 3 | Manual state docs |
| chore(deps) | 3 | Dependency updates |
| [auto-merger] merge autopilot | 27 | Automated merge commits from autopilot |
| **[autopilot] feat*** | ~28 | Features from autopilot (whatsapp, stock, shipping, sentry, security, search, rbac, pwa, posthog, payments, invoicing, gdpr, email, db, cron, checkout, axiom, alerts, admin, account) |
| **[autopilot] fix*** | 8 | Fixes from autopilot |
| **[autopilot] test*** | 1 | Test additions from autopilot |
| **[autopilot] docs*** | 4 | Documentation from autopilot |
| **[autopilot] chore*** | 1 | Chore from autopilot |
| **[autopilot] ops*** | 1 | Ops work |
| L10 rows** | 29 | Feature rows from L10 ledger |
| Merge commits | 2 | Manual merges of origin/main into autopilot |
| Wave markers | 2 | Wave 5 and Wave 6 |
| L9 row | 1 | |
| fix(ken-8, cart, money, e2e) | 3 | Named fixes |
| ci | 1 | |
| migrations | 1 | |
| docs | 2 | |

**Pattern:** main is the newer mainline with L10 feature implementation and ongoing autopilot work. It has NOT been updated since audit/final-audit was cut from it.

---

## Migration Analysis

### Migrations on audit/final-audit (but not main)

- 184_orders_monthly_partitioning.sql
- 188_pin_invoker_search_path.sql
- 189_reviews_title_and_one_per_product.sql
- 190_abandoned_cart_second_reminder.sql
- 191_payment_discrepancies.sql
- 192_seed_seo_redirects.sql
- 194_discount_claim_caps.sql
- 196_shipped_notification_carries_tracking.sql
- 197_shipping_zones_and_pickup.sql
- 201_scheduled_price_changes.sql
- 202_fraud_abuse.sql
- 203_support_center.sql
- 204_supplier_onboarding.sql
- 205_content_pages.sql
- 206_homepage_merchandising.sql
- 207_email_deliverability.sql
- 208_drop_redundant_indexes.sql
- 209_advisor_warnings.sql
- 210_product_phases.sql
- 211_subscriptions_phase2.sql

### Migrations on main (but not audit/final-audit)

- 211_whatsapp_selfservice.sql
- 212_courses_phase2.sql

**Conflict Risk:** HIGH. If merging main → audit/final-audit, migrations 211-212 need to be applied after 211_subscriptions_phase2. Both branches have pending migrations that will conflict if merged.

---

## Recommended Action Plan (For Ofir Decision)

This report is **AUDIT ONLY**. No automatic merges or cherry-picks have been performed. Ofir must decide:

### Option A: Rebase main onto audit/final-audit
- **Pros:** Brings all L10 features and autopilot work into production
- **Cons:** Rewrites 145 commits; requires force push to main (breaks GitHub protection)
- **Migrations:** Must apply 211_whatsapp_selfservice.sql and 212_courses_phase2.sql after current audit/final-audit migrations
- **Risk:** Very high; history is not preserved

### Option B: Cherry-pick main's new features onto audit/final-audit
- **Candidate commits:**
  - `e4220ba9c` L10 row 25: second abandoned-cart reminder
  - `27e194f03` migrations: record 240, 241, 235 as applied
  - `e4e11e7f6` L10 row 23: club tier
  - `184798a49` L10 row 20: admin price schedule
  - `d42f49a11` L10 row 21: gift cards
  - `24c3d2e9e` L10 row 26: product comparison
  - `23ad2f79c` L10 row 13: web till offline
  - ... (145 total)
- **Pros:** Selective, audit trail preserved
- **Cons:** 145 cherry-picks; high merge conflict risk; labor intensive
- **Risk:** Medium; conflicts likely with docs(state) entries

### Option C: Create a fresh integration branch
- **Method:** git merge-base, then reapply common features from both branches
- **Pros:** Clean integration, fresh testing
- **Cons:** New branch, requires full testing
- **Risk:** Medium; requires coordination

### Option D: Keep audit/final-audit as production, deprecate main
- **Method:** Continue deploying from audit/final-audit; delete main; rename audit/final-audit → main
- **Pros:** Simple, avoids merge complexity, audit/final-audit is already in production
- **Cons:** Loses L10 work from autopilot; violates GitHub protection convention
- **Risk:** Low; audit/final-audit is already live

---

## Key Blockers Identified

1. **Migration Collision:** Both branches have unapplied pending migrations (audit/final-audit: 211_subscriptions_phase2; main: 211_whatsapp_selfservice, 212_courses_phase2)
2. **GitHub Protection:** main is protected; pushing a force update will trigger the pre-push hook and fail with REFUSED
3. **State Divergence:** audit/final-audit has 387 docs(state) entries documenting measurements; main has 16. Merging will complicate the state file.
4. **No Autopilot PR Integration:** The 29 [autopilot] and [auto-merger] commits on main do not have PR reviews (audit/final-audit is the production branch, so PRs go to main, but main is not deployed)

---

## Commit Lists for Manual Review

### Top Features on main (not in audit/final-audit)

```
e4220ba9c L10 row 25: second abandoned-cart reminder (pending 244) (#85)
27e194f03 migrations: record 240, 241 and 235 as applied in production (#84)
e4e11e7f6 L10 row 23: club tier on the account overview (#83)
184798a49 L10 row 20: an admin screen that schedules price changes (#82)
d42f49a11 L10 row 21: gift cards get an admin switch, a printable QR and a way in (#81)
24c3d2e9e L10 row 26: product comparison (#80)
23ad2f79c L10 row 13: the web till keeps scans made while offline (#79)
bba925deb L10 row 15: operations KPIs on the admin analytics page (#78)
a6b628d5f L10 row 8: "bought this week" on the product page (#77)
59304cfe2 L10 row 6: wishlist hearts on product cards (#76)
539895eef L10 row 10: trust bar on the product page and the cart (#75)
e93162b16 L10 row 9: countdown on the issued voucher and on listing cards (#74)
5b6c4bc67 L10 row 5: recently viewed, on the product page and the home page (#73)
01d1210a4 L10 row 4: infinite scroll on the shop and category listings (#72)
20d380228 L10 row 2: supplier, discount and category-tree facets on search (#71)
8ef64b087 L10 row 3: sort control on the search page (#70)
```

### Top Audit/State Commits on audit/final-audit (only there)

```
337d1a2a4 docs(m08-c113): seller line carries ח.פ 033798513 (#89)
1e84df0e5 docs(m07-c113): TODO/FIXME scan on HEAD 6ae2b05de, only the two tracked TODO(cardcom), zero new
6ae2b05de docs(m06-c113): build gate re-verified clean on HEAD 86137f52a, 340/340, zero drift
86137f52a docs(m05-c113): test gate re-verified clean on HEAD b93675616, 640/640, zero drift
b93675616 docs(m04-c113): type-check gate re-verified clean on HEAD f0c73423f, zero drift
f0c73423f docs(m03-c113): category parity re-measured on a clean HEAD build, 3.72/2.88/1.71 PASS
ebbb72628 fix: L1 LANDMINES collected property and lint
d0cc3be4f docs(m02-c113): product parity re-measured on a clean HEAD build, 4.80/4.39/2.46 PASS
9cb9ceb6b docs(m01-c113): home parity re-measured on a clean HEAD build, 7.92/9.03/4.16 PASS, zero diff
c70765cf5 docs(m18-c112): trim STATE.md to 192 lines, move M12..M17-c112 entries to STATE-ARCHIVE
```

---

## Technical Details

### Git Commands for Reference

```bash
# Commits only in main
git log --oneline origin/audit/final-audit..origin/main

# Commits only in audit/final-audit
git log --oneline origin/main..origin/audit/final-audit

# Merge base
git log -1 $(git merge-base origin/main origin/audit/final-audit) --oneline

# Check for conflicts (without merging)
git merge --no-commit --no-ff origin/main origin/audit/final-audit
git merge --abort
```

### Vercel Configuration

- **Installation Command:** `pnpm install --no-frozen-lockfile`
- **Build Command:** `pnpm build`
- **Output Directory:** `.next`
- **Region:** fra1
- **Crons:** 32 scheduled cron endpoints configured in vercel.json

---

## Conclusion

The repository has two distinct lineages:

1. **audit/final-audit** - Production branch (deployed live), heavily instrumented with audit documentation and measurement records
2. **main** - Protected branch with L10 feature implementation and autopilot work, not deployed

**This split must be resolved manually by Ofir.** The report above provides all data needed to make an informed decision about which integration path to take.

**⛔ STOP HERE.** Do not attempt to merge, cherry-pick, or push changes. All decisions are Ofir's to make.

---

## Report Generated

- **Generated:** 2026-10-19
- **Session:** Claude Autopilot (non-interactive)
- **Scope:** Audit only; no code changes made
- **Next Step:** Ofir reviews and decides on integration strategy
