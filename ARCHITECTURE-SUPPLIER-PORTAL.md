# ארכיטקטורה: פורטל ספק (מצביע BINDING)

סקירה קצרה לפורטל ספק. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; payout פיזי בלבד; קופון: 0 מהפלטפורמה.

**מקור קנוני:**

```
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md
docs/BUSINESS-MODEL.md
```

Dump ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| SP1 | שער: `supplier_members` פעיל; roles owner/manager/scanner. |
| SP2 | redeem: RPC `redeem_voucher` בלבד; JWT משתמש. |
| SP3 | No Escrow; אין payout קופון מהפלטפורמה. |
| SP4 | ספק לא כותב `platform_percent` / `coupon_price`. |
| SP5 | UI עברית RTL; כסף agorot פנימי, ₪ תצוגה. |
| SP6 | `suspended` חוסם redeem ו-publish חדש. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root mega dump | docs/SUPPLIER-PORTAL קנוני. |
| הרשאה לפי profiles.role בלבד | membership tenant. |
| Escrow held until scan | No Escrow. |
| ספק עורך platform_percent | admin only. |
| optimistic UI redeemed | server truth first. |

---

## סכמת DB

```text
suppliers, supplier_members, supplier_bank_accounts
vouchers, voucher_redemptions
order_items, payout_statements
products (read/draft; no % write)
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | wrong shop scan | not_found (anti-enum). |
| CE2 | replay idempotency | same outcome. |
| CE3 | expired voucher | 409 expired. |
| CE4 | multi-supplier user | context switch. |
| CE5 | scanner sees bank | RBAC deny. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | PIN per scanner | optional hardening. |
| O2 | supplier analytics v2 | ANALYTICS doc. |
| O3 | mobile scan PWA | SUPER-APP. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | dump root |
| 2026-08-12 | batch-2: BINDING מצביע |
