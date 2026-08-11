# ארכיטקטורה: UX מימוש קופון (ספק + לקוח)

מפרט UX מחייב לסורק ספק ולתצוגת QR ללקוח. RTL עברית, מיפוי הודעות שגיאה, ואין סימון `redeemed` אופטימיסטי.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #9/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף בתצוגה: **No Escrow**. יתרה לגבייה = `face - coupon_price` (אגורות→₪ ב-`he-IL`). מימוש סופי רק אחרי תשובת שרת `success`. אין ניסוח נאמן / Escrow / שחרור תשלום לספק.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-COMMERCE.md
```

חוזה שרת/outcomes: `docs/ARCHITECTURE-COUPON-REDEMPTION.md`

---

## 0. החלטה (UX1–UX7)

| # | הכרעה |
|---|---|
| UX1 | כל מסכי הסריקה והקופון: `dir="rtl"`, עברית, Heebo / סטאק האתר. |
| UX2 | הצלחה: המספר הגדול ביותר על המסך = יתרה לגבייה בקופה (לא מחיר האתר). |
| UX3 | **אין** optimistic `redeemed`: לפני תשובת RPC המסך נשאר "מאמת…" / מצב קלט. |
| UX4 | Wrong shop וקוד לא קיים חולקים אותה הודעה חיצונית (anti-enum). |
| UX5 | מצלמה ראשית; הקלדה ידנית תמיד זמינה (מרתף / בלי הרשאת מצלמה). |
| UX6 | כפתורי CTA ≥ 44px גובה; קוד בתצוגה `dir="ltr"` + tracking. |
| UX7 | לקוח רואה QR רק לשובר `issued` שבבעלותו; אחרי `redeemed`/`expired`/`refunded` אין QR פעיל. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Optimistic UI: סימון "מומש" לפני תשובת RPC | סיכון double-spend תפיסתי; UX3 אוסר. |
| הודעה נפרדת ל-"ספק לא נכון" | חושף enum; UX4 מאחד ל-not_found. |
| הצגת "שוחרר תשלום" / Escrow בהצלחה | סותר No Escrow; מקדמה = הכנסת פלטפורמה. |
| QR פעיל גם אחרי `redeemed` (ל"הוכחה") | UX7; QR = כלי מימוש בלבד. |
| הצלחת כסף באופליין לפני sync | CE offline: תור בלבד, לא יתרה מדומה. |
| מימוש על ידי הלקוח (כפתור "ממש") | מימוש = ספק בלבד; REDEMPTION. |
| הצגת `platform_percent` / עמלה לספק בסורק | לא רלוונטי לקופון; supplier_due = 0. |
| BarcodeDetector חובה בלי fallback הקלדה | UX5; Safari ישן / הרשאות נדחות. |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** ה-UI קורא נתונים קיימים; מימוש כותב דרך RPC.

| טבלה / שדה | שימוש UX |
|---|---|
| `vouchers.status` | `issued` / `redeemed` / `expired` / `refunded` → סטטוס + QR |
| `vouchers.code` | תצוגה ltr; הקלדה ידנית בסורק |
| `vouchers.qr_payload` | חתום; רינדור QR ללקוח |
| `vouchers.expires_at` | תוקף בתצוגה |
| `vouchers.user_id` | RLS: לקוח רואה רק שלו |
| `order_items.coupon_price_*` / face | "שולם באתר" + חישוב יתרה |
| `remaining_amount_due_agorot` (לוגי/API) | המספר הדומיננטי בהצלחת סריקה |
| `voucher_redemptions` | outcome, `idempotency_key`, replay |
| `products.name` / snapshot | שם מוצר בתוצאה |

כסף: agorot integer בשרת; UI ממיר ל-₪ `he-IL`. **אין** שדות Escrow/held.

---

## 3. מסלולים

| Route | קהל | תפקיד |
|---|---|---|
| `/supplier/scan` | חבר ספק | מצלמה + הקלדה + תוצאה |
| `/account/coupons` או `/account/vouchers` | לקוח | רשימת שוברים + QR לפעילים |
| `/coupon/[id]` (או מקביל) | לקוח בעלים | פרטי שובר בודד + QR |
| `POST /api/supplier/vouchers/redeem` | ספק | מימוש (לא UI ישיר) |

`robots: noindex` על סריקה ועל דפי קופון פרטיים.

---

## 4. סורק ספק: `/supplier/scan`

### 4.1 שלבים

```text
1. קלט     מצלמה (BarcodeDetector / polyfill) ו/או שדה קוד
2. שליחה   POST עם method + idempotency_key חדש לכל ניסיון משתמש
3. המתנה   busy=true; אין שינוי סטטוס מקומי ל-"מומש"
4. תוצאה   לפי outcome; בהצלחה: יתרה לגבייה בטיפוגרפיה דומיננטית
5. המשך   "סרוק הבא" מאפס תוצאה וחוזר לקלט (בלי לשמור optimistic state)
```

Double-tap: אותו `idempotency_key` לניסיון אחד, או מפתח חדש לניסיון חדש אחרי תוצאה סופית. השרת מגדיר אמת; ה-UI לא "מנחש" הצלחה.

### 4.2 פריסה (mobile-first)

| פריט | כלל |
|---|---|
| מעטפת | `dir="rtl"`, max-width ~480px ממורכז, `min-h-dvh` |
| כותרת | "סריקת קופונים" |
| וידאו | יחס אנכי נוח לטלפון; לא חוסם את שדה ההקלדה |
| שדה קוד | גדול, `inputMode` מתאים, `autoCapitalize="characters"` |
| CTA | "מימוש" / "אשר וממש"; disabled בזמן busy או קוד קצר מדי |
| סטטוס רשת | מחובר / לא מקוון (אם יש תור: "נשמר לסנכרון", בלי הצלחת כסף) |

טוקנים: CTA כהה (`#333e48` או טוקן heading); הדגשת הצלחה עם מותג צהוב (`#fed700`) על פס/מסגרת הצלחה.

