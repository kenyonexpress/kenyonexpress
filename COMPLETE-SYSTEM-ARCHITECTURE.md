# Complete System Architecture (אינדקס BINDING)

אינדקס אינטגרציה קצר. **אין Escrow.** פירוט כסף ו-ERD ב-docs/.

Status: **BINDING (index)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**מקורות קנוניים:**

```
docs/ARCHITECTURE-MONEY.md
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
docs/MASTER-ARCHITECTURE-v2.md
docs/ARCHITECTURE-DOCS-INDEX.md
docs/DB-SCHEMA.md
```

**נדחה במפורש מהגרסה הישנה של מסמך זה:**

- `escrow_holds` / held-until-redeem על קופון
- payout לספק מהפלטפורמה על מימוש קופון
- D-MONEY-2 עם Escrow release

Dump ERD ארוך (phase6): git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| CS1 | agorot integer בלבד; `src/lib/money.ts`. |
| CS2 | קופון: `coupon_price` מוחלט; 100% מקדמה לפלטפורמה; יתרה בעסק; **No Escrow**. |
| CS3 | פיזי: 100% באתר; split מ-snapshot `platform_percent`; payout batch. |
| CS4 | Snapshot immutable ב-`order_items` אחרי paid. |
| CS5 | Cardcom Low Profile בלבד (SAQ-A). |
| CS6 | root = אינדקס; ERD מלא ב-DB-SCHEMA + domain docs. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow / escrow_holds על קופון | MONEY + BUSINESS-MODEL; No Escrow. |
| root mega ERD dump | docs/ + git history. |
| float / numeric money | CS1 agorot. |
| re-read live percent ב-settlement | CS4 snapshot. |
| coupon_codes legacy כמקור | vouchers קנוני. |

---

## סכמת DB

אינדקס טבלאות (פירוט: `docs/DB-SCHEMA.md`):

```text
profiles, products, orders, order_items
payments, vouchers, voucher_redemptions
suppliers, supplier_members
wallet_*, settlement_events, payout_statements
```

`escrow_holds`: legacy/0; לא במודל חי. אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | doc ישן מזכיר Escrow | CONTRADICTIONS + MONEY גוברים. |
| CE2 | percent null ב-publish | block. |
| CE3 | unredeemed expiry | wallet credit (C6). |
| CE4 | physical payout before window | manual/block. |
| CE5 | ledger vs Cardcom drift | reconcile nightly. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | align LEDGER-DESIGN עם No Escrow | root companion review. |
| O2 | monorepo packages/money | MASTER-v2 O2. |
| O3 | migration 036-041 queue | MASTER-ARCHITECTURE 0.2. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-27 | phase6 dump עם Escrow (מיושן) |
| 2026-08-12 | batch-2: BINDING index; דחיית Escrow |
