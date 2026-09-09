# Documentation Index

---

## What this is, in ten lines

For someone who will read nothing else.

1. **KenyonExpress is an Israeli coupon marketplace.** A customer pays a small
   absolute price online for a coupon worth much more, then pays the balance in
   cash at the business when they redeem it.
2. **The platform keeps the entire online payment, permanently.** There is no
   escrow, no hold, and no payout to a supplier on the coupon path. The cash at
   the counter is the supplier's and never touches us.
3. **Money is an integer number of agorot.** No float touches it anywhere, and
   every calculation goes through one module, `src/lib/money.ts`.
4. **The stack is Next.js 16 on Vercel, Postgres on Supabase, Cardcom for
   card payments.** One Next app at `src/app/`; `apps/` holds a mobile till app
   and nothing else.
5. **The database enforces the rules, not just the code.** 133 RLS policies,
   conservation CHECK constraints, an append-only payment journal, and three
   transition-guard triggers that refuse an illegal status move with `23514`.
6. **The catalogue is built and the money path is written.** 80 products, 12
   suppliers, 61 tables, 99 applied migrations.
7. **No customer has ever bought anything.** The four orders in production are
   E2E fixtures, and **zero vouchers have ever been issued**.
8. **There is no production site.** The Vercel project points at a different,
   abandoned repository, and all 11 of its deployments failed.
9. **Nothing scheduled runs.** Ten cron routes exist and nothing calls them, so
   vouchers do not expire and no voucher email is ever sent.
10. **Three defects stand between this and taking real money**: the deployment
    (8), the scheduler (9), and four column names on the money path that
    production does not have, which make the first real payment raise `42703`.

**In one sentence:** the system is substantially built and carefully
constrained, and it has never been switched on.

---

Every document in `docs/`, what it is for, and whether you can trust it.

**170 documents.** 98 current, 50 carrying a correction banner, 22 marked as
historical snapshots.

Last reconciled against production (`ixvwfbuvfxxsjiywhbbb`), the GitHub API and
the Vercel API on **2026-09-01**.

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
| [ONBOARDING-DAY-ONE.md](ONBOARDING-DAY-ONE.md) | ✅ | The first day hour by hour, clone to first merged PR, with a cut order for when it runs long. |
| [BUSINESS-RULES.md](BUSINESS-RULES.md) | ✅ | Every rule the code **refuses** to break, with the file and line that refuses. Plus the seven that are stated and enforced by nothing. |
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
| [ENV-REFERENCE.md](ENV-REFERENCE.md) | ✅ | Every environment variable: what breaks if it is missing, what breaks if it is **wrong**, which are secret, how to rotate. |
| [THIRD-PARTY-DEPENDENCIES.md](THIRD-PARTY-DEPENDENCIES.md) | ✅ | Every external service, plan and cost read from the provider APIs. **Contains the finding that there is no deployment.** |

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
| [FAILURE-MODES.md](FAILURE-MODES.md) | ✅ | **Every way this can fail, ranked by likelihood × impact.** Five entries are at certainty, not probability. |
| [QUERY-COOKBOOK.md](QUERY-COOKBOOK.md) | ✅ | Twenty SQL queries an operator needs, each one executed against production before being written down. |
| [RELEASE-PROCESS.md](RELEASE-PROCESS.md) | ✅ | Branch to production: who approves what, the gates, and how to roll back. Protection settings read from the API. |
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
| [DATA-RETENTION.md](DATA-RETENTION.md) | ✅ | What is kept and for how long, mapped to the Privacy Policy. **The deletion the policy promises is not implemented.** |
| [ACCESSIBILITY-STATEMENT.md](ACCESSIBILITY-STATEMENT.md) | ✅ | IS 5568 level AA, Hebrew and English, plus what is measured and what only runs locally. |


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
| [MIGRATION-BACKLOG.md](MIGRATION-BACKLOG.md) | ⚠️ | Which migrations applied and which did not. Read the banner: the backlog is empty, 137 included. |
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

