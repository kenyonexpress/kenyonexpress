# ארכיטקטורה: Notifications V2

מצביע למודל התראות קנוני. סיכום BINDING.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

**טקסט מלא:**

```
docs/ARCHITECTURE-NOTIFICATIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| N1 | Stack: **Resend + Supabase DB Trigger + Edge Function worker**. |
| N2 | אין Make. אין Zapier. |
| N3 | אירועי חובה: `order_confirmation`, `coupon_purchased`, `coupon_redeemed`, `supplier_new_order`, `refund`. |
| N4 | תבניות עברית RTL; retry + DLQ; `dedupe_key` + Resend `Idempotency-Key`. |
| N5 | מסלול כסף לא מחכה ל-provider (async outbox). |
| N6 | V2 doc = pointer; לא לשכפל spec במסמך זה. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Make/Zapier orchestrator | N2: in-house worker. |
| send sync ב-finalize | N5: outbox async. |
| duplicate spec ב-V2 | N6: pointer לקנוני. |
| SMS v1 חובה | email + WhatsApp עתידי. |
| marketing בלי opt-in | MARKETING doc: 30א. |

---

## סכמת DB

```text
notification_outbox (event_type, dedupe_key, payload, status, is_marketing)
notification_deliveries (provider_id, attempts, last_error)
consent_events (channel, granted, source)
```

קיים במיגרציות notifications. אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | duplicate webhook finalize | dedupe_key skip send. |
| CE2 | Resend 429 | retry backoff; DLQ after N. |
| CE3 | opt-out mid-queue | send-time skip marketing. |
| CE4 | invalid email | fail delivery; לא block order. |
| CE5 | worker down 1h | outbox backlog; replay. |
| CE6 | PII in payload log | redact; minimal fields. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | WhatsApp transactional templates | Meta approval. |
| O2 | push notifications PWA | v2. |
| O3 | merge V2 file into NOTIFICATIONS | optional cleanup. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | V2 summary |
| 2026-08-12 | batch-2: BINDING pointer 5 סעיפים |
