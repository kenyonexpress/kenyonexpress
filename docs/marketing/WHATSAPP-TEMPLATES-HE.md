# תבניות WhatsApp (Twilio)

Status: DRAFT · docs only  
Channel: Twilio Content API / WhatsApp Business.  
Language: `he` · `dir=rtl` on the customer phone.  
Variables: Twilio numbered `{{1}}` `{{2}}` … Never put a QR image or `data:` URI in a template. Code as text only.

כסף: אגורות ב-payload, תצוגה ₪ בלי float. בלי `.00` כשאין אגורות (`₪25` לא `₪25.00`).

30א: תבניות **שיווקיות** רק ל-opt-in, עם הסרה. תפעול (הזמנה, שובר, מימוש, משלוח, החזר, קאשבק, payout לספק) יוצא בלי דיוור שיווקי.

הזמנת קופון: לא שולחים גם `order_paid` וגם `voucher_issued`. בוחרים אחת. בשיגור: `voucher_issued` מספיק אחרי `paid_at`.

Base URL: `https://kenyonexpress.co.il`

אין Escrow, אין "הכי זול בארץ", אין הבטחת החזר מיידי לכרטיס.

---

## רישום אצל Twilio

| # | Friendly name | Kind פנימי | Category | 30א |
|---|---|---|---|---|
| 1 | ke_order_paid | `order_paid` | UTILITY | תפעול |
| 2 | ke_voucher_issued | `voucher_issued` | UTILITY | תפעול |
| 3 | ke_voucher_expiring | `voucher_expiring` | UTILITY | תפעול (רק עם תאריך אמיתי) |
| 4 | ke_voucher_redeemed | `voucher_redeemed` | UTILITY | תפעול |
| 5 | ke_order_shipped | `order_shipped` | UTILITY | תפעול (פיזי; לא בשיגור קופון) |
| 6 | ke_refund_done | `refund` | UTILITY | תפעול |
| 7 | ke_cashback_credited | `cashback_credited` | UTILITY | תפעול |
| 8 | ke_abandoned_cart | `abandoned_cart` | MARKETING | opt-in |
| 9 | ke_welcome | `welcome` | UTILITY | תפעול, בלי דיל |
| 10 | ke_review_request | `review_request` | MARKETING | opt-in, אחרי מימוש |
| 11 | ke_winback | `win_back` | MARKETING | opt-in, 60 יום בלי paid |
| 12 | ke_payout_paid | `payout_paid` | UTILITY | לספק, לא ללקוח |

Buttons: URL with variable where noted. Quick reply רק בהסרה שיווקית אם Twilio דורש.

---

## 1. order paid

**משתנים:** `{{1}}` שם · `{{2}}` מספר הזמנה · `{{3}}` סכום שנגבה באתר (₪) · `{{4}}` קישור הזמנה (path)

**גוף**

```
שלום {{1}},
התשלום התקבל. הזמנה {{2}}.
שולם באתר: {{3}}
יתרה בבית העסק, אם יש, לא נגבית כאן. היא מופיעה בעמוד הדיל ותשולם אחרי סריקה.
פרטי הזמנה: https://kenyonexpress.co.il{{4}}
```

לא לצרף קוד שובר אם נשלח גם `voucher_issued`.

---

## 2. voucher issued

**משתנים:** `{{1}}` שם · `{{2}}` שם הדיל · `{{3}}` קוד 10 תווים · `{{4}}` תוקף (תאריך ירושלים) · `{{5}}` יתרה בבית העסק (₪, או "אין" אם 0)

**גוף**

```
שלום {{1}},
הקופון מוכן: {{2}}
קוד: {{3}}
תוקף: {{4}}
יתרה לתשלום בבית העסק אחרי סריקה: {{5}}
מציגים את הקוד או את ה-QR מהאזור האישי, לא צילום מהוואטסאפ כתחליף לקוד.
הקופונים שלי: https://kenyonexpress.co.il/account/coupons
```

אין תמונת QR. המימוש חד פעמי.

---

## 3. voucher expiring

**משתנים:** `{{1}}` שם הדיל · `{{2}}` ימים שנותרו · `{{3}}` תאריך פקיעה · `{{4}}` קוד

שליחה רק אם `expires_at` ידוע. חלון: 7 ימים, ואז מחר (תבנית נפרדת או אותו טקסט עם `{{2}}` = 1).

**גוף**

```
תזכורת: {{1}} פג בעוד {{2}} ימים ({{3}}).
קוד: {{4}}
למימוש אצל בית העסק אחרי תיאום אם נדרש.
הקופון: https://kenyonexpress.co.il/account/coupons
```

בלי "מבצע נגמר היום" אם התאריך לא מחר.

---

## 4. voucher redeemed

**משתנים:** `{{1}}` שם הדיל · `{{2}}` שם העסק · `{{3}}` יתרה שנגבתה / לתשלום בקופה (₪) · `{{4}}` זמן מימוש

**גוף**

```
הקופון {{1}} מומש אצל {{2}}.
סכום שהושלם בבית העסק לפי הדיל: {{3}}
זמן: {{4}}
הקוד לא פעיל יותר. צילום מסך לא מקנה מימוש נוסף.
הזמנות: https://kenyonexpress.co.il/account/orders
```

---

## 5. shipped (פיזי)

**משתנים:** `{{1}}` שם · `{{2}}` מספר הזמנה · `{{3}}` שם מוצר · `{{4}}` הערת משלוח / מספר מעקב או "הספק יצור קשר"

לא בשיגור קופון-only. אין לשלוח על שורת קופון.

**גוף**

```
שלום {{1}},
הזמנה {{2}} ({{3}}) בדרך.
{{4}}
הספק אחראי למשלוח. שאלה על זמן הגעה: info@kenyonexpress.co.il עם מספר ההזמנה.
מעקב הזמנה: https://kenyonexpress.co.il/account/orders
```