---

## Everything else

The remaining 31 documents, added to this index on 2026-09-01 so that the index
is genuinely complete. Most are single-subject architecture notes from the
design phase; the status column means what it means at the top of this page.

### Admin, account, storefront features

| Document | Status | What it is |
|---|---|---|
| [ADMIN-ARCHITECTURE.md](ADMIN-ARCHITECTURE.md) | ✅ | The admin area as built. See also `ARCHITECTURE-ADMIN.md`. |
| [ARCHITECTURE-ACCOUNT-IDENTITY.md](ARCHITECTURE-ACCOUNT-IDENTITY.md) | ⚠️ | Customer account and identity. |
| [ARCHITECTURE-CART-ZUSTAND.md](ARCHITECTURE-CART-ZUSTAND.md) | ✅ | The Zustand cart store and its mirror in `localStorage`. |
| [ARCHITECTURE-WISHLIST.md](ARCHITECTURE-WISHLIST.md) | ✅ | Wishlist design. |
| [ARCHITECTURE-SHIPPING-RETURNS.md](ARCHITECTURE-SHIPPING-RETURNS.md) | ✅ | Physical shipping and returns. Read with `docs/BUSINESS-RULES.md` §8. |
| [ARCHITECTURE-SUPPLIER-ONBOARDING.md](ARCHITECTURE-SUPPLIER-ONBOARDING.md) | ✅ | How a supplier joins. |
| [ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md](ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md) | ⚠️ | The physical fulfilment axis. **Nothing writes `item_status` past `issued` today.** |
| [ARCHITECTURE-CUSTOMER-SUPPORT.md](ARCHITECTURE-CUSTOMER-SUPPORT.md) | ✅ | Support design. |
| [ARCHITECTURE-COOKIE-CONSENT.md](ARCHITECTURE-COOKIE-CONSENT.md) | ✅ | Consent banner and versioned consent. See `docs/DATA-RETENTION.md` §4. |

### Platform and infrastructure

| Document | Status | What it is |
|---|---|---|
| [ARCHITECTURE-API-CONTRACTS.md](ARCHITECTURE-API-CONTRACTS.md) | ⚠️ | API contracts. Superseded for routes by `API-REFERENCE.md`. |
| [ARCHITECTURE-ENV-SECRETS.md](ARCHITECTURE-ENV-SECRETS.md) | ✅ | Secret handling. Superseded for the variable list by `ENV-REFERENCE.md`. |
| [ARCHITECTURE-FEATURE-FLAGS.md](ARCHITECTURE-FEATURE-FLAGS.md) | ✅ | Feature flags, which are environment variables here. |
| [ARCHITECTURE-MEDIA-R2.md](ARCHITECTURE-MEDIA-R2.md) | ✅ | Cloudflare R2 media storage. |
| [ARCHITECTURE-OPS.md](ARCHITECTURE-OPS.md) | ✅ | Environments, monitoring, backup and recovery. |
| [ARCHITECTURE-PRODUCTION-OPS.md](ARCHITECTURE-PRODUCTION-OPS.md) | ⚠️ | Production infrastructure. **Read `THIRD-PARTY-DEPENDENCIES.md` §0 first: there is no deployment.** |
| [CAPACITY.md](CAPACITY.md) | ✅ | Capacity planning. |

### Testing

| Document | Status | What it is |
|---|---|---|
| [ARCHITECTURE-TESTING.md](ARCHITECTURE-TESTING.md) | ✅ | The full testing strategy. Superseded on current state by `TESTING.md`. |
| [ARCHITECTURE-TESTING-CICD.md](ARCHITECTURE-TESTING-CICD.md) | ⚠️ | Testing and CI/CD. See `RELEASE-PROCESS.md` §3 for what actually runs. |

### AI agents

