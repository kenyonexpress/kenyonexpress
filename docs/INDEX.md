# Documentation Index

Every document in `docs/`, what it is for, and whether you can trust it.

**161 documents.** 89 current, 50 carrying a correction banner, 22 marked as
historical snapshots.

Last reconciled against production (`ixvwfbuvfxxsjiywhbbb`) on **2026-09-01**.

---

## How to read the status column

| | Meaning |
|---|---|
| ✅ | Current. Verified against production in this pass. |
| ⚠️ | Useful, but carries a banner: it names tables or numbers production contradicts. The design may still be sound; the schema it assumes is not what exists. |
| 🕯️ | Historical snapshot. True on its date, **not maintained**. Evidence, not guidance. |

**If two documents disagree, `ARCHITECTURE-OVERVIEW.md` wins**, because every
number in it was read out of the live database rather than out of a migration
file or a prior document.

---

## Start here

| Document | Status | What it is |
|---|---|---|
| [ARCHITECTURE-OVERVIEW.md](ARCHITECTURE-OVERVIEW.md) | ✅ | **The whole system in one document.** Data model, money, coupon lifecycle, roles, search, deployment. Start here. |
| [ONBOARDING.md](ONBOARDING.md) | ✅ | Clone to running locally, and the four traps that cost hours. |
| [GLOSSARY.md](GLOSSARY.md) | ✅ | Every domain term, Hebrew and English, including the two that mean the opposite of what you would assume. |
| [SCHEMA-REALITY-CHECK.md](SCHEMA-REALITY-CHECK.md) | ✅ | The 31 table names the docs use that production does not have. **Check here before writing any query from a document.** |

---

## The system

| Document | Status | What it is |
|---|---|---|
| [DATA-MODEL.md](DATA-MODEL.md) | ✅ | Every table, its columns, relationships and RLS posture. Includes the three concepts modelled twice. |
| [MONEY-MODEL.md](MONEY-MODEL.md) | ✅ | Agorot, the 26 generated columns, which amounts are signed and why. |
| [PAYMENT-FLOW.md](PAYMENT-FLOW.md) | ✅ | Cart to settled line, with state diagrams matching the live enums. |
| [VOUCHER-LIFECYCLE.md](VOUCHER-LIFECYCLE.md) | ✅ | Issue, code, QR, redemption, expiry. The `redeem_voucher` guard order. |
| [SUPPLIER-PAGE.md](SUPPLIER-PAGE.md) | ✅ | The supplier portal and its authorisation model. |
| [SEARCH-PIPELINE-SPEC.md](SEARCH-PIPELINE-SPEC.md) | ✅ | Two write paths, the outbox, Meilisearch settings as implemented. |
| [API-REFERENCE.md](API-REFERENCE.md) | ✅ | 30 routes and 85 server actions: method, auth, shapes. |
| [ROLES-AND-PERMISSIONS.md](ROLES-AND-PERMISSIONS.md) | ✅ | Three role systems, and three traps in `has_role`. |
| [DECISIONS.md](DECISIONS.md) | ✅ | 41 architecture decisions with reasoning, plus 7 superseded. |
| [DECISIONS-PROVISIONAL.md](DECISIONS-PROVISIONAL.md) | ✅ | Decisions taken in Ofir's absence, still awaiting approval. |

## Security

| Document | Status | What it is |
|---|---|---|
| [SECURITY-POSTURE.md](SECURITY-POSTURE.md) | ✅ | Threat model, 13 threats, 21 advisor findings triaged, 8 gaps. |
| [DB-SECURITY-MODEL.md](DB-SECURITY-MODEL.md) | ✅ | Grants, definer functions, the nine server-only tables. |
| [AUTH-MODEL.md](AUTH-MODEL.md) | ⚠️ | The auth layers. Counts corrected in this pass. |
| [ARCHITECTURE-SECURITY.md](ARCHITECTURE-SECURITY.md) | ⚠️ | The per-table RLS manifest. Table counts corrected. |
| [DB-HARDENING-AUDIT.md](DB-HARDENING-AUDIT.md) | ⚠️ | Why "0 WARN" would take the site down. Dated counts annotated. |
| [ARCHITECTURE-SECURITY-AUDIT.md](ARCHITECTURE-SECURITY-AUDIT.md) | ⚠️ | Earlier security audit. |
| [ARCHITECTURE-SECURITY-COMPLIANCE.md](ARCHITECTURE-SECURITY-COMPLIANCE.md) | ⚠️ | Compliance mapping. Names unbuilt tables. |
| [ARCHITECTURE-FRAUD-RATE-LIMITS.md](ARCHITECTURE-FRAUD-RATE-LIMITS.md) | ⚠️ | Fraud signals and rate limiting. |

