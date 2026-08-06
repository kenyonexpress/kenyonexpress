# ARCHITECTURE: Personal Area (`/account/**`)

ארכיטקטורת האזור האישי של KenyonExpress.

Status: **BINDING** · Updated: 2026-08-02  
Scope: docs only.

Companions:

```
docs/ARCHITECTURE-ACCOUNT-IDENTITY.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-NOTIFICATIONS.md
```

Stack: Next.js App Router route group `(account)`, Server Components + Server Actions, Supabase Auth (Google OAuth), RLS, כסף באגורות (integer), RTL + Heebo, מותג `#fed700` / ink `#333e48`.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| P1 | כל `/account/**` דורש session. אורח → `/login?next=...`. |
| P2 | כניסה לאזור האישי: **Google OAuth** (מסלולי סיסמה/magic בקוד = legacy לסגירה ב-UX). |
| P3 | RLS הוא הגבול. קריאות לקוח עם user client; `adminClient` רק עם `.eq('user_id', uid)` מתועד. |
| P4 | קופונים בתצוגה חדשה = טבלת `vouchers` (לא `coupon_codes`). Alias: `/account/vouchers` → `/account/coupons`. |
| P5 | ארנק = קרדיט פנימי בלבד. **לא יוצא מהמערכת** (אין משיכה, אין P2P, אין זיכוי כרטיס מהארנק). |
| P6 | כסף ב-DB/domain: **integer agorot**. UI: ₪ ב-`he-IL`, `Asia/Jerusalem`. |
| P7 | קופון (**No Escrow**): במייל ובמסך מופיעים שולם באתר + יתרה בבית העסק. מקדמת האתר נשארת אצל הפלטפורמה; אין held לספק ואין נאמן אשראי. פיזי לפי `platform_percent` פר מוצר. |
| P8 | אין PAN/CVV. `payment_tokens.cardcom_token` לא ב-SELECT ל-`authenticated`. |
| P9 | התנתקות בניווט וב-`/account/details`. אחרי logout → `/login`. |

---

## 1. מפת מידע (IA)

```
(account)/layout.tsx     getUser() gate + AccountNav + shell
  /account               סקירה
  /account/orders        היסטוריית הזמנות
  /account/orders/[id]   פרטי הזמנה (+ קופונים/QR שלה)
  /account/coupons       ארנק קופונים (טאבים + QR)
  /account/wallet        ארנק קאשבק פנימי
  /account/details       פרופיל Google / פרטים
  /account/addresses     כתובות למשלוח
  /account/tokens        כרטיסים שמורים (last4 בלבד)
```

Nav (עברית, מחייב):

| href | תווית |
|---|---|
| `/account` | סקירה |
| `/account/orders` | ההזמנות שלי |
| `/account/coupons` | הקופונים שלי |
| `/account/wallet` | הארנק שלי |
| `/account/details` | הפרטים שלי |
| `/account/addresses` | כתובות |
| `/account/tokens` | אמצעי תשלום |

Badge על הארנק: יתרה מעוצבת.  
דף תצוגת קופון בודד (מחוץ ל-nav, מקישורי מייל): `/coupon/[id]`.

קבצים:

```
src/app/(account)/layout.tsx
src/app/(account)/account/**
src/components/account/AccountNav.tsx
src/styles/account.css
```

---

## 2. היסטוריית הזמנות

### 2.1 מסכים

| Route | כותרת | תוכן |
|---|---|---|
| `/account/orders` | ההזמנות שלי | רשימה (עד 50), תאריך, סטטוס, סכום ששולם באתר, סימון "כולל קופונים", CTA פרטים |
| `/account/orders/[id]` | פרטי הזמנה | סיכום, שורות, שולם מהארנק, סך שולם באתר, יתרה בבית העסק לשורות קופון, קישור/QR לקופונים |

ריק: `עוד לא ביצעת הזמנות.`

### 2.2 טבלאות ו-RLS

| טבלה | SELECT ללקוח | כתיבה |
|---|---|---|
| `orders` | `user_id = auth.uid()` | אין (checkout/webhook בשרת) |
| `order_items` | דרך בעלות על ההזמנה | אין |

שאילתות יעד: `getMyOrders` / `getOrderDetail` עם user-scoped client (או admin + filter חובה). אין cancel/refund מהאזור האישי ב-v1.

### 2.3 סטטוסים (תוויות UI)

