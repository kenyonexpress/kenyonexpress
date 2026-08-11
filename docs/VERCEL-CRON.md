# Vercel cron

expire-vouchers daily 23:15 UTC.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | expire then credit wallet |
| D2 | expiry not forfeiture C6 |
| D3 | CRON_SECRET Bearer |
| D4 | cap 500/run |
| D5 | redeem checks expiry anyway |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| merged RPC | two steps |
| public cron | 401 |

## סכמת DB

vouchers; idempotency voucher:id:expiry_credit.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | step2 fail | retry |
| CE2 | 401 | secret sync |
| CE3 | backlog | multi-day |
| CE4 | double credit | key |
| CE5 | TZ | UTC schedule |

## פתוחות

| # | פער |
|---|---|
| O1 | alert credited=0 |
