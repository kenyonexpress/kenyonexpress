# ארכיטקטורה: תגובה לאירועים (Incident Response)

ארכיטקטורת **תגובה לאירועים** (SEV) ל-KenyonExpress: רמות חומרה, playbooks, תקשורת, postmortem.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-FEATURE-FLAGS.md
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
docs/ARCHITECTURE-PAYMENT-RECONCILIATION.md
docs/INCIDENT-PLAYBOOKS.md
docs/RUNBOOK-INCIDENTS.md
```

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| IR1 | ארבע רמות SEV (1–4) עם יעדי תגובה מחייבים. |
| IR2 | SEV1/SEV2: התראה מיידית לבעלים + הנדסה (Ntfy / Sentry). |
| IR3 | Kill switches: `CHECKOUT_ENABLED=false`, `SUPPLIER_SCAN_ENABLED=false` לפני חקירה עמוקה בכסף. |
| IR4 | Secret leak: rotation מיידי לפי `ARCHITECTURE-ENV-SECRETS.md`; invalidate sessions אם auth-related. |
| IR5 | Postmortem תוך 72 שעות ל-SEV1/SEV2: ציר זמן, root cause, פעולות מונעות. |
| IR6 | תקשורת לקוחות/ספקים רק אם תקלה >30 דק' על תשלום/קופונים/סריקה. |
| IR7 | אין הבטחת פיצוי בנוסח ציבורי ללא אישור מפורש. |
| IR8 | Webhook storm: pause retry cron אם מגביר; reconcile אחרי fix. |
| IR9 | Double redeem חשוד: freeze vouchers + audit `voucher_redemptions`. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| תלות ב-Zapier/PagerDuty בלבד | vendor lock; Ntfy + Sentry מספיקים ל-MVP. |
| המשך checkout בזמן SEV1 כסף | סיכון double charge; kill switch קודם. |
| תקשורת ציבורית מיידית בכל SEV | רעש; רק כשהשפעה >30 דק' על לקוח. |
| postmortem רק "בעל פה" | אין למידה; מסמך חובה 72ש. |
| replay webhook ידני בלי dedup check | סיכון voucher כפול; batch safe בלבד. |
| rollback DB מ-PITR כברירת מחדל | הרס נתונים; reconcile נקודתי קודם. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

טבלאות לחקירה ולא לכתיבה ישירה באירוע:

| טבלה | שימוש בחקירה |
|---|---|
| `orders`, `payments` | סטטוס paid/failed; timeline |
| `payment_webhook_events` | dedup; signature_valid; replay |
| `vouchers`, `voucher_redemptions` | double redeem |
| `audit_log` | פעולות admin/כסף |
| `notification_outbox` | מיילים שלא נשלחו (DLQ) |

Feature flags (env, לא DB):

```
CHECKOUT_ENABLED
SUPPLIER_SCAN_ENABLED
```

---

## 3. רמות חומרה

| SEV | הגדרה | דוגמה | יעד תגובה |
|---|---|---|---|
| SEV1 | כסף/אבטחה פגומים עכשיו | double charge, voucher dup, secret leak | 15 דק' |
| SEV2 | תפקוד ליבה ירוד | checkout down, webhook DLQ spike | 1 שעה |
| SEV3 | מוגבל / קוסמטי חמור | search down עם fallback | יום עסקים |
| SEV4 | חוב טכני | perf regress | backlog |

---

## 4. ערוצי התראה

- Ntfy / Sentry → בעלים + הנדסה
- אין תלות ב-Zapier
- DLQ על `order_paid` / `voucher_issued` → ntfy מיידי (ראה NOTIFICATIONS)

---

## 5. Playbooks קצרים

### Checkout down

1. Confirm error rate (Sentry)
2. `CHECKOUT_ENABLED=false`
3. Check Cardcom + Supabase status
4. Fix / revert deploy
5. Re-enable + smoke checkout

### Webhook storm / DLQ

1. Pause retry cron if amplifying
2. Inspect signature failures vs provider outage
3. Replay safe batch after fix (dedup!)
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

## 6. תקשורת

| קהל | מתי |
|---|---|
| בעלים | כל SEV1/2 מייד |
| לקוחות | אם תשלום/קופונים שבורים >30 דק' |
| ספקים | אם סריקה/משלוח שבורים |

נוסח: עברית, בלי להבטיח פיצוי לא מאושר.

---

## 7. Postmortem

תוך 72ש ל-SEV1/2:

- ציר זמן (UTC + IL)
- root cause (טכני + תהליך)
- פעולות מונעות עם בעלים ותאריך יעד
- קישור ל-monitoring/alerts שחסרו

---

## 8. מקרי קצה (טבלת תפעול)

| קוד | סימפטום | תגובה |
|---|---|---|
| `sev1_double_charge` | שני charges לאותו order | refund ידני + freeze LP |
| `sev1_secret_leak` | service_role ב-public repo | rotation + invalidate |
| `webhook_storm` | אלפי events/דקה | pause cron; Cardcom status |
| `reconcile_gap` | paid ב-Cardcom, pending ב-DB | reconcile job + manual |
| `double_redeem_live` | אותו voucher פעמיים | kill scan + audit |
| `checkout_partial` | LP נוצר, webhook לא | reconcile; לא LP חדש על אותו ref |
| `ntfy_down` | אין התראה | Sentry email fallback |
| `false_sev1` | alert רעש | tune threshold; לא kill switch ארוך |
| `postmortem_late` | >72ש בלי doc | escalate; חובה לפני deploy הבא |
| `comms_premature_refund` | הבטחת פיצוי בטweet | retract; policy IR7 |

---

## 9. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | on-call rotation formal | היום: בעלים + ntfy |
| O2 | runbook אוטומטי ל-reconcile gap | קשור PAYMENT-RECONCILIATION |
| O3 | SLA חוזה לספקים על downtime סריקה | משפטי |
| O4 | status page ציבורי | לא חובה MVP |
| O5 | tabletop exercise תאריך | לפני go-live |

עודכן: 2026-08-12.

---

## 10. Acceptance

- [ ] SEV matrix + playbooks 4 תרחישים
- [ ] kill switches מתועדים
- [ ] postmortem 72ש
- [ ] חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | Incident response SEV playbooks |
| 2026-08-12 | batch-2: שכתוב לפי תבנית חובה |
