# מפרט תשלום לספק (פיזי)

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
agorot; **No Escrow** על קופון.

מקור: `PAYOUT-ARCHITECTURE.md`

---

## החלטה

| # | הכרעה |
|---|---|
| VP1 | קופון: **אין payout**. |
| VP2 | פיזי: settlement_events אחרי Cardcom. |
| VP3 | TransferFromDigitalBank אחרי אישור. |
| VP4 | CSV = fallback. |
| VP5 | T+3; min 10_000 agorot. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| payout קופון | VP1 |
| CSV כ-MVP | VP4 |

---

## סכמת DB

```text
settlement_events, payout_statements, supplier_bank_accounts
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | Transfer fail | CSV fallback |
| CE2 | refund after paid | supplier_debit |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | Financial sandbox | GO-LIVE |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
