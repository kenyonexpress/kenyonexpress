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

**256 documents.** 177 carry no banner, 47 carry a correction, 34 are historical snapshots.

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
| [MANUAL.md](MANUAL.md) | ✅ | נמדד 05.11.2026 (S29): 14 פריטים שרק אופיר יכול לעשות, שורה לפריט, לפי סדר עדיפות. |
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
| [CARDCOM-ACTIVATION.md](CARDCOM-ACTIVATION.md) | ✅ | The owner's checklist for turning on real Cardcom credentials: which three env vars, the one that must not be true, and how to verify the first real payment. |
| [DEALS-PIPELINE.md](DEALS-PIPELINE.md) | ✅ | Supplier-fed deals ingestion queue: feed or manual submission, admin review, and why it never scrapes a third-party site or writes straight to products. |
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
| [FRAUD-RULES.md](FRAUD-RULES.md) | ✅ | ‏SECTIONS 57. נכתב ‏22.09.2026: טבלת הכללים, מה מסרב ומה מנתב, רשימת החסימה, ההתראה, ומה נמדד. |
| [OWASP-TOP-10.md](OWASP-TOP-10.md) | ✅ | Measured 2026-09-09 against the working tree, the live deployment and the |
| [PRICING-COMPLIANCE.md](PRICING-COMPLIANCE.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |
| [RATE-LIMITS.md](RATE-LIMITS.md) | ✅ | נמדד מול העץ ב-09.09.2026. כל מספר כאן נקרא מ-src/lib/rate-limit/policies.ts |
| [SECURITY-POSTURE.md](SECURITY-POSTURE.md) | ✅ | Threat model, what is enforced where, and the gaps that are real. |
| [SECURITY.md](SECURITY.md) | ✅ | ‏SECTIONS 81. נמדד ‏22.09.2026: תשעת הפריטים מול מה שיש, המטריצה במקום ‏pgTAP, ומה לא נבנה ולמה. |

---

## Operations, release and infrastructure

28 documents.

| Document | Status | What it is |
|---|---|---|
| [BACKLOG.md](BACKLOG.md) | ✅ | Created 2026-09-29 (M15-c51): the single canonical "ידני לאופיר" list, merged from STATE.md and LAUNCH-READINESS.md, in criticality order, no duplicates. |
| [CAPACITY.md](CAPACITY.md) | ✅ | Measured 2026-09-01 with the k6 scenarios already in load/. Every number here |
| [CI-AND-BRANCH-PROTECTION.md](CI-AND-BRANCH-PROTECTION.md) | ⚠️ | Applied 21.08.2026. What is enforced, what is deliberately not, and the two |
| [CONTENT-UPLOADER.md](CONTENT-UPLOADER.md) | ✅ | קונסולת מעלה התוכן: מה כבר היה, מה נוסף, ומה נדחה עם נימוק. |
| [DB-RESTORE-RUNBOOK.md](DB-RESTORE-RUNBOOK.md) | ✅ | Operational runbook for the Postgres backup pipeline: how the daily dump works, |
| [DEPLOY.md](DEPLOY.md) | ✅ | Exactly what Ofir has to click, in order. Everything that could be prepared |
| [DEPLOYMENT.md](DEPLOYMENT.md) | ✅ | Verified against the real Vercel project on 2026-09-02, through the CLI, not |
| [DNS-CUTOVER-PLAN.md](DNS-CUTOVER-PLAN.md) | ✅ | Nothing here has been run. Executing the cutover is a hard stop and needs |
| [DR-RUNBOOK.md](DR-RUNBOOK.md) | ✅ | ‏נכתב ‏02.09.2026. תרחיש הייחוס: פרויקט ה-Supabase המאוחסן אבד או הושחת. |
| [DR.md](DR.md) | ✅ | ‏SECTIONS 82. נמדד ‏22.09.2026: ‏PITR כבוי, ‏7 גיבויים פיזיים, ‏R2 עדיין כבוי; ששת הפריטים מול מה שיש. |
| [ETERNAL-OPS.md](ETERNAL-OPS.md) | ✅ | תאריך: 2026-08-19. |
| [GROWTH-LAUNCH-MARKETING.md](GROWTH-LAUNCH-MARKETING.md) | ✅ | תאריך: 2026-08-19. |
| [INCIDENT-PLAYBOOKS.md](INCIDENT-PLAYBOOKS.md) | ✅ | Five named incidents, with steps. Written to be followed by someone who did not |
| [INFRA-TASKS.md](INFRA-TASKS.md) | ✅ | רשימת משימות תשתית ממוספרות ל-backend של KenyonExpress. |
| [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) | ✅ | שער PUSH NOW / HOLD נמדד 05.11.2026 (S29). הגוף מ-19.08 היסטורי. |
| [LAUNCH-DAY-PLAN.md](LAUNCH-DAY-PLAN.md) | ⚠️ | תאריך: 2026-08-19. |
| [LAUNCH-READINESS.md](LAUNCH-READINESS.md) | ✅ | Measured 2026-09-25 on audit/final-audit at d0a21af2a. NOT READY: domain dark, mock charges, cron secret mismatch |
| [LAUNCH-RUNBOOK.md](LAUNCH-RUNBOOK.md) | ✅ | The order of operations for going live, command by command, with the rollback |
| [MOBILE-RELEASE.md](MOBILE-RELEASE.md) | ✅ | Verified 2026-09-02, code and production both. |
| [MONITORING.md](MONITORING.md) | ✅ | נמדד ב-09.09.2026: היסטוריית ריצות אמיתית מ-GitHub Actions, משתנים וסודות |
| [PERFORMANCE-BUDGET.md](PERFORMANCE-BUDGET.md) | ✅ | Measured 2026-09-06 against a real pnpm start build on port 3311, with |
| [PERF.md](PERF.md) | ✅ | ‏SECTIONS 84. נמדד ‏22.09.2026: שמונת הפריטים מול מה שיש, ‏Lighthouse מדומה ו-provided, ‏bundle, תמונות, מטמון. |
| [ADMIN-OPS.md](ADMIN-OPS.md) | ✅ | ‏SECTIONS 85. נמדד ‏22.09.2026: שבעת פריטי התפעול מול מה שיש; ‏KPI מימוש והחזרים, יומן ספק, התאמות, חסימה, ‏CSV ללוג, עורך הגדרות. |
| [APP.md](APP.md) | ✅ | ‏SECTIONS 87. נמדד ‏22.09.2026: ‏splash ל-iOS, ‏deep links ‏(404 עד env), ‏shortcuts, ‏E2E ‏8/8; ‏TWA נדחה לפי ‏D1→M1. |
| [DX.md](DX.md) | ✅ | ‏SECTIONS 86. נמדד ‏22.09.2026: שבעת פריטי ה-DX מול מה שיש; גלריית רכיבים ב-`/dev/components` במקום ‏Storybook, ‏pre-commit עם ‏tsc ו-vitest על ה-index, ‏CONTRIBUTING, ‏VS Code על ‏Biome. |
| [PAYOUT-ENGINE.md](PAYOUT-ENGINE.md) | ✅ | ‏SECTIONS 55. נבנה ‏22.09.2026: ריצת תשלומים יומית מהיומן, מה לא אוטומטי ולמה, ומה נמדד. |
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

24 documents.

| Document | Status | What it is |
|---|---|---|
| [A11Y-SWEEP-REPORT.md](A11Y-SWEEP-REPORT.md) | 🕯️ | ‏MISSION-FINAL שלב 8 מבקש ביקורת נגישות על כל דף. עד היום השער |
| [AUTOPILOT-DIFF.md](AUTOPILOT-DIFF.md) | ✅ | Measured 2026-09-25 against audit/final-audit at 37826cd02, read only through git. What autopilot and |
| [BACKUP-RECOVERY.md](BACKUP-RECOVERY.md) | ⚠️ | ‏נמדד ‏10.09.2026. ששת פריטי הגיבוי אחד אחד: ‏PITR לא נרכש, ‏R2 לא מופעל ואין בו |
| [BRANCH-AUDIT.md](BRANCH-AUDIT.md) | ✅ | Measured 2026-09-06 against closeout/v1-final at 48ea88353. Every number |
| [CATEGORY-1TO1-FINDINGS.md](CATEGORY-1TO1-FINDINGS.md) | 🕯️ | מדידות מהאתר החי ומ-localhost ב-1440x2600, דרך scripts/cat-probe.mjs, |
| [COPY-AUDIT.md](COPY-AUDIT.md) | ✅ | Every Latin-script string a visitor can read on the funnel, with a verdict. |
| [DB-DRIFT-AUDIT.md](DB-DRIFT-AUDIT.md) | ⚠️ | Audit of the gap between supabase/migrations/ and the live remote Postgres |
| [DB-HARDENING-AUDIT.md](DB-HARDENING-AUDIT.md) | ✅ | AUTOPILOT queue step (10), measured against production rather than assumed. |
| [DNS-SNAPSHOT-PRE-CUTOVER.md](DNS-SNAPSHOT-PRE-CUTOVER.md) | ✅ | Taken 2026-09-02, from the Cloudflare API (Zone:Read) and from public |
| [FINAL-AUDIT.md](FINAL-AUDIT.md) | ✅ | ‏SECTIONS 23. נמדד ב-09.09.2026 מול 16983ef6c (‏origin/main אחרי מיזוג |
| [FINAL-REPORT.md](FINAL-REPORT.md) | 🕯️ | Rewritten 2026-09-01. The previous version was written 2026-08-31 and its |
| [FINAL-REPORT-V2.md](FINAL-REPORT-V2.md) | ✅ | ‏SECTIONS 88. נמדד ‏22.09.2026: ‏E2E מלא ‏(664/73/9 ותשעת הכישלונות מאובחנים), ‏parity ‏10.38/9.56/11.37, ‏RTL ‏54/54, ‏a11y ‏194, ‏k6 ‏spike ‏308 ‏ms, עמודים משפטיים. תג ‏v2.10.0-rc1 ‏(v2.0.0-rc1 תפוס מ-02.09). |
| [GAP-AUDIT-FINAL.md](GAP-AUDIT-FINAL.md) | ✅ | Written 2026-09-02. Every verdict below was checked by reading the code or by |
| [GO-LIVE-DRY-RUN.md](GO-LIVE-DRY-RUN.md) | ✅ | ‏SECTIONS 43. נמדד ‏21.09.2026: מיגרציות בטרנזקציה מגולגלת, ‏E2E מול ‏pnpm start, ‏RLS שלילי מול פרודקשן, ומה שחסום על סביבה. |
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
| [S01-baseline.md](S01-baseline.md) | ✅ | Queue S01, 04.11.2026: HEAD == design-locked-2026-10-19, install, tsc 0, vitest 640/640, freeze diff empty. |
| [S02-vercel.md](S02-vercel.md) | ✅ | Queue S02, 04.11.2026: Vercel production branch is closeout/v1-final; git production build READY. |
| [S03-env.md](S03-env.md) | ✅ | Queue S03, 04.11.2026: production env vs 119 keys read in src; 8/8 deploy keys set, NEXT_PUBLIC_SITE_URL added, HOLD list of missing secrets. |
| [S04-r2.md](S04-r2.md) | ✅ | Queue S04, 04.11.2026: R2 upload on @aws-sdk/client-s3, AVIF+WebP variants, admin action uploadImageToR2; smoke blocked (key only in Vercel, cdn host not R2). |
| [S05-turnstile.md](S05-turnstile.md) | ✅ | Queue S05, 04.11.2026: Turnstile enforced on /login and /signup, and on /suppliers/apply through a signed pass cookie; src/lib/turnstile/verify.ts, 16 new tests. |
| [S06-cart.md](S06-cart.md) | ✅ | Queue S06, 04.11.2026: cart server audit; max_per_order now enforced (44 live rows ignored it), guest merge no longer deletes the guest cart on a failed write; 30 new tests. |
| [S07-guest.md](S07-guest.md) | ✅ | Queue S07, 04.11.2026: guest checkout on an anonymous session, email required on the profile, Google linked after payment with order attach on an existing account, address saved for next order; 34 new tests, no migration. |
| [S08-payment.md](S08-payment.md) | ✅ | Queue S08, 04.11.2026: payment adapter (`src/server/payments/adapter.ts`) with live/sandbox mode from env, never throws; no Cardcom credentials = sandbox with checkout closed on a production build; provider refuses that sandbox server-side; idempotent webhook journal, guarded transitions, tokenization hook; 24 new tests, no migration. |
| [S09-split.md](S09-split.md) | ✅ | Queue S09, 04.11.2026: split snapshot already written by checkout (platform_percent, commission_agorot = platform amount, supplier_immediate_agorot = supplier amount; 947 paid lines, 0 nulls); migration 253 applied extends the paid-line lock from rates to amounts; 4 new tests, proof by rolled-back DO block. |
| [S10-vouchers.md](S10-vouchers.md) | ✅ | Queue S10, 04.11.2026: vouchers on paid coupon lines. Issuing already wired in finalize; added validity 30/60/90 default 90 (C7 refusal retired), app-generated 8-digit partner_pin (live column/trigger written into the repo), status `transferred` with re-issue on gift claim via service-role RPC; migration 254 applied, proven with rolled-back blocks. |
| [S11-order.md](S11-order.md) | ✅ | Queue S11, 04.11.2026: order page. QR, expiry, Waze, transfer already there; added s.14C cancellation decision (14 days, unredeemed, 2 business days before a booked service, fee min(5%,₪100)) on page and enforced for `changed_mind` in requestRefund, 8-digit partner_pin, supplier address, invoice placeholder. No component touched. |
| [S12-email.md](S12-email.md) | ✅ | Queue S12, 04.11.2026: purchase confirmation is the only automatic customer email. Six lines with ח.פ 033798513, the s.14C rule (unredeemed, 2 business days), whole shekels, order page link. `voucher_expiring` email and the abandoned-cart cron switched off via `lib/email/automatic-email-policy.ts`. Live Resend test-mode send to delivered@resend.dev accepted. |
| [S13-cancel.md](S13-cancel.md) | ✅ | Queue S13, 04.11.2026: refundOrder now applies s.14C (14 days, unredeemed) via decideCancellation14g and refuses with POLICY_REFUSED; admin override = full refund, no fee, any date, ground goodwill; refunds.decided_by set; pending refund_requests closed with the refund payment. Sandbox adapter test runs the real provider factory. |
| [S14-transfer.md](S14-transfer.md) | ✅ | Queue S14, 04.11.2026: coupon transfer to another email and recipient claim already existed (S10, 254 applied: old row transferred, new row with new code/QR/pin). S14 closes two gaps: sending to your own address is refused (SELF), and the sender claiming their own pending link is refused (OWN_GIFT) instead of a silent self re-issue. Production probe of enum, RPC and grants. |
| [S15-redeem.md](S15-redeem.md) | ✅ | Queue S15, 04.11.2026: /partner/redeem for supplier members, QR or 8-digit partner_pin, idempotency key required, every attempt in vouchers_redemption_events, double redeem refused by the RPC. Found the live redeem_voucher_locked had never run (inet passed to a text param, 42883); fixed by migration 255, applied, proven with a rolled-back block as a real member. Also removed a duplicate voucher_redeemed event in the supplier route. |
| [S16-admin-upload.md](S16-admin-upload.md) | ✅ | Queue S16, 04.11.2026: /admin/products/new already carried type, platform_percent, validity, shipping, cancel window and S04 images. The CSV import gained shipping fee, cancel window and image URLs through the form's own schema, and now writes images and terms. Found production lacked refund_policy, so every save with a shipping fee or cancel window was refused; migration 256 applied, proven with rolled-back writes. |
| [S17-supplier.md](S17-supplier.md) | ✅ | Queue S17, 04.11.2026: /supplier/apply serves the business join with the click-wrap supplier agreement. Every acceptance is written to agreement_acceptances (version, server SHA-256, time, IP, user agent), and a trigger makes that table append-only. Adds a 1 ILS charge-and-void card check on the sandbox provider only. Migration 257 applied; supplier_card_verifications was already taken by a legacy table, so the new table is supplier_application_card_checks. |
| [S18-legal.md](S18-legal.md) | ✅ | Queue S18, 04.11.2026: audit of /terms, /privacy, /returns and /accessibility against the launch clauses (18+, 14ג with 14 days, 2 non-rest days and the min(5%, 100 ILS) fee, Tel Aviv jurisdiction). Only the registration number was missing. It is added to the terms, the cookie policy and the contact block of every legal page, and a test pins all four clauses. |
| [S19-auth.md](S19-auth.md) | ✅ | Queue S19, 04.11.2026: password and Google sign-in measured against production, passkey registration in place on the first-purchase return page, and a six-digit code sign-in that goes by WhatsApp through Meta Cloud API when three env vars are set and by email otherwise. Our own HMAC challenge in an httpOnly cookie, no migration; a phone number never creates an account. |
| [S20-expiry.md](S20-expiry.md) | ✅ | Queue S20, 04.11.2026: coupon expiry reminders. /api/cron/expiry enqueues one bucket (T-7 or T-1) and drains the outbox in the same call: push by default, email only after the customer switches it on, in-app bell. Pending 258 applied: ke-expiry-t7 and ke-expiry-t1 as pg_cron GETs through the vault; APP_BASE_URL re-seeded to www; the dead push-expiry-reminders job removed. Found: all twelve 162 jobs POST and answer 405. |
| [S21-push.md](S21-push.md) | ✅ | Queue S21, 04.11.2026: web push. The VAPID pair was broken locally (a 41-character private key that does not derive the public key) and unverifiable in production (0 deliveries ever), so it was rotated in Vercel production along with VAPID_SUBJECT. Per-browser topics order_updates and expiry (pending 259 applied); required kinds ignore them. The service worker re-subscribes on pushsubscriptionchange and on a key rotation through /api/push/subscription. |
| [S22-gift.md](S22-gift.md) | ✅ | Queue S22, 04.11.2026: gift coupons. The gift flow existed, but pending 226 was never applied, so a chosen send date and the wrapping fee were silently dropped in production. 226 applied. New /gift/<product slug> on the claim route's segment (token-shaped and found means claim, otherwise product): adds the coupon to the cart and prefills the checkout gift block through an httpOnly cookie scoped to /checkout. |
| [S23-wallet.md](S23-wallet.md) | ✅ | Queue S23, 04.11.2026: wallet and cashback. Checkout ignored products.cashback_enabled, so three active products with the switch off paid 5% cashback; one helper now gates cart, checkout and the admin save. 260 applied: v_wallet_ledger in integer agorot, anon revoked. First tests of the affiliate payout to wallet hook. Found: production has no affiliates table, so no commission can be paid until the programme schema is rebuilt. |
| [S24-security.md](S24-security.md) | ✅ | Queue S24, 04.11.2026: security. Rate limits already go through one limiter on auth, checkout and redeem, but production has no UPSTASH_REDIS_REST_* and limits through the Postgres fallback. CSP and HSTS live; new test pins HSTS on every header entry. security.yml was invalid YAML (duplicate workflow_dispatch) since 22.09, so gitleaks never ran: fixed, 76 history findings triaged into .gitleaksignore, seven are real leaked credentials pending rotation. The same broken file hid the dependency audit: next 16.3.7 had two critical advisories, bumped to 16.4.5 with dompurify, node-forge and source-map-js; zod (fix only in v4) accepted until 2026-12-31. New RLS smoke: no cross-user read or money-table write for anon or three customers. |
| [S25-seo.md](S25-seo.md) | ✅ | Queue S25, 04.11.2026: SEO. robots.txt, the sitemap index and Product/Offer/Organization JSON-LD already existed. Fixed in the library only (every emitting page is frozen): Offer prices now cut from integer agorot via money.ts instead of toFixed on a float, and the Organization node gains legalName, taxID 033798513 and an email ContactPoint, with no phone and no sameAs. Served output measured on a local production build. |
| [S26-observability.md](S26-observability.md) | ⚠️ | Queue S26, 04.11.2026: observability. Sentry DSN and release were already wired; one sandbox event delivered with the HEAD SHA as release. checkout_step reached /api/a only, so the four checkout steps now also go to PostHog behind the consent gate; one sandbox event accepted. No Axiom drain exists and AXIOM_TOKEN is sensitive on Vercel, so Axiom is unverified. |
| [S27-e2e.md](S27-e2e.md) | ✅ | Queue S27, 05.11.2026: five money journeys (guest coupon, physical with address, gift, cancel, redeem) on a Vercel preview, 5/5 twice in a row. Found and fixed: refund_requests absent in production (261 applied), the mock provider failing across serverless instances, a coupon order stamped with the home address, silent Turnstile refusals. |
| [S28-freeze-proof.md](S28-freeze-proof.md) | ✅ | Queue S28, 05.11.2026: zero diff against design-locked-2026-10-19 on the frozen list (home, header, hero, category, product, footer, globals.css, layout.tsx, page.tsx). 13 existing components changed, all on routes the 04.11 amendment opened (cart, account, supplier apply); none restored. |
| [S29-launch.md](S29-launch.md) | ✅ | Queue S29, 05.11.2026: LAUNCH-CHECKLIST.md PUSH NOW / HOLD gate measured against production, Vercel and the DB; MANUAL.md rewritten as 14 owner-only items in priority order. Production serves HEAD behind MAINTENANCE_MODE; real Cardcom charging unproven. |
| [S30-tag.md](S30-tag.md) | ✅ | Queue S30, 05.11.2026: annotated tag v2.1.0-checkout on 4f5a054d3, pushed. LAUNCH-READY pending-external: HOLD has 9 open rows, so ~/ke-goals/LAUNCH.flag was not created. |
| [S30-launch.md](S30-launch.md) | ✅ | Queue S30, 06.11.2026: MAINTENANCE_MODE removed from Vercel production, redeployed, www answers 200 with no maintenance text, tag v2.1.1-launch-gaps pushed. Found, not fixed: 10 dead product links on the live homepage (9 x 404, 1 x 410), sourced from src/lib/ke-live-deals-data.ts. No code change. |
| [S31-redirects.md](S31-redirects.md) | ✅ | Queue S31, 06.11.2026: the 20 retired WordPress URLs that moved answer 301 from next.config.ts (42 rules, Hebrew sources in three spellings), generated from a new 87-permalink slug map. 20 of 20 random old URLs return 301 to a live route on a production build. Not measured on Vercel. |
| [S32-pwa.md](S32-pwa.md) | ✅ | Queue S32, 06.11.2026: the existing PWA extended, not replaced. Manifest `name` is Kenyon EXPRESS (Hebrew `short_name` kept), a new in-browser offline check (12/12), tests on the first-purchase install gate. Lighthouse 11.7.1 PWA 100 on `/` and `/products`, installability 31/31, on a local production build. The logo could not be byte-compared with the wp_import attachment. |
| [S33-errors.md](S33-errors.md) | ✅ | Queue S33, 06.11.2026: error, loading and empty states. `global-error.tsx` branded inline, six `loading.tsx` files on one shared state (none above a page that must 404: a group-level one turned unknown product and category URLs into 200s, measured), an empty state with a way forward for orders and coupons. Fixed on the way: 500 on `/coupons/<not-a-uuid>`, nested `<main>` on group 404s, 1.4:1 code digits. `pnpm errors:check` 45 of 45, vitest 8271 passed. Not measured: a real empty account, production |
| [S34-contact.md](S34-contact.md) | ✅ | Queue S34, 06.11.2026: contact and share. `/contact` lists the five WhatsApp channels as cards instead of a dropdown; the share row, the ask link and the order contact already existed and are now read in a browser (`e2e/s34-contact-share.spec.ts`, 28 of 28 with `wa-contact.spec.ts`). Fixed on the way: a nested `<main>` on `/contact` and a second toaster that rendered every store toast twice. Migration 236 still pending, so the channels come from code defaults. |
| [S35-chips.md](S35-chips.md) | ✅ | Queue S35, 06.11.2026: filter chip data. Migration 262 (applied) adds `products.open_weekend` and `products.free_shipping`, carries the old stand-ins over once (0 weekend tags, 14 zero-price rows) and refuses free shipping beside a shipping price. The chips filter on the two columns, the admin form has a checkbox for each, and both archive pages mount a four-chip row with no location chip (`e2e/s35-chips.spec.ts`, 16 of 16). |
| [S36-env.md](S36-env.md) | ✅ | Queue S36, 06.11.2026: Meilisearch optional at boot. `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` declared optional in `env.ts` with no format check (they were never required); `/api/ready` gains `search: ok/degraded` and no longer 503s on an unset or unreachable engine, only on a required dependency down. Measured on the built server in five configurations. |
| [S37-gsc.md](S37-gsc.md) | ✅ | Queue S37, 06.11.2026: SKIPPED. Search Console. No verification token and no Google API credentials in `~/ke-goals/secrets`, so no TXT record was added and no sitemap was submitted. The apex already carries a `google-site-verification` TXT record on Vercel DNS (22 days old, same value as the pre-cutover snapshot). Production answers 503 on `/sitemap.xml` under `MAINTENANCE_MODE`. Found, not fixed: `robots.txt` names the apex while production serves `www`. Lists the three steps left for Ofir. |
| [S38-monitor.md](S38-monitor.md) | ✅ | Queue S38, 06.11.2026: site monitor in the database. Migration 263 (applied): `public.site_health`, a pg_cron probe every 5 minutes (pg_net GET of `APP_BASE_URL/api/ready`) and a second job a minute later that judges it, because pg_net answers after commit. The third consecutive non-200 sends "hey SITE down" to ntfy `kenyon-ofir-limit` once per outage; recovery sends nothing. Every alert scenario rehearsed in a rolled-back transaction, the transport proven on a throwaway topic, first live probes 200. Not measured: a real alert, a real outage. |
| [S39-dns.md](S39-dns.md) | ✅ | Queue S39, 06.11.2026: DONE. Email DNS on the Vercel zone. SPF (`send` TXT) and DKIM (`resend._domainkey`) were already present; DMARC was `p=none` with no `rua` and was replaced with `v=DMARC1; p=quarantine; rua=mailto:support@kenyonexpress.co.il`, confirmed on public resolvers. Resend answered 200 to a send from `noreply@kenyonexpress.co.il` to its test sink. Not run: `resend domains verify`, the only working key is send-only. Found, not fixed: the apex has no MX record since the cutover, so `support@` receives nothing, DMARC reports included. |
| [S40-mx.md](S40-mx.md) | ⚠️ | Queue S40, 06.11.2026: BLOCKED zoho-account-needed. No MX record was added. The zone carries no Zoho verification record and the machine holds no Zoho credentials, so the domain is not verified at Zoho and MX records pointing there would only turn silence into rejections. The apex still has no MX; `support@` receives nothing. Lists the steps for Ofir: open the account, add the verification TXT, then the three MX records. |
| [S41-catalog.md](S41-catalog.md) | ⚠️ | Queue S41, 06.11.2026: BLOCKED ledger-not-empty. The operator's decisions were applied to the 25 catalogue findings in production: 9 rows archived (the admin's own delete, because `price_history` refuses a hard delete), 2 set to draft, 1 slug regenerated; 93 -> 82 active. The snapshot was re-measured (44 -> 82 products) and the ledger is 94, not `[]`: 4 carried findings with no decision, 86 on the demo catalogue and launch seed, 4 on E2E fixtures. The 47 `is_demo` rows were not deleted. Lists the three decisions left for Ofir. |
| [M01-c361.md](M01-c361.md) | ✅ | Queue M01-c361, 05.11.2026: SKIPPED. compare.mjs on / not run; home is frozen and compare.mjs is not a gate under the 04.11 design freeze. Freeze gate empty. |
| [M02-c361.md](M02-c361.md) | ✅ | Queue M02-c361, 05.11.2026: SKIPPED. compare.mjs on /product not run under the design freeze. Freeze gate empty. |
| [M03-c361.md](M03-c361.md) | ✅ | Queue M03-c361, 05.11.2026: SKIPPED. compare.mjs on /category not run under the design freeze. Freeze gate empty. |
| [M04-c361.md](M04-c361.md) | ✅ | Queue M04-c361, 05.11.2026: tsc exit 0 with no type drift; the only drift was lint's docs-index gate (M01-M03 unindexed), fixed by adding these rows. |
| [M05-c361.md](M05-c361.md) | ✅ | Queue M05-c361, 05.11.2026: pnpm test had 1 red of 8179, the README docs count (318 stated, 324 on disk) drifted since S28; set to 325 with this doc. |
| [M06-c361.md](M06-c361.md) | ✅ | Queue M06-c361, 05.11.2026: pnpm build was green; the one drift was the Next 16.4 partialPrefetching warning, pinned to false (unset already meant off). |
| [M07-c361.md](M07-c361.md) | ✅ | Queue M07-c361, 05.11.2026: TODO/FIXME scan older than 7 days. Same two TODO(cardcom) markers only, both already in BACKLOG item 6 (live-terminal blocker); zero new. Docs-only. |
| [M08-c361.md](M08-c361.md) | ✅ | Queue M08-c361, 05.11.2026: Lighthouse mobile on / and a sample product. Devtools perf 99/99, A11y 100, SEO 100; BP 96 from the local .env.production VERCEL=1 rendering the /_vercel analytics tags off Vercel. Measurement only. |
| [M09-c361.md](M09-c361.md) | ✅ | Queue M09-c361, 05.11.2026: removed drizzle-orm/drizzle-kit, drizzle.config.ts, src/db/schema and seven orphan files outside the freeze; knip's remaining deps are frozen-component or scripts/ consumers. |
| [M04-c362.md](M04-c362.md) | ✅ | Queue M04-c362, 06.11.2026: tsc exit 0, no type drift; fixed lint docs-index drift (archived M02 churn doc unindexed) and README docs count 346 -> 348. |
| [M06-c362.md](M06-c362.md) | ✅ | Queue M06-c362, 06.11.2026: pnpm build exit 0 (428 static pages), no tracked file changed, no drift to fix; remaining build-log noise is known (Sentry 401, slow DB, unapplied migrations). |
| [M07-c362.md](M07-c362.md) | ✅ | Queue M07-c362, 06.11.2026: TODO/FIXME scan older than 7 days. Same two TODO(cardcom) markers only, both already in BACKLOG item 6 (live-terminal blocker); zero new. Docs-only. |
| [M08-c362.md](M08-c362.md) | ✅ | Queue M08-c362, 06.11.2026: Lighthouse mobile on / and a sample product, local build and (first time) the live site. Local devtools perf 99/98, live 95/84 (network-bound, through a VPN); A11y 100 and SEO 100 everywhere. Live product page BP 96: four related-product images of demo-* rows answer 400 from /_next/image because /images/cdn/wp/* does not exist; the local 100 is a stale optimizer cache. Measurement only. |
| [M09-c362.md](M09-c362.md) | ✅ | Queue M09-c362, 06.11.2026: removed @radix-ui/react-select, @radix-ui/react-dropdown-menu and react-hook-form with the three unimported ui primitives that used them, five orphan lib files and four never-referenced exports; dead-component ledger 20 -> 15. Unwired courses, Meilisearch reindex and R2 upload actions left for an owner decision. |
| [_archive/M02-c361.churn.1793914416.md](_archive/M02-c361.churn.1793914416.md) | 🗄️ | Archived churn copy of M02-c361 (SKIPPED under design freeze), moved aside by the loop fix 3e7624715. |
| [M10-c361.md](M10-c361.md) | ✅ | Queue M10-c361, 05.11.2026: object scan of all 71 migrations/pending files against production. 27 live, 44 not (28 with no objects, 16 partial); none applied here. 218 is still not live and breaks the customer profile form (42703), filed as the next item. |
| [M10-c362.md](M10-c362.md) | ⚠️ | Queue M10-c362, 06.11.2026: re-scan of all 73 migrations/pending files against production. 29 live (262 and 263 new), the same 44 not applied; none applied here. BLOCKED: 218 is still not live and the site is now out of maintenance, so the customer account details form fails with 42703. |
| [M11-c361.md](M11-c361.md) | ✅ | Queue M11-c361, 05.11.2026: sitemap freshness and reachability. Local build matches the production DB exactly (88/12/37 + 17 regions + 15 content; only the 4 E2E fixtures left out, 0 lastmod mismatches). Production returns 503 under MAINTENANCE_MODE by design, and the apex host still 308s to www (BACKLOG #23, Ofir). No code change. |
| [M11-c362.md](M11-c362.md) | ✅ | Queue M11-c362, 06.11.2026: sitemap freshness and reachability, first run on the live site. www serves the index and all five files as 200; exact match with the production DB (80/12/38 + 17 regions + 15 content; only the 4 E2E fixtures left out, 0 lastmod mismatches); all 162 listed URLs return 200. Each goes through one 308 from the apex host (BACKLOG #23, Ofir). No code change. |
| [M12-c361.md](M12-c361.md) | ✅ | Queue M12-c361, 05.11.2026: robots.txt production-safe. Production answers 200 with the storefront rules, every token and auth path blocked. Added /newsletter/ (GET-write token pages), /partner/ and /dev/ to the disallow list. Takes effect on the next deploy. |
| [M12-c362.md](M12-c362.md) | ✅ | Queue M12-c362, 06.11.2026: robots.txt production-safe, measured on the live site. www serves 200 text/plain with Allow: / and 19 Disallow lines identical to src/app/robots.ts at HEAD, the same file for Googlebot, bingbot and GPTBot; none of the 162 sitemap URLs is disallowed. Recorded, not fixed: /debug/sentry answers 200 with the 404 body when its gate is off. No code change. |
| [M12-c363.md](M12-c363.md) | ✅ | Queue M12-c363, 06.11.2026: robots.txt production-safe, second run of the day. Unchanged since M12-c362: www serves 200 text/plain, byte-identical body (same md5), Allow: / and 19 Disallow lines identical to src/app/robots.ts at HEAD, same file for Googlebot, bingbot and GPTBot; none of the 162 sitemap URLs is disallowed; no route file added or removed since. Host and Sitemap lines still name the apex (BACKLOG #23, owner). |
| [M13-c361.md](M13-c361.md) | ✅ | Queue M13-c361, 05.11.2026: /api/health 200 with a real DB probe in production and locally. /api/ready was swallowed by the maintenance page in production (503 HTML); now exempt like /api/health. Locally 200 with real DB and limiter once the [SENSITIVE] Meilisearch placeholder is removed. |
| [M13-c362.md](M13-c362.md) | ✅ | Queue M13-c362, 06.11.2026: /api/health and /api/ready return 200 with real dependencies, in production (six of six, first 200 for /api/ready there) and locally after pnpm build, including MAINTENANCE_MODE=1. Negative control: a rejected service-role key gives 503 JSON on both. Recorded, not fixed: production Meilisearch is down, search degraded to Postgres. No code change. |
| [M13-c363.md](M13-c363.md) | ✅ | Queue M13-c363, 06.11.2026: /api/health and /api/ready return 200 with real dependencies, second run of the day. Unchanged since M13-c362: eight of eight GETs on production answer 200 JSON with no-store; locally 200 after pnpm build, including MAINTENANCE_MODE=1 and meilisearch not_configured. Negative control: a wrong service-role key gives 503 JSON on both. Still open: production Meilisearch is down, search degraded to Postgres. No code change. |
| [M14-c361.md](M14-c361.md) | ✅ | Queue M14-c361, 05.11.2026: Sentry release matches HEAD. Production deployment dpl_6kBkvYvyby1AYG2PvkKnr3p1Q1A7 is ff9639f96 = HEAD; live client chunk bakes release:"ff9639f9..."; server/edge fall back to VERCEL_GIT_COMMIT_SHA (no SENTRY_RELEASE set). Sentry-side release and source maps still not created: build SENTRY_AUTH_TOKEN answers 401 (BACKLOG #21, new token from Ofir). No code change. |
| [M14-c362.md](M14-c362.md) | ✅ | Queue M14-c362, 06.11.2026: Sentry release matches HEAD. Production deployment dpl_BheVBLhESd9LRpXJFsKAZ2wkGAqt is 29a09d12a = HEAD = origin; the live client chunk bakes release:"29a09d12..."; server/edge fall back to VERCEL_GIT_COMMIT_SHA (no SENTRY_RELEASE set). Sentry-side release and source maps still not created: build SENTRY_AUTH_TOKEN answers 401 (BACKLOG #21, new token from Ofir). Also adds the INDEX rows M12-c362 and M13-c362 were committed without. No code change. |
| [M14-c363.md](M14-c363.md) | ✅ | Queue M14-c363, 06.11.2026: Sentry release matches HEAD, second run of the day. Production deployment dpl_5q5mYjYBUv9ABcNvtRBL7cLb9cYc is 921bd1c33 = HEAD = origin; the live client chunk bakes release:"921bd1c33..."; server/edge fall back to VERCEL_GIT_COMMIT_SHA (no SENTRY_RELEASE set). A first reading 40 seconds after the push still saw the previous deployment (6d2f8376e) while the build ran. Sentry-side release and source maps still not created: build SENTRY_AUTH_TOKEN answers 401 (BACKLOG #21, new token from Ofir). Also adds the INDEX row M13-c363 was committed without. No code change. |
| [M15-c361.md](M15-c361.md) | ✅ | Queue M15-c361, 05.11.2026: no app console errors on /, /product/barbecue, /product/bar-drink at 380 and 1440 (fresh pnpm build of 18624c96a, pnpm start). 0 pageerror, 0 hydration warnings; all 50 entries are local-only: /_vercel/insights + speed-insights 404 and one /_next/image 404 (custom loader). Production 503 under MAINTENANCE_MODE, not measurable. No code change. |
| [M15-c362.md](M15-c362.md) | ✅ | Queue M15-c362, 06.11.2026: no console errors on / and five product pages at 380 and 1440, measured on production. First pass found 92 entries, all /_next/image 400: 52 /images/cdn/wp files that 40 active products reference existed on main only. Restored in f9a0234e6; second pass on dpl_13QNLJDsVFZTGFoWweT84iDesCG4 found 0 errors, 0 broken images. Corrects M15-c361, which classed one of these as local-only. |
| [M15-c363.md](M15-c363.md) | ✅ | Queue M15-c363, 06.11.2026: no console errors on / and ten product pages at 380 and 1440, measured on production (dpl_Ba7YMAdj2LFmZY4THknuQVmGW1Kh = 2e3d6dd64 = HEAD). Two passes of 22 loads: 0 console errors, 0 pageerror, 0 responses >= 400, 0 broken images. Pass 1 logged two net::ERR_ABORTED requests on /product/אייפון-13 at 380; a CDP trace shows each is a duplicate the browser cancelled after the same URL had loaded 200. Seen in 3 of 16 loads of that page, cause not established. No code change. |
| [M16-c361.md](M16-c361.md) | ✅ | Queue M16-c361, 05.11.2026: all 88 product pages in sitemap emit exactly one Product (name, ILS Offer price>0) and one BreadcrumbList (positions 1..n, last crumb = product). Only gap: Product.image absent on /product/מזקקת-ויסקי, ledgered no-image catalogue row with no wp_import photo. No code change. |
| [M16-c362.md](M16-c362.md) | ✅ | Queue M16-c362, 06.11.2026: first M16 on production. All 82 active product pages (80 in sitemap + 2 E2E fixtures, diffed against the database) emit exactly one Product (name, url, ILS Offer price>0) and one BreadcrumbList (positions 1..n, last crumb = product). Product.image absent on 3: ledgered /product/מזקקת-ויסקי and the two fixtures. Node URLs and canonical name the apex host, which 308s to www; recorded. No code change. |
| [M16-c363.md](M16-c363.md) | ✅ | Queue M16-c363, 06.11.2026: unchanged since M16-c362, measured on production (dpl_2mx1hM1cGSKpQ1MLrqSLBpZfV3Fn = 6377924c2 = HEAD). All 82 active product pages (80 in sitemap + 2 E2E fixtures, diffed against the database) emit exactly one Product (name, url, ILS Offer price>0) and one BreadcrumbList (positions 1..n, last crumb = product). Product.image absent on the same 3: ledgered /product/מזקקת-ויסקי and the two fixtures. Offer.price against the charged price not checked. No code change. |
| [M17-c361.md](M17-c361.md) | ✅ | Queue M17-c361, 05.11.2026: RTL holds on /, /product/barbecue, /product/bar-drink at 380/768/1440. html dir=rtl lang=he, 0 Hebrew elements computing ltr or left-aligned, 0 px horizontal overflow. Only dir=ltr is the deliberate footer newsletter email field (frozen). No code change. |
| [M17-c362.md](M17-c362.md) | ✅ | Queue M17-c362, 06.11.2026: first M17 on production. /, and 5 product pages at 380/768/1440 (18 loads): html dir=rtl lang=he, 0 Hebrew text elements computing ltr or left-aligned, 0 px overflow. LTR elements are the numeric discount badges on / and two supplier phone links, both deliberate. One exception recorded, not fixed (frozen): the Hebrew placeholder of the footer newsletter email field is left-aligned from 1024 px up; BACKLOG #25. Corrects M17-c361, which missed the placeholder. No code change. |
| [M17-c363.md](M17-c363.md) | ✅ | Queue M17-c363, 06.11.2026: RTL unchanged since M17-c362, measured on production (dpl_Hr7oaqaotPQQJ78FkYQWvmc9zkS9 = 58e0708c2 = HEAD). / and 10 product pages at 380/768/1440 (33 loads, second pass): html dir=rtl lang=he, 0 Hebrew text elements computing ltr or left-aligned, 0 px overflow, 0 CSS-LTR elements besides the numeric discount badges. Footer newsletter placeholder still left-aligned (BACKLOG #25, frozen). New, unexplained: one first-pass load of /product/מזקקת-ויסקי at 768 rendered the root error screen with HTTP 200; not reproduced in 23 other loads of that page; cause unknown, Sentry not readable (BACKLOG #26). Read-only, no code change. |
| [M18-c362.md](M18-c362.md) | ✅ | Queue M18-c362, 06.11.2026: STATE.md trimmed from 329 lines / 88.6 KB to 240 lines / 38.2 KB. S39..S31, the post-G final audit, G1..G7, B1+B2+B3, M19-c361, M18-c361, the c361 M line (with M07/M06/M04-c362), S30 v2.1.0-checkout, S29..S27 and V08..V05 moved verbatim to the top of STATE-ARCHIVE.md; nothing deleted. No code change. |
| [M19-c362.md](M19-c362.md) | ✅ | Queue M19-c362, 06.11.2026: prod promote no-op. www serves dpl_HMymwoHhF4MPZkfnFv1WcWZnC2TD, git auto-deploy of 9d42d9e9e = HEAD; it was still Building when the item started and took the alias about two minutes later. /api/ready 200 with search degraded (meilisearch down), /api/health 200, / 200. No code change. |
| [M04-c363.md](M04-c363.md) | ✅ | Queue M04-c363, 06.11.2026: tsc --noEmit exit 0 at f66e16bd3, no type drift; pnpm lint and the docs-inventory test were also green before any change. Nothing to fix. No code change. |
| [M05-c363.md](M05-c363.md) | ✅ | Queue M05-c363, 06.11.2026: pnpm test (vitest run) green at 741274bd2, 704 files passed + 1 skipped, 8303 tests passed + 13 skipped of 8316; no drift. Nothing to fix. No code change. |
| [M06-c363.md](M06-c363.md) | ✅ | Queue M06-c363, 06.11.2026: pnpm build exit 0 at 08e82471c (417 static pages), no tracked file changed, no drift to fix; 11 fewer product pages than c362 come from S41 (93 -> 82 active), /supplier/apply turned PPR via S33. |
| [M07-c363.md](M07-c363.md) | ✅ | Queue M07-c363, 06.11.2026: TODO/FIXME scan older than 7 days at f180611f2. Same two TODO(cardcom) markers only (105 d and 91 d), both already in BACKLOG item 6 and issues #41/#42, still open (live-terminal blocker); zero new. Docs-only. |
| [M08-c363.md](M08-c363.md) | ✅ | Queue M08-c363, 06.11.2026: Lighthouse mobile on / and a sample product at 23458fe58, local build and live. Local devtools perf 99-100 / 98-99; A11y, BP and SEO 100 in all 26 runs. Live product page BP 96 -> 100: the four related-product images now answer 200 (M15-c362 restored the files). Live devtools perf 66 / 69 (median of 3, was 95 / 84): same page weight, TBT and CLS, time lost in the network leg over a slow VPN link; not shown to be a site regression, not re-measured off the VPN. Measurement only. |
| [M09-c363.md](M09-c363.md) | ✅ | Queue M09-c363, 06.11.2026: no removable dependency (postgres and lighthouse are used by scripts). Deleted the eight unimported store/ and product/WishlistButton components, two stray root scripts and nine dead definitions. Dead-component ledger 15 -> 8, Hebrew literal ceiling 557 -> 543, knip unused files 197 -> 187. type-check, lint, test (8303) and build green. |
| [M10-c363.md](M10-c363.md) | ⚠️ | Queue M10-c363, 06.11.2026: third re-scan of all 73 migrations/pending files against production. Identical to M10-c362: 29 live, the same 44 not applied; none applied here. BLOCKED: 218 is still not live on the live site, so the customer account details form fails with 42703. |
| [M11-c363.md](M11-c363.md) | ✅ | Queue M11-c363, 06.11.2026: sitemap freshness and reachability on the live site, second run of the day. Identical to M11-c362: www serves the index and all five files as 200; exact match with the production DB (80/12/38 + 17 regions + 15 content; only the 4 E2E fixtures left out, 0 lastmod mismatches); all 162 listed URLs return 200, each through one 308 from the apex host (BACKLOG #23, owner). |
| [G1-cardcom-webhook.md](G1-cardcom-webhook.md) | ✅ | Queue G1, 05.11.2026: the Cardcom webhook already lives at /api/payments/cardcom/webhook (URL secret + GetLpResult, DB-unique dedup, finalize, DLQ); added the /api/webhooks/cardcom alias, Sentry warnings on declines, and the four-payload contract suite in tests/webhooks. No HMAC: Cardcom does not sign |
| [G2-resend-dns.md](G2-resend-dns.md) | ✅ | Queue G2, 05.11.2026: scripts/verify-resend-dns.sh; DKIM, SPF, MX (us-east-1) and DMARC all in the Vercel zone and resolving publicly over DoH; Resend API status not measurable without a domains:read key |
| [BACKUP-RUNBOOK.md](BACKUP-RUNBOOK.md) | ✅ | Queue G3, 05.11.2026: PITR is OFF (pitr_enabled=false, no add-on), daily physical backups 7-day window, WAL-G archiving on, no R2 dumps; enable steps (ci_small + pitr_7), restore procedures A/B/C, dry-run commands |
| [G4-launch-seed.md](G4-launch-seed.md) | ✅ | Queue G4, 05.11.2026: scripts/seed-launch.ts wrote 1 dummy supplier + 3 coupons (119/240, 149/320, 790/1400 ILS, 15%, old-site images, is_demo=true, tag launch-seed) into production through the money module and publish gate; --check/--remove |
| [ROLLBACK-RUNBOOK.md](ROLLBACK-RUNBOOK.md) | ✅ | Queue G5, 05.11.2026: known-good production deployment recorded (dpl_T2NV6P7N..., commit d49fb1b1f), one-command rollback via vercel promote, scripts/record-known-good-deploy.sh keeps the last five |
| [G6-admin-2fa.md](G6-admin-2fa.md) | ✅ | Queue G6, 05.11.2026: TOTP forced for super_admin, admin and content_uploader (gate + proxy), backup codes hashed in auth app_metadata with reset-by-code recovery, /api/auth/mfa, account and admin-mfa UI, E2E admin fixture enrolled, contract suite |
| [G7-error-pages.md](G7-error-pages.md) | ✅ | Queue G7, 05.11.2026: 404, 500 and offline on one branded frame (logo, Electro palette redefined locally, mail + WhatsApp support), offline page lists the worker's cached browse pages, public/offline.html static fallback, sw ke-v4 |
| [M18-c361.md](M18-c361.md) | ✅ | Queue M18-c361, 05.11.2026: STATE.md trimmed from 299 lines / 63.5 KB to 213 lines / 36.7 KB. V04..V02, S26..S14 and M08..M06-c113 moved verbatim to the top of STATE-ARCHIVE.md; nothing deleted. No code change. |
| [M19-c361.md](M19-c361.md) | ✅ | Queue M19-c361, 05.11.2026: prod promote no-op. Production alias serves dpl_5JRDE2Dr9iHZLqsV1Dk4BiyRByuX, git auto-deploy of f9f2e37ad = HEAD. /api/ready 503 JSON (meilisearch down), /api/health 200, / 503 under MAINTENANCE_MODE. No code change. |
| [STATE-ARCHIVE.md](STATE-ARCHIVE.md) | 🕯️ | כל מה שהיה ב-STATE.md לפני הגיזום ל-300 שורות (Q06, 25.09.2026), החדש למעלה. STATE.md הוא הנוכחי. |
| [V01-cart.md](V01-cart.md) | ✅ | Queue V01, 04.11.2026: cart visual. /cart rebuilt as Electro v7's WooCommerce cart table (stacked labelled cards below 768) with coupon and clear-cart in the actions row and a cart_totals box; every cart price in whole shekels; drawer gets a per-line remove. Fixed on the way: the mini-cart opened off-screen (182px overflow at 1440), /cart and the drawer said "empty" while the server cart was loading, and 24/36/22px touch targets. Screenshots at 380/768/1440 in docs/V01/. |
| [V02-checkout.md](V02-checkout.md) | ✅ | Queue V02, 04.11.2026: checkout visual. /checkout is Electro v7's single page at every width (stepper removed): email first, shipping only for physical carts, sticky order panel from 992, whole shekels, sticky pay bar above the tab bar under 992, error summary with focus on the first wrong field, spinner busy state, single-page Suspense skeleton. 0 overflow and 0 controls under 44px at 380/768/1440. Screenshots in docs/V02/. |
| [V03-confirm.md](V03-confirm.md) | ✅ | Queue V03, 04.11.2026: order confirmation visual. /checkout/return (alias /checkout/confirm, new) in Electro thank-you order: notice, order overview (number, date, total, email), coupon QR + code with business details and Waze/Google Maps links (street address only, no phone), invoice link, cancellation note, continue shopping. Whole shekels, copy in checkout.confirm.*. 0 overflow and 0 controls under 44px at 380/768/1440. Screenshots in docs/V03/. |
| [V04-auth.md](V04-auth.md) | ✅ | Queue V04, 04.11.2026: auth visual. /login and /register (new alias of /signup) as Electro my-account inside the store chrome: breadcrumb, centred "החשבון שלי", two columns with an "או" disc, password form then Google, passkey and the code step, register/login door opposite. Copy in auth.*, 0 overflow and 0 controls under 44px at 380/768/1440. No login modal: the header account dropdown is frozen. Screenshots in docs/V04/. |
| [V05-account.md](V05-account.md) | ✅ | Queue V05, 04.11.2026: account visual. /account/** as Electro my-account: breadcrumb, centred "החשבון שלי", MyAccount nav as a side column from 992 and a scrolling tab strip below (active tab centred by an aria-current observer, no path hook). Orders and wallet as shop_table, stacking into labelled cards below 768; dashboard greeting; settings cards in the account vocabulary. Whole shekels in the account area. 0 overflow and 0 controls under 44px on 7 pages at 380/768/1440. Screenshots in docs/V05/. |
| [V06-supplier-legal.md](V06-supplier-legal.md) | ✅ | Queue V06, 04.11.2026: supplier join and legal visual. /supplier/apply gets site chrome (it had none), the V04 breadcrumb and title frame and a scoped Electro form sheet. Fixes "המשך" on step 2 submitting the wizard (React reused the button node). Legal tables stack into labelled cards below 640, contents and breadcrumb links are 44px below 1024, and the title is 28px below 768. 0 overflow and 0 small controls at 380/768 on 5 pages. Screenshots in docs/V06/. |
| [V07-mobile.md](V07-mobile.md) | ✅ | Queue V07, 04.11.2026: mobile shell check of every open route (cart, drawer, checkout, confirmation, login, register, 17 account pages, supplier join, 4 legal documents) at 380 and 768: overflow, covered controls, 44px targets, keyboard, safe-area insets, install banner. 21 failing route/width pairs before, 0 after. Fixes the checkout pay bar and the WhatsApp button sliding under the tab bar on notched phones, five sub-44px controls, and keeps the install banner off the sign-in forms and legal documents. Screenshots in docs/V07/. |
| [V08-lighthouse.md](V08-lighthouse.md) | ✅ | Queue V08, 05.11.2026: Lighthouse mobile on /cart, /checkout, /login and /account, signed in with a real cart where the route needs it (scripts/v08-lighthouse.mjs, 5 simulated runs plus 1 devtools-throttled run per route). Fixes the footer shift on all four (Suspense fallbacks and loading blocks that now hold a screen of height), the checkout terms checkbox under WCAG 2.5.8, two serial round trips in the checkout body, and eleven auth calls per /account render cut to one (src/lib/supabase/request-user.ts). Reports in docs/V08/. |
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
| [CRON.md](CRON.md) | ⚠️ | ‏נמדד ‏10.09.2026. שבע מ-17 המשימות המתוזמנות מחזירות ‏404 מהפריסה שהמתזמן קורא |
| [CUSTOMER-SUPPORT-TOOLS.md](CUSTOMER-SUPPORT-TOOLS.md) | ✅ | כלי התמיכה בקונסולת האדמין: איתור לפי טלפון/מספר הזמנה, ציר זמן, זיכוי ידני, שליחה חוזרת, צפייה כלקוח. נמדד 10.09.2026. |
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
| [RESILIENCE.md](RESILIENCE.md) | ✅ | ‏SECTIONS 83. נמדד ‏22.09.2026: ‏breakers, ‏DLQ, מתגי הרג, ומה שנבנה: מצב תחזוקה וטבלת דגלים עם ממשק. |
| [REFS-POLICY.md](REFS-POLICY.md) | ✅ | Recommendation: change nothing. Do not adopt git-lfs, and do not commit the |
| [REVIEWS.md](REVIEWS.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |
| [SENTRY-SETUP.md](SENTRY-SETUP.md) | ✅ | Measured and wired 21.08.2026. What is done, what is left, and the three ways |
| [SEO-PAGES.md](SEO-PAGES.md) | ✅ | נמדד מול העץ ומול הפרויקט ixvwfbuvfxxsjiywhbbb ב-09.09.2026. |
| [SHIPPING.md](SHIPPING.md) | ✅ | Measured 2026-09-09 against production (ixvwfbuvfxxsjiywhbbb). |
| [SOURCING-RULES.md](SOURCING-RULES.md) | ✅ | Authoritative. Read this before changing any asset, string or geometry value. |
| [STAGING.md](STAGING.md) | ✅ | סביבת ביניים: הבאנר נבנה, כל השאר חסום על גורמים חיצוניים. נמדד 2026-09-10. |
| [TAX-INVOICING.md](TAX-INVOICING.md) | ✅ | ‏SECTIONS 56. נמדד ‏22.09.2026: מה מסעיף ‏68 חי, ומה נוסף: רשימת חשבוניות ללקוח ומסך חיפוש והחזרה לתור לאדמין. |
| [SUPPLIER-SELF-SERVICE.md](SUPPLIER-SELF-SERVICE.md) | ✅ | ‏SECTIONS 54. נבנה ‏21.09.2026: שדות פרופיל, הצעות מחיר ותמונות בדלי ממתין, מה היה קיים ומה נמדד. |
| [SPAWNER-REVIVAL-MEASURED.md](SPAWNER-REVIVAL-MEASURED.md) | 🕯️ | נמדד 19.08.2026 ב-09:32. תוספת ל-docs/ETERNAL-OPS.md §1.2 ו-§5, ותיקון |
| [SUBSCRIPTIONS.md](SUBSCRIPTIONS.md) | ✅ | This section is additive. Everything below it is the 2026-09-02 write-up of |
| [SUPPLIER-ONBOARDING-KIT.md](SUPPLIER-ONBOARDING-KIT.md) | ✅ | תאריך: 2026-08-19. |
| [SUPPLIER-ONBOARDING.md](SUPPLIER-ONBOARDING.md) | ✅ | הצטרפות בית עסק: מבקש אינו ספק, ומספר חשבון אינו עמודה. |
| [SUPPLIER-POS.md](SUPPLIER-POS.md) | ✅ | הקופה של בית העסק: מה כבר היה, איפה, ומה נמצא חסר. |
| [SUPPORT.md](SUPPORT.md) | ✅ | מרכז התמיכה: מה כבר היה, מה מעולם לא נכתב, ומה השתנה. |
| [TESTING.md](TESTING.md) | ✅ | What is tested where, how to run each suite, and what the gates actually block. |
| [VISUAL-PARITY.md](VISUAL-PARITY.md) | ✅ | ‏נמדד ‏02.09.2026 (ערב), ‏compare.mjs מול build טרי על ‏:3412, האתר החי |
| [WHATSAPP.md](WHATSAPP.md) | ✅ | Verified 2026-09-02. Built before G5; G5's one real gap was measurement, closed |
| [WHATSAPP-SETUP.md](WHATSAPP-SETUP.md) | ✅ | Owner runbook: registering with Meta through Twilio, env vars, pointing the webhook, template approval, testing. |
| [WA-CONTACT.md](WA-CONTACT.md) | ✅ | ‏SECTIONS 94. נמדד ‏22.09.2026: וואטסאפ לפי נושא ‏(5 ערוצים, ברירות מחדל בקוד + מיגרציה ‏236), בורר ב-/contact, גיליון צף, ‏footer, "שאלה לבית העסק" עם נפילה לשירות לקוחות, אדמין, ‏E2E. |
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
| [adr/0013-feature-flags-env-over-table.md](adr/0013-feature-flags-env-over-table.md) | ✅ | סטטוס: נאכף. מאז: ‏22.09.2026 ‏(SECTIONS 83). |
| [adr/0014-bans-live-in-auth-users.md](adr/0014-bans-live-in-auth-users.md) | ✅ | סטטוס: נאכף. מאז: ‏22.09.2026 ‏(SECTIONS 85). |
| [adr/README.md](adr/README.md) | ✅ | ‏נכתבו ‏02.09.2026 (‏STEP 85), כתקצירים המפנים לראיות. כל החלטה כאן כבר |

---

## Legal pages

2 documents.

| Document | Status | What it is |
|---|---|---|
| [legal/COUNSEL-REVIEW.md](legal/COUNSEL-REVIEW.md) | ✅ | ארבעת המסמכים ב-/legal/ נכתבו לפי הדין הישראלי ולפי אופן פעולת המערכת |
| [legal/README.md](legal/README.md) | ✅ | מסמך תפעולי: מה נבנה, איפה זה יושב, למה בכתובות האלה, ומה נשאר לעשות |

