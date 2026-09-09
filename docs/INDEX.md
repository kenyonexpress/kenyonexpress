# Documentation Index

---

## What this is, in ten lines

For someone who will read nothing else. **Every number below was read out of
production (`ixvwfbuvfxxsjiywhbbb`) or off the live site on 2026-09-09**, not
carried over from the previous edition of this file.

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
5. **The database enforces the rules, not just the code.** 180 RLS policies,
   conservation CHECK constraints, an append-only payment journal, and
   transition-guard triggers that refuse an illegal status move with `23514`.
6. **The catalogue is built and the money path is written.** 80 products of
   which 44 are active, 12 suppliers, 91 tables, 151 applied migrations.
7. **No customer has ever bought anything.** The four orders in production are
   E2E fixtures, and **zero vouchers have ever been issued**.
8. **There IS a production site, and this line used to say the opposite.**
   `https://www.kenyonexpress.co.il/` answers `200` over HTTP/2 with our build:
   the Hebrew `<title>`, and our CSP down to the `frame-src
   secure.cardcom.solutions`. The apex `308`s to `www`. TLS is valid.
   What is still true is that **no deploy can be triggered from this machine** -
   the Vercel CLI here has no project link and no token, so the site is served
   by an account nobody in this repo can reach.
9. **Nothing scheduled runs.** Ten cron routes exist and nothing calls them, so
   vouchers do not expire and no voucher email is ever sent.
10. **The blockers are the scheduler (9), the unreachable deploy path (8), and
    a catalogue whose live rows still carry template text, copies and
    duplicates** (25 findings over the 44 active products, pinned in
    `supabase/catalogue-known-issues.json`).

**In one sentence:** the system is substantially built, carefully constrained,
and now actually serving, and the things between it and real money are
operational rather than architectural.

---

Every document in `docs/`, what it is for, and whether you can trust it.

**255 documents.** 176 carry no banner, 47 carry a correction, 34 are historical snapshots.

**This file is generated and then curated, and it is checked.**
`scripts/docs-index-gate.mjs` fails if a file exists in `docs/` that has no row
here, or a row here points at a file that does not exist. The previous edition
listed 170 of the 255 and nothing noticed for eight days.

---

## How to read the status column

| | Meaning |
|---|---|
| ✅ | No correction banner. The document has not been contradicted in writing. |
| ⚠️ | Carries a correction banner: something in it names tables, paths or numbers that production or the repo contradicts. The design may still be sound; the detail it asserts is not current. |
| 🕯️ | Historical snapshot, banner and all. True on its date and **not maintained**. Evidence of what was measured, not guidance for what to do. |

**If two documents disagree, `ARCHITECTURE-OVERVIEW.md` wins**, because every
number in it was read out of the live database rather than out of a migration
file or a prior document.

**A ✅ is not a promise of accuracy.** It means nobody has written a correction
into the file. `scripts/docs-path-audit.mjs` is the mechanical half: it resolves
every repo path any document mentions in backticks and fails on a new dangling
one.

---

## Start here

6 documents.

| Document | Status | What it is |
|---|---|---|
| [ARCHITECTURE-OVERVIEW.md](ARCHITECTURE-OVERVIEW.md) | ✅ | One document, the whole system. Written for someone who has never opened this |
| [BUSINESS-RULES.md](BUSINESS-RULES.md) | ✅ | Every rule this system actually enforces, in plain language, with the file and |
| [GLOSSARY.md](GLOSSARY.md) | ✅ | Every domain term, Hebrew and English, with the exact meaning it carries in |
| [ONBOARDING-DAY-ONE.md](ONBOARDING-DAY-ONE.md) | ✅ | Clone to first merged pull request, in one working day. |
| [ONBOARDING.md](ONBOARDING.md) | ✅ | ‏נכתב ‏02.09.2026. עשרים דקות קריאה חוסכות את כל המלכודות שמפורטות למטה. |
| [SCHEMA-REALITY-CHECK.md](SCHEMA-REALITY-CHECK.md) | ✅ | Table and column names that appear in this documentation set but do not exist |

---

## The system

13 documents.

| Document | Status | What it is |
|---|---|---|
| [API-REFERENCE.md](API-REFERENCE.md) | ✅ | Every HTTP route and every server action: method, auth, what it takes, what it |
| [DATA-MODEL.md](DATA-MODEL.md) | ✅ | Every table in production: what it holds, what it points at, and who can read |
| [DECISIONS-PROVISIONAL.md](DECISIONS-PROVISIONAL.md) | ⚠️ | ‏כל שורה כאן היא הכרעה שנלקחה לבד כי לא הייתה תשובה, וכל אחת מהן |
| [DECISIONS.md](DECISIONS.md) | 🕯️ | Every structural decision this system rests on, what it was decided instead of, |
| [ENV-REFERENCE.md](ENV-REFERENCE.md) | ✅ | Every environment variable this system reads: what it does, what breaks without |
| [MASTER-ARCHITECTURE.md](MASTER-ARCHITECTURE.md) | ⚠️ | מסמך ההכרעות המחייב של KenyonExpress. מהדורה זו מחליפה במלואה את מהדורות |
| [MONEY-MODEL.md](MONEY-MODEL.md) | ✅ | Integer agorot, the generated columns, and which amounts are allowed to go |
| [PAYMENT-FLOW.md](PAYMENT-FLOW.md) | ✅ | How money moves through KenyonExpress, from the cart to a settled order line. |
| [ROLES-AND-PERMISSIONS.md](ROLES-AND-PERMISSIONS.md) | ✅ | Who can do what, and which layer actually stops them. |
| [SEARCH-PIPELINE-SPEC.md](SEARCH-PIPELINE-SPEC.md) | ✅ | This document was written from the code, not from a plan. Every value below |
| [SUPPLIER-PAGE.md](SUPPLIER-PAGE.md) | ✅ | What a supplier can see and do, and the authorisation model behind it. |
| [THIRD-PARTY-DEPENDENCIES.md](THIRD-PARTY-DEPENDENCIES.md) | ✅ | Every external service this system touches: what it does, what breaks without |
| [VOUCHER-LIFECYCLE.md](VOUCHER-LIFECYCLE.md) | ✅ | A voucher is what the customer actually buys. It is created when an order is |

---

## Data, money and the catalogue

10 documents.

