# ARCHITECTURE: Mobile Super-App (Expo / React Native)

ארכיטקטורת אפליקציית מובייל עתידית ל-KenyonExpress: **Expo + React Native** על **אותו backend Supabase** כמו ה-web.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי. זה מסמך יעד (future), לא מחייב שיגור day-0.

Companions:

```
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-PWA.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
```

עקרון: **Web = SEO ורכישה ראשונית.** האפ = שימור, Push, ארנק קופונים (תצוגת QR אופליין), סריקת ספק. אין DB נפרד. אין Auth נפרד. אין PSP שני.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| M1 | Client: **Expo** (React Native) + TypeScript + Expo Router. |
| M2 | Backend: **אותו** פרויקט Supabase (Auth, Postgres, RLS, Storage) כמו ה-web. |
| M3 | כסף ו-redeem רק דרך Server Actions / Route Handlers / RPC קיימים. אין service role באפ. |
| M4 | תשלומים: Cardcom דרך שרת Next/Edge בלבד (WebView Low Profile אם נדרש PCI). |
| M5 | ארנק פנימי לא יוצא מהמערכת (אין משיכה / P2P). |
| M6 | קופון: Escrow פנימי 2026-07-27 (שולם באתר + יתרה בעסק; held עד מימוש). |
| M7 | PWA (M0) היא שלב ביניים; לא מחליפה חנויות אפ. |
| M8 | אין Make/Zapier. Push דרך אותו pipeline התראות. |

---

## 1. Super-app: שני מצבים, אפ אחת

| מצב | קהל | יכולות |
|---|---|---|
| Customer | קונים | קטלוג, עגלה, checkout, קופונים+QR, ארנק, הזמנות, Push, פרופיל Google |
| Supplier | `supplier_members` | סורק QR למימוש, היסטוריית סריקות, התראות מכירה (מוגבל; לא פורטל מלא day-1) |

מעבר מצב: אחרי login, אם למשתמש יש חברות ספק פעילה → כניסה למודול Scan. אחרת רק Customer shell.

---

## 2. Stack

| רכיב | בחירה |
|---|---|
| Runtime | Expo (managed / CNG) + EAS Build |
| Navigation | Expo Router (file-based), מקביל לוגית ל-`(store)` / `(account)` |
| Server state | TanStack Query |
| Cart local | store קטן + sync ל-`carts` |
| Auth | `@supabase/supabase-js` + Secure Store לרענון טוקנים |
| QR customer | `react-native-qrcode-svg` על `qr_payload` |
| QR supplier | מצלמה → redeem API |
| Payments | Next/Edge + Cardcom; לא SDK אשראי ילידי עם PAN |
| Push | אותם אירועים כמו notifications; רישום `push_tokens` |
| Brand | ink `#333e48`, yellow `#fed700`, RTL native (`I18nManager`) |

Secrets אסורים באפ:

```
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
CARDCOM_*
CRON_SECRET
VOUCHER_QR_SECRET (שימוש חתימה רק בשרת)
```

מותרים באפ (ציבוריים):

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_APP_URL
```

---

## 3. מודל כסף (זהה ל-web)

| סוג | באתר / באפ | פלטפורמה | ספק |
|---|---|---|---|
| קופון | `coupon_price` (אגורות) | `%` מהמקדמה; יתרת מקדמה ב-held עד מימוש | יתרת face בקופה בסריקה |
| פיזי | מחיר מלא | `%` מצולם ב-`order_items` | ledger / payout |

כללי אפ:

1. מחירים רק מ-API שרת / snapshots. אין חישוב עמלה בקליינט.
2. כסף בחוזים: integer agorot; תצוגה ₪ `he-IL`.
3. אין מסלול תשלום שמעקף את `finalizeOrder` / webhook.

---

## 4. Shared Supabase Auth

| נושא | חוזה |
|---|---|
| Project | URL + anon key זהים ל-web |
| Provider | Google OAuth (Sign in with Apple בהמשך אם החנות דורשת) |
| Session | JWT של אותו project; RLS זהה |
| Gate | account/checkout דורשים session; browse לאורח מותר |
| Cart merge | אחרי login, כמו `mergeGuestCart` ב-web |
| Logout | מוחק session + cache קופונים מקומי |

```text
Google sign-in (Expo Auth Session / native)
  → Supabase session
  → אותם profiles / wallet_accounts / vouchers / orders
  → קריאות עם user JWT תחת RLS
```

אין טבלת users נפרדת. אין סיסמה כמסלול ראשי באפ.

---

## 5. מפת מסכים (IA)

### 5.1 Customer

```text
/(app)
  /                 Home
  /category/[slug]  Category
  /product/[slug]   PDP
  /cart             Cart
  /checkout         Checkout (server-backed)
  /account          Overview
  /account/orders
  /account/coupons  QR wallet
  /account/wallet
  /account/details
```

### 5.2 Supplier (מוגבל)

```text
/(supplier)
  /scan             Camera redeem
  /scan/history     Recent redemptions
