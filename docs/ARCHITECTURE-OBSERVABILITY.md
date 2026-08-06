# ארכיטקטורה: תצפיתיות (Observability)

Sentry, לוגים מובנים, והתראות תפעוליות.

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/RUNBOOK-PRODUCTION.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-SECURITY.md
docs/MASTER-INDEX.md
```

הקשר: מפעיל יחיד עם טלפון. אין NOC.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| OBS1 | Error tracking: **Sentry** (`@sentry/nextjs`), errors בלבד ב-MVP (בלי Replay חובה). |
| OBS2 | לוגים: JSON שורה אחת; לוגר יחיד `src/lib/log.ts`; אסור `console.log` בנתיבי כסף. |
| OBS3 | לוגים = אבחון; ראיות כסף ב-DB append-only בלבד. |
| OBS4 | Scrubber משותף: אין PAN, CVV, tokens, סיסמאות, service role. |
| OBS5 | התראות: Better Stack / Ntfy לפי SEV. |
| OBS6 | `/api/health` רדוד ופומבי; בדיקות עומק ב-cron מאומת. |
| OBS7 | Kill switch checkout לפני rollback ארוך. |

---

## 1. Sentry

| נושא | חוזה |
|---|---|
| SDK | `@sentry/nextjs` + source maps ב-build |
| Tags | `domain`: payment / coupon / webhook / rls / other |
| SEV | SEV1 כסף/checkout · SEV2 redeem/notifications · SEV3 UI |
| PII | scrub לפני שליחה; אין email/phone ב-extra |

---

## 2. לוגים

שדות מינימום: `ts`, `level`, `msg`, `request_id`, `user_id?`, `order_id?`, `domain`.  
Retention: runtime קצר + drain (יעד ~30 יום).  
ראיות משפטיות: `audit_log`, `payment_webhook_events`, `voucher`/`redemption` logs.

---

## 3. התראות

| מקור | דוגמה |
|---|---|
| Sentry | spike SEV1 |
| Cron `/api/cron/alerts` | תור outbox תקוע, webhook failures, redeem burst |
| Uptime | home / health / Cardcom heartbeat |
| DLQ | `coupon_issued` dead |

ערוצים: push/מייל/שיחה לפי Better Stack; בהמשך WhatsApp דרך outbox.

---

## 4. Acceptance

- [ ] Sentry על payment/coupon/webhook  
- [ ] לוגר יחיד + scrubber  
- [ ] התראות על כסף ותור התראות  
- [ ] Health רדוד מול cron עמוק  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | Sentry + לוגים + התראות (מסמך ממוקד בעברית) |
| 2026-08-06 | QA: קישור MASTER-INDEX; RTL/עברית תקינים |
