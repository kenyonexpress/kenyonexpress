# ARCHITECTURE-INCIDENT-RESPONSE.md

ארכיטקטורת **תגובה לאירועים** (SEV) ל-KenyonExpress.

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
Companions: observability, backup-DR, feature-flags, Go-Live, payment-reconciliation.

---

## 0. רמות חומרה

| SEV | הגדרה | דוגמה | יעד תגובה |
|---|---|---|---|
| SEV1 | כסף/אבטחה פגומים עכשיו | double charge, voucher dup, secret leak | 15 דק׳ |
| SEV2 | תפקוד ליבה ירוד | checkout down, webhook DLQ spike | 1 שע׳ |
| SEV3 | מוגבל / קוסמטי חמור | search down עם fallback | יום עסקים |
| SEV4 | חוב טכני | perf regress | backlog |

---

## 1. ערוצי התראה

- Ntfy / Sentry → בעלים + הנדסה
- אין תלות ב-Zapier

---

## 2. Playbooks קצרים

### Checkout down

1. Confirm error rate
2. `CHECKOUT_ENABLED=false`
3. Check Cardcom + Supabase status
4. Fix / revert deploy
5. Re-enable + smoke C3

### Webhook storm / DLQ

1. Pause retry cron if amplifying
2. Inspect signature failures vs provider outage
3. Replay safe batch after fix
4. Reconcile payments daily job

### Suspected double redeem

1. Disable `SUPPLIER_SCAN_ENABLED` if ongoing
2. Freeze affected vouchers
3. Audit `voucher_redemptions`
4. Customer/supplier comms

### Secret leak

1. Rotate secret (env-secrets matrix)
2. Invalidate sessions if auth-related
3. Audit logs
4. Postmortem

---

## 3. תקשורת

| קהל | מתי |
|---|---|
| בעלים | כל SEV1/2 מייד |
| לקוחות | אם תשלום/קופונים שבורים >30 דק׳ |
| ספקים | אם סריקה/משלוח שבורים |

נוסח: עברית, בלי להבטיח פיצוי לא מאושר.

---

## 4. Postmortem

תוך 72ש ל-SEV1/2: ציר זמן, root cause, פעולות מונעות, בעלים למשימות.

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Incident response SEV playbooks (`arch/docs-queue`) |