### 4.3 מה מוצג בהצלחה

1. כותרת הצלחה (טבלה בסעיף 6)  
2. **לגבייה בקופה: ₪X.XX** (מ-`remaining_amount_due_agorot` / `amount_collected_agorot`)  
3. שם מוצר + קוד (משני)  
4. אם `replayed`: שורת משנה "תשובה חוזרת" (לא מימוש כפול)

### 4.4 אופליין (אם מיושם)

| מותר | אסור |
|---|---|
| שמירת קוד + מפתח לתור | להציג יתרה לגבייה כאילו מומש |
| טקסט: ייסנכרן כשהרשת תחזור | לסמן UI כ-`redeemed` מקומית |
| flush FIFO אחרי `online` | להמציא success בלי RPC |

---

## 5. לקוח: תצוגת QR

### 5.1 רשימה (`/account/coupons`)

| מצב שובר | UI |
|---|---|
| `issued` + לא פג | כרטיס/שורה עם QR (או לינק לפרטים), תוקף, יתרה בעסק |
| `redeemed` | סטטוס "מומש"; בלי QR פעיל |
| `expired` | "פג תוקף"; בלי QR |
| `refunded` | "הוחזר"; בלי QR |

מיון מומלץ: פעילים קודם. כסף: אגורות מהשרת → פורמט `he-IL`.

### 5.2 פרט (`/coupon/[id]`)

דורש session; רק בעל השובר (`user_id`).

| שדה | מקור |
|---|---|
| שם מוצר | products / snapshot |
| קוד | `code` (ltr) |
| QR | מ-`qr_payload` החתום (רינדור קליינט) |
| שולם באתר | `coupon_price_agorot` |
| יתרה בעסק | `face - coupon` / `remaining_amount_due_agorot` |
| תוקף | `expires_at` |
| סטטוס | תרגום עברי של status |

אחרי מימוש/פקיעה/החזר: מסתירים QR פעיל; אפשר להשאיר קוד לקריאה בלבד.

### 5.3 בהירות מול בית העסק

לקוח מבין משפט אחד: "שלמת מקדמה באתר; בבית העסק ישלמו את היתרה המוצגת." בלי נאמן/Escrow.

---

## 6. מיפוי הודעות שגיאה (עברית מחייבת)

מיפוי מ-`outcome` (קנוני ב-REDEMPTION) לטקסט UI. Wrong shop לא מקבל ניסוח נפרד.

| outcome | טקסט ספק (מחייב) |
|---|---|
| `success` | הקופון מומש בהצלחה |
| `already_redeemed` | הקופון כבר מומש |
| `expired` | תוקף הקופון פג |
| `refunded` | הקופון הוחזר ללקוח |
| `not_found` | קוד קופון לא נמצא |
| `unauthorized` | אין הרשאת ספק |
| `rate_limited` | יותר מדי סריקות, המתינו רגע |
| `invalid_request` | בקשה לא תקינה |

