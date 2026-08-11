# Master Architecture (אינדקס BINDING)

אינדקס קצר למסמך האב v3. **No Escrow.** פירוט ב-docs/.

Status: **BINDING (index)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**מקורות קנוניים:**

```
docs/MASTER-ARCHITECTURE.md
docs/MASTER-ARCHITECTURE-v2.md
docs/ARCHITECTURE-MONEY.md
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-DOCS-INDEX.md
```

**נדחה במפורש מה-root v2 הישן:**

- Escrow / held-until-redeem על קופון
- payout לספק על קופון מהפלטפורמה
- `platform_percent` עם default/fallback

Dump v3 (850+ שורות): git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| M1 | כל domain docs ב-`docs/ARCHITECTURE-*.md` בלבד. |
| M2 | סדר סמכות כסף: CONTRADICTIONS → MONEY → BUSINESS-MODEL → domain. |
| M3 | `platform_percent` NOT NULL, בלי DEFAULT, snapshot ב-`order_items`. |
| M4 | קופון: prepaid מוחלט; 100% לפלטפורמה; **No Escrow**. |
| M5 | Security > Legal > Master > domain (בנושאים לא כספיים). |
| M6 | root = אינדקס; הכרעות 1.1-1.57 ב-docs/MASTER-ARCHITECTURE. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow C11b (root v2 ישן) | No Escrow; MONEY. |
| root mega conflict audit | docs/MASTER-ARCHITECTURE v3. |
| nullable platform_percent + fallback | migration 050 NOT NULL. |
| suppliers.commission_percent default | אין default; per product. |
| תיקיות ארכיטקטורה צדדיות | docs/ בלבד. |

---

## סכמת DB

אינדקס (פירוט: docs/MASTER-ARCHITECTURE §0.2, DB-SCHEMA):

```text
026-035 migrations applied; 036-041 planned
orders, order_items, products, vouchers
suppliers, payout_statements, wallet_*
```

אין DDL חדש במסמך root.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | root v2 אומר Escrow | בטל; MONEY גובר. |
| CE2 | doc domain סותר master | כסף: MONEY; אחר: security. |
| CE3 | migration hole | ls supabase/migrations + update index. |
| CE4 | product בלי percent | block publish/checkout. |
| CE5 | two redeem functions | `redeem_voucher` RPC יחיד. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | migrations 036-041 | MASTER-ARCHITECTURE 0.2. |
| O2 | packages/money monorepo | MASTER-v2 O2. |
| O3 | merge docs-batch-2 → main | review. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-17 | v3 dump root/docs |
| 2026-08-12 | batch-2: BINDING index root; דחיית Escrow |
