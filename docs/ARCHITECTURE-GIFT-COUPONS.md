# ארכיטקטורה: קופון מתנה

קופון מתנה: רכישה, העברת בעלות, וברכות.

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-B2B-SALES.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-INVENTORY.md
docs/CONTRADICTIONS.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| G1 | קופון מתנה = voucher רגיל עם `gift` metadata; אותו מודל כסף (**No Escrow**: מקדמה לפלטפורמה; יתרה בעסק; אין נאמן/J5). |
| G2 | הרוכש משלם באתר; המקבל מקבל בעלות על ה-voucher אחרי העברה. |
| G3 | העברת בעלות מותרת רק לסטטוס `issued` (לא redeemed/expired/refunded/frozen). |
| G4 | העברה אחת בלבד כברירת מחדל (או N מוגבל באדמין); כל העברה ב-audit. |
| G5 | ברכה = טקסט קצר בעברית + אופציונלי שם השולח; בלי PII מיותר בלוגים. |
| G6 | אחרי העברה: המקבל רואה את הקופון באזור האישי; השולח רואה "נשלח כמתנה". |
| G7 | ביטול/החזר: לפי LEGAL מול הרוכש המקורי; אחרי redeem אצל מקבל אין החזר אוטומטי. |
| G8 | הנפקה ב-checkout צורכת מכסת INVENTORY; העברת בעלות לא משנה `quota_issued` ולא יוצרת payout לספק. |

---

## 1. זרימה

```text
רוכש → checkout (flag is_gift)
  → paid → voucher issued + gift_message + recipient_email/phone?
  → מייל/וואטסאפ לשולח: אישור + קישור שליחה
  → שולח בוחר מקבל (או הזין בקופה) → transfer ownership
  → מקבל מקבל coupon_issued / gift_received
  → מקבל מציג QR / מוסיף לארנק
  → ספק סורק כרגיל
```

---

## 2. מודל נתונים (יעד)

```text
voucher_gifts (
  id, voucher_id,
  purchaser_user_id,
  recipient_user_id null,     -- אחרי claim
  recipient_contact,          -- email או phone לנמען שעדיין לא נרשם
  message_he,                 -- ברכה, מקס ~500 תווים
  transferred_at,
  claim_token_hash,           -- לקישור חד-פעמי
  status pending_claim|claimed|revoked
)
```

Ownership על `vouchers.user_id` משתנה רק ב-RPC `transfer_gift_voucher` (service/definer) עם בדיקות סטטוס.

---

## 3. ברכות

| כלל | פירוט |
|---|---|
| שפה | עברית; RTL במייל ובמסך |
| תוכן | טקסט חופשי מסונן (XSS); בלי קישורים חשודים |
| תבניות מוכנות | "מזל טוב", "חג שמח", "תודה" (אופציונלי) |
| תצוגה | במסך הקופון של המקבל + במייל gift_received |

---

## 4. אבטחה / הונאה

- Claim token חד-פעמי, תפוגה (למשל 30 יום או עד `expires_at` של הקופון).  
- Rate limit על שליחות מתנה למשתמש.  
- אחרי claim: token מתבטל.  
- Wrong recipient contact: השולח יכול revoke כל עוד `pending_claim` ו-`issued`.  

---

## 5. התראות

| אירוע | kind |
|---|---|
| נרכש כמתנה | `gift_purchased` לשולח |
| נשלח/מוכן ל-claim | `gift_ready` לנמען |
| נתבע בעלות | `gift_claimed` לשולח + `coupon_issued` למקבל |
| בוטל לפני claim | `gift_revoked` |

---

## 6. Acceptance

- [ ] העברה רק מ-`issued`  
- [ ] ברכה RTL במייל ובאפ  
- [ ] Claim חד-פעמי  
- [ ] Redeem אחרי העברה עובד למקבל בלבד  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | קופון מתנה: בעלות, ברכות, claim |
| 2026-08-06 | QA: קישור B2B/PRICING; No Escrow מחוזק |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS (No Escrow + platform_percent) |
| 2026-08-07 | QA: קישור INVENTORY + G8 (מכסה; חיזוק No Escrow ב-G1) |
