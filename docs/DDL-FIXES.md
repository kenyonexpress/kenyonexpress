# DDL-FIXES

תיקוני DDL לנתיב קופון / settlement. **No Escrow.**

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
פרויקט: `ixvwfbuvfxxsjiywhbbb` · MCP `apply_migration` בלבד

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| F1 | **`platform_settled`** ב-enum (071). |
| F2 | קופון: **No Escrow**; finalize → `platform_settled`. |
| F3 | לא full 027 (COALESCE 10%). |
| F4 | לא full 054 CHECK 100%. |
| F5 | סדר: 071 → 054_section2 → 072 → 073. |

---

## 2. חלופות שנדחו

| חלופה | למה |
|---|---|
| Escrow 079/080 | cancelled |
| db push | forbidden |
| 066 במקום 071 | לא הוחל |

---

## 3. סכמת DB

| migration | תוכן |
|---|---|
| 071 | platform_settled |
| 054_section2 | coupon_price_ils |
| 072 | supplier_members |
| 073 | vouchers |

---

## 4. מקרי קצה

| # | מצב |
|---|---|
| E1 | enum חסר אחרי Cardcom |
| E2 | ADD VALUE same TX |
| E3 | rebuild env order |

---

## 5. פתוחות

| # | פער |
|---|---|
| O1 | redeem RPCs |
| O2 | payout 027 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING No Escrow |
