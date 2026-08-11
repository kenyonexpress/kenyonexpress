# ארכיטקטורה: החזרים ומחלוקות

החזר קופון לפני/אחרי מימוש, החזרות פיזי לפי דיני צרכן בישראל (14 יום), היפוך ledger (אין Escrow), Cardcom Refund API, ומכונת מצבי dispute.

Status: **BINDING** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**אינה ייעוץ משפטי.** ניסוח ללקוח רק אחרי עו״ד.

מסמכים קשורים:

```
docs/REFUNDS-CANCELLATION-POLICY.md
docs/DISPUTE-RESOLUTION.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/COUPON-LIFECYCLE-SPEC.md
docs/PAYOUT-ARCHITECTURE.md
docs/VENDOR-PAYOUT-SPEC.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
docs/CONTRADICTIONS.md
```

---

## 0. המלצה אחת (מחייבת)

**אין Escrow ואין "שחרור נאמן".** החזר ללקוח = Cardcom refund (או זיכוי ארנק כשמותר) + עדכון voucher/order + היפוך settlement (`supplier_debit` לפיזי שכבר שולם לספק). קופון אחרי `redeemed`: אין ביטול אוטומטי של מימוש; פיצוי דרך dispute בלבד.

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| R1 | מכר מרחוק: חלון **14 יום** כשחל החוק ואין פטור (**[דורש עו״ד]**). |
| R2 | דמי ביטול כשמותר: עד **5% או 100 ₪**, הנמוך. |
| R3 | קופון: סכום הבסיס להחזר = מה ששולם **באתר** (`paid_on_site`), לא face. |
| R4 | לפני מימוש (`issued`): ביטול מקוון אפשרי במסלול מדיניות + freeze → refunded. |
| R5 | אחרי מימוש (`redeemed`): אין unwind של הסטטוס; dispute → ארנק / Cardcom / דחייה. |
| R6 | פיזי: החזרה/ביטול לפי דין + סטטוס משלוח; ledger הפוך אם כבר payout. |
| R7 | Cardcom: `RefundByTransactionId` (+ `CancelOnly` אותו יום כשמתאים). |
| R8 | כל refund/dispute ב-`audit_log` + טבלת `refunds` / `disputes`. |
| R9 | No Escrow: אין אירוע "release_escrow" / held לספק על מקדמת קופון. |
| R10 | Chargeback → freeze אם issued; תור `manual_review` (FRAUD). |

---

## 2. קופון: לפני מימוש

```text
בקשה (/cancel | אזור אישי | תמיכה)
  → זכאות: status=issued, בתוך חלון מדיניות, לא freeze אחר
  → חישוב: refund_agorot = paid_on_site - fee (אם חל)
  → BEGIN
       voucher → frozen (או ישירות refunded אחרי הצלחת Cardcom)
       Cardcom RefundByTransactionId (או CancelOnly)
       payments / orders מסומנים
       voucher → refunded
       outbox: refund confirmation email
  → COMMIT + audit
```

| כלל | פירוט |
|---|---|
| QR | אחרי freeze/refund: חתימה לא תעבור redeem |
| כסף | רק סכום האתר; יתרה "בעסק" לא מוחזרת כי לא נגבתה |
| כשל Cardcom | voucher נשאר frozen; תור ops; אין redeem |
| Idempotency | מפתח refund יציב; `AllowMultipleRefunds` רק במודע |

---

## 3. קופון: אחרי מימוש

```text
redeemed → אין שינוי ל-issued
  → פתיחת dispute (לקוח/תמיכה)
  → מכונת מצבים §7
  → פיצוי אפשרי: wallet credit | Cardcom refund | דחייה
  → לעולם לא "שחזור שובר"
```

נטל ראיה במחלוקת מימוש: על הספק (`DISPUTE-RESOLUTION.md`).  
החזר ללקוח אחרי redeem אינו "ביטול עסקה רגילה" אלא הכרעה מסחרית/דין עם audit.

---

## 4. פיזי: החזרות לפי דיני צרכן (14 יום)

| מצב | כיוון מוצר |
|---|---|
| תוך 14 יום, טרם משלוח מהותי / לפי דין | ביטול מקוון + Refund Cardcom |
| אחרי קבלת נכס, בתוך חלון החוק | החזרה לפי מדיניות + עו״ד; דמי ביטול כשמותר |
| פגם / אי-התאמה / אי-אספקה | fee=0; תיקון או החזר |
| פטורים סטטוטוריים | **[דורש עו״ד]** ברשימה בעמוד מדיניות |

חישוב דמי ביטול (כשחלים):

```text
fee_agorot    = min(floor(paid_on_site_agorot * 5 / 100), 10000)
refund_agorot = paid_on_site_agorot - fee_agorot
```

