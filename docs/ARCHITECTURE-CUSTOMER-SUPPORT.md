# ארכיטקטורה: תמיכת לקוחות

תמיכת לקוחות: תקלות הזמנה, קופון שלא נסרק, בקשות החזר, ערוצי קשר, תשובות מוכנות בעברית, הסלמה לספק.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. נציגים מדברים "שולם באתר" + "יתרה בבית העסק". אסור: נאמן, Escrow, held, J5, עמלה 5%/10% קבועה, הבטחת payout לספק. כסף ב-DB באגורות; תצוגה לנציג ב-₪.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-COUPON-REDEMPTION-UX.md
docs/ARCHITECTURE-COMMERCE.md
docs/LEGAL-CHECKLIST.md
docs/RUNBOOK-OPERATIONS.md
```

Stack יעד: `/admin/support`, Resend, טיקטים ב-Supabase, עברית RTL.

---

## 0. החלטה (CS1 עד CS6)

| # | הכרעה |
|---|---|
| CS1 | פלטפורמה ≠ ספק. KE מחברת; הספק מספק את השירות/המוצר. |
| CS2 | מקרו מותרים: "שולם באתר", "יתרה בבית העסק". אסורים: נאמן, Escrow, held, הבטחת payout לספק, עמלה 5%/10% קבועה. |
| CS3 | קופון אחרי מימוש: אין הבטחת החזר מלא אוטומטי. |
| CS4 | כסף: אגורות ב-DB; נציג מדבר ב-₪ (המרה תצוגה בלבד). |
| CS5 | הסלמה לספק רק עם הקשר מינימלי (בלי PII מיותר). |
| CS6 | Transactional email דרך pipeline ההתראות; לא Zapier. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Zapier / webhook חיצוני לטיקטים | CS6; pipeline אחיד + audit |
| נציג משנה `vouchers.status` ידנית בלי admin | סיכון fraud; מדינicity REFUNDS |
| הבטחת "הכסף בנאמן עד המימוש" | סותר No Escrow / C11א |
| WhatsApp כערוץ ראשי ב-v1 | SLA לא מוגדר; עתידי בלבד |
| החזר Cardcom אוטומטי לכל בקשה | REFUNDS; `redeemed` דורש בדיקה |
| חשיפת `platform_percent` ללקוח | לא רלוונטי לתמיכה; C2 |
| טלפון כערוץ ברירת מחדל | עומס; רק אחרי הסלמה / fraud |
| bot AI עם הרשאות refund | agent limits; admin בלבד לכסף |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** טבלאות יעד (קיימות או מתוכננות):

```text
support_tickets:
  id, user_id, order_id?, voucher_id?, category, status, priority,
  assigned_to?, created_at, updated_at, closed_at?

support_messages:
  id, ticket_id, author_type (user|agent|system), body_he,
  created_at, internal_note (agent only)?
