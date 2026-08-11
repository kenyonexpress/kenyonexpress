# ארכיטקטורה: Docs Index

אינדקס מסמכי ארכיטקטורה ב-`ke-arch` (branch `arch/docs-batch-2`).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

Master: `docs/MASTER-ARCHITECTURE-v2.md` · תבנית: `docs/DOCS-TEMPLATE-BINDING.md`

---

## החלטה

| # | הכרעה |
|---|---|
| I1 | כל `ARCHITECTURE-*.md` חייב 5 סעיפים BINDING (החלטה, חלופות, DB, קצה, פתוחות). |
| I2 | worktree docs: `ke-arch` בלבד; branch `arch/docs-batch-2`. |
| I3 | סתירות כסף: `CONTRADICTIONS.md` + `ARCHITECTURE-MONEY.md` גוברים. |
| I4 | מסמך V2 pointer → קנוני אחד (לא כפילות). |
| I5 | יישום קוד: worktrees ייעודיים (`ke-arch-*`) + docs כאן. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| docs רק באנגלית | I1: עברית RTL. |
| אינדקס אוטומטי מ-git | ידני + INDEX.md לספרינט. |
| ARCHITECTURE ב-root repo | I2: ke-arch worktree. |
| כפילות NOTIFICATIONS + V2 | I4: pointer. |
| em dash בכותרות | DOCS-TEMPLATE: אסור. |

---

## סכמת DB

אין DDL. מטא-נתונים:

```text
docs/INDEX.md          -- sprint index
docs/MASTER-INDEX.md   -- master map
docs/CHANGELOG.md      -- doc revisions
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | שני docs סותרים על Escrow | CONTRADICTIONS wins. |
| CE2 | doc בלי 5 סעיפים | לא BINDING; batch fix. |
| CE3 | worktree wrong path | R1 template: ke-arch only. |
| CE4 | code dump 2000 lines | BINDING pointer + git history. |
| CE5 | branch not docs-batch-2 | R5: commit לענף הנכון. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | auto-link checker CI | broken refs. |
| O2 | batch-3 domains | STATE.md queue. |
| O3 | merge docs-batch-2 → main | after review. |

---

## אינדקס לפי דומיין

### Go-Live / ops
`ARCHITECTURE-GO-LIVE-CHECKLIST`, `BACKUP-DR`, `OBSERVABILITY`, `TESTING-CICD`, `FRAUD-RATE-LIMITS`, `ENV-SECRETS`, `FEATURE-FLAGS`, `INCIDENT-RESPONSE`, `PAYMENT-RECONCILIATION`

### Commerce
`CART-ZUSTAND`, `CHECKOUT-CARDCOM`, `COUPON-REDEMPTION`, `MASTER-CHECKOUT-REDEMPTION`, `FULFILLMENT-SUPPLIER-WORKFLOW`, `INVOICING-TAX`, `SHIPPING-RETURNS`

### Storefront / SEO
`SEO`, `SEO-SITEMAP`, `SEO-PERFORMANCE`, `SEARCH`, `SEARCH-UX`, `SEARCH-DISCOVERY`, `CATALOG-SEARCH-SEO`, `CATEGORY-PAGE`, `PWA`, `ACCESSIBILITY`, `ACCESSIBILITY-IL`

### Account / AI / notifications
`ACCOUNT`, `ACCOUNT-IDENTITY`, `ACCOUNT-WALLET`, `ACCOUNT-AREA`, `AI-AGENTS`, `AI-AGENTS-RUNTIME`, `AI-AGENTS-SUPPORT`, `NOTIFICATIONS`, `NOTIFICATIONS-V2`, `NOTIFICATIONS-MARKETING`

### Admin / analytics
`ADMIN`, `ADMIN-DASHBOARD`, `ADMIN-DASHBOARD-SPEC`, `ADMIN-ANALYTICS`, `ANALYTICS`, `ANALYTICS-BI`, `ANALYTICS-KPI`, `SUPPLIER-PORTAL`

### Data / WP
`WORDPRESS-IMPORT`, `WP-MIGRATION`, `WP-MIGRATION-PLAN`, `WP-DATA-MIGRATION`, `WP-DATA-MIGRATION-EXECUTION`

### Security / legal
`SECURITY`, `SECURITY-COMPLIANCE`, `SECURITY-RLS`, `LEGAL`, `LEGAL-PAGES`, `CARDCOM-EDGE-CASES`, `CARDCOM-WEBHOOKS`

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | index docs-queue |
| 2026-08-12 | batch-2: BINDING index + 5 סעיפים |
