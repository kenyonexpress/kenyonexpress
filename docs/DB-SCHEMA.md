# Database schema: `public`

Status: **BINDING (reference)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
מודל כסף: **No Escrow**

**Regenerate:**

```
node scripts/db-doc.mjs
```

(dורש `SUPABASE_DB_URL`. read-only SELECT.)

הגוף המלא (~1296 שורות) הוסר. snapshot קודם: git history.

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| S1 | **מקור runtime:** פרוד + `src/types/database.ts`. |
| S2 | מסמך = תיעוד; לא substitute ל-introspection. |
| S3 | כל `public` table: **RLS enabled**. |
| S4 | `escrow_held_agorot` = **legacy 0** (No Escrow). |
| S5 | `platform_percent` חובה, **אין default**. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| Drizzle schema נפרד | migrations SQL |
| dump סטטי 1300+ שורות | drift |
| numeric כ-primary | agorot integer |
| Escrow column פעילה | No Escrow |

---

## 3. סכמת DB (סיכום)

| טבלה | תפקיד |
|---|---|
| `products` | `platform_percent`, `coupon_price_ils` |
| `orders` / `order_items` | snapshot כסף |
| `vouchers` / `voucher_redemptions` | QR, מימוש |
| `payments` | Cardcom |
| `settlement_events` | ledger events |
| `suppliers` | admin-only |

---

## 4. מקרי קצה

| # | מצב |
|---|---|
| E1 | enum בקוד ≠ פרוד |
| E2 | payout tables null |
| E3 | wallet numeric vs agorot |
| E4 | regenerate בלי URL |

---

## 5. פתוחות

| # | פער |
|---|---|
| O1 | run db-doc after migrations |
| O2 | payout 027 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING: pointer to script |
| 2026-07-23 | introspection |
