# ארכיטקטורה: מחזור חיי קופון

יצירה אחרי תשלום, QR חתום, מימוש אטומי, מרוצי סריקה, פקיעה, audit, והרשאות ספק.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/COUPON-LIFECYCLE-SPEC.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
```

**יחס ל-`COUPON-LIFECYCLE-SPEC.md`:** המסמך הזה = הכרעות ארכיטקטורה מחייבות. ה-SPEC נשאר לפירוט מוצר/טבלאות מצבים ומפנה לכאן כשמתנגשים.

מודל כסף: **No Escrow**. אחרי סריקה הלקוח משלם יתרה בעסק; הפלטפורמה לא משחררת כסף לספק על מקדמה.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| CL1 | הנפקה רק אחרי order `paid` + GetLpResult (לא מ-return בלבד). |
| CL2 | סטטוסים קנוניים בפרוד (054): `issued` \| `redeemed` \| `expired` \| `refunded`. כתיבה חדשה: `redeemed` (לא `used`). |
| CL3 | מימוש = `UPDATE … WHERE status='issued' … RETURNING` אטומי; אין מימוש בזיכרון בלבד. |
| CL4 | QR = מטען חתום (HMAC/`KEV1`); בעלות QR אינה מספיקה בלי עדכון DB. |
| CL5 | ספק סורק רק מוצרים של `supplier_id` שלו; wrong shop → תשובה אחידה (anti-enum). |
| CL6 | כסף על השורה: snapshots אגורות; `supplier_due=0`; יתרה בעסק מחוץ לפלטפורמה. |
| CL7 | אחרי `redeemed` אין unwind אוטומטי ל-`issued`. |
| CL8 | כל מעבר סטטוס + סריקה נכשלת נרשמים ב-audit / `voucher_redemptions`. |

---

## 1. יצירה (mint)

```text
finalize paid
  → לכל order_item מסוג coupon × quantity:
       INSERT voucher (
         status=issued,
         code unique,
         qr_payload signed,
         face/coupon/balance snapshots agorot,
         platform_percent snapshot (ביקורת),
         expires_at = paid_at + expiry_days,
         order_item_id, user_id, supplier_id
       )
  → outbox: voucher_issued / order_paid
  → item_status → issued
```

| כלל | פירוט |
|---|---|
| מכסה | אכיפה אטומית מול quota לפני/בתוך finalize |
| Idempotency | מפתח הנפקה פר order_item (+ seq); replay לא מנפיק כפול |
| כשל אחרי paid | reconcile job; לא מסמן order כלא-paid |

---

## 2. QR

| רכיב | תפקיד |
|---|---|
| `code` | הזנה ידנית; נרמול A-Z0-9 |
| `qr_payload` | `KEV1.<body>.<HMAC>` עם key id לרוטציה |
| אימות | שרת תמיד מאמת חתימה אם נשלח payload |
| תצוגה | אזור אישי / אפ; אופליין לתצוגה בלבד, לא למימוש מקומי |

אסור: קודי ניחוש קצרים בלי rate limit. ראה FRAUD.

---

## 3. מימוש אטומי

```text
POST /api/supplier/vouchers/redeem (JWT ספק)
  → verify staff / PIN לפי מדיניות
  → redeem_voucher RPC SECURITY DEFINER:
       SELECT … FOR UPDATE
       IF not issued OR expired OR wrong supplier → outcome
       UPDATE status='redeemed', redeemed_at=now() WHERE status='issued'
       INSERT voucher_redemptions (outcome, amount_collected_agorot, …)
  → outbox: voucher_redeemed
```

`amount_collected_agorot` = יתרת העסק (תיעוד); **לא** יוצר payout פלטפורמה→ספק.

---

## 4. מרוצים (race)

| תרחיש | התנהגות |
|---|---|
| שני סורקים במקביל | שורת UPDATE אחת מצליחה; השנייה `already_redeemed` / 0 rows |
| סריקה + refund במקביל | FOR UPDATE; refund רק מ-`issued`; אחרי redeemed אין refund אוטומטי |
| סריקה + expire cron | expire רק `WHERE status='issued' AND expires_at<=now()` |
| כפילות HTTP retry | אותה RPC; אם כבר redeemed → תוצאת כשל יציבה בלי side effects כפולים |

אין optimistic UI שמסמן "מומש" לפני תשובת שרת.

---

## 5. פקיעה

| מנגנון | כלל |
|---|---|
| `expires_at` | מ-`expiry_days` / שדה מוצר בזמן mint (snapshot) |
| Cron | `issued` → `expired` באצוות; idempotent |
| אחרי expired | אין redeem; מחלוקת/הארכת admin נדירה + audit בלבד |
| Breakage כסף | לפי LEGAL/ארנק; לא זיכוי אשראי כברירת מחדל (C6) |

---

## 6. Audit

| אירוע | איפה |
|---|---|
| mint | audit_log + שורת voucher |
| redeem success/fail | `voucher_redemptions.outcome` (כולל כשלים) |
| expire / refund / freeze | audit_log + timestamps |
| admin override | user id + סיבה חובה |

שמירה: לפי
`docs/DATA-RETENTION-POLICY.md`
(כשחל).

---

## 7. הרשאות ספק

| פעולה | מי |
|---|---|
| סריקה | `supplier_members` / staff עם הרשאת scan; PIN באפ כשמופעל |
| צפייה בהיסטוריית סריקות | אותו ספק בלבד (RLS) |
| הנפקה / שינוי מחיר / % | **לא** ספק; admin בלבד |
| refund | לא מסלול ספק; admin/legal |

`wrong_supplier` / לא נמצא: תשובת לקוח אחידה; פירוט רק בלוג שרת.

---

## 8. מכונת מצבים (תמצית)

```text
(none) → issued → redeemed (terminal)
              → expired (terminal)
              → refunded (terminal)
```

פירוט טבלאות:
`docs/COUPON-LIFECYCLE-SPEC.md`.

---

## 9. Acceptance

- [ ] Mint רק אחרי paid מאומת  
- [ ] Redeem אטומי עם race מוגדר  
- [ ] QR חתום; אין מימוש מקומי  
- [ ] No Escrow; אין payout על redeem  
- [ ] Audit על הצלחה וכשל  
- [ ] הרשאות ספק מוגבלות לסריקה  

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING: יצירה, QR, redeem, races, expiry, audit, הרשאות |