```

Deep links:

```text
kenyonexpress://checkout
kenyonexpress://coupons
kenyonexpress://coupon/{voucherId}
kenyonexpress://orders/{orderId}
kenyonexpress://scan
```

Universal Links / App Links לאותם נתיבי web כשאפשר (SEO נשאר ב-web).

---

## 6. Coupon QR wallet (offline display)

### 6.1 מטרה

לקוח בקופה בלי קליטה יכול **להציג** QR/קוד. המימוש עצמו תמיד אונליין אצל הספק.

### 6.2 Cache מקומי (`issued` בלבד)

| שדה | מקור |
|---|---|
| `voucher_id` | `vouchers.id` |
| `code` | קוד קריא |
| `qr_payload` | מחרוזת לרינדור |
| `product_name_he` | snapshot |
| `supplier_name` | snapshot |
| `coupon_price_agorot` | שולם באתר |
| `remaining_due_agorot` | יתרה בעסק |
| `expires_at` | תוקף |
| `synced_at` | זמן סנכרון |

Wipe: logout, או כשהסטטוס בשרת כבר לא `issued`.

### 6.3 רינדור ו-sync

- `react-native-qrcode-svg` על `qr_payload` (לא URL תמונה משרת כמקור אמת)
- בהירות מסך מוגברת בזמן הצגת QR
- באנר "מצב לא מקוון" כשאין רשת
- Foreground / Push `coupon.issued` → delta sync
- Redeem הצלחה → מסיר QR מקומית
- אין redeem מהאפ של הלקוח

ספק קורא ל-

```
POST /api/supplier/vouchers/redeem
```

(או RPC מקביל) עם JWT של חבר ספק.

---

## 7. Checkout באפ

```text
Cart (local + server carts)
  → begin_checkout (server)
  → Cardcom Low Profile (WebView / system browser)
  → return URL / deep link
  → finalize / webhook (server, זהה ל-web)
  → vouchers issued → sync QR wallet + Push
```

האפ לא מאשרת תשלום לבד. אין כפל `finalizeOrder`.

---

## 8. Push notifications

רישום:

```text
push_tokens (user_id, platform ios|android, token, updated_at)
UNIQUE (user_id, token) או (user_id, platform)
```

| אירוע | לקוח | ספק | Deep link |
|---|---|---|---|
| רכישת קופון | כן | אופציונלי "נמכר" | `kenyonexpress://coupon/{id}` |
| מימוש | אישור | סיכום סריקה | coupons / scan history |
| פקיעה 48ש | כן | לא | coupons |
| הזמנה פיזית | סטטוס (עתידי) | להכין משלוח | supplier |

Transactional push לא תלוי ב-marketing opt-in. בקשת הרשאה אחרי ערך (אחרי רכישה / כניסה לארנק), לא ב-cold start אגרסיבי.

Pipeline: אותו worker כמו

```
docs/ARCHITECTURE-NOTIFICATIONS.md
```

---

## 9. מודול ספק

- Gate: `supplier_members.is_active` + role `owner|manager|scanner`
- מצלמה → payload/code → redeem
- תוצאות: הצלחה / כבר מומש / פג / לא שייך / rate limited
- אין גישה לנתוני לקוח מעבר למה שה-redeem מחזיר
- אטומיות ו-replay: לפי Fraud Prevention

---

## 10. אבטחה

| כלל | פירוט |
|---|---|
| RLS | גבול יחיד; anon key בלבד בקליינט |
| Secrets | אין service/Cardcom/Resend באפ |
| Biometrics | אופציונלי לכניסה חוזרת; לא תחליף ל-Google בפעם הראשונה |
| Pinning | הערכה אחרי M2; לא חוסם day-0 |
| Account deletion | לפי legal / web flow |
| Offline | תצוגת QR בלבד; לא redeem מקומי |

---

## 11. שלבי מסירה

| Phase | Scope | Exit |
|---|---|---|
| M0 | PWA (ביניים) | ארנק קופונים בדפדפן |
| M1 | Expo: catalog + account + Google + vouchers QR offline cache | TestFlight / internal |
| M2 | Checkout Cardcom + wallet read + push registration | קניית קופון בדיקה |
| M3 | Supplier scanner + push (purchase, redeem, 48h) | redeem e2e |
| M4 | Physical ship status + polish | soft public |

חנויות: App Store + Google Play (ישראל). מדיניות זהה ל-web.

---

## 12. טסטים

| # | תרחיש |
|---|---|
| MA1 | Guest → Google → purchase coupon → QR על המכשיר |
| MA2 | Airplane: QR מוצג; redeem מהספק נכשל בנימוס בלי רשת |
| MA3 | אותו Supabase user רואה אותם vouchers ב-web ובאפ |
| MA4 | Supplier scan success + replay → `already_used` |
| MA5 | Push expiry 48h + deep link לארנק |
| MA6 | אין service role / Cardcom secret ב-binary (בדיקת סריקה) |

---

## 13. מה לא בונים

- DB מובייל נפרד / Auth נפרד
- חישוב עמלה בקליינט
- משיכת ארנק
- Make/Zapier ל-push
- רשת שליחים כתלות שיגור
- החלפת ה-web כערוץ SEO

---

## 14. Related

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-E2E-TESTING.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
```

---

## 15. Revision

| Date | Change |
|---|---|
| 2026-07-31 | רענון + שלבי M0–M4 |
| 2026-08-02 | Expo RN, shared Supabase, QR offline, push; Escrow 2026-07-27 |
| 2026-08-03 | Super-app framing על `arch/docs-queue`; docs only |
