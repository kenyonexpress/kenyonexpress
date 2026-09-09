# ARCHITECTURE-PAYMENT-RECONCILIATION.md

<!-- v1-final-banner:2026-09-01 -->
> ⚠️ **Partly stale 2026-09-01. See `docs/ARCHITECTURE-OVERVIEW.md` §3 and §7.3.**
>
> Reconciliation runs from `/api/cron/reconcile`, which **nothing currently
> calls**: there is no scheduler wired up. It is one of the three money-path jobs
> in that state. See `docs/CRON-EXTERNAL.md`.
>
> There is no escrow leg to reconcile. The payment journal is `payment_events`
> (append-only, 38 event types), added in migration 130.

ארכיטקטורת **התאמת תשלומים** (Cardcom ↔ ledger ↔ orders).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
Companions: checkout-cardcom, analytics-KPI, backup-DR, Go-Live.

---

## 0. מטרה

לוודא שכל שקל שנגבה ב-Cardcom יש לו הזמנה `paid`, וכל הזמנה `paid` יש לה ראיית תשלום, בלי כפילויות ובלי Escrow מדומה.

---

## 1. ישויות

| מקור | מפתח |
|---|---|
| `payments` | `idempotency_key`, `cardcom_transaction_id`, `cardcom_account_key` |
| `orders` | `paid_at`, `total_*` |
| `payment_events` | append-only trail |
| Cardcom reports | external export / API |
| `ledger_*` / wallet | journal posts |

---

## 2. כללי התאמה יומיים

| בדיקה | צפי |
|---|---|
| R1 | כל `payments.status=succeeded` עם `order.paid_at` לא null |
| R2 | אין `order.paid_at` בלי payment succeeded או wallet-covers-all מתועד |
| R3 | סכום Cardcom == `paid_on_site` snapshot (סובלנות עיגול אגורה) |
| R4 | אין שתי שורות payment succeeded לאותו `idempotency_key` |
| R5 | קופון: אין שורות escrow hold חדשות |
| R6 | Refunds: סכום מצטבר ≤ original |

Job: `fn_reconcile_payments_daily` או Edge cron + דוח ל-admin + Ntfy על diff.

---

## 3. מצבי חריגה

| מצב | טיפול |
|---|---|
| Paid in Cardcom, order pending | replay finalize / manual runbook |
| Order paid, no Cardcom id | חקירה wallet-only vs bug |
| Amount mismatch | freeze payouts related; human |
| Duplicate vouchers | mark extras void; alert SEV1 |

---

## 4. הרשאות

- דוחות reconciliation: `is_admin()` בלבד.
- ספק לא רואה התאמת פלטפורמה מלאה.

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Payment reconciliation (`arch/docs-queue`) |