| מצב נגזר | תווית |
|---|---|
| `pending` | ממתינה לתשלום |
| `paid` / paid on site + balance at merchant | שולמה |
| הושלם / שוחרר | הושלמה |
| קופון נסרק | מומשה |
| `refunded` | זוכתה |
| `cancelled` | בוטלה |

כסף בתצוגה: אגורות → ₪. לשורות קופון תמיד שני מספרים: שולם באתר / לתשלום בבית העסק.

---

## 3. ארנק קופונים (UI)

### 3.1 מקור אמת

| ישות | טבלה | הערה |
|---|---|---|
| קנוני | `vouchers` | הנפקה ב-`issueVoucher` אחרי תשלום |
| מורשת | `coupon_codes` | תצוגה ישנה בלבד; לא לכתיבה חדשה |

עמודות כסף ב-`vouchers`: `face_value_agorot`, `coupon_price_agorot`, `remaining_amount_due_agorot`  
(CHECK: face = coupon_price + remaining_due).  
QR: `qr_payload` + `qr_key_id` (לא `qr_code_url` ישן).

### 3.2 מסך `/account/coupons`

- טאבים: פעיל · נסרק · פג תוקף (+ זוכה אם רלוונטי)
- כרטיס פעיל: שם מוצר, ספק, קוד קריא, שולם באתר, יתרה בעסק, תוקף, **QR גדול** (שרת מרנדר מ-`qr_payload`)
- מומש/פג: בלי QR סריק; חותמת סטטוס
- עותק: `הצגת הקוד בבית העסק. היתרה משולמת שם בזמן הסריקה.`

### 3.3 `/coupon/[id]`

דף תצוגה לקופון בודד (ממייל / deep link):

- Session של הבעלים
- `noindex`
- QR + קוד + שני הסכומים + פרטי בית עסק
- CTA חזרה: לכל הקופונים שלי

### 3.4 כללי QR

1. QR הוא bearer להצגה; חד-פעמיות נאכפת ב-`redeem_voucher` אצל הספק, לא בהסתרת screenshot.
2. אין להטמיע QR כ-`data:` URI במייל (ראה notifications). המייל מקשר לכאן.
3. Offline (PWA/אפליקציה): מותר cache של issued בלבד; wipe ב-logout.

---

## 4. ארנק קאשבק פנימי (כללים)

### 4.1 "Never exits the system"

הארנק הוא **קרדיט אתר בלבד**:

