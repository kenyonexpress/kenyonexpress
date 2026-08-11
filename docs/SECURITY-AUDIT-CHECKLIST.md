# צ'קליסט ביקורת אבטחה

לפני/אחרי prod.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית. כסף: **agorot integer**; `platform_percent` פר מוצר בלי default.


```
docs/ARCHITECTURE-SECURITY.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | RLS FORCE |
| D2 | Cardcom GetLpResult + ?s= |
| D3 | agorot + refund audit |
| D4 | QR HMAC + rate limit |
| D5 | wallet service_role |
| D6 | CSRF + secrets Vercel |

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| open QR hash | no |
| PUBLIC wallet fn | no |

## סכמת DB

orders, payments, vouchers, ledger policies.

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | no FORCE | fix |
| CE2 | service role client | block |
| CE3 | webhook open | 401 |
| CE4 | double redeem | unique |
| CE5 | chargeback | playbook |

## פתוחות

| # | פער |
|---|---|
| O1 | pentest |