Designed, not built. Nothing in `src/` implements an agent runtime.

| Document | Status | What it is |
|---|---|---|
| [ARCHITECTURE-AI-AGENTS.md](ARCHITECTURE-AI-AGENTS.md) | ✅ | The agent platform design. |
| [ARCHITECTURE-AI-AGENTS-RUNTIME.md](ARCHITECTURE-AI-AGENTS-RUNTIME.md) | ⚠️ | Runtime detail. |
| [ARCHITECTURE-AI-AGENTS-SUPPORT.md](ARCHITECTURE-AI-AGENTS-SUPPORT.md) | ✅ | Support-facing agents. |

### Growth, content, marketing

| Document | Status | What it is |
|---|---|---|
| [ARCHITECTURE-CATALOG-SEARCH-SEO.md](ARCHITECTURE-CATALOG-SEARCH-SEO.md) | ✅ | Catalogue, search and SEO together. |
| [ARCHITECTURE-GROWTH-SEO.md](ARCHITECTURE-GROWTH-SEO.md) | ⚠️ | Growth, SEO preservation and lifecycle marketing. |
| [ARCHITECTURE-LAUNCH-MARKETING.md](ARCHITECTURE-LAUNCH-MARKETING.md) | ✅ | Launch marketing. |
| [GROWTH-LAUNCH-MARKETING.md](GROWTH-LAUNCH-MARKETING.md) | ✅ | The growth plan for launch. |
| [CONTENT-SEO-PLAN.md](CONTENT-SEO-PLAN.md) | ✅ | Content and SEO plan. |
| [ARCHITECTURE-ROADMAP.md](ARCHITECTURE-ROADMAP.md) | ⚠️ | Build order from design to launch. Sequencing has moved on. |

### Superseded master documents

| Document | Status | What it is |
|---|---|---|
| [MASTER-ARCHITECTURE.md](MASTER-ARCHITECTURE.md) | ⚠️ | The v3 unified master document. **Superseded by `ARCHITECTURE-OVERVIEW.md`**; describes a Turborepo layout that was never built. |
| [MASTER-ARCHITECTURE-v2.md](MASTER-ARCHITECTURE-v2.md) | ⚠️ | The v2 master document. |
| [ARCHITECTURE-DOCS-INDEX.md](ARCHITECTURE-DOCS-INDEX.md) | ⚠️ | An earlier index. **This file supersedes it.** |

### WordPress migration

| Document | Status | What it is |
|---|---|---|
| [WP-IMPORT-DRY-RUN.md](WP-IMPORT-DRY-RUN.md) | ✅ | The import dry-run report. |

---

## The six things a newcomer most needs to know

1. **`supabase/migrations/` does not describe production.** 115 files against a
   **99**-migration ledger, different lineages. `src/types/database.ts` is
   closer but is **five weeks stale** — 33 tables against production's 61 — so
   run `pnpm db:types` before trusting it.
2. **There is no escrow and no payout system.** The platform keeps the whole
   coupon prepayment; the supplier collects the balance in cash. Since migration
   137 the database enforces this too: **no transition enters `escrow_held`.**
3. **`authenticated` still holds DML on 56 relations**, so RLS is the only
   database-level defence on the money tables — and **no test attempts a
   forbidden write**.
4. **There is no deployment.** The Vercel project watches a different,
   abandoned repository, and all 11 of its deployments are `ERROR`.
   [THIRD-PARTY-DEPENDENCIES.md](THIRD-PARTY-DEPENDENCIES.md) §0.
5. **Nothing is scheduled.** No Vercel cron, and pg_cron is not installed.
6. **`finalize.ts` and `queries/orders.ts` name four columns production does not
   have**, so the first real payment raises `42703`.

Items 3 through 6 are the launch blockers. The ranked list of everything else is
[FAILURE-MODES.md](FAILURE-MODES.md); the response to each is
[RUNBOOK.md](RUNBOOK.md).
