# Supplier Portal Architecture (מצביע BINDING)

סקירה קצרה לפורטל ספק (alias). פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; payout פיזי בלבד.

**מקור קנוני:**

```
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md
docs/ARCHITECTURE-SUPPLIER-SETTLEMENTS.md
```

Dump ארוך (arch/admin-supplier): git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| S1 | alias ל-`ARCHITECTURE-SUPPLIER-PORTAL.md` ב-docs/; root לא מקור אמת. |
| S2 | membership `supplier_members`; roles owner/manager/scanner. |
| S3 | redeem: RPC `redeem_voucher`; JWT user session. |
| S4 | No Escrow; אין KPI escrow_held; קופון payout=0 מהפלטפורמה. |
| S5 | ספק לא כותב money knobs; admin בלבד. |
| S6 | UI עברית RTL. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root duplicate 800+ lines | docs/SUPPLIER-PORTAL קנוני. |
| Escrow until scan | No Escrow. |
| profiles.role=vendor בלבד | membership tenant. |
| ספק עורך platform_percent | SP7 docs. |
| שני root docs סותרים | alias + pointer. |

---

## סכמת DB

```text
suppliers, supplier_members, supplier_bank_accounts
vouchers, voucher_redemptions
payout_statements, order_items (physical queue)
products (draft/read)
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | suspended supplier | block redeem. |
| CE2 | wrong shop | not_found. |
| CE3 | scanner → bank UI | 403. |
| CE4 | idempotency replay | same outcome. |
| CE5 | multi-supplier user | context pick. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | merge SUPPLIER-PORTAL + SUPPLIER-PORTAL-ARCHITECTURE | root aliases only. |
| O2 | supplier mobile scan | PWA/SUPER-APP. |
| O3 | analytics dashboard | SUPPLIER-ANALYTICS. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-27 | dump arch/admin-supplier |
| 2026-08-12 | batch-2: BINDING alias pointer |