---

## 6. refund

**משתנים:** `{{1}}` שם · `{{2}}` מספר הזמנה · `{{3}}` סכום שיוחזר (מה שנגבה באתר) · `{{4}}` יעד: "כרטיס (עד 14 ימי עסקים)" או "ארנק באתר"

**גוף**

```
שלום {{1}},
אושר זיכוי להזמנה {{2}} על {{3}}.
היעד: {{4}}
יתרה ששולמה בבית העסק לא עוברת דרכנו.
מדיניות: https://kenyonexpress.co.il/refund_returns
```

אין "החזר מיידי" לכרטיס.

---

## 7. cashback credited

**משתנים:** `{{1}}` סכום ₪ · `{{2}}` יתרת ארנק אחרי הזיכוי

רק אחרי `fn_wallet_transfer`. סכום ≤0: לא לשלוח.

**גוף**

```
נכנס לך קאשבק של {{1}} לארנק באתר.
יתרה נוכחית: {{2}}
אפשר להשתמש בקופה הבאה באתר. אין משיכה למזומן ואין העברה לכרטיס.
הארנק: https://kenyonexpress.co.il/account/wallet
```

---

## 8. abandoned cart (שיווקי)

**משתנים:** `{{1}}` שם · `{{2}}` שם דיל ראשון בסל · `{{3}}` מחיר קופון באתר (₪)

opt-in. לא לשלוח אם אין פריט `active` או אם כבר `paid` מאז.

**גוף**

```
שלום {{1}},
{{2}} עדיין בסל. מחיר הקופון באתר: {{3}}. יתרה, אם יש, בבית העסק אחרי סריקה.
לסל: https://kenyonexpress.co.il/cart
להסרה מדיוור שיווקי השיבו STOP או הסרה בחשבון.
```

שני טיימינגים (מייל מקביל): שעה, 24 שעות. וואטסאפ: פעם אחת בחלון 24 שעות, לא שני ספאם.

---

## 9. welcome

**משתנים:** `{{1}}` שם

פעם אחת למשתמש. בלי דיל, בלי אחוז הנחה.

**גוף**

```
שלום {{1}},
החשבון ב-KenyonExpress מוכן.
קופון: משלמים באתר רק את מחיר הקופון. יתרה, אם כתובה בדיל, בבית העסק אחרי סריקת QR.
הקופונים שלי: https://kenyonexpress.co.il/account/coupons
הקטלוג: https://kenyonexpress.co.il/
```

---

## 10. review request (שיווקי)

**משתנים:** `{{1}}` שם · `{{2}}` שם הדיל · `{{3}}` שם העסק

רק אחרי `redeemed` (או מסירה פיזית). opt-in. בלי לקנות דירוג.

**גוף**

```
שלום {{1}},
מימשת את {{2}} אצל {{3}}. אם מתאים, ביקורת קצרה עוזרת ללקוחות הבאים.
לכתיבה: https://kenyonexpress.co.il/account/orders
הסרה מדיוור שיווקי: STOP.
```

---

## 11. win-back (שיווקי)

**משתנים:** `{{1}}` שם · `{{2}}` שם דיל `active` אחד · `{{3}}` מחיר קופון ₪ · `{{4}}` slug

60 יום בלי `paid`. עוצר אם רכש. דיל חי בלבד. בלי קופון מתנה.

**גוף**

```
שלום {{1}},
עברו שישים יום בלי רכישה. דיל אחד פעיל: {{2}}. מחיר קופון באתר {{3}}.
https://kenyonexpress.co.il/product/{{4}}
הסרה: STOP.
```

---

## 12. payout paid (ספק)

**משתנים:** `{{1}}` שם בית העסק · `{{2}}` תקופת דוח · `{{3}}` סכום שהועבר (₪) · `{{4}}` אסמכתא / יום ערך

למספר וואטסאפ של איש הקשר התפעולי, לא ללקוח. קופון: אין payout על מקדמת האתר (הפלטפורמה שומרת את מחיר הקופון). הודעה זו לפיזי / עמלה ששולמה בפועל, לא על יתרה שנגבתה בקופה של העסק.

**גוף**

```
שלום {{1}},
הועבר תשלום לתקופה {{2}}: {{3}}.
אסמכתא: {{4}}
פירוט בפורטל הספק. זה אינו חשבונית מס.
https://kenyonexpress.co.il/supplier/login
```

---

## מיפוי משתנים (יישום)

| תבנית | {{1}} | {{2}} | {{3}} | {{4}} | {{5}} |
|---|---|---|---|---|---|
| order paid | name | order number | on-site ₪ | `/account/orders/...` | |
| voucher | name | product | code | expires | balance ₪ |
| expiring | product | days | date | code | |
| redeemed | product | supplier | balance ₪ | redeemed_at | |
| shipped | name | order | product | tracking note | |
| refund | name | order | amount ₪ | destination | |
| cashback | amount ₪ | wallet ₪ | | | |
| abandoned | name | product | coupon ₪ | | |
| welcome | name | | | | |
| review | name | product | supplier | | |
| win-back | name | product | coupon ₪ | slug | |
| payout | supplier | period | amount ₪ | ref | |

---

## QA לפני אישור Meta/Twilio

1. עברית בלי משתנה חסר. אם Twilio דוחה ערך ריק: למלא `אין` או `0`, לא סימן פיסוק במקום מספר.
2. אין PAN, אין payload `KEV1` מלא בצ'אט (רק קוד קצר אם זה מה שמוצג ללקוח).
3. שיווקי: רשימת opt-in בלבד.
4. ספק payout לא הולך למספר הלקוח.
