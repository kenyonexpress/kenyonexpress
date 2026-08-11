# ארכיטקטורה: אזור אישי (`/account/**`)

מסכי לקוח מחובר: הזמנות, קופונים (`vouchers`), וארנק קאשבק פנימי. זהות ו-session ב-
`ARCHITECTURE-ACCOUNT-IDENTITY.md`
. ארנק לעומק ב-
`ARCHITECTURE-ACCOUNT-WALLET.md`
.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #21/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-ACCOUNT-IDENTITY.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-CART-GUEST.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. מקדמת קופון באתר נשארת אצל הפלטפורמה. יתרה בבית העסק מחוץ לפלטפורמה. אין held לספק.

Stack: Next.js App Router `(account)`, Server Components + Server Actions, Supabase Auth + RLS, כסף באגורות (integer), RTL + Heebo.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| PA1 | כל `/account/**` דורש session. אורח → `/login?next=...`. |
| PA2 | כניסה ראשית: Google OAuth. OTP/גיבוי לפי IDENTITY. |
| PA3 | RLS הוא הגבול. קריאות לקוח עם user client; `adminClient` רק עם `.eq('user_id', uid)` מתועד. |
| PA4 | קופונים בתצוגה חדשה = `vouchers` (לא כתיבה ל-`coupon_codes`). Alias: `/account/vouchers` → `/account/coupons`. |
| PA5 | ארנק = קרדיט פנימי בלבד. אין משיכה, אין P2P, אין זיכוי כרטיס מהארנק. |
| PA6 | כסף ב-DB/domain: integer agorot. UI: ₪ ב-`he-IL`, `Asia/Jerusalem`. |
| PA7 | קופון: במייל ובמסך מופיעים שולם באתר + יתרה בבית העסק. פיזי לפי `platform_percent` פר מוצר (snapshot). |
| PA8 | אין PAN/CVV. `payment_tokens.cardcom_token` לא ב-SELECT ל-`authenticated`. |
| PA9 | התנתקות בניווט וב-`/account/details`. אחרי logout → `/login`. |
| PA10 | אין cancel/refund מהאזור האישי ב-v1. |

---

## 1. מפת מידע (IA)

```text
(account)/layout.tsx     getUser() gate + AccountNav + shell
  /account               סקירה
  /account/orders        היסטוריית הזמנות
  /account/orders/[id]   פרטי הזמנה (+ קופונים/QR שלה)
  /account/coupons       ארנק קופונים (טאבים + QR)
  /account/wallet        ארנק קאשבק פנימי
  /account/details       פרופיל / פרטים
  /account/addresses     כתובות למשלוח
  /account/tokens        כרטיסים שמורים (last4 בלבד)
```

| href | תווית |
|---|---|
| `/account` | סקירה |
| `/account/orders` | ההזמנות שלי |
| `/account/coupons` | הקופונים שלי |
| `/account/wallet` | הארנק שלי |
| `/account/details` | הפרטים שלי |
| `/account/addresses` | כתובות |
| `/account/tokens` | אמצעי תשלום |

Badge על הארנק: יתרה מעוצבת. דף קופון בודד (מחוץ ל-nav): `/coupon/[id]` (`noindex`).

---

## 2. הזמנות

| Route | תוכן |
|---|---|
| `/account/orders` | עד 50 שורות: תאריך, סטטוס, סכום ששולם באתר, סימון "כולל קופונים", CTA פרטים |
| `/account/orders/[id]` | סיכום, שורות, שולם מהארנק, סך שולם באתר, יתרה בבית העסק לשורות קופון, קישור/QR |

ריק: `עוד לא ביצעת הזמנות.`

| טבלה | SELECT ללקוח | כתיבה |
|---|---|---|
| `orders` | `user_id = auth.uid()` | אין (checkout/webhook בשרת) |
| `order_items` | דרך בעלות על ההזמנה | אין |

שאילתות יעד: `getMyOrders` / `getOrderDetail` עם user-scoped client.

| מצב נגזר | תווית UI |
|---|---|
| `pending` | ממתינה לתשלום |
| `paid` | שולמה |
| הושלם / שוחרר | הושלמה |
| קופון נסרק | מומשה |
| `refunded` | זוכתה |
| `cancelled` | בוטלה |

לשורות קופון תמיד שני מספרים: שולם באתר / לתשלום בבית העסק (מ-snapshots, לא חישוב חי ממוצר).

---

## 3. קופונים (UI)

| ישות | טבלה | הערה |
|---|---|---|
| קנוני | `vouchers` | הנפקה אחרי תשלום מאומת |
| מורשת | `coupon_codes` | תצוגה ישנה בלבד; לא לכתיבה חדשה |

