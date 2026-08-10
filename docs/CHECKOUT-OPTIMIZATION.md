# אופטימיזציית Checkout + זרימת Cardcom

זרימת תשלום מלאה, מצבי כשל, retry, ומשפך נטישה.

Status: **PLAN** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md
docs/GUEST-VS-MEMBER-STRATEGY.md
docs/ANALYTICS-SPEC.md
docs/INCIDENT-PLAYBOOKS.md
docs/CONTRADICTIONS.md
```

מודל: **No Escrow**. סכום ב-Cardcom = סכום לתשלום באתר באגורות (אותו מספר בקופה וב-LP).  
אין HMAC על webhook Cardcom; מקור אמת = `GetLpResult` (או המקביל ב-legacy Interface).

---

## 1. זרימת תשלום מלאה (happy path)

```text
עגלה תקינה
  → validateCart (מחיר/מלאי/סוג)
  → זהות (חשבון; ראה GUEST-VS-MEMBER)
  → כתובת אם פיזי
  → submitCheckout → שורת order (pending) + Low Profile Create
  → redirect / WebView ל-Cardcom
  → לקוח משלם
  → SuccessRedirect → /checkout/return?…
  → שרת: GetLpResult + התאמת סכום/מזהה
  → order paid + vouchers / פיצול פיזי ב-ledger
  → מייל / אזור אישי
```

| שלב | אחריות | הערה |
|---|---|---|
| יצירת LP | Next server | `ReturnValue` = מזהה הזמנה פנימי |
| IndicatorUrl / webhook | `?s=<secret>` | לא חתימת גוף |
| Return URL | דפדפן/WebView | UI בלבד; לא סוגר בלי GetLpResult |
| Finalize | שרת | idempotent לפי order id / LP id |

אנליטיקה: `begin_checkout` → `checkout_step` → `purchase` (רק אחרי paid).

---

## 2. מצבי כשל

| קוד פנימי | סימפטום | גורם טיפוסי | התנהגות ללקוח | פעולת מערכת |
|---|---|---|---|---|
| `cart_invalid` | לא מגיעים ל-Cardcom | מלאי/מחיר השתנו | הודעה בעגלה + רענון סכום | לא יוצרים LP |
| `auth_required` | עצירה בזהות | אורח בלי login | מסך התחברות | עגלה נשמרת |
| `lp_create_failed` | שגיאה לפני redirect | Cardcom/טרמינל/env | "נסו שוב" | order נשאר cancellable / לא paid |
| `user_cancel` | חזרה מ-FailedRedirect | ביטול בדף Cardcom | חזרה לעגלה/checkout | אין חיוב; אפשר LP חדש |
| `3ds_fail` | כישלון אימות | בנק/כרטיס | נסו כרטיס אחר | כמו cancel |
| `amount_mismatch` | GetLpResult ≠ order | באג/מניפולציה | מסך בדיקה + תמיכה | **לא** mark paid; alert P1 |
| `webhook_dup` | כפילות indicator | retry רשת | שקוף ללקוח | idempotent finalize |
| `lp_pending` | return בלי תוצאה סופית | עיכוב Cardcom | "בודקים תשלום…" | poll GetLpResult (סעיף 3) |
| `paid_no_voucher` | paid בלי הנפקת קופון | כשל אחרי חיוב | תמיכה דחופה | reconcile ידני / job |
| `cardcom_down` | timeouts גורפים | ספק סליקה | באנר + checkout off | INCIDENT §Cardcom |

אסור: לסמן paid על סמך query string ב-return בלבד.

---

## 3. מדיניות Retry

| מצב | מי מריץ | כלל |
|---|---|---|
| יצירת LP נכשלה לפני redirect | לקוח | כפתור "נסו שוב"; order חדש או reuse pending לפי מימוש |
| FailedRedirect / ביטול משתמש | לקוח | חזרה לcheckout; **LP חדש** (לא reuse session שנגמר) |
| Return עם pending | שרת | GetLpResult כל N שנ׳, מקס M ניסיונות; אח״כ מסך תמיכה |
| Webhook אחרי return שכבר finalize | שרת | no-op (idempotent) |
| GetLpResult 5xx | שרת | backoff אקספוננציאלי; אל תכפיל חיוב |
| הלקוח מרענן return | שרת | אותה reconcile; אין LP שני אוטומטי |
| חשד כפל חיוב | תמיכה+admin | לפי PLAYBOOK תשלום כפול; לא retry סליקה |

מגבלות: לא יותר מ-K ניסיונות LP לאותה עגלה בחלון זמן (anti-bot).  
`CHECKOUT_ENABLED=false` עוצר retry אוטומטי גלובלי.

---

## 4. משפך נטישה (תזכורת)

| # | שלב | נטישה טיפוסית |
|---|---|---|
| 1-3 | מוצר→עגלה | מחיר/יתרה בעסק לא ברורים |
| 4 | זהות | חובת login בלי הסבר |
| 5 | כתובת | שדות ארוכים (פיזי) |
| 6 | Cardcom | פחד / נטישה בדף חיצוני |
| 7 | Return | pending / כשל reconcile |

יעדי כיוון: payment_redirect→purchase ≥ 85% אחרי ייצוב.

---

## 5. A/B בעדיפות גבוהה

| ID | רעיון | עלות | תועלת |
|---|---|---:|---:|
| AB-01 | "לתשלום באתר / יתרה בעסק" מעל CTA | 1 | 5 |
| AB-03 | "העגלה נשמרת אחרי התחברות" | 1 | 4 |
| AB-05 | מסך ביניים לפני Cardcom | 2 | 3 |
| AB-08 | אחרי paid: קישור ישיר ל-QR | 3 | 5 |

---

## 6. Acceptance

- [ ] Happy path מתועד מקצה לקצה
- [ ] טבלת כשלים כוללת amount_mismatch ו-idempotency
- [ ] Retry לא יוצר חיוב כפול
- [ ] אין finalize בלי GetLpResult

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | משפך + A/B |
| 2026-08-11 | זרימת Cardcom מלאה, מצבי כשל, מדיניות retry |