## Operations

| Document | Status | What it is |
|---|---|---|
| [RUNBOOK.md](RUNBOOK.md) | ✅ | Alerts, on-call steps, rollback, common failures. |
| [INCIDENT-PLAYBOOKS.md](INCIDENT-PLAYBOOKS.md) | ✅ | Six named incidents with steps. |
| [OPERATIONS-CALENDAR.md](OPERATIONS-CALENDAR.md) | ✅ | Every scheduled job, when it should run, what breaks while it does not. **Nothing is scheduled.** |
| [DEPLOYMENT.md](DEPLOYMENT.md) | ✅ | Environments, secrets, deploy and rollback. |
| [TESTING.md](TESTING.md) | ✅ | What is tested where, the gates, and what is *not* tested. |
| [INDEX-USAGE-REPORT.md](INDEX-USAGE-REPORT.md) | ✅ | 281 indexes, 178 unscanned, and why not to drop them yet. |
| [CRON-EXTERNAL.md](CRON-EXTERNAL.md) | ✅ | How to switch a scheduler on. Paste-ready table. |
| [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md) | ⚠️ | Restore procedure. |
| [RUNBOOK-OPS.md](RUNBOOK-OPS.md) | ⚠️ | Earlier ops runbook; superseded by `RUNBOOK.md`. |
| [ARCHITECTURE-OBSERVABILITY.md](ARCHITECTURE-OBSERVABILITY.md) | ⚠️ | Logging and Sentry. |
| [ARCHITECTURE-INCIDENT-RESPONSE.md](ARCHITECTURE-INCIDENT-RESPONSE.md) | ⚠️ | Earlier incident doc; superseded by `INCIDENT-PLAYBOOKS.md`. |
| [SENTRY-SETUP.md](SENTRY-SETUP.md) | ✅ | Sentry configuration. |
| [ARCHITECTURE-BACKUP-DR.md](ARCHITECTURE-BACKUP-DR.md) | ⚠️ | Backup design. |
| [ETERNAL-OPS.md](ETERNAL-OPS.md) | ⚠️ | The autonomous agent loop. |
| [GITHUB-SETTINGS.md](GITHUB-SETTINGS.md) | ✅ | Repository settings. |
| [CI-AND-BRANCH-PROTECTION.md](CI-AND-BRANCH-PROTECTION.md) | ✅ | CI gates and branch protection. |
| [VERCEL-CRON.md](VERCEL-CRON.md) | ⚠️ | Superseded by `OPERATIONS-CALENDAR.md`. |
| [DEPLOY.md](DEPLOY.md) | ⚠️ | Earlier deploy notes; superseded by `DEPLOYMENT.md`. |

## Commerce and payments

