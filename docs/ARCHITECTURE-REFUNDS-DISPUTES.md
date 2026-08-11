# ARCHITECTURE: Refunds and Disputes

ארכיטקטורת החזרים ומחלוקות: קופונים (לפני/אחרי מימוש), מוצרים פיזיים, Cardcom, ארנק כגיבוי.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי. **לא ייעוץ משפטי.**

Companions:

```
docs/LEGAL-CHECKLIST.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/RUNBOOK-OPERATIONS.md
docs/ARCHITECTURE-NOTIFICATIONS.md
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| R1 | Refund לכרטיס רק אחרי אישור דומיין (אדמין / מדיניות); לא מ-Cardcom dashboard לבד כמקור אמת. |
| R2 | כסף: integer agorot. כל תנועה ב-ledger / audit. |
| R3 | קופון `issued` (טרם מימוש): מסלול ביטול/החזר אפשרי לפי מדיניות + חוק. |
| R4 | קופון `redeemed`: אין הבטחת החזר מלא אוטומטי; מסלול ידני / מחלוקת. |
| R5 | Cardcom Refund API דרך שרת בלבד; idempotency על `refund_id`. |
| R6 | אם Cardcom נכשל אחרי אישור זיכוי פנימי: wallet credit fallback (פנימי בלבד) + התראת ops. |
| R7 | Dispute/chargeback: לא מוחק היסטוריה; מקפיא voucher אם רלוונטי; audit. |
| R8 | מייל `refund` אחרי finalize בלבד (ראה Notifications). |

---

## 1. מטריצת מסלולים

| מצב | מוצר | פעולה אופיינית | כסף |
|---|---|---|---|
| לפני מימוש | coupon `issued` | ביטול שובר + Refund Cardcom (או חלקי) | זיכוי `coupon_price` ששולם באתר (בכפוף למדיניות) |
| אחרי מימוש | coupon `redeemed` | אין auto-refund; טיקט + בדיקת ספק | נדיר; חלקי/wallet/דחייה |
| לפני משלוח | physical | ביטול + Refund | מלא או בניכוי דמי ביטול אם חוקי |
| אחרי משלוח | physical | החזרה לפי מדיניות ספק + KE | חלקי/מלא לפי בדיקה |
| Chargeback | כל סוג | Dispute flow (§5) | קיזוז ledger + חקירה |

---

## 2. קופון: לפני מימוש

```text
Customer/support request
  → verify voucher status = issued (FOR UPDATE)
  → eligibility (תוקף, fraud flags, חלון ביטול)
  → admin/system approve
  → void voucher (status cancelled/refunded; QR invalid)
  → Cardcom refund (agorot → ILS API)
  → ledger: reverse platform/supplier held as needed
  → notify customer (kind refund)
```

כללים:

- לא לבטל אם כבר `redeemed`
- replay של אותה בקשה: idempotent על `refund_id` / dedupe
- UI: הקופון נעלם מ-`/account/coupons` או מסומן מבוטל

---

## 3. קופון: אחרי מימוש

| אפשרות | מתי |
|---|---|
| דחייה | שירות סופק / מימוש תקין |
| החזר חלקי | תקלה מוכחת; סכום ידני באגורות |
| wallet credit | כשלא ניתן/לא רצוי להחזיר לכרטיס |
| הסלמה לספק | איכות שירות בבית העסק |

אסור לנציג להבטיח "תמיד מחזירים אחרי סריקה".

---

## 4. מוצר פיזי

```text
Request → order_item state (paid / shipped / delivered)
  → policy window
  → RMA / אישור ספק אם נדרש
  → Cardcom refund (full/partial)
  → inventory / shipment cancel if applicable
  → settle supplier payout adjustment (snapshot platform_percent)
```

`platform_percent` לחישוב קיזוז: **רק מהסנאפשוט** ב-`order_items`.

---

## 5. Cardcom Refund API

| כלל | פירוט |
|---|---|
| מיקום | Server Action / Route Handler בלבד |
| קלט | `payment_id` / Cardcom deal identifiers + `amount_agorot` |
| Idempotency | מפתח יציב `refund:{order_id}:{refund_id}` |
| הצלחה | שמירת `provider_refund_id`, `refunded_at`, סטטוס הזמנה |
| כשל זמני | retry מוגבל; לא לסמן voucher מבוטל בלי כסף שחזר או wallet fallback מאושר |
| כשל קבוע | טיקט ops + wallet fallback לפי §6 |

אסור: קריאה מ-Edge הדפדפן עם מפתחות Cardcom.

---

## 6. Wallet credit fallback

כשזיכוי לכרטיס נכשל או לא זמין (מדיניות):

1. זיכוי ארנק פנימי באגורות (`wallet_ledger`, reason `refund_fallback`)
2. קישור ל-`order_id` / `refund_id`
3. הודעה ללקוח בעברית: קרדיט לשימוש באתר בלבד, לא משיכה
4. התראת אדמין אם הסכום מעל סף

ארנק: ראה

```
docs/ARCHITECTURE-WALLET-CASHBACK.md
```

אין העברה לחשבון בנק מהארנק.

---

## 7. Disputes / Chargebacks

```text
Cardcom / bank chargeback notice
  → open dispute case in admin
  → freeze related voucher if still issued (optional policy)
  → collect evidence (order, QR redeem log, delivery)
  → respond in Cardcom window
  → outcome: won / lost / partial
  → ledger adjustment + supplier clawback if needed
```

| כלל | פירוט |
|---|---|
| היסטוריה | לא מוחקים orders/payments |
| Redeem אחרי chargeback | חסום אם מדיניות מקפיאה |
| Fraud | קישור ל-Fraud Prevention |

---

## 8. סטטוסים ונתונים

טבלאות יעד (שמות לוגיים):

```text
refunds (id, order_id, amount_agorot, reason, status, provider_refund_id, …)
dispute_cases (id, order_id, channel cardcom|manual, status, …)
audit_log / ledger entries
```

סטטוסי refund:

```text
requested → approved → submitting → succeeded
                              ↘ failed → wallet_fallback | manual
         → rejected
```

---

## 9. הרשאות

| תפקיד | יכולת |
|---|---|
| customer | בקשת ביטול / טיקט |
| support agent | בקשה + המלצה; לא Cardcom בלי הרשאה |
| admin | אישור refund + קריאת Cardcom |
| supplier | אישור עובדות משלוח/שירות; לא זיכוי כרטיס |

`requireRecentAuth` / MFA לאדמין מעל סף סכום.

---

## 10. Acceptance

- [ ] מסלול issued → void + Cardcom מתועד
- [ ] redeemed בלי auto-refund
- [ ] פיזי עם קיזוז לפי snapshot
- [ ] idempotency על refund
- [ ] wallet fallback בלי משיכה חיצונית
- [ ] dispute לא מוחק היסטוריה

---

## 11. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