```

סטטוסים:

```text
new → open → pending_customer → pending_supplier → resolved → closed
```

קטגוריות:

| category | דוגמאות |
|---|---|
| `order_issue` | לא התקבל אישור, סכום שגוי |
| `coupon_scan` | QR לא נסרק, already_redeemed, סירוב בעסק |
| `refund_request` | ביטול לפני/אחרי מימוש |
| `account` | התחברות Google, ארנק |
| `data_privacy` | ייצוא / מחיקה (GDPR) |
| `other` | |

RLS: לקוח רואה רק את שלו; אדמין/סוכן את הכל.

קריאות נלוות (לא טיקט): `orders`, `payments`, `vouchers`, `voucher_redemptions`, `wallet_*`, `audit_log`.

---

## 3. ערוצי קשר

| ערוץ | שימוש | SLA תגובה ראשונה (יעד) |
|---|---|---|
| טופס `/contact` / טיקט באתר | ברירת מחדל | 4 שעות עסקים |
| אימייל support@… (Resend) | אותו תור | 4 שעות עסקים |
| צ׳אט באתר (עתידי) | שאלות קצרות | 15 דק׳ בזמן פעילות |
| WhatsApp (עתידי) | אותו תור אחרי אישור | כמו אימייל |
| טלפון | רק אחרי הסלמה / fraud | לפי תורנות |

דחוף (תשלום נכשל אחרי חיוב, חשד הונאה, סריקה כפולה חשודה): **30 דקות**.

---

## 4. זרימות תמיכה

### 4.1 תקלות הזמנה

1. אמת `order_id` + `paid_at` + תשלום Cardcom (`GetLpResult` / `payments`)
2. אם paid ואין מייל: שליחה מחדש מ-outbox / לינק ל-`/account/orders`
3. אם לא paid: הסבר להשלים checkout; לא להבטיח חיוב
4. סכום לא תואם: השווה PDP/cart/snapshot; פתח bug אם צריך

### 4.2 קופון שלא נסרק

| תסמין | בדיקה | תשובה |
|---|---|---|
| אורח רואה בקשה להתחבר | תקין | התחברות Google |
| `already_redeemed` | scan log | הודיעו אם לא הלקוח סרק → fraud path |
| `expired` | expires_at | הסבר תוקף; refund רק לפי מדיניות |
| `not_found` (כולל wrong shop) | supplier_id / code | anti-enum; לא לחשוף ספק "לא נכון" |
| עסק בלי רשת | תפעול ספק | הסלמה לספק; הלקוח לא מבצע redeem |
| חתימה לא תקינה | QR פגום/צילום | הצגת קוד ידני מהאזור האישי |

נציג **לא** משנה סטטוס voucher בלי הרשאת admin + מדיניות.

### 4.3 בקשות החזר

הפניה מלאה: `docs/ARCHITECTURE-REFUNDS-DISPUTES.md`

תקציר לנציג:

- `issued` → מסלול ביטול אפשרי
- `redeemed` → אין auto; איסוף עובדות + הסלמה
- פיזי → מצב משלוח + ספק
- אחרי אישור: Cardcom או wallet fallback
- קופון: **אין** payout לספק מהפלטפורמה; refund = ללקוח בלבד

---

## 5. הסלמה לספק

מתי:

- איכות שירות בבית העסק
- משלוח פיזי באיחור
- סירוב לכבד קופון תקף

איך:

1. סטטוס `pending_supplier`
2. הודעה לאימייל התפעולי של הספק (תבנית עברית) עם: order ref קצר, מוצר, זמן, **בלי** טלפון לקוח אם לא הכרחי
3. SLA ספק פנימי: 1 עד 2 ימי עסקים
4. אם אין מענה: admin מחליט על זיכוי / השעיית ספק

---

## 6. תשובות מוכנות (עברית)

### 6.1 אישור הזמנה חסר

```text
שלום {{name}},
בדקנו את הזמנה {{order_ref}}. התשלום התקבל וההזמנה מופיעה בחשבון שלך תחת "ההזמנות שלי".
אם מדובר בקופון, ניתן להציג את ה-QR תחת "הקופונים שלי".
```

### 6.2 קופון: שולם + יתרה

```text
שלום {{name}},
עבור הקופון "{{product}}" שולמת באתר {{paid_ils}}. יתרה לתשלום בבית העסק: {{due_ils}}.
יש להציג את הקוד או את ה-QR בעסק לפני תום התוקף ({{expires_he}}).
```

### 6.3 Already redeemed

```text
שלום {{name}},
לפי המערכת הקופון כבר מומש ב-{{when}} בבית העסק {{supplier}}.
אם לא אתם ביצעתם את המימוש, השיבו להודעה זו ונבדוק מיד.
```

### 6.4 בקשת החזר לפני מימוש

```text
שלום {{name}},
קיבלנו בקשה לביטול קופון שטרם מומש. נבדוק זכאות לפי מדיניות הביטול ונעדכן לאישור הזיכוי.
```

### 6.5 אחרי מימוש

```text
שלום {{name}},
קופון שמומש בבית העסק לא ניתן לזיכוי אוטומטי. נשמח לקבל פירוט על התקלה ונבדוק מול בית העסק במקרים מתאימים.
```

### 6.6 ארנק

```text
שלום {{name}},
יתרת הארנק שלך היא {{balance_ils}}. ניתן לממש אותה בקופה באתר בלבד. לא ניתן למשוך את הקרדיט לחשבון בנק.
```

---

## 7. מגבלות כלי נציג

נציג / סוכן AI (אם קיים):

- מותר: קריאת הזמנה, פתיחת טיקט, בקשת refund review, הפניה ל-GDPR
- אסור: Cardcom charge/refund בלי admin, שינוי `platform_percent`, redeem ידני בלי מדיניות, שינוי voucher status

---

## 8. מקרי קצה

| מקרה | תרחיש | תגובת נציג | הערה |
|---|---|---|---|
| CSE1 | paid ב-Cardcom, order עדיין pending | reconcile + resend confirm | OBSERVABILITY |
| CSE2 | לקוח טוען "סרקו פעמיים" | scan log + timestamps | fraud path |
| CSE3 | ספק מסרב לכבד קופון תקף | pending_supplier + תיעוד | לא לשנות voucher |
| CSE4 | refund אחרי redeem | REFUNDS; אין auto | CS3 |
| CSE5 | לקוח מבקש "החזר לכרטיס + ארנק" | מדינicity refund | wallet fallback |
| CSE6 | impersonation / account takeover | verify Google + recent auth | FRAUD |
| CSE7 | GDPR deletion עם order פתוח | legal hold | DATA-EXPORT-GDPR |
| CSE8 | סכום שונה בין מייל לחשבון | snapshot order_items | bug path |
| CSE9 | קופון פג, לקוח דורש Cardcom refund | LEGAL / wallet credit | C6 |
| CSE10 | נציג מבטיח payout לספק | **אסור** במקרו | CS2 |
| CSE11 | duplicate tickets | merge + single thread | ops |
| CSE12 | supplier רואה PII מלא בהסלמה | CS5; redact | audit |

---

## 9. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `/admin/support` UI: קיים או backlog | RUNBOOK |
| O2 | SLA מדיד (metrics) vs יעד בטבלה | OBSERVABILITY |
| O3 | AI agent tier: מה מותר autonomously | FRAUD + limits |
| O4 | WhatsApp Business: מתי נכנס ל-SLA | WHATSAPP spec |
| O5 | טופס contact → ticket אוטומטי vs ידני | notifications |
| O6 | מדיניות זיכוי goodwill (מעבר REFUNDS) | LEGAL |

עודכן: 2026-08-12.

---

## 10. Acceptance

- [ ] ערוצים + SLA מוגדרים
- [ ] זרימות order / scan / refund מתועדות
- [ ] מקרו בעברית מאושרים (בלי Escrow)
- [ ] הסלמת ספק בלי PII עודף
- [ ] קישור למדיניות Refunds
- [ ] החלטה + חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | rev D |
| 2026-08-03 | Refresh: flows, canned Hebrew, escalation |
| 2026-08-12 | batch-2 pass-3: BINDING עברית, DOCS-TEMPLATE-BINDING, No Escrow מלא |
