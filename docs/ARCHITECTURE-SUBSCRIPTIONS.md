# ארכיטקטורה: מנוי חודשי (טכני)

מודל מנוי טכני מלא: הצטרפות, מחזור חיוב חודשי, כשלי חיוב ו-retry, ביטול/הקפאה, ledger, וזכויות צרכן.  
לא חלק מהשקת הקופונים. דורש threat model + מיגרציה + אישור עו״ד לניסוח ללקוח לפני קוד פרוד.

Status: **BINDING (design)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #48/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-RECURRING-SUBSCRIPTIONS.md
docs/SUBSCRIPTIONS-BILLING-SPEC.md
docs/BUSINESS-MODEL.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/CONTRADICTIONS.md
docs/GO-LIVE-CHECKLIST.md
```

**יחס ל-`ARCHITECTURE-RECURRING-SUBSCRIPTIONS.md`:** המסמך הזה = מקור אמת טכני (סכמה, cron, threat, SU*). Recurring = תצוגת מוצר. בהתנגשות גובר המסמך הזה.

מודל כסף: **No Escrow**. מנוי ≠ מקדמת קופון. אין held לספק.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| SU1 | סוג מוצר: `products.type = 'subscription'`. |
| SU2 | Interval ראשוני: **`monthly`** בלבד. שנתי = phase 2 על אותו מודל. |
| SU3 | סכומים: integer **agorot** בכל מקום פנימי. |
| SU4 | אמצעי: **Cardcom Token** אחרי חיוב ראשון מוצלח. |
| SU5 | אין Escrow. מנוי ≠ מקדמת קופון. אין held לספק. |
| SU6 | פיצול לספק (אם יש): `platform_percent` **snapshot פר מחזור חיוב**. |
| SU7 | משתמש מחובר חובה בהצטרפות (לא אורח). |
| SU8 | Cron חיוב: idempotency מפתח `(subscription_id, billing_period)`. |
| SU9 | ביטול מנוי: מאזור אישי + `/cancel` לפי דין; ניסוח סופי דורש עו״ד. |
| SU10 | Apple/Google IAP: מחוץ למסמך. |
| SU11 | מיגרציות prod רק MCP. לא חלק מ-soft-open קופונים. |
| SU12 | דגל `SUBSCRIPTIONS_ENABLED` נפרד מ-`CHECKOUT_ENABLED` (מומלץ). |

---

## 1. מה הלקוח קונה

| רכיב | פירוט |
|---|---|
| מוצר | קורס / שירות מתמשך / גישה תקופתית (לא קופון מימוש בעסק) |
| מחיר | `recurring_amount_agorot` |
| מחזור | חודש מ-`paid_at` הראשון, Asia/Jerusalem |
| מספר מחזורים | `max_billing_cycles` או `null` = ללא הגבלה |
| הנפקה | כל חיוב מוצלח = `orders` + `subscription_invoices` |

אין לערבב במפרט זה הנפקת voucher למימוש בעסק.

---

## 2. מודל נתונים

### 2.1 שדות מוצר

| שדה | סוג | הערה |
|---|---|---|
| `type` | `'subscription'` | |
| `billing_interval` | `'monthly'` | CHECK |
| `recurring_amount_agorot` | `bigint` | מקור אמת |
| `max_billing_cycles` | `int` null | null = אין תקרה |
| `platform_percent` | כמו שאר המוצרים | חובה לפרסום |

### 2.2 `subscriptions` (תמצית)

סטטוסים: `incomplete` | `active` | `past_due` | `paused` | `cancelled` | `expired`.

שדות ליבה: `user_id`, `product_id`, `supplier_id`, `amount_agorot`, `platform_percent_snapshot`, `billing_interval=monthly`, `cardcom_token` (server-only), `card_last4`, `next_billing_at`, `current_period_*`, `cycles_completed`, `max_billing_cycles`, `retry_count`, `cancel_at_period_end`, `cancelled_at`, `paused_at`.

RLS: לקוח read own; כתיבות כסף/טוקן רק service role אחרי שער שרת.

### 2.3 `subscription_invoices`

סטטוסים: `pending` | `paid` | `failed` | `refunded` | `void`.  
`idempotency_key` UNIQUE: `sub:{subscription_id}:{period_start_iso}`.

---

## 3. הצטרפות (חיוב ראשון + Token)

```text
PDP type=subscription
  → session חובה
  → מחיר חודשי + תנאי ביטול
  → Low Profile ChargeAndCreateToken
  → return / webhook → GetLpResult (מקור אמת)
  → הצלחה: subscriptions active + token + invoice#1 paid + order + מייל
  → כשל: incomplete; אין טוקן לשימוש חוזר
```

סכום = `recurring_amount_agorot`. Snapshot `platform_percent` לשורה.

---

## 4. מחזור חיוב (cron)

```text
Cron (CRON_SECRET):
  SELECT active WHERE next_billing_at <= now()
    AND cancel_at_period_end = false
    AND (max_cycles null OR cycles_completed < max)

  לכל מנוי בטרנזקציה:
    1. INSERT invoice pending עם idempotency_key (ON CONFLICT → יציאה)
    2. ChargeToken
    3a. OK → paid + order + cycles++ + קדם next_billing_at
    3b. כשל → סעיף 5
