# ARCHITECTURE-DOCS-INDEX.md

אינדקס מסמכי ארכיטקטורה ב-`ke-arch` (branch `arch/docs-queue`).

Date: 2026-07-31 · docs only.

**Master (money-first):** `MASTER-ARCHITECTURE-v2.md`

## Go-Live / ops
- `ARCHITECTURE-GO-LIVE-CHECKLIST.md`
- `ARCHITECTURE-BACKUP-DR.md`
- `ARCHITECTURE-OBSERVABILITY.md`
- `ARCHITECTURE-TESTING-CICD.md`
- `ARCHITECTURE-FRAUD-RATE-LIMITS.md`
- `ARCHITECTURE-ENV-SECRETS.md`
- `ARCHITECTURE-FEATURE-FLAGS.md`
- `ARCHITECTURE-INCIDENT-RESPONSE.md`
- `ARCHITECTURE-PAYMENT-RECONCILIATION.md`

## Commerce
- `ARCHITECTURE-CART-ZUSTAND.md`
- `ARCHITECTURE-CHECKOUT-CARDCOM.md`
- `ARCHITECTURE-COUPON-REDEMPTION.md`
- `ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md`
- `ARCHITECTURE-INVOICING-TAX.md`
- `ARCHITECTURE-SHIPPING-RETURNS.md`

## Storefront
- `ARCHITECTURE-SEO-PERFORMANCE.md`
- `ARCHITECTURE-CATEGORY-PAGE.md`
- `ARCHITECTURE-SEARCH.md`
- `ARCHITECTURE-PWA.md`
- `ARCHITECTURE-MOBILE-APP.md`
- `ARCHITECTURE-WISHLIST.md`
- `ARCHITECTURE-MEDIA-R2.md`
- `ARCHITECTURE-DESIGN-SYSTEM.md`
- `ARCHITECTURE-ACCESSIBILITY.md`
- `ARCHITECTURE-COOKIE-CONSENT.md`

## Account / support
- `ARCHITECTURE-ACCOUNT-AREA.md`
- `ARCHITECTURE-CUSTOMER-SUPPORT.md`
- `ARCHITECTURE-AI-AGENTS-SUPPORT.md`
- `ARCHITECTURE-AI-AGENTS.md`
- `ARCHITECTURE-NOTIFICATIONS.md` (V2 מלא: Resend+Trigger+Edge, WhatsApp, QR, 48h, unsubscribe)
- `ARCHITECTURE-NOTIFICATIONS-V2.md` (מצביע לקנוני למעלה)

## Admin / suppliers / growth
- `ARCHITECTURE-ADMIN.md`
- `ARCHITECTURE-ADMIN-DASHBOARD.md`
- `ARCHITECTURE-SUPPLIER-PORTAL.md`
- `ARCHITECTURE-SUPPLIER-ONBOARDING.md`
- `ARCHITECTURE-ANALYTICS.md`
- `ARCHITECTURE-ANALYTICS-KPI.md`
- `ARCHITECTURE-REFERRALS.md`
- `ARCHITECTURE-SECURITY-COMPLIANCE.md`
- `ARCHITECTURE-SECURITY-AUDIT.md` (תוכנית ביקורת: RLS probes, סריקות, רישום ממצאים)
- `ARCHITECTURE-ADMIN-DASHBOARD-SPEC.md` (מפרט מסכי אדמין: טבלאות, פילטרים, הרשאות)
- `OPERATIONS-RUNBOOK.md` (תפעול יומי ותקלות נפוצות)
- `INDEX.md` (אינדקס עשרת מסמכי ספרינט 07/31-08/02)
- `ARCHITECTURE-LEGAL.md`
- `ARCHITECTURE-LEGAL-PAGES.md` (מפרט תקנון, ביטולים לפי חוק הגנת הצרכן, פרטיות, נגישות)

## Data
- `ARCHITECTURE-WP-MIGRATION.md`
- `ARCHITECTURE-WP-MIGRATION-PLAN.md` (חוזה מיפוי שדה-מול-שדה, סדר ייבוא, rollback)
- `ARCHITECTURE-LAUNCH-MARKETING.md` (‏301 מ-WP, Google Merchant, קמפיין השקה)
- `ARCHITECTURE-WP-DATA-MIGRATION-EXECUTION.md`

## Still deeper elsewhere (worktrees)
Full-length versions may live under `ke-arch-*` (cart, account-area, notifications-v2, wp, etc.). Prefer the dedicated worktree when implementing that domain; `ke-arch` holds the consolidated queue + summaries.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Index after docs-queue continuous run |
| 2026-07-31 | Gap docs: env, flags, shipping, reconcile, onboarding, incident, a11y, design, cookies |
| 2026-07-31 | Link MASTER-ARCHITECTURE-v2; GO-LIVE/ONBOARDING/ANALYTICS/SUPPORT rev C |