| Document | Status | What it is |
|---|---|---|
| [CARDCOM-ARCHITECTURE.md](CARDCOM-ARCHITECTURE.md) | 🕯️ | Base URL לכל הקריאות: |
| [COMPONENT-INVENTORY.md](COMPONENT-INVENTORY.md) | ✅ | Read-only scan of src/components. Every .tsx component is listed, grouped by subdirectory. |
| [COUPON-STOREFRONT-SPEC.md](COUPON-STOREFRONT-SPEC.md) | ✅ | מפרט מלא של דף מוצר מסוג קופון (storefront PDP). |
| [DB-SCHEMA.md](DB-SCHEMA.md) | ⚠️ | Generated from live Supabase project ixvwfbuvfxxsjiywhbbb on 2026-07-23 by read-only introspection of informationschema and pgcatalog. |
| [INVENTORY.md](INVENTORY.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |
| [INVOICING.md](INVOICING.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |
| [MIGRATION-BACKLOG.md](MIGRATION-BACKLOG.md) | ⚠️ | מצב המיגרציות ב-supabase/migrations/ מול הפרודקשן החי. |
| [MIGRATION-REVIEW.md](MIGRATION-REVIEW.md) | 🕯️ | Five migrations sit in migrations/pending/ and none is applied. This reviews |
| [SEED.md](SEED.md) | ✅ | There is one database — the hosted Supabase project. supabase start |
| [WP-MIGRATION.md](WP-MIGRATION.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |

---

## Security

7 documents.

| Document | Status | What it is |
|---|---|---|
| [AUTH-MODEL.md](AUTH-MODEL.md) | ⚠️ | נמדד מול פרודקשן (ixvwfbuvfxxsjiywhbbb) ב-19.08.2026. כל מספר כאן הוא תוצאה |
| [DB-SECURITY-MODEL.md](DB-SECURITY-MODEL.md) | ✅ | ‏53 טבלאות ב-public, כולן עם RLS מופעל, כולן rlsforced = false (הבעלים ו-servicerole עוקפים). |
| [FRAUD.md](FRAUD.md) | ✅ | שכבת ההונאה והניצול לרעה: מה מסרב, מה רק מנתב, ומה מכל זה חי כבר היום. |
| [OWASP-TOP-10.md](OWASP-TOP-10.md) | ✅ | Measured 2026-09-09 against the working tree, the live deployment and the |
| [PRICING-COMPLIANCE.md](PRICING-COMPLIANCE.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |
| [RATE-LIMITS.md](RATE-LIMITS.md) | ✅ | נמדד מול העץ ב-09.09.2026. כל מספר כאן נקרא מ-src/lib/rate-limit/policies.ts |
| [SECURITY-POSTURE.md](SECURITY-POSTURE.md) | ✅ | Threat model, what is enforced where, and the gaps that are real. |

---

## Operations, release and infrastructure

27 documents.

| Document | Status | What it is |
|---|---|---|
| [CAPACITY.md](CAPACITY.md) | ✅ | Measured 2026-09-01 with the k6 scenarios already in load/. Every number here |
| [CI-AND-BRANCH-PROTECTION.md](CI-AND-BRANCH-PROTECTION.md) | ⚠️ | Applied 21.08.2026. What is enforced, what is deliberately not, and the two |
| [CONTENT-UPLOADER.md](CONTENT-UPLOADER.md) | ✅ | קונסולת מעלה התוכן: מה כבר היה, מה נוסף, ומה נדחה עם נימוק. |
| [DB-RESTORE-RUNBOOK.md](DB-RESTORE-RUNBOOK.md) | ✅ | Operational runbook for the Postgres backup pipeline: how the daily dump works, |
| [DEPLOY.md](DEPLOY.md) | ✅ | Exactly what Ofir has to click, in order. Everything that could be prepared |
| [DEPLOYMENT.md](DEPLOYMENT.md) | ✅ | Verified against the real Vercel project on 2026-09-02, through the CLI, not |
| [DNS-CUTOVER-PLAN.md](DNS-CUTOVER-PLAN.md) | ✅ | Nothing here has been run. Executing the cutover is a hard stop and needs |
| [DR-RUNBOOK.md](DR-RUNBOOK.md) | ✅ | ‏נכתב ‏02.09.2026. תרחיש הייחוס: פרויקט ה-Supabase המאוחסן אבד או הושחת. |
| [ETERNAL-OPS.md](ETERNAL-OPS.md) | ✅ | תאריך: 2026-08-19. |
| [GROWTH-LAUNCH-MARKETING.md](GROWTH-LAUNCH-MARKETING.md) | ✅ | תאריך: 2026-08-19. |
| [INCIDENT-PLAYBOOKS.md](INCIDENT-PLAYBOOKS.md) | ✅ | Five named incidents, with steps. Written to be followed by someone who did not |
| [INFRA-TASKS.md](INFRA-TASKS.md) | ✅ | רשימת משימות תשתית ממוספרות ל-backend של KenyonExpress. |
| [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) | ⚠️ | תאריך: 2026-08-19. |
| [LAUNCH-DAY-PLAN.md](LAUNCH-DAY-PLAN.md) | ⚠️ | תאריך: 2026-08-19. |
| [LAUNCH-READINESS.md](LAUNCH-READINESS.md) | 🕯️ | Measured on main at dd10a9504, 2026-09-01. Every number below is command |
| [LAUNCH-RUNBOOK.md](LAUNCH-RUNBOOK.md) | ✅ | The order of operations for going live, command by command, with the rollback |
| [MOBILE-RELEASE.md](MOBILE-RELEASE.md) | ✅ | Verified 2026-09-02, code and production both. |
| [MONITORING.md](MONITORING.md) | ✅ | נמדד ב-09.09.2026: היסטוריית ריצות אמיתית מ-GitHub Actions, משתנים וסודות |
| [PERFORMANCE-BUDGET.md](PERFORMANCE-BUDGET.md) | ✅ | Measured 2026-09-06 against a real pnpm start build on port 3311, with |
| [POST-LAUNCH-BACKLOG.md](POST-LAUNCH-BACKLOG.md) | ✅ | Everything deliberately deferred, with the measurement or the argument behind |
| [RELEASE-PROCESS.md](RELEASE-PROCESS.md) | ✅ | back. |
| [RELEASE-v1.0-MERGE-PLAN.md](RELEASE-v1.0-MERGE-PLAN.md) | ✅ | Written 2026-09-02. release/v1.0 is cut from closeout/v1-final at the tip |
| [RUNBOOK-OPS.md](RUNBOOK-OPS.md) | ✅ | תאריך: 2026-08-19. |
| [RUNBOOK.md](RUNBOOK.md) | ✅ | What to do when something breaks. Written to be read at 3am by someone who did |
| [SECRETS-ROTATION.md](SECRETS-ROTATION.md) | ✅ | ‏נכתב ‏02.09.2026. לכל סוד: איפה הוא חי, איך מסובבים, ומה נשבר אם מדלגים על |
| [VERCEL-CRON.md](VERCEL-CRON.md) | ⚠️ | vercel.json exists for one reason: without it no scheduled job runs at all, |
| [VERCEL-SETUP.md](VERCEL-SETUP.md) | ✅ | מדריך צעד אחר צעד, מאפס ועד פריסה ראשונה עובדת. נכתב מול המצב בפועל |

---

## Architecture specifications

78 documents.

| Document | Status | What it is |
|---|---|---|
| [ARCHITECTURE-ACCESSIBILITY.md](ARCHITECTURE-ACCESSIBILITY.md) | ✅ | ארכיטקטורת נגישות (a11y) ל-KenyonExpress RTL. |
| [ARCHITECTURE-ACCOUNT-AREA.md](ARCHITECTURE-ACCOUNT-AREA.md) | ✅ | ארכיטקטורת אזור אישי (/account/). |
| [ARCHITECTURE-ACCOUNT-IDENTITY.md](ARCHITECTURE-ACCOUNT-IDENTITY.md) | ⚠️ | מסמך תכנון. מיגרציה נלווית (טיוטה, לא הוחלה): |
| [ARCHITECTURE-ACCOUNT-WALLET.md](ARCHITECTURE-ACCOUNT-WALLET.md) | ✅ | סטטוס: DESIGN + IMPLEMENTATION. ענף feat/account-wallet, worktree ke-account. |
| [ARCHITECTURE-ACCOUNT.md](ARCHITECTURE-ACCOUNT.md) | 🕯️ | KenyonExpress My Account architecture (binding customer dashboard spec). |
| [ARCHITECTURE-ADMIN-ANALYTICS.md](ARCHITECTURE-ADMIN-ANALYTICS.md) | ⚠️ | KenyonExpress Admin analytics expansion (binding). |
| [ARCHITECTURE-ADMIN-DASHBOARD.md](ARCHITECTURE-ADMIN-DASHBOARD.md) | ⚠️ | KenyonExpress admin dashboard architecture (platform control center). |
| [ARCHITECTURE-ADMIN.md](ARCHITECTURE-ADMIN.md) | ✅ | KenyonExpress Admin Dashboard Core architecture (implementation goal, Fable 5). |
| [ARCHITECTURE-AFFILIATES-REFERRALS.md](ARCHITECTURE-AFFILIATES-REFERRALS.md) | ✅ | תאריך: 2026-08-19. |
| [ARCHITECTURE-AI-AGENTS-RUNTIME.md](ARCHITECTURE-AI-AGENTS-RUNTIME.md) | ⚠️ | סטטוס: טיוטה מחייבת v2.0 (2026-07-17). בעלים: ארכיטקט פלטפורמת ה-AI. |
| [ARCHITECTURE-AI-AGENTS-SUPPORT.md](ARCHITECTURE-AI-AGENTS-SUPPORT.md) | ✅ | ארכיטקטורת סוכני AI לתמיכה: סוכן שירות לקוחות + סוכן ספקים. |
| [ARCHITECTURE-AI-AGENTS.md](ARCHITECTURE-AI-AGENTS.md) | ✅ | KenyonExpress AI agents architecture (future phase, binding skeleton). |
| [ARCHITECTURE-ANALYTICS-BI.md](ARCHITECTURE-ANALYTICS-BI.md) | ⚠️ | The marketplace runs on Supabase Postgres. Products have a producttype of coupon or physical. Commission works by the platform keeping platformpercent per  |
| [ARCHITECTURE-ANALYTICS-KPI.md](ARCHITECTURE-ANALYTICS-KPI.md) | ⚠️ | ארכיטקטורת מדדי מכירות, conversion ודוחות לבעלים (KenyonExpress). |
| [ARCHITECTURE-ANALYTICS.md](ARCHITECTURE-ANALYTICS.md) | ⚠️ | ארכיטקטורת אנליטיקה: GA4, אירועי המרה, דשבורד מכירות לבעלים. |
| [ARCHITECTURE-API-CONTRACTS.md](ARCHITECTURE-API-CONTRACTS.md) | ⚠️ | Owner: API contracts architect |
| [ARCHITECTURE-BACKUP-DR.md](ARCHITECTURE-BACKUP-DR.md) | ✅ | KenyonExpress Backup & Disaster Recovery architecture (binding). |
| [ARCHITECTURE-CART-CHECKOUT.md](ARCHITECTURE-CART-CHECKOUT.md) | 🕯️ | KenyonExpress Guest Cart → Login-at-Pay → Checkout → Cardcom → Voucher architecture (complete binding spec). |
| [ARCHITECTURE-CART-ZUSTAND.md](ARCHITECTURE-CART-ZUSTAND.md) | ✅ | ארכיטקטורת עגלה (Zustand + Guest + מיזוג ב-שלם) ל-KenyonExpress. |
| [ARCHITECTURE-CATALOG-SEARCH-SEO.md](ARCHITECTURE-CATALOG-SEARCH-SEO.md) | ✅ | מסמך תכנון מלא. מיגרציה נלווית (טיוטה, לא הוחלה): |
| [ARCHITECTURE-CATEGORY-PAGE.md](ARCHITECTURE-CATEGORY-PAGE.md) | ⚠️ | ארכיטקטורת דף קטגוריה KenyonExpress: 1:1 מול electro home-v7 / shop-archive. |
| [ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md](ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md) | ✅ | זרימת ה-checkout המלאה מקצה לקצה: עגלת אורח, התחברות ברגע התשלום, ‏Cardcom |
| [ARCHITECTURE-CHECKOUT-CARDCOM.md](ARCHITECTURE-CHECKOUT-CARDCOM.md) | 🕯️ | KenyonExpress end-to-end checkout and Cardcom payment architecture (complete binding spec). |
| [ARCHITECTURE-COMMERCE.md](ARCHITECTURE-COMMERCE.md) | ⚠️ | .claude/skills/cardcom-payments wherever the two conflict. This document also |
| [ARCHITECTURE-COOKIE-CONSENT.md](ARCHITECTURE-COOKIE-CONSENT.md) | ✅ | ארכיטקטורת הסכמת עוגיות / פרטיות לקוח (ישראל + שקיפות). |
| [ARCHITECTURE-COUPON-REDEMPTION-UX.md](ARCHITECTURE-COUPON-REDEMPTION-UX.md) | ✅ | מפרט UX מחייב למימוש קופון (ספק + לקוח). |
| [ARCHITECTURE-COUPON-REDEMPTION.md](ARCHITECTURE-COUPON-REDEMPTION.md) | ✅ | KenyonExpress supplier coupon / voucher redemption architecture (binding scan spec). |
| [ARCHITECTURE-CUSTOMER-SUPPORT.md](ARCHITECTURE-CUSTOMER-SUPPORT.md) | ✅ | ארכיטקטורת תמיכת לקוחות: טיקטים, החזרים, ביטול קופון, מדיניות כסף. |
| [ARCHITECTURE-DESIGN-SYSTEM.md](ARCHITECTURE-DESIGN-SYSTEM.md) | ✅ | ארכיטקטורת שפת עיצוב / Design tokens ל-KenyonExpress (Electro-aligned). |
| [ARCHITECTURE-DOCS-INDEX.md](ARCHITECTURE-DOCS-INDEX.md) | 🕯️ | Index of docs/. Rewritten 2026-09-01 against production |
| [ARCHITECTURE-ENV-SECRETS.md](ARCHITECTURE-ENV-SECRETS.md) | ✅ | מטריצת סביבה וסודות ל-KenyonExpress (מה חייב איפה, מה אסור בדפדפן). |
| [ARCHITECTURE-FEATURE-FLAGS.md](ARCHITECTURE-FEATURE-FLAGS.md) | ✅ | ארכיטקטורת Feature Flags / Kill Switches ל-KenyonExpress. |
| [ARCHITECTURE-FRAUD-RATE-LIMITS.md](ARCHITECTURE-FRAUD-RATE-LIMITS.md) | ✅ | ארכיטקטורת הגבלת קצב ונוגד הונאה (שכבת מוצר). |
| [ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md](ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md) | ⚠️ | KenyonExpress post-purchase fulfillment and supplier workflow architecture (complete binding spec). |
| [ARCHITECTURE-GO-LIVE-CHECKLIST.md](ARCHITECTURE-GO-LIVE-CHECKLIST.md) | ⚠️ | צ'קליסט Go-Live מחייב לשיגור KenyonExpress (כסף אמיתי + קופונים אמיתיים). |
| [ARCHITECTURE-GROWTH-SEO.md](ARCHITECTURE-GROWTH-SEO.md) | ⚠️ | מסמך הכרעות. תאריך: 2026-07-17. ענף: phase5/homepage. |
| [ARCHITECTURE-INCIDENT-RESPONSE.md](ARCHITECTURE-INCIDENT-RESPONSE.md) | ✅ | ארכיטקטורת תגובה לאירועים (SEV) ל-KenyonExpress. |
| [ARCHITECTURE-INVOICING-TAX.md](ARCHITECTURE-INVOICING-TAX.md) | ⚠️ | ארכיטקטורת חשבוניות / מס (מסגרת מוצר לשיגור בישראל). |
| [ARCHITECTURE-LAUNCH-MARKETING.md](ARCHITECTURE-LAUNCH-MARKETING.md) | ✅ | ארכיטקטורת שיווק השקה: שימור SEO מ-WP (הפניות 301), Google Merchant, קמפיין השקה. |
| [ARCHITECTURE-LEGAL-COMPLIANCE.md](ARCHITECTURE-LEGAL-COMPLIANCE.md) | ⚠️ | ארכיטקטורת ציות משפטי ורגולטורי של KenyonExpress. מסמך הכרעות: כל סעיף מכריע, אין אופציות פתוחות. |
| [ARCHITECTURE-LEGAL-PAGES.md](ARCHITECTURE-LEGAL-PAGES.md) | ✅ | מפרט העמודים המשפטיים באתר: תקנון, מדיניות ביטולים (חוק הגנת הצרכן, קופונים), פרטיות, נגישות. |
| [ARCHITECTURE-LEGAL.md](ARCHITECTURE-LEGAL.md) | ⚠️ | KenyonExpress דפים משפטיים (תקנון, פרטיות, ביטולים, נגישות, cookies). |
| [ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md](ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md) | ⚠️ | Money rule: agorot integers only, zero floats past the ILS/agorot boundary. |
| [ARCHITECTURE-MEDIA-R2.md](ARCHITECTURE-MEDIA-R2.md) | ✅ | ארכיטקטורת מדיה / תמונות (R2 או S3-compatible). |
| [ARCHITECTURE-MOBILE-APP.md](ARCHITECTURE-MOBILE-APP.md) | ✅ | ארכיטקטורת אפליקציית מובייל (סופר-אפ עתידי) ל-KenyonExpress. |
| [ARCHITECTURE-MOBILE-SUPERAPP.md](ARCHITECTURE-MOBILE-SUPERAPP.md) | ⚠️ | מסמך תכנון מחייב. תאריך: 2026-07-17. ענף: phase5/homepage. |
| [ARCHITECTURE-NOTIFICATIONS-MARKETING.md](ARCHITECTURE-NOTIFICATIONS-MARKETING.md) | ⚠️ | מסמך תכנון. מיגרציה נלווית (טיוטה, לא הוחלה): |
| [ARCHITECTURE-NOTIFICATIONS-V2.md](ARCHITECTURE-NOTIFICATIONS-V2.md) | ✅ | ארכיטקטורת התראות V2 (סיכום מחייב ב-ke-arch). |
| [ARCHITECTURE-NOTIFICATIONS.md](ARCHITECTURE-NOTIFICATIONS.md) | ⚠️ | ארכיטקטורת התראות טרנזקציוניות של KenyonExpress. |
| [ARCHITECTURE-OBSERVABILITY.md](ARCHITECTURE-OBSERVABILITY.md) | ⚠️ | KenyonExpress observability architecture (binding logs, errors, money audit, alerts, dashboards). |
| [ARCHITECTURE-OPS.md](ARCHITECTURE-OPS.md) | ⚠️ | תאריך: 2026-07-29 \| ענף: arch/mega-docs \| סטטוס: מסמך מחייב, שכבת מימוש |
| [ARCHITECTURE-ORDER-STATE-MACHINE.md](ARCHITECTURE-ORDER-STATE-MACHINE.md) | ⚠️ | מכונות המצב של ההזמנה, הפריט, התשלום והשובר. כל הסטטוסים, כל המעברים החוקיים, |
| [ARCHITECTURE-PAYMENT-RECONCILIATION.md](ARCHITECTURE-PAYMENT-RECONCILIATION.md) | ⚠️ | ארכיטקטורת התאמת תשלומים (Cardcom ↔ ledger ↔ orders). |
| [ARCHITECTURE-PERFORMANCE.md](ARCHITECTURE-PERFORMANCE.md) | ✅ | KenyonExpress storefront performance architecture (binding). |
| [ARCHITECTURE-PERSONAL-AREA.md](ARCHITECTURE-PERSONAL-AREA.md) | ✅ | ארכיטקטורת האזור האישי של KenyonExpress. |
| [ARCHITECTURE-PRODUCT-TYPES.md](ARCHITECTURE-PRODUCT-TYPES.md) | ⚠️ | קופון / פיזי / מנוי חוזר: מה משתנה בכל שכבה. |
| [ARCHITECTURE-PRODUCTION-OPS.md](ARCHITECTURE-PRODUCTION-OPS.md) | ⚠️ | מסמך תכנון תשתית. סטטוס: DESIGN. אין בו מיגרציות ואין בו קוד להחלה. |
| [ARCHITECTURE-PWA.md](ARCHITECTURE-PWA.md) | ⚠️ | KenyonExpress Progressive Web App architecture (binding). |
| [ARCHITECTURE-REFERRALS.md](ARCHITECTURE-REFERRALS.md) | ✅ | ארכיטקטורת הפניות / שותפים (referrals & affiliates). |
| [ARCHITECTURE-ROADMAP.md](ARCHITECTURE-ROADMAP.md) | ⚠️ | תאריך: 2026-07-29 \| ענף: arch/mega-docs \| סטטוס: מסמך מחייב, תוכנית ביצוע |
| [ARCHITECTURE-SEARCH.md](ARCHITECTURE-SEARCH.md) | ✅ | KenyonExpress Hebrew catalog search architecture (binding Postgres FTS spec). |
| [ARCHITECTURE-SECURITY-AUDIT.md](ARCHITECTURE-SECURITY-AUDIT.md) | ✅ | תוכנית ביקורת אבטחה מעשית ל-KenyonExpress: מה בודקים, איך, באיזו תדירות, ואיך מתעדים ממצאים. |
| [ARCHITECTURE-SECURITY-COMPLIANCE.md](ARCHITECTURE-SECURITY-COMPLIANCE.md) | ⚠️ | KenyonExpress security and compliance architecture. |
| [ARCHITECTURE-SECURITY.md](ARCHITECTURE-SECURITY.md) | ✅ | KenyonExpress security architecture. This document is the binding security decision record: where it conflicts with any other doc, this one wins for securi |
| [ARCHITECTURE-SEO-PERFORMANCE.md](ARCHITECTURE-SEO-PERFORMANCE.md) | ✅ | ארכיטקטורת SEO + ביצועים לחנות KenyonExpress (Next.js 15 App Router). |
| [ARCHITECTURE-SEO-SITEMAP.md](ARCHITECTURE-SEO-SITEMAP.md) | ⚠️ | תאריך: 2026-07-29 \| ענף: arch/mega-docs \| סטטוס: מסמך מחייב, שכבת מימוש |
| [ARCHITECTURE-SEO.md](ARCHITECTURE-SEO.md) | ✅ | מסמך תכנון מלא, מוכן ליישום. תאריך: 2026-07-23. ענף: phase5/homepage. |
| [ARCHITECTURE-SHIPPING-RETURNS.md](ARCHITECTURE-SHIPPING-RETURNS.md) | ✅ | ארכיטקטורת משלוחים והחזרות למוצרים פיזיים (קופונים מחוץ להיקף משלוח). |
| [ARCHITECTURE-SUPPLIER-ONBOARDING.md](ARCHITECTURE-SUPPLIER-ONBOARDING.md) | ✅ | ארכיטקטורת גיוס ו-onboarding ספקים ל-KenyonExpress. |
| [ARCHITECTURE-SUPPLIER-PORTAL.md](ARCHITECTURE-SUPPLIER-PORTAL.md) | 🕯️ | KenyonExpress supplier-facing portal architecture. |
| [ARCHITECTURE-SUPPLIER-REDEMPTION.md](ARCHITECTURE-SUPPLIER-REDEMPTION.md) | ⚠️ | מסמך תכנון מלא. מיגרציה נלווית (טיוטה, לא הוחלה): |
| [ARCHITECTURE-TESTING-CICD.md](ARCHITECTURE-TESTING-CICD.md) | ⚠️ | This document is the single source of truth for the testing strategy and the CI/CD pipeline. It is written for a marketplace that moves real money: Cardcom |
| [ARCHITECTURE-TESTING.md](ARCHITECTURE-TESTING.md) | ✅ | תאריך: 2026-07-29 \| ענף: arch/mega-docs \| סטטוס: מסמך מחייב, שכבת מימוש |
| [ARCHITECTURE-WISHLIST.md](ARCHITECTURE-WISHLIST.md) | ✅ | KenyonExpress wishlist architecture (binding). 1:1 electro / live YITH Wishlist UX. |
| [ARCHITECTURE-WP-DATA-MIGRATION-EXECUTION.md](ARCHITECTURE-WP-DATA-MIGRATION-EXECUTION.md) | ✅ | תוכנית ביצוע למיגרציית נתוני WordPress → KenyonExpress (WXR-first). |
| [ARCHITECTURE-WP-DATA-MIGRATION.md](ARCHITECTURE-WP-DATA-MIGRATION.md) | 🕯️ | Source of truth for extraction, field mapping, image pipeline, SEO |
| [ARCHITECTURE-WP-MIGRATION-PLAN.md](ARCHITECTURE-WP-MIGRATION-PLAN.md) | ✅ | תוכנית מיפוי WordPress → Supabase מחייבת: שדה מול שדה, סדר ייבוא, rollback. |
| [ARCHITECTURE-WP-MIGRATION.md](ARCHITECTURE-WP-MIGRATION.md) | ✅ | תאריך: 2026-07-29 \| ענף: arch/mega-docs \| סטטוס: מסמך מחייב, שכבת מימוש |

---

## Design and visual parity

1 documents.

| Document | Status | What it is |
|---|---|---|
| [design/COMPARE-RESULTS.md](design/COMPARE-RESULTS.md) | ✅ | node scripts/compare.mjs --page=<page> --width=<w> against refs/, scored over |

---

## Audits, reports and measurements

23 documents.

| Document | Status | What it is |
|---|---|---|
| [A11Y-SWEEP-REPORT.md](A11Y-SWEEP-REPORT.md) | 🕯️ | ‏MISSION-FINAL שלב 8 מבקש ביקורת נגישות על כל דף. עד היום השער |
| [BACKUP-RECOVERY.md](BACKUP-RECOVERY.md) | ⚠️ | ‏נמדד ‏10.09.2026. ששת פריטי הגיבוי אחד אחד: ‏PITR לא נרכש, ‏R2 לא מופעל ואין בו |
| [BRANCH-AUDIT.md](BRANCH-AUDIT.md) | ✅ | Measured 2026-09-06 against closeout/v1-final at 48ea88353. Every number |
| [CATEGORY-1TO1-FINDINGS.md](CATEGORY-1TO1-FINDINGS.md) | 🕯️ | מדידות מהאתר החי ומ-localhost ב-1440x2600, דרך scripts/cat-probe.mjs, |
| [COPY-AUDIT.md](COPY-AUDIT.md) | ✅ | Every Latin-script string a visitor can read on the funnel, with a verdict. |
| [DB-DRIFT-AUDIT.md](DB-DRIFT-AUDIT.md) | ⚠️ | Audit of the gap between supabase/migrations/ and the live remote Postgres |
| [DB-HARDENING-AUDIT.md](DB-HARDENING-AUDIT.md) | ✅ | AUTOPILOT queue step (10), measured against production rather than assumed. |
| [DNS-SNAPSHOT-PRE-CUTOVER.md](DNS-SNAPSHOT-PRE-CUTOVER.md) | ✅ | Taken 2026-09-02, from the Cloudflare API (Zone:Read) and from public |
| [FINAL-AUDIT.md](FINAL-AUDIT.md) | ✅ | ‏SECTIONS 23. נמדד ב-09.09.2026 מול 16983ef6c (‏origin/main אחרי מיזוג |
| [FINAL-REPORT.md](FINAL-REPORT.md) | 🕯️ | Rewritten 2026-09-01. The previous version was written 2026-08-31 and its |
| [GAP-AUDIT-FINAL.md](GAP-AUDIT-FINAL.md) | ✅ | Written 2026-09-02. Every verdict below was checked by reading the code or by |
| [IMAGE-IMPORT-STATUS.md](IMAGE-IMPORT-STATUS.md) | ✅ | Measured 2026-09-09. SECTIONS 20 asked for scripts/import-images.ts and ended |
| [INDEX-USAGE-REPORT.md](INDEX-USAGE-REPORT.md) | ✅ | Measured against the production Supabase project ixvwfbuvfxxsjiywhbbb on |
| [LIGHTHOUSE-AUDIT.md](LIGHTHOUSE-AUDIT.md) | 🕯️ | ‏MISSION-FINAL שלב 8. שלוש הביקורות רצות על כל המסלולים הציבוריים, לא על |
| [LOAD-TEST-RESULTS.md](LOAD-TEST-RESULTS.md) | ✅ | ‏נמדד ‏02.09.2026, ‏k6 מקומי מול pnpm start על המחשב הזה (‏port 3412, |
| [MEGA-BLOCK-AUDIT.md](MEGA-BLOCK-AUDIT.md) | ✅ | The block's own rule: "סרוק קודם מה קיים ודלג עליו". This file is that scan, |
| [MORNING-REPORT.md](MORNING-REPORT.md) | 🕯️ | עודכן: 2026-08-19, סוף היום. ענף קוד קנוני: phase5/homepage. |
| [PAYMENTS-VERIFY-REPORT.md](PAYMENTS-VERIFY-REPORT.md) | 🕯️ | היקף: אימות מסלול הכסף מול כללי העסקים המחייבים, ותיקון מה שנמצא סותר. |
| [PERFORMANCE-REPORT.md](PERFORMANCE-REPORT.md) | ✅ | Section 62 of ~/ke-goals/SECTIONS.md. Measured 2026-09-09 against the build at |
| [PIXEL-WAVE-REPORT.md](PIXEL-WAVE-REPORT.md) | 🕯️ | עודכן: ‏2026-08-19, ענף feat/pixel-wave, בילד jKlu531ZpXzULKt4Qrff (‏10:49). |
| [PROJECT-COMPLETE.md](PROJECT-COMPLETE.md) | 🕯️ | ‏נכתב ‏19.08.2026, בילד qOQvgn9UgRyJr71kDu3ia, ענף phase5/homepage. |
| [SEED-REPORT.md](SEED-REPORT.md) | 🕯️ | עודכן: ‏2026-08-19. הכלי: scripts/seed-catalogue.mjs, הנתונים: |
| [UI-PARITY-REPORT.md](UI-PARITY-REPORT.md) | ✅ | Every scripts/compare.mjs run appends a row here automatically -- the gate |
| [WP-IMPORT-REPORT.md](WP-IMPORT-REPORT.md) | 🕯️ | מקור: data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml (‏5,942,638 בתים) |

---

## Product, features and everything else

75 documents.

| Document | Status | What it is |
|---|---|---|
| [ACCESSIBILITY-GATE.md](ACCESSIBILITY-GATE.md) | 🕯️ | Measured 2026-09-09. docs/A11Y-SWEEP-REPORT.md is the 2026-08-19 sweep and is |
| [ACCESSIBILITY-STATEMENT.md](ACCESSIBILITY-STATEMENT.md) | ✅ | IS 5568 level AA · ת"י 5568 ברמה AA |
| [ADMIN-ARCHITECTURE.md](ADMIN-ARCHITECTURE.md) | ✅ | KenyonExpress production admin dashboard architecture. |
| [ADMIN-PRODUCT-PAGE-SPEC.md](ADMIN-PRODUCT-PAGE-SPEC.md) | ⚠️ | מפרט דף המוצר באדמין: ארבעת שדות הכסף הדינמיים, שדות ספק חובה, snapshot ל- |
| [ANALYTICS-EVENTS.md](ANALYTICS-EVENTS.md) | ✅ | נמדד מול פרודקשן (ixvwfbuvfxxsjiywhbbb) ב-09.09.2026. טבלת האירועים כאן |
| [BUSINESS-MODEL.md](BUSINESS-MODEL.md) | ✅ | - אני מגדיר בדף המוצר את סכום הקופון שהלקוח משלם באתר (למשל: דיל 100 שח → קופון 10 שח באתר) |
| [CABINS.md](CABINS.md) | ✅ | Cabin booking: units, nightly rates, holds, and a constraint that makes |
| [CACHING.md](CACHING.md) | ✅ | Measured 2026-09-09 against the working tree. |
| [COMPONENT-QUEUE.md](COMPONENT-QUEUE.md) | ✅ | The authoritative order for the homepage rebuild. One component at a time, top |
| [CONTENT-OPERATIONS-GUIDE.md](CONTENT-OPERATIONS-GUIDE.md) | ✅ | תאריך: 2026-08-19. |
| [CONTENT-PAGES.md](CONTENT-PAGES.md) | ✅ | The text of the site's information pages, editable in the admin panel without a |
| [CONTENT-SEO-PLAN.md](CONTENT-SEO-PLAN.md) | ✅ | תאריך: 2026-08-19. |
| [CONTRADICTIONS.md](CONTRADICTIONS.md) | ⚠️ | סטטוס: RESOLVED (עודכן 2026-07-27, הכרעת Ofir). |
| [COST-MODEL.md](COST-MODEL.md) | ✅ | What the platform pays, what an order costs, and the two places a cost |
| [COURSES.md](COURSES.md) | ✅ | A course product type, its lessons, who may watch them, and the certificate. |
| [CRON-EXTERNAL.md](CRON-EXTERNAL.md) | ✅ | Ten jobs. All ten are GET, all ten authenticate with the same header, and all |
| [CUSTOMER-SUPPORT-PLAYBOOK.md](CUSTOMER-SUPPORT-PLAYBOOK.md) | ✅ | תאריך: 2026-08-19. |
| [DATA-BASELINE.md](DATA-BASELINE.md) | 🕯️ | ענף: phase5/homepage, והמשך ב-feat/seed-data. |
| [DATA-RETENTION.md](DATA-RETENTION.md) | ✅ | What is kept, for how long, why, how deletion works, and where each line maps to |
| [DDL-FIXES.md](DDL-FIXES.md) | 🕯️ | תיקוני DDL קריטיים לנתיב קופון / settlement, וסדר החלה בטוח של 027+054. |
| [DEAD-CODE.md](DEAD-CODE.md) | ✅ | ‏נמדד ‏02.09.2026 (‏STEP 83). מחיקת קבצים היא עצירה קשה לפי כללי |
| [DEPENDENCIES.md](DEPENDENCIES.md) | ✅ | ‏נכתב ‏02.09.2026 (‏STEP 94). |
| [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md) | ✅ | משלים את docs/ARCHITECTURE-BACKUP-DR.md, שהוא מסמך מדיניות. זה מסמך מדידה. |
| [E2E-MEASURED.md](E2E-MEASURED.md) | 🕯️ | ‏docs/LAUNCH-READINESS.md רשם את הסוויטה כ-"לא הורץ". היא הורצה כאן מול |
| [EMAIL-DELIVERABILITY.md](EMAIL-DELIVERABILITY.md) | ✅ | Section 60 of ~/ke-goals/SECTIONS.md. |
| [EMAILS.md](EMAILS.md) | ✅ | Measured 2026-09-09. |
| [ENV.md](ENV.md) | ✅ | Every variable this app reads, whether it is required, and what breaks without |
| [ERROR-HANDLING.md](ERROR-HANDLING.md) | ✅ | Measured 2026-09-09 against the working tree. Written for SECTIONS 15, which |
| [FAILURE-MODES.md](FAILURE-MODES.md) | ✅ | Every way this system can fail, ordered by likelihood × impact. |
| [GAP-MATRIX.md](GAP-MATRIX.md) | ✅ | Static audit. A ✔ means the table's name appears in that layer (or an |
| [GEO.md](GEO.md) | ✅ | Verified 2026-09-02 rather than rebuilt: G5 asked for city tags, a cities |
| [GITHUB-SETTINGS.md](GITHUB-SETTINGS.md) | ✅ | Everything in this file is a setting in the GitHub web UI. None of it lives in |
| [HANDOVER.md](HANDOVER.md) | ✅ | ‏נכתב ‏02.09.2026, בסוף ‏17 מגה-בלוקים (‏STEPS 2–97). מסמך הכניסה למי |
| [HOMEPAGE-MERCHANDISING.md](HOMEPAGE-MERCHANDISING.md) | ✅ | Admin control over what the home page shows and in what order. Section 59 of |
| [I18N.md](I18N.md) | ✅ | Section 61 of ~/ke-goals/SECTIONS.md. One locale is active: he-IL. |
| [KNOWN-ISSUES.md](KNOWN-ISSUES.md) | ✅ | The v1.2.0 ledger of what is knowingly imperfect. Every entry names its |
| [LIVE-DELTA.md](LIVE-DELTA.md) | ✅ | Our built homepage against the live site, section by section, measured in a real |
| [MASTER-ARCHITECTURE-v2.md](MASTER-ARCHITECTURE-v2.md) | ⚠️ | המסמך המאוחד business-model-first ל-KenyonExpress (מהדורת docs-queue). |
| [MISSING-ASSETS.md](MISSING-ASSETS.md) | ✅ | What could not be captured, what was tried, and what is being used instead. |
| [NOTIFICATIONS.md](NOTIFICATIONS.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |
| [OFIR-APPROVALS.md](OFIR-APPROVALS.md) | 🕯️ | תאריך: 2026-08-19. |
| [OPERATIONS-CALENDAR.md](OPERATIONS-CALENDAR.md) | ✅ | Every scheduled job: when it should run, what it touches, and what breaks while |
| [OWNER-CHECKLIST.md](OWNER-CHECKLIST.md) | ✅ | ‏נכתב ‏01.09.2026, עודכן ‏02.09 בסוף שבעת מגה-הבלוקים (תגי v1.4–v1.8, |
| [PARITY-REFERENCE.md](PARITY-REFERENCE.md) | ✅ | Measured 2026-09-09. Everything below was read off the network, the filesystem or a |
| [PORT-FROM-DUP-REPO.md](PORT-FROM-DUP-REPO.md) | 🕯️ | מקור: העותק שנבנה בטעות בלילה ב- |
| [PRODUCT-PAGE-SPEC.md](PRODUCT-PAGE-SPEC.md) | ⚠️ | נוצר: 2026-07-24. עודכן: 2026-07-28. ענף: feat/checkout-complete. |
| [PRODUCT-PHASES.md](PRODUCT-PHASES.md) | ✅ | Which product types the shop is currently selling, and the switch that decides. |
| [PRODUCTION-CHANGES-2026-07-27.md](PRODUCTION-CHANGES-2026-07-27.md) | 🕯️ | Two changes were made directly to the hosted Supabase project |
| [PROMOS.md](PROMOS.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |
| [QA-CHECKLIST.md](QA-CHECKLIST.md) | ⚠️ | רשימת בדיקה ידנית לכל דפי האתר, מסודרת לפי עדיפות. נבנתה מסקירת קוד בלבד (read-only). |
| [QUERY-COOKBOOK.md](QUERY-COOKBOOK.md) | ✅ | Twenty SQL queries an operator actually needs, ready to paste. |
| [QUESTIONS-FOR-OFIR.md](QUESTIONS-FOR-OFIR.md) | 🕯️ | תאריך: 2026-08-19. |
| [REFS-INDEX.md](REFS-INDEX.md) | ✅ | What every capture in refs/ holds, where it came from, and whether it is |
| [REFS-POLICY.md](REFS-POLICY.md) | ✅ | Recommendation: change nothing. Do not adopt git-lfs, and do not commit the |
| [REVIEWS.md](REVIEWS.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |
| [SENTRY-SETUP.md](SENTRY-SETUP.md) | ✅ | Measured and wired 21.08.2026. What is done, what is left, and the three ways |
| [SEO-PAGES.md](SEO-PAGES.md) | ✅ | נמדד מול העץ ומול הפרויקט ixvwfbuvfxxsjiywhbbb ב-09.09.2026. |
| [SHIPPING.md](SHIPPING.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |
| [SOURCING-RULES.md](SOURCING-RULES.md) | ✅ | Authoritative. Read this before changing any asset, string or geometry value. |
| [STAGING.md](STAGING.md) | ✅ | סביבת ביניים: הבאנר נבנה, כל השאר חסום על גורמים חיצוניים. נמדד 2026-09-10. |
| [SPAWNER-REVIVAL-MEASURED.md](SPAWNER-REVIVAL-MEASURED.md) | 🕯️ | נמדד 19.08.2026 ב-09:32. תוספת ל-docs/ETERNAL-OPS.md §1.2 ו-§5, ותיקון |
| [SUBSCRIPTIONS.md](SUBSCRIPTIONS.md) | ✅ | This section is additive. Everything below it is the 2026-09-02 write-up of |
| [SUPPLIER-ONBOARDING-KIT.md](SUPPLIER-ONBOARDING-KIT.md) | ✅ | תאריך: 2026-08-19. |
| [SUPPLIER-ONBOARDING.md](SUPPLIER-ONBOARDING.md) | ✅ | הצטרפות בית עסק: מבקש אינו ספק, ומספר חשבון אינו עמודה. |
| [SUPPLIER-POS.md](SUPPLIER-POS.md) | ✅ | הקופה של בית העסק: מה כבר היה, איפה, ומה נמצא חסר. |
| [SUPPORT.md](SUPPORT.md) | ✅ | מרכז התמיכה: מה כבר היה, מה מעולם לא נכתב, ומה השתנה. |
| [TESTING.md](TESTING.md) | ✅ | What is tested where, how to run each suite, and what the gates actually block. |
| [VISUAL-PARITY.md](VISUAL-PARITY.md) | ✅ | ‏נמדד ‏02.09.2026 (ערב), ‏compare.mjs מול build טרי על ‏:3412, האתר החי |
| [WHATSAPP.md](WHATSAPP.md) | ✅ | Verified 2026-09-02. Built before G5; G5's one real gap was measurement, closed |
| [WISHLIST.md](WISHLIST.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). wishlists |
| [WP-EXPORT-2026-07-29-DRY-RUN.md](WP-EXPORT-2026-07-29-DRY-RUN.md) | 🕯️ | The first dry run of the import pipeline against the real WordPress export |
| [WP-IMPORT-2026-08-07-MAPPING.md](WP-IMPORT-2026-08-07-MAPPING.md) | 🕯️ | Source: data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml (5.9 MB, WP 6.8.1). |
| [WP-IMPORT-DRY-RUN.md](WP-IMPORT-DRY-RUN.md) | ✅ | Run 2026-09-01. node scripts/wp-import/xml-fxp-dryrun.mjs. Nothing was |
| [coupon-page-measured.md](coupon-page-measured.md) | 🕯️ | Source URL: https://kenyonexpress.co.il/product/%D7%A7%D7%95%D7%A4%D7%95%D7%9F-%D7%98%D7%A1%D7%98/ |
| [hardcoded-audit.md](hardcoded-audit.md) | 🕯️ | Read-only scan of src/ (.ts, .tsx, .css) for hardcoded hex colors and px values. |
| [rtl-violations.md](rtl-violations.md) | 🕯️ | Auto-generated by scripts/rtl-lint.mjs (run: node scripts/rtl-lint.mjs). |

---

## At the repository root, not in `docs/`

Two documents predate the `docs/` directory and were never moved. They are
listed here because the index is where people look, and checked by
`scripts/docs-index-gate.mjs` through the `../` prefix.

| Document | Status | What it is |
|---|---|---|
| [../ARCHITECTURE-REFUNDS-CANCELLATIONS.md](../ARCHITECTURE-REFUNDS-CANCELLATIONS.md) | ✅ | Refunds, cancellations and what Israeli consumer law requires of each. |
| [../LEDGER-DESIGN.md](../LEDGER-DESIGN.md) | ✅ | A double-entry ledger design. Read it as a proposal: `fn_post_journal` exists, the full ledger does not. |

---

## ADRs

13 documents.

| Document | Status | What it is |
|---|---|---|
| [adr/0001-money-is-integer-agorot.md](adr/0001-money-is-integer-agorot.md) | ✅ | סטטוס: נאכף. מאז: תחילת הפרויקט; ‏DB מאז 059. |
| [adr/0002-no-escrow.md](adr/0002-no-escrow.md) | ✅ | סטטוס: נאכף. הוחלט: ‏28.07.2026 (אופיר), מיגרציה 085. |
| [adr/0003-dynamic-platform-percent.md](adr/0003-dynamic-platform-percent.md) | ✅ | סטטוס: נאכף (‏C1 ב-docs/CONTRADICTIONS.md). |
| [adr/0004-class-table-inheritance.md](adr/0004-class-table-inheritance.md) | ✅ | סטטוס: נאכף בסכימה הפרוסה. |
| [adr/0005-rls-everywhere.md](adr/0005-rls-everywhere.md) | ✅ | סטטוס: נאכף. |
| [adr/0006-migrations-via-mcp-only.md](adr/0006-migrations-via-mcp-only.md) | ✅ | סטטוס: נאכף תהליכית. |
| [adr/0007-cardcom-lowprofile.md](adr/0007-cardcom-lowprofile.md) | ✅ | סטטוס: נאכף. ראיה מלאה: ‏memory ‏cardcom-legacy-api-truth + ‏docs/DEPLOYMENT.md. |
| [adr/0008-outbox-pattern.md](adr/0008-outbox-pattern.md) | ✅ | סטטוס: נאכף. |
| [adr/0009-cache-via-next-use-cache.md](adr/0009-cache-via-next-use-cache.md) | ✅ | סטטוס: נאכף. |
| [adr/0010-no-search-ui-then-header.md](adr/0010-no-search-ui-then-header.md) | ✅ | סטטוס: עודכן ‏02.09. |
| [adr/0011-refs-based-visual-parity.md](adr/0011-refs-based-visual-parity.md) | ✅ | סטטוס: נאכף. |
| [adr/0012-one-code-agent-per-repo.md](adr/0012-one-code-agent-per-repo.md) | ✅ | סטטוס: כלל עצירה קשה. |
| [adr/README.md](adr/README.md) | ✅ | ‏נכתבו ‏02.09.2026 (‏STEP 85), כתקצירים המפנים לראיות. כל החלטה כאן כבר |

---

## Legal pages

2 documents.

| Document | Status | What it is |
|---|---|---|
| [legal/COUNSEL-REVIEW.md](legal/COUNSEL-REVIEW.md) | ✅ | ארבעת המסמכים ב-/legal/ נכתבו לפי הדין הישראלי ולפי אופן פעולת המערכת |
| [legal/README.md](legal/README.md) | ✅ | מסמך תפעולי: מה נבנה, איפה זה יושב, למה בכתובות האלה, ומה נשאר לעשות |

