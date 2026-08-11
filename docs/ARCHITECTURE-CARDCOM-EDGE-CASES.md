# ארכיטקטורה: Cardcom Edge Cases

3DS, webhooks, idempotency, timeout redirect, agorot.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/RUNBOOK-INCIDENTS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| C1 | מקור אמת: Cardcom verify + `payments` row; לא UI בלבד. |
| C2 | DB/API: integer **agorot**; המרה Cardcom במודול אחד. |
| C3 | Webhook + return URL: idempotent על deal/order. |
| C4 | אסור `paid` ידני ב-SQL. |
| C5 | 3DS cancel/fail ≠ paid. |
| C6 | `CHECKOUT_ENABLED=false` אם מסלול כסף שבור. |
| C7 | capture מלא v1; partial → manual_review. |
| C8 | duplicate webhook: 200 no-op אם already paid. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| trust return URL query alone | C1: verify API. |
| float totals in checkout | C2: agorot. |
| retry finalize without idempotency | double vouchers. |
| mark paid on browser "success" | C1. |
| partial capture default | C7: full capture v1. |

---

## סכמת DB

```text
payments (status, cardcom_deal_id, amount_agorot)
payment_events (provider_event_id UNIQUE, payload)
orders (status pending|paid|failed)
idempotency: order_id + operation
```

vouchers: ON CONFLICT / constraints prevent double issue.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | user cancel 3DS | no capture; unpaid. |
| CE2 | webhook before return | paid once; return no-op. |
| CE3 | duplicate webhook | 200; no side effects. |
| CE4 | timeout mid-redirect | wait webhook; UI "בודקים תשלום". |
| CE5 | amount mismatch agorot | reject finalize. |
| CE6 | fail webhook then success | success if verify approved. |
| CE7 | double click pay | idempotency begin_checkout. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | reconcile cron stuck payments | RECONCILIATION. |
| O2 | multi-item partial capture | v2. |
| O3 | Cardcom sandbox E2E matrix | TESTING. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | edge cases first draft |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