| Document | Status | What it is |
|---|---|---|
| [BUSINESS-MODEL.md](BUSINESS-MODEL.md) | ✅ | The commercial rules in Hebrew. The source of the money design. |
| [CARDCOM-ARCHITECTURE.md](CARDCOM-ARCHITECTURE.md) | ⚠️ | Cardcom specifics: legacy API, unsigned webhooks. |
| [ARCHITECTURE-COMMERCE.md](ARCHITECTURE-COMMERCE.md) | ⚠️ | The commerce design. Enum lists corrected. |
| [ARCHITECTURE-ORDER-STATE-MACHINE.md](ARCHITECTURE-ORDER-STATE-MACHINE.md) | ⚠️ | Five state machines. Escrow values marked dead. |
| [ARCHITECTURE-CART-CHECKOUT.md](ARCHITECTURE-CART-CHECKOUT.md) | ⚠️ | Cart and checkout. |
| [ARCHITECTURE-CHECKOUT-CARDCOM.md](ARCHITECTURE-CHECKOUT-CARDCOM.md) | ⚠️ | Checkout against Cardcom. |
| [ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md](ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md) | ⚠️ | End-to-end checkout walkthrough. |
| [ARCHITECTURE-COUPON-REDEMPTION.md](ARCHITECTURE-COUPON-REDEMPTION.md) | ⚠️ | Redemption design. Contains a never-applied enum draft, marked. |
| [ARCHITECTURE-COUPON-REDEMPTION-UX.md](ARCHITECTURE-COUPON-REDEMPTION-UX.md) | ⚠️ | Redemption UX. |
| [ARCHITECTURE-SUPPLIER-REDEMPTION.md](ARCHITECTURE-SUPPLIER-REDEMPTION.md) | ⚠️ | Supplier-side redemption. |
| [ARCHITECTURE-PAYMENT-RECONCILIATION.md](ARCHITECTURE-PAYMENT-RECONCILIATION.md) | ⚠️ | Reconciliation design. |
| [ARCHITECTURE-REFUNDS-CANCELLATIONS.md](../ARCHITECTURE-REFUNDS-CANCELLATIONS.md) | ⚠️ | Refunds and Israeli consumer law. Lives at the repository root. |
| [ARCHITECTURE-INVOICING-TAX.md](ARCHITECTURE-INVOICING-TAX.md) | ⚠️ | Invoicing and VAT. |
| [ARCHITECTURE-ACCOUNT-WALLET.md](ARCHITECTURE-ACCOUNT-WALLET.md) | ⚠️ | The wallet. See `DATA-MODEL.md` §1 on which wallet tables are live. |
| [LEDGER-DESIGN.md](../LEDGER-DESIGN.md) | 🕯️ | A double-entry ledger that was never built. |
| [ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md](ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md) | ⚠️ | Combined checkout and redemption spec. |
| [PAYMENTS-VERIFY-REPORT.md](PAYMENTS-VERIFY-REPORT.md) | ⚠️ | Payment verification pass. |
| [ARCHITECTURE-PRODUCT-TYPES.md](ARCHITECTURE-PRODUCT-TYPES.md) | ⚠️ | The four product types. |

## Catalogue, storefront, UI

| Document | Status | What it is |
|---|---|---|
| [PRODUCT-PAGE-SPEC.md](PRODUCT-PAGE-SPEC.md) | ⚠️ | Product page. Escrow ruling corrected in this pass. |
| [ADMIN-PRODUCT-PAGE-SPEC.md](ADMIN-PRODUCT-PAGE-SPEC.md) | ⚠️ | Admin product editor. |
| [COUPON-STOREFRONT-SPEC.md](COUPON-STOREFRONT-SPEC.md) | ⚠️ | Coupon storefront. |
| [ARCHITECTURE-CATEGORY-PAGE.md](ARCHITECTURE-CATEGORY-PAGE.md) | ⚠️ | Category page. |
| [ARCHITECTURE-DESIGN-SYSTEM.md](ARCHITECTURE-DESIGN-SYSTEM.md) | ✅ | Tokens and components. |
| [COMPONENT-INVENTORY.md](COMPONENT-INVENTORY.md) | ⚠️ | Component list. |
| [ARCHITECTURE-ACCESSIBILITY.md](ARCHITECTURE-ACCESSIBILITY.md) | ✅ | Accessibility, Israeli standard. |
| [ARCHITECTURE-PERFORMANCE.md](ARCHITECTURE-PERFORMANCE.md) | ⚠️ | Performance budget. |
| [ARCHITECTURE-PWA.md](ARCHITECTURE-PWA.md) | ⚠️ | PWA and offline. |
| [ARCHITECTURE-SEARCH.md](ARCHITECTURE-SEARCH.md) | ⚠️ | Search design; see `SEARCH-PIPELINE-SPEC.md` for what is built. |
| [ARCHITECTURE-SEO.md](ARCHITECTURE-SEO.md) · [SEO-SITEMAP](ARCHITECTURE-SEO-SITEMAP.md) · [SEO-PERFORMANCE](ARCHITECTURE-SEO-PERFORMANCE.md) | ⚠️ | SEO. |
| [ARCHITECTURE-ACCOUNT.md](ARCHITECTURE-ACCOUNT.md) · [ACCOUNT-AREA](ARCHITECTURE-ACCOUNT-AREA.md) · [PERSONAL-AREA](ARCHITECTURE-PERSONAL-AREA.md) | ⚠️ | The account area. |
| [ARCHITECTURE-ADMIN.md](ARCHITECTURE-ADMIN.md) · [ADMIN-DASHBOARD](ARCHITECTURE-ADMIN-DASHBOARD.md) · [ADMIN-ANALYTICS](ARCHITECTURE-ADMIN-ANALYTICS.md) | ⚠️ | Admin. |
| [ARCHITECTURE-SUPPLIER-PORTAL.md](ARCHITECTURE-SUPPLIER-PORTAL.md) | ⚠️ | Supplier portal design; see `SUPPLIER-PAGE.md`. |