1. אין משיכה לבנק / כרטיס / מזומן.
2. אין העברה למשתמש אחר.
3. אין endpoint למשיכה (החלטת מוצר, לא חוסר פיצ'ר).
4. שימוש יחיד: `apply_wallet` ב-checkout מפחית חיוב Cardcom.
5. תנועות רק דרך `fn_wallet_transfer` תחת service role.
6. Ledger append-only: תיקון = reverse entry, לא UPDATE/DELETE.

עותק UI מחייב:

```
הארנק משמש לתשלום חלקי או מלא באתר.
אין משיכה למזומן ואין העברה למשתמש אחר.
```

### 4.2 טבלאות קנוניות

| טבלה | תפקיד |
|---|---|
| `wallet_accounts` | חשבון אחד למשתמש + חשבונות פלטפורמה |
| `wallet_entries` | יומן double-entry, `idempotency_key UNIQUE` |
| `v_wallet_ledger` | תצוגת לקוח (security_invoker) |
| `v_wallet_balance_drift` | התאמה אדמין (cache מול ledger) |

Deprecated (לא להחיות): `wallets`, `wallet_balances`, `wallet_transactions`.

יעד יתרה: `balance_agorot` integer. עד המרה מלאה: קריאה דרך שכבת המרה; אסור float חדש בנתיב כסף.

חשבונות פלטפורמה: `platform:revenue`, `platform:cashback_reserve`, `platform:adjustments`.

### 4.3 מטריצת תנועות

| אירוע | Debit | Credit | `reason` | `idempotency_key` |
|---|---|---|---|---|
| קאשבק אחרי תשלום | `platform:cashback_reserve` | user | `order_cashback` | `order:{id}:cashback` |
| שימוש בקופה | user | `platform:revenue` | `order_spend` | `order:{id}:spend` |
| החזר (עתידי) | `platform:revenue` | user | `order_refund` | `order:{id}:refund` |
| זיכוי אדמין | `platform:adjustments` | user | `admin_credit` | `adj:{uuid}` |

קאשבק: אחוז מ-**התשלום באתר** (לא מ-face), מצולם ב-`order_items.cashback_amount_agorot` ב-checkout.  
חיוב ארנק: רק אחרי אימות Cardcom ב-finalize (לא ב-beginCheckout בלבד).  
חשבון משתמש לא יורד מתחת לאפס.

### 4.4 מסך `/account/wallet`

- כותרת: הארנק שלי
- יתרה גדולה + רשימת תנועות מ-`v_wallet_ledger`
- תוויות: קאשבק על רכישה · שימוש בארנק · החזר · זיכוי ידני
- אין פעולות כתיבה מה-UI

---

## 5. פרופיל Google

### 5.1 Auth

| רכיב | מיקום |
|---|---|
| כניסה | `signInWithGoogle` · scopes `openid email profile` |
| Callback | `src/app/auth/callback/route.ts` · `exchangeCodeForSession` · מיזוג עגלת אורח |
| Gate | `getUser()` ב-layout / proxy על `/account*` |
| יציאה | `signOut` / `signOutAll` → `/login` |

כפתור: **כניסה עם Google**.

### 5.2 `profiles` אחרי OAuth

`handle_new_user` ממלא מ-`raw_user_meta_data`:

| עמודה | מקור |
|---|---|
| `email` | Google email (read-only ב-UI) |
| `full_name` | `full_name` / `name` |
| `avatar_url` | תמונת Google |
| `phone` | ריק עד שהמשתמש ממלא |

### 5.3 מסך `/account/details`

כותרת: **הפרטים שלי** · שם וטלפון לשימוש בהזמנות.

| שדה | ניתן לעריכה |
|---|---|
| שם מלא | כן |
| טלפון | כן (ולידציית IL) |
| אימייל | לא (OAuth) |
| avatar | שמור ב-DB; תצוגה אופציונלית ב-nav |

Action: `updateProfileDetails` תחת RLS; `role` קפוא.  
הצלחה: `הפרטים נשמרו`.

בנוסף באותו shell (לא Google-ספציפי): כתובות, אמצעי תשלום (last4/brand/expiry בלבד).

---

## 6. מטריצת RLS (תמצית)

| טבלה | SELECT | כתיבת לקוח |
|---|---|---|
| `profiles` | own | own (בלי role) |
| `orders` / `order_items` | own | לא |
| `vouchers` | own | לא |
| `wallet_accounts` / `wallet_entries` | own (דרך views/policies) | לא |
| `payment_tokens` | own, עמודות בטוחות | מחיקה / ברירת מחדל דרך fn |
| `user_addresses` | own | soft delete |

---

## 7. פערים ידועים (ליישור קוד)

| ID | פער | חומרה |
|---|---|---|
| G1 | ~~`coupon_codes`~~ → `vouchers` + QR + טאבים על `feat/personal-area` | נסגר |
| G2 | `/coupon/[id]`: `noindex`, `/login`, CTA ל-`/account/coupons` | נסגר |
| G3 | הזמנות עדיין admin client + filter `user_id` (ארנק/פרופיל/קופונים: RLS) | P1 |
| G4 | תצוגה דרך `money.ts` (Agorot); עמודות wallet/orders עדיין `*_ils` עד 059 | P1 (חלקי) |
| G5 | Logout ב-nav וב-`/account/details` | נסגר |
| G6 | Privacy / notifications routes מה-Identity draft לא מחוברים | P2 |

---

## 8. מחוץ לסקופ

- פאנל אדמין / ספק סורק
- Wishlist / referral UI
- משיכת ארנק / PSP שני
- מסכי שיווק (מסמך notifications marketing)

---

## 9. Acceptance

- [x] Session gate על כל `/account/**` (+ proxy על `/coupon/`)
- [x] הזמנות: רשימה + פרט, בלי כתיבת לקוח
- [x] קופונים מ-`vouchers` עם QR לפעילים בלבד
- [x] ארנק: יתרה + ledger; עותק "לא יוצא מהמערכת"; אין כפתור משיכה
- [x] פרטים: Google email read-only; שם/טלפון נשמרים; avatar
- [x] כסף מוצג מ-agorot דרך `money.ts` (המרה מ-`*_ils` בגבול השאילתה עד 059)

---

## 10. Revision

| Date | Change |
|---|---|
| 2026-08-02 | מסמך מחייב: הזמנות, ארנק קופונים, כללי ארנק agorot/closed-loop, פרופיל Google |
| 2026-08-02 | יישום על `feat/personal-area`: G1/G2/G5 נסגרו, acceptance מסומן |
| 2026-08-06 | QA (מחוץ לחבילת 20): P7 ל-No Escrow; ביטול held לספק |