```

אין double-charge: המפתח הייחודי לתקופה הוא חומת האש.  
תזמון: יום עוגן; אם אין יום בחודש (31) → יום אחרון בחודש.

---

## 5. כשלי חיוב ו-retry

| סוג | התנהגות |
|---|---|
| Soft | `past_due` + retry |
| Hard | עצירת retry; בקשת עדכון אמצעי |
| Technical | backoff; לא hard מיד |

מדיניות יעד: ניסיון 1 מיידי; 2 אחרי +2 ימים; 3 אחרי +5 מימים מניסיון 1; אחרי 3 soft בחלון 7 ימים → `paused`/`cancelled`.  
אותו `idempotency_key` לכל retry של אותה תקופה.

עדכון כרטיס: Low Profile CreateTokenOnly / ChargeAndCreateToken; החלפת טוקן בשרת; אם `past_due` ניסיון מיידי לאותה תקופה. אין PAN/CVV.

---

## 6. ביטול והקפאה

```text
incomplete → active
active → past_due → active
active|past_due → paused → active
active|paused|past_due → cancelled
active → expired (max_cycles)
```

| מצב | התנהגות יעד |
|---|---|
| ביטול מיידי | `cancelled`; אין חיוב עתידי; גישה עד `current_period_end` אם שולם |
| `cancel_at_period_end` | active עד סוף תקופה; cron לא מחדש |
| הקפאה | cron מדלג; חידוש = חיוב מיידי לתקופה חדשה |

UI חובה באזור אישי + קישור מ-`/cancel`.

---

## 7. זכויות צרכן (כיוון הנדסי)

דורש עו״ד לפני פרסום. לא ייעוץ משפטי.

| נושא | כיוון |
|---|---|
| שקיפות | מחיר חודשי + תדירות + ביטול לפני תשלום |
| ביטול מתמשך | כפתור פשוט באזור אישי |
| מכר מרחוק (חיוב ראשון) | 14 יום כשחל; דמי ביטול LEGAL לפי LEGAL L2/L3 (לא commission) |
| אחרי שימוש דיגיטלי | ייתכן פטור/הגבלה ל-14 יום (עו״ד) |
| אחרי ביטול | אסור חיוב חוזר; cron מכבד cancelled |

---

## 8. Ledger פר מחזור

```text
invoice paid
  → orders + order_items (snapshots)
  → settlement_events (platform + supplier_due אם יש)
  → wallet spend? idempotency = sub_spend:{invoice_id}
  → cashback? key = cashback:sub:{invoice_id}
```

| כלל | פירוט |
|---|---|
| יחידה | אגורות bigint |
| Snapshot | `platform_percent` פר invoice |
| קופון | מנוי לא מנפיק voucher במפרט זה |
| כשל אחרי ChargeToken לפני ledger | reconcile; לא ChargeToken שני לאותה תקופה |

---

## 9. אבטחה

| כלל | פירוט |
|---|---|
| Token | server-only; לא ב-Sentry/client |
| Rate limit | fail-closed על subscribe / update-card / cancel |
| Audit | שינוי status, החלפת טוקן, ביטול admin |
| Alert | spike ב-`past_due` / כשל cron |

Threat model לפני קוד: גניבת טוקן, double-charge, ביטול שלא נאכף, ledger בלי idempotency.

---

## 10. סדר יישום

```text
1. Threat model + עו״ד לניסוח ביטול
2. מיגרציית subscriptions + invoices (MCP)
3. הצטרפות + Token + מיילים
4. Cron + idempotency + retry + ledger
5. UI ביטול/הקפאה/עדכון כרטיס
6. SUBSCRIPTIONS_ENABLED בפרוד
7. Soft-open מנויים נפרד מקופונים
```

---

## 11. Acceptance

- [ ] אין active בלי חיוב ראשון מאומת  
- [ ] אין ChargeToken בלי idempotency לתקופה  
- [ ] soft decline לפי 3 ניסיונות / 7 ימים  
- [ ] ביטול מונע חיוב הבא  
- [ ] טוקן לא ב-client  
- [ ] invoice paid ⇒ order + settlement  
- [ ] אין שפת Escrow  
- [ ] ניסוח צרכן אושר עו״ד לפני פרסום  
- [ ] דמי ביטול (אם חלים) = LEGAL לא commission  

---

## 12. Out of scope

- מנוי שמנפיק קופוני מימוש חודשיים  
- שנתי עם הנחה (phase 2)  
- מסוף פר ספק לחיוב מנוי  
- IAP בחנויות אפ  

---

## 13. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | ארכיטקטורת מנוי חודשי מלאה: Token, מחזור, retry, ביטול |
| 2026-08-11 | Ledger per billing cycle |
| 2026-08-12 | batch #48/50: רענון טכני BINDING על arch/docs-batch-2; קישור Recurring |