עמודות כסף: `face_value_agorot`, `coupon_price_agorot`, `remaining_amount_due_agorot`  
(CHECK: face = coupon_price + remaining_due).  
QR: `qr_payload` + `qr_key_id`.

### `/account/coupons`

- טאבים: פעיל · נסרק · פג תוקף (+ זוכה אם רלוונטי)
- פעיל: שם, ספק, קוד, שולם באתר, יתרה בעסק, תוקף, QR גדול (שרת מ-`qr_payload`)
- מומש/פג: בלי QR סריק; חותמת סטטוס
- עותק: `הצגת הקוד בבית העסק. היתרה משולמת שם בזמן הסריקה.`

### `/coupon/[id]`

Session של הבעלים, QR + שני הסכומים + פרטי בית עסק, CTA חזרה ל-`/account/coupons`.

### כללי QR

1. QR הוא bearer להצגה; חד-פעמיות ב-`redeem_voucher` אצל הספק.
2. אין להטמיע QR כ-`data:` URI במייל (ראה notifications).
3. Offline (PWA): cache של issued בלבד; wipe ב-logout.

---

## 4. ארנק קאשבק (כללי UI)

הארנק הוא **קרדיט אתר בלבד**:

1. אין משיכה לבנק / כרטיס / מזומן.
2. אין העברה למשתמש אחר.
3. שימוש יחיד: `apply_wallet` ב-checkout מפחית חיוב Cardcom.
4. תנועות רק דרך `fn_wallet_transfer` (service role).
5. Ledger append-only: תיקון = reverse entry.

עותק UI מחייב:

```text
הארנק משמש לתשלום חלקי או מלא באתר.
אין משיכה למזומן ואין העברה למשתמש אחר.
```

| טבלה | תפקיד |
|---|---|
| `wallet_accounts` | חשבון משתמש + חשבונות פלטפורמה |
| `wallet_entries` | יומן double-entry, `idempotency_key UNIQUE` |
| `v_wallet_ledger` | תצוגת לקוח |

Deprecated: `wallets`, `wallet_balances`, `wallet_transactions`.

מסך `/account/wallet`: יתרה גדולה + תנועות מ-`v_wallet_ledger`. אין כתיבה מה-UI.

קאשבק: אחוז מ-**התשלום באתר** (לא מ-face), מצולם ב-checkout. חיוב ארנק רק אחרי אימות Cardcom ב-finalize.

---

## 5. פרופיל ואמצעי תשלום

| רכיב | מיקום |
|---|---|
| כניסה | לפי IDENTITY (Google / OTP) |
| Callback | `/auth/callback` · מיזוג עגלה → CART-GUEST |
| Gate | `getUser()` ב-layout / proxy על `/account*` |
| יציאה | `signOut` → `/login` |

`/account/details`: שם וטלפון ניתנים לעריכה; אימייל OAuth לקריאה בלבד; `role` קפוא.

`/account/tokens`: `last4` / brand / expiry בלבד. הוספת כרטיס רק דרך Cardcom Low Profile (לא טופס PAN אצלנו).

---

## 6. RLS (תמצית)

| טבלה | SELECT | כתיבת לקוח |
|---|---|---|
| `profiles` | own | own (בלי role) |
| `orders` / `order_items` | own | לא |
| `vouchers` | own | לא |
| `wallet_*` | own (views/policies) | לא |
| `payment_tokens` | own, עמודות בטוחות | מחיקה / ברירת מחדל דרך fn |
| `user_addresses` | own | soft delete |

---

## 7. Acceptance

- [ ] Session gate על כל `/account/**` (+ proxy על `/coupon/`)
- [ ] הזמנות: רשימה + פרט, בלי כתיבת לקוח
- [ ] קופונים מ-`vouchers` עם QR לפעילים בלבד; שני סכומים
- [ ] ארנק: יתרה + ledger; עותק "לא יוצא מהמערכת"; אין כפתור משיכה
- [ ] פרטים: email read-only; שם/טלפון נשמרים
- [ ] כסף מוצג מ-agorot דרך שכבת `money`
- [ ] No Escrow בנוסח ובמספרים (אין "מוחזק לספק")

מחוץ לסקופ: אדמין/סורק ספק, wishlist, משיכת ארנק, שיווק.

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-02 | מסמך מחייב ראשון: הזמנות, קופונים, ארנק, Google |
| 2026-08-06 | QA: P7 ל-No Escrow |
| 2026-08-12 | batch #21: ריענון BINDING ממוקד על arch/docs-batch-2 |
