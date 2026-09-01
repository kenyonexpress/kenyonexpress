# ARCHITECTURE-DOCS-INDEX.md

<!-- v1-final-banner:2026-09-01 -->

Index of `docs/`. Rewritten 2026-09-01 against production
(`ixvwfbuvfxxsjiywhbbb`). The previous version indexed a worktree branch
(`arch/docs-queue`) that is no longer where the work lives, and named a master
document that production contradicts.

## Start here

**`ARCHITECTURE-OVERVIEW.md` is the master document.** It describes the whole
system in one file: data model, money in agorot, coupon lifecycle, roles and
RLS, search pipeline, deployment topology. Every number in it was measured
against production on 2026-09-01, and it carries the queries so they can be
re-checked. Where any other document in this directory disagrees with it, the
overview is right.

Read it before any other file here.

## Authority order

1. `ARCHITECTURE-OVERVIEW.md`: the system as it actually is
2. The source files it names, especially `src/lib/money.ts`,
   `src/server/payments/README.md`, and the two state machines
3. Everything else in this directory

## Status legend

Documents carrying a `<!-- v1-final-banner -->` block have been checked against
production and their contradicted claims are named at the top. Documents without
one were either already accurate or describe something production cannot
contradict (checklists, reports of past runs, content plans).

⛔ superseded · ⚠️ partly stale, corrections at the top · 📅 historical record

## Current and load-bearing

| Document | What it is |
|---|---|
| `ARCHITECTURE-OVERVIEW.md` | **The master document.** |
| `LAUNCH-RUNBOOK.md` | The binding launch sequence. Supersedes `DEPLOY.md`. |
| `CRON-EXTERNAL.md` | The ten scheduled jobs and why none of them runs yet. |
| `AUTH-MODEL.md` | Roles, sessions, route guards. |
| `DB-SECURITY-MODEL.md` | Live grant and RLS map, re-measured 2026-09-01. |
| `CARDCOM-ARCHITECTURE.md` | The payment integration as built (legacy `/Interface/*.aspx`, unsigned callbacks). |
| `SEARCH-PIPELINE-SPEC.md` | Webhook, QStash, outbox, Meilisearch. |
| `ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md` | The end-to-end checkout path. |
| `ARCHITECTURE-REFUNDS-CANCELLATIONS.md` | Refund workflow and the statutory fee cap. |

## Corrected 2026-09-01

These carry a banner naming exactly what production contradicts.

⛔ `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` · `ARCHITECTURE-COMMERCE.md` ·
`MASTER-ARCHITECTURE.md` · `MASTER-ARCHITECTURE-v2.md` · `MIGRATION-BACKLOG.md` ·
`ARCHITECTURE-GO-LIVE-CHECKLIST.md`

⚠️ `ARCHITECTURE-ADMIN-ANALYTICS.md` · `ARCHITECTURE-ADMIN-DASHBOARD.md` ·
`ARCHITECTURE-SUPPLIER-PORTAL.md` · `ARCHITECTURE-SUPPLIER-REDEMPTION.md` ·
`ARCHITECTURE-ACCOUNT.md` · `ARCHITECTURE-CHECKOUT-CARDCOM.md` ·
`ARCHITECTURE-ORDER-STATE-MACHINE.md` · `ARCHITECTURE-PRODUCT-TYPES.md` ·
`ARCHITECTURE-PAYMENT-RECONCILIATION.md` · `ARCHITECTURE-INVOICING-TAX.md` ·
`ADMIN-PRODUCT-PAGE-SPEC.md` · `DB-SCHEMA.md` · `DB-DRIFT-AUDIT.md`

📅 `PRODUCTION-CHANGES-2026-07-27.md` · `PAYMENTS-VERIFY-REPORT.md` ·
`CONTRADICTIONS.md`

**The four claims those banners keep having to make**, because they recur across
the corpus:

1. There is no escrow, and there never will be. `escrow_held` and
   `escrow_released` are dead enum values; `escrow_holds` holds 2 legacy rows
   with no writer.
2. There is no `supplier_payouts` table and there never was in this lineage.
   The `payout_status` and `payout_line_type` enums are live with nothing
   behind them.
3. The coupon prepayment is an absolute shekel amount
   (`products.coupon_price_ils`), never 10% or any other percentage.
4. `platform_settled` is live in `order_status`, `payment_status` and
   `settlement_status`. Any six-value `order_status` list is wrong.

## By domain

**Commerce and money**: `ARCHITECTURE-CART-CHECKOUT.md`,
`ARCHITECTURE-CART-ZUSTAND.md`, `ARCHITECTURE-COUPON-REDEMPTION.md`,
`ARCHITECTURE-COUPON-REDEMPTION-UX.md`, `COUPON-STOREFRONT-SPEC.md`,
`ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md`,
`ARCHITECTURE-SHIPPING-RETURNS.md`, `BUSINESS-MODEL.md`