## Growth, content, legal

| Document | Status | What it is |
|---|---|---|
| [ARCHITECTURE-LEGAL-COMPLIANCE.md](ARCHITECTURE-LEGAL-COMPLIANCE.md) | ⚠️ | Israeli consumer and privacy law mapping. |
| [ARCHITECTURE-LEGAL.md](ARCHITECTURE-LEGAL.md) · [LEGAL-PAGES](ARCHITECTURE-LEGAL-PAGES.md) | ⚠️ | Legal pages. |
| [legal/COUNSEL-REVIEW.md](legal/COUNSEL-REVIEW.md) | ✅ | Points for counsel. |
| [CUSTOMER-SUPPORT-PLAYBOOK.md](CUSTOMER-SUPPORT-PLAYBOOK.md) | ✅ | What support may and may not say. |
| [CONTENT-OPERATIONS-GUIDE.md](CONTENT-OPERATIONS-GUIDE.md) | ✅ | Content operations, Hebrew. |
| [SUPPLIER-ONBOARDING-KIT.md](SUPPLIER-ONBOARDING-KIT.md) | ✅ | Supplier onboarding pack. |
| [ARCHITECTURE-NOTIFICATIONS.md](ARCHITECTURE-NOTIFICATIONS.md) · [V2](ARCHITECTURE-NOTIFICATIONS-V2.md) · [MARKETING](ARCHITECTURE-NOTIFICATIONS-MARKETING.md) | ⚠️ | Notifications. |
| [ARCHITECTURE-REFERRALS.md](ARCHITECTURE-REFERRALS.md) · [AFFILIATES](ARCHITECTURE-AFFILIATES-REFERRALS.md) | ⚠️ | Referrals and affiliates. |
| [ARCHITECTURE-ANALYTICS.md](ARCHITECTURE-ANALYTICS.md) · [BI](ARCHITECTURE-ANALYTICS-BI.md) · [KPI](ARCHITECTURE-ANALYTICS-KPI.md) | ⚠️ | Analytics. **`analytics_events` was never built.** |
| [ARCHITECTURE-MOBILE-APP.md](ARCHITECTURE-MOBILE-APP.md) · [SUPERAPP](ARCHITECTURE-MOBILE-SUPERAPP.md) | ⚠️ | The Expo app. |

## WordPress migration

| Document | Status |
|---|---|
| [ARCHITECTURE-WP-MIGRATION.md](ARCHITECTURE-WP-MIGRATION.md) · [PLAN](ARCHITECTURE-WP-MIGRATION-PLAN.md) · [DATA](ARCHITECTURE-WP-DATA-MIGRATION.md) · [EXECUTION](ARCHITECTURE-WP-DATA-MIGRATION-EXECUTION.md) | ⚠️ |
| [WP-IMPORT-REPORT.md](WP-IMPORT-REPORT.md) · [EXPORT DRY RUN](WP-EXPORT-2026-07-29-DRY-RUN.md) · [MAPPING](WP-IMPORT-2026-08-07-MAPPING.md) | 🕯️ |

The live import tables are in the **`wp_import` schema**, 14 of them, and
`wp_import.orders`, `.products` and `.vouchers` shadow `public` names.

## Migration and drift