יעד החזר לכרטיס: תוך **14 יום** מאישור הביטול (מוצר; עו״ד לניסוח).

---

## 5. "Escrow reversal" (פירוש מחייב: אין Escrow)

בקשות ישנות / נוסח חיצוני שמדברות על "היפוך escrow" מתורגמות כך:

| נוסח שגוי | מנגנון אמיתי |
|---|---|
| שחרור held לספק בקופון | **לא קיים** (No Escrow) |
| ביטול held בקופון | freeze/refund של מקדמת האתר ללקוח בלבד |
| היפוך אחרי payout פיזי | `supplier_debit` + תביעה מול באצ' הבא / clawback |
| chargeback על קופון issued | freeze; אין release לספק |

```text
פיזי שכבר charge_settled / שולם לספק
  → Cardcom refund ללקוח
  → settlement_events: supplier_debit (סכום חלק הספק)
  → באצ' payout הבא מקזז / דורש החזרה מהספק
```

קופון: אין שורת payout מהמקדמה; refund לא יוצר "היפוך escrow".

---

## 6. Cardcom Refund API

מקור חוזה: `CARDCOM-ARCHITECTURE.md`.

| פעולה | מתי |
|---|---|
| `RefundByTransactionId` + `CancelOnly: true` | אותו יום עסקים, לפני שידור מלא |
| `RefundByTransactionId` מלא | החזר מלא אחרי שידור |
| `RefundByTransactionId` + `PartialSum` | החזר חלקי (דמי ביטול / פריט) |
| `AllowMultipleRefunds` | רק כשנדרש במפורש; ברירת מחדל false |

דרישות:

- `CARDCOM_API_PASSWORD` בפרוד (בלי זה זיכויים נכשלים בשקט תפעולי)  
- מקור אמת עסקה: `TransactionId` מאומת מ-`payments` / GetLpResult  
- כסף באגורות בדומיין; המרה לפורמט Cardcom בשכבת הלקוח בלבד  
- הצלחת API → עדכון DB באותה TX לוגית; כשל → מצב `refund_failed` + Sentry  

אין PAN/CVV. אין refund מ-client בלי admin/session מורשה.

---

## 7. מכונת מצבי dispute

```text
open
  → awaiting_supplier   (ספק מקבל ≤2 ימי עסקים להגיב)
  → under_review        (אדמין/תמיכה עם ראיות)
  → resolved_customer   (זיכוי ארנק או Cardcom refund)
  → resolved_supplier   (נדחה ללקוח; נימוק בכתב)
  → closed              (אין ערעור נוסף במוצר; IR נפרד ל-chargeback)
```

| מעבר | תנאי |
|---|---|
| open → awaiting_supplier | מחלוקת מימוש / אי-כיבוד |
| awaiting_supplier → under_review | תשובת ספק או timeout |
| under_review → resolved_* | הכרעה + audit (מי, למה, סכום) |
| * → closed | אחרי ביצוע כספי או דחייה סופית |

SLA: תשובה ראשונה ≤ יום עסקים; הכרעה ≤ 3 ימי עסקים (`DISPUTE-RESOLUTION.md`).

מצבי voucher במקביל (לא מחליפים את dispute):

```text
issued | frozen | redeemed | refunded | expired | void
```

אסור: `redeemed` → `issued`.

---

## 8. סכמת תמצית

```sql
-- כיוון; יישור למיגרציות קיימות
refunds (
  id, order_id, payment_id, amount_agorot, fee_agorot,
  status,           -- requested|approved|submitted|succeeded|failed
  cardcom_refund_transaction_id,
  reason_code, created_by, audit…
)

disputes (
  id, order_id, voucher_id null, supplier_id,
  status,           -- open|awaiting_supplier|under_review|resolved_customer|resolved_supplier|closed
  resolution_type,  -- wallet|cardcom_refund|rejected|rebook
  amount_agorot null,
  decided_by, decided_at, notes_he
)
```

---

## 9. Acceptance

- [ ] קופון issued: מסלול ביטול + Cardcom + `refunded`  
- [ ] קופון redeemed: בלי unwind; רק dispute  
- [ ] פיזי: חלון 14 יום מתועד במדיניות (**[דורש עו״ד]** לטקסט לקוח)  
- [ ] אין אירועי Escrow/held בסכמה או בנוסח  
- [ ] `supplier_debit` אחרי payout פיזי  
- [ ] מכונת dispute + audit  
- [ ] Refund API עם idempotency וטיפול כשל  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | יצירה: לפני/אחרי redeem, 14 יום, ledger reversal, Cardcom, dispute SM |