**Storefront**: `ARCHITECTURE-CATEGORY-PAGE.md`, `PRODUCT-PAGE-SPEC.md`,
`ARCHITECTURE-SEARCH.md`, `ARCHITECTURE-CATALOG-SEARCH-SEO.md`,
`ARCHITECTURE-SEO.md`, `ARCHITECTURE-SEO-SITEMAP.md`,
`ARCHITECTURE-SEO-PERFORMANCE.md`, `ARCHITECTURE-PERFORMANCE.md`,
`ARCHITECTURE-PWA.md`, `ARCHITECTURE-WISHLIST.md`, `ARCHITECTURE-MEDIA-R2.md`,
`ARCHITECTURE-DESIGN-SYSTEM.md`, `ARCHITECTURE-ACCESSIBILITY.md`,
`ARCHITECTURE-COOKIE-CONSENT.md`, `COMPONENT-INVENTORY.md`

**Account and support**: `ARCHITECTURE-ACCOUNT.md`,
`ARCHITECTURE-ACCOUNT-AREA.md`, `ARCHITECTURE-ACCOUNT-IDENTITY.md`,
`ARCHITECTURE-ACCOUNT-WALLET.md`, `ARCHITECTURE-PERSONAL-AREA.md`,
`ARCHITECTURE-CUSTOMER-SUPPORT.md`, `CUSTOMER-SUPPORT-PLAYBOOK.md`,
`ARCHITECTURE-NOTIFICATIONS.md`, `ARCHITECTURE-NOTIFICATIONS-V2.md`,
`ARCHITECTURE-NOTIFICATIONS-MARKETING.md`, `ARCHITECTURE-AI-AGENTS*.md`

**Admin, suppliers, growth**: `ADMIN-ARCHITECTURE.md`,
`ARCHITECTURE-ADMIN.md`, `ARCHITECTURE-ADMIN-DASHBOARD.md`,
`ARCHITECTURE-ADMIN-ANALYTICS.md`, `ARCHITECTURE-SUPPLIER-PORTAL.md`,
`ARCHITECTURE-SUPPLIER-ONBOARDING.md`, `SUPPLIER-ONBOARDING-KIT.md`,
`ARCHITECTURE-AFFILIATES-REFERRALS.md`, `ARCHITECTURE-REFERRALS.md`,
`ARCHITECTURE-GROWTH-SEO.md`, `GROWTH-LAUNCH-MARKETING.md`,
`ARCHITECTURE-ANALYTICS*.md`

**Security, legal, ops**: `ARCHITECTURE-SECURITY.md`,
`ARCHITECTURE-SECURITY-AUDIT.md`, `ARCHITECTURE-SECURITY-COMPLIANCE.md`,
`DB-HARDENING-AUDIT.md`, `ARCHITECTURE-LEGAL*.md`,
`ARCHITECTURE-FRAUD-RATE-LIMITS.md`, `ARCHITECTURE-ENV-SECRETS.md`,
`ARCHITECTURE-FEATURE-FLAGS.md`, `ARCHITECTURE-INCIDENT-RESPONSE.md`,
`ARCHITECTURE-OBSERVABILITY.md`, `ARCHITECTURE-OPS.md`,
`ARCHITECTURE-PRODUCTION-OPS.md`, `ARCHITECTURE-BACKUP-DR.md`,
`DISASTER-RECOVERY.md`, `RUNBOOK-OPS.md`, `SENTRY-SETUP.md`,
`CI-AND-BRANCH-PROTECTION.md`, `GITHUB-SETTINGS.md`

**Data and WordPress import**: `ARCHITECTURE-WP-MIGRATION*.md`,
`ARCHITECTURE-WP-DATA-MIGRATION*.md`, `WP-IMPORT-REPORT.md`,
`WP-IMPORT-2026-08-07-MAPPING.md`, `WP-EXPORT-2026-07-29-DRY-RUN.md`,
`DATA-BASELINE.md`, `SEED-REPORT.md`

**Testing and measurement**: `ARCHITECTURE-TESTING.md`,
`ARCHITECTURE-TESTING-CICD.md`, `E2E-MEASURED.md`, `QA-CHECKLIST.md`,
`LIGHTHOUSE-AUDIT.md`, `PIXEL-WAVE-REPORT.md`, `A11Y-SWEEP-REPORT.md`,
`rtl-violations.md`, `hardcoded-audit.md`, `coupon-page-measured.md`

**Launch**: `LAUNCH-RUNBOOK.md`, `LAUNCH-CHECKLIST.md`,
`LAUNCH-READINESS.md`, `LAUNCH-DAY-PLAN.md`, `OWNER-CHECKLIST.md`,
`OFIR-APPROVALS.md`, `QUESTIONS-FOR-OFIR.md`, `DECISIONS.md`

## Revision

| Date | Change |
|---|---|
| 2026-09-01 | Rewritten against production. `ARCHITECTURE-OVERVIEW.md` named as master; 22 documents banded with their specific contradicted claims; branch reference to `arch/docs-queue` removed. |
| 2026-07-31 | Index after docs-queue continuous run |
| 2026-07-31 | Gap docs: env, flags, shipping, reconcile, onboarding, incident, a11y, design, cookies |
| 2026-07-31 | Link MASTER-ARCHITECTURE-v2; GO-LIVE/ONBOARDING/ANALYTICS/SUPPORT rev C |