| Document | Status | What it is |
|---|---|---|
| [MIGRATION-BACKLOG.md](MIGRATION-BACKLOG.md) | ⚠️ | Which migrations applied and which did not. 137 is pending. |
| [DB-DRIFT-AUDIT.md](DB-DRIFT-AUDIT.md) | ⚠️ | The repo-versus-production drift. Phantom names here are the subject. |
| [DB-SCHEMA.md](DB-SCHEMA.md) | ⚠️ | Schema reference; superseded by `DATA-MODEL.md`. |
| [DDL-FIXES.md](DDL-FIXES.md) | 🕯️ | A DDL remediation pass. |
| [CONTRADICTIONS.md](CONTRADICTIONS.md) | ⚠️ | The contradiction register that preceded this pass. |
| [PRODUCTION-CHANGES-2026-07-27.md](PRODUCTION-CHANGES-2026-07-27.md) | ⚠️ | What was applied that day. |

## Historical snapshots

Kept as evidence. **Not maintained.**

[A11Y-SWEEP-REPORT](A11Y-SWEEP-REPORT.md) ·
[CATEGORY-1TO1-FINDINGS](CATEGORY-1TO1-FINDINGS.md) ·
[coupon-page-measured](coupon-page-measured.md) ·
[DATA-BASELINE](DATA-BASELINE.md) ·
[DDL-FIXES](DDL-FIXES.md) ·
[E2E-MEASURED](E2E-MEASURED.md) ·
[FINAL-REPORT](FINAL-REPORT.md) ·
[hardcoded-audit](hardcoded-audit.md) ·
[LAUNCH-READINESS](LAUNCH-READINESS.md) ·
[LIGHTHOUSE-AUDIT](LIGHTHOUSE-AUDIT.md) ·
[MORNING-REPORT](MORNING-REPORT.md) ·
[OFIR-APPROVALS](OFIR-APPROVALS.md) ·
[PIXEL-WAVE-REPORT](PIXEL-WAVE-REPORT.md) ·
[PORT-FROM-DUP-REPO](PORT-FROM-DUP-REPO.md) ·
[PROJECT-COMPLETE](PROJECT-COMPLETE.md) ·
[QUESTIONS-FOR-OFIR](QUESTIONS-FOR-OFIR.md) ·
[rtl-violations](rtl-violations.md) ·
[SEED-REPORT](SEED-REPORT.md) ·
[SPAWNER-REVIVAL-MEASURED](SPAWNER-REVIVAL-MEASURED.md) ·
[WP-EXPORT-2026-07-29-DRY-RUN](WP-EXPORT-2026-07-29-DRY-RUN.md) ·
[WP-IMPORT-2026-08-07-MAPPING](WP-IMPORT-2026-08-07-MAPPING.md) ·
[WP-IMPORT-REPORT](WP-IMPORT-REPORT.md)

## Launch

[LAUNCH-CHECKLIST](LAUNCH-CHECKLIST.md) ⚠️ ·
[LAUNCH-DAY-PLAN](LAUNCH-DAY-PLAN.md) ⚠️ ·
[LAUNCH-RUNBOOK](LAUNCH-RUNBOOK.md) ⚠️ ·
[ARCHITECTURE-GO-LIVE-CHECKLIST](ARCHITECTURE-GO-LIVE-CHECKLIST.md) ⚠️ ·
[OWNER-CHECKLIST](OWNER-CHECKLIST.md) ✅ ·
[QA-CHECKLIST](QA-CHECKLIST.md) ⚠️

---

## The five things a newcomer most needs to know

1. **`supabase/migrations/` does not describe production.** 115 files against a
   98-migration ledger, different lineages. `src/types/database.ts` describes
   production.
2. **There is no escrow and no payout system.** The platform keeps the whole
   coupon prepayment; the supplier collects the balance in cash.
3. **`authenticated` still holds DML on 56 relations**, so RLS is the only
   database-level defence on the money tables.
4. **Nothing is scheduled.** No Vercel cron, and pg_cron is not installed.
5. **`finalize.ts` names two columns production does not have**, so the first
   real payment raises `42703`.

Items 3, 4 and 5 are the launch blockers. All three are in
[RUNBOOK.md](RUNBOOK.md).
