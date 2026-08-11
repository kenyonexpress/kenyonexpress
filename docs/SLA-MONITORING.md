# SLA וניטור

Sentry, uptime, SEV.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/SUPPORT-SLA-POLICY.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | 99.5% target soft-open |
| D2 | SEV response times |
| D3 | Sentry alerts |
| D4 | OPS-DAILY proactive |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| 99.99% solo | no |
| no Sentry | no |

## סכמת DB

metrics from logs/orders volume.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | maintenance | banner |
| CE2 | uptime false green | synthetic |
| CE3 | Sentry quota | plan |
| CE4 | ISR stale | SEV3 |
| CE5 | slow redeem | SEV2 |

## פתוחות

| # | פער |
|---|---|
| O1 | synthetic checkout |
