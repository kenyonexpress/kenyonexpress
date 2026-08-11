# צ'קליסט השקה

ידני vs קוד. GO-LIVE סדר.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/LAUNCH-DAY.md
docs/GITHUB-SETTINGS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | Cardcom 4 env |
| D2 | DNS+URL |
| D3 | Pro+PITR |
| D4 | CI+rules |
| D5 | coupon OK without payout |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| mock prod | throws |
| registrar move | no |

## סכמת DB

RLS; product gates.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | checkout false test | B11 |
| CE2 | E2E required | secrets |
| CE3 | webhook URL | APP_URL |
| CE4 | refund password | fail |
| CE5 | IBAN only | G1 |

## פתוחות

| # | פער |
|---|---|
| O1 | G1 payout |