Aliases ישנים: `already_used` → אותה הודעה כמו `already_redeemed`.

שגיאת רשת/5xx (לפני outcome): "שגיאת רשת, נסו שוב" / "שגיאת מערכת, נסו שוב". **לא** לסמן מומש.

---

## 7. אין optimistic redeemed

| רגע | מצב UI מותר |
|---|---|
| לפני fetch | קלט / מצלמה פעילה |
| בזמן fetch | spinner / "מאמת…"; CTA disabled |
| `success` | מסך הצלחה + יתרה |
| כל כשל | מסך כשל לפי טבלה; הקוד נשאר לניסיון חוזר אם רלוונטי |
| timeout / abort | כשל רשת; שובר נשאר `issued` בצד לקוח עד רענון מהשרת |

אסור: לצבוע QR כבוי / "מומש" לפני 200 + `outcome=success`; לעדכן רשימת לקוח מקומית ל-`redeemed` בלי invalidate/refetch; להציג יתרה מתשובה מקומית מדומה.

---

## 8. נגישות וביצועי שטח

| נושא | כלל |
|---|---|
| ניגודיות | טקסט על רקע הצלחה/כשל קריא באור חנות |
| `role="status"` | על אזור תוצאה להקראה מיידית |
| רטט (אופציונלי) | קצר בהצלחה; לא במקום הודעה |
| סוללה/חום | עצירת מצלמה ביציאה מהמסך (`getTracks().stop()`) |
| Safari ישן | אם אין BarcodeDetector: הקלדה + הודעה ברורה |

---

## 9. מקרי קצה

| מקרה | תרחיש | UX מחייב | הערה |
|---|---|---|---|
| UXE1 | double-tap על "מימוש" | busy + idempotency; replay אם אותו מפתח | לא optimistic |
| UXE2 | שני סורקים, אחד success | השני: already_redeemed | CAS בשרת |
| UXE3 | timeout אחרי success בשרת | כשל רשת; refetch לפני retry | שובר עדיין issued עד refetch |
| UXE4 | wrong_supplier | not_found (אותה הודעה) | anti-enum UX4 |
| UXE5 | QR מצולם / חתימה שבורה | not_found + log | לא מגיעים ל-RPC |
| UXE6 | rate_limit | הודעה UX6; CTA disabled זמני | לא spam |
| UXE7 | offline queue flush | "מסנכרן…"; success רק אחרי RPC | לא יתרה מדומה |
| UXE8 | לקוח פותח QR אחרי redeem מרחוק | refetch: "מומש", QR מוסתר | invalidate on focus |
| UXE9 | voucher expired בזמן סריקה | expired | לא success |
| UXE10 | refunded בזמן סריקה | refunded | CE redeem_after_refund |
| UXE11 | unauthorized supplier | unauthorized | לא leak voucher |
| UXE12 | מצלמה נדחית | fallback הקלדה UX5 | לא dead-end |

---

## 10. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | האם offline queue חובה ב-v1 או opt-in | תלוי SUPPLIER-PORTAL |
| O2 | BarcodeDetector polyfill: איזה חבילה / גודל bundle | ביצועים mobile |
| O3 | `/account/coupons` מול `/account/vouchers`: route קנוני אחד | PERSONAL-AREA |
| O4 | רטט haptic: iOS vs Android | נגישות O5 |
| O5 | polling/refetch interval אחרי סריקה ללקוח (realtime?) | notifications v2 |
| O6 | האם `replayed` מוצג גם ללקוח (לא רק ספק) | כרגע ספק בלבד |

עודכן: 2026-08-12.

---

## 11. Acceptance

- [ ] Scan RTL, CTA ≥ 44px, יתרה דומיננטית בהצלחה  
- [ ] מיפוי הודעות לפי סעיף 6 (כולל anti-enum)  
- [ ] אין optimistic redeemed  
- [ ] QR ללקוח רק ב-`issued`; מוסתר אחרי redeemed/expired/refunded  
- [ ] אין ניסוח Escrow/נאמן  
- [ ] אופליין (אם קיים) לא מציג הצלחת כסף לפני שרת  
- [ ] החלטה + חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות  

---

## 12. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-02 | טיוטת UX קודמת ל-feat/coupon-redemption |
| 2026-08-12 | BINDING batch #9: סורק + QR לקוח, RTL, anti-optimistic |
| 2026-08-12 | batch-2 pass-3: DOCS-TEMPLATE-BINDING (חלופות, DB, מקרי קצה, פתוחות) |
