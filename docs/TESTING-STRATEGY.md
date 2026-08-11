# אסטרטגיית בדיקות (מדיניות)

תקציר BINDING ל-PR/CI. פירוט:

```
docs/ARCHITECTURE-TESTING-CICD.md
docs/CODE-REVIEW-CHECKLIST.md
```

Status: **BINDING (policy)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
No Escrow; agorot; `platform_percent` פר מוצר.

---

## החלטה

| # | הכרעה |
|---|---|
| TE1 | Unit Vitest: money, commission, split, redemption logic. |
| TE2 | Integration: RLS, redeem race, GetLpResult finalize. |
| TE3 | E2E: home/product/cart/checkout/auth; no prod pay. |
| TE4 | Coverage: **100%** על money path + redeem core (policy דורס 95% היסטורי). |
| TE5 | PR כסף: unit + coverage gate; docs-only = lint/typecheck. |
| TE6 | אין בדיקות escrow/HMAC webhook (לא קיים). |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| shared dev DB writes from CI | local/fake |
| Cardcom HMAC test | CC3: no HMAC |
| global 80% gate | TE4 focused |
| skip tests on "small" money fix | TE5 |

---

## סכמת DB

אין DDL. Integration tests: `redeem_voucher`, payment journal tables.

---

## מקרי קצה

| # | מקרה | חובה |
|---|---|---|
| CE1 | duplicate webhook | idempotency test |
| CE2 | concurrent redeem | UNIQUE test |
| CE3 | wrong supplier scan | unit gate |
| CE4 | migration RLS | policy script |
| CE5 | UI RTL regression | E2E or compare |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | align vitest.config thresholds to TE4 |
| O2 | remove escrow.ts reference in config |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
