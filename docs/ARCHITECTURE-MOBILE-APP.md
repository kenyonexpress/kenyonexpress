# ARCHITECTURE: Mobile App (Expo)

ארכיטקטורת אפליקציית מובייל ל-KenyonExpress: **Expo + React Native** על **אותו backend Supabase** כמו ה-web.

Status: **BINDING** · Updated: 2026-08-03 (rev B)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).  
זה מסמך יעד (future). PWA היא שלב ביניים; ה-web נשאר ערוץ SEO.

Companions:

```
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-PWA.md
```

עקרון: **Web = SEO ורכישה ראשונית.** האפ = שימור, Push, ארנק קופונים (תצוגת QR אופליין), Apple/Google Wallet, סריקת ספק. אין DB נפרד. אין Auth נפרד. אין PSP שני.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| M1 | Client: **Expo** (React Native) + TypeScript + Expo Router. |
| M2 | Backend: **אותו** פרויקט Supabase (Auth, Postgres, RLS, Storage) כמו ה-web. |
| M3 | כסף ו-redeem רק דרך Server Actions / Route Handlers / RPC. אין service role באפ. |
| M4 | תשלומים: Cardcom דרך שרת Next/Edge בלבד (WebView Low Profile אם נדרש PCI). |
| M5 | ארנק כסף פנימי לא יוצא מהמערכת (אין משיכה / P2P). |
| M6 | קופון: Escrow פנימי 2026-07-27 (שולם באתר + יתרה בעסק; held עד מימוש). |
| M7 | PWA (M0) היא שלב ביניים; לא מחליפה חנויות אפ. |
| M8 | Push + Wallet pass updates דרך אותו pipeline ב-`ARCHITECTURE-NOTIFICATIONS.md`. אין Make/Zapier. |
| M9 | RTL native מההתחלה (`I18nManager` / config), לא רק סטייל אחרי paint. |

---

## 1. המלצה מנומקת: Expo / React Native מול PWA

### 1.1 הכרעה

| שלב | בחירה | תפקיד |
|---|---|---|
| עכשיו עד soft-open | **PWA על ה-web הקיים** (M0) | ארנק קופונים בדפדפן, install prompt, בלי חנות |
| יעד מוצר (שימור + ספק) | **Expo + React Native** (M1+) | אפ בחנויות, Push אמין, מצלמת ספק, Wallet passes |
| תמיד | **Web Next.js** | SEO, רכישה ראשונית, אינדוקס |

**אין לבחור PWA כתחליף קבוע לאפ.** PWA היא גשר. האפ הנייטיבית היא היעד לשימור ולסריקת ספק.

### 1.2 למה לא PWA בלבד

| דרישה עסקית | PWA | Expo RN |
|---|---|---|
| SEO / שיתוף לינקים | מצוין (זה ה-web) | חלש כערוץ ראשי; לא מחליף |
| Push ב-iOS | מוגבל/שביר לפי גרסת Safari והתקנה | APNs יציב דרך Expo |
| מצלמת ספק ל-redeem בקופה | הרשאות דפדפן לא אמינות בשטח | הרשאות native + UX סריקה |
| QR בהיר מסך / offline cache | אפשרי חלקית (SW) | MMKV/SQLite + brightness API |
| Apple/Google Wallet | קישורי web | אותו שרת + UX התקנה טוב יותר באפ |
| נוכחות ב-App Store / Play (ישראל) | אין | חובה לשיווק/אמון אצל ספקים רבים |
| עלות time-to-market | נמוכה (כבר יש Next) | גבוהה יותר (EAS, חנויות, ביקורת) |

מסקנה: PWA נותנת 80% מארנק הלקוח בזול, ונכשלת בדיוק במה שהספק והשימור דורשים (סריקה + push + חנויות).

### 1.3 למה Expo ולא RN "נקי" / Flutter

1. אותו אקוסיסטם React כמו ה-web; שיתוף חוזי TypeScript / validation קל יותר.  
2. EAS Build + OTA לעדכוני JS בלי מחזור חנות מלא לכל תיקון UI.  
3. Auth Session / Secure Store / Camera מודולים בשלים ל-Google + QR.  
4. אין DB שני ואין Auth שני: אותו Supabase project.

Flutter נדחה: צוות ושפה נפרדים בלי יתרון כספי ברור למוצר קופונים.

### 1.4 סדר מסירה (מחייב)

```text
M0  PWA (web)     → ארנק קופונים בדפדפן, בלי לחסום SEO
M1  Expo customer → catalog + Google + QR offline
M2  Checkout      → Cardcom WebView + push registration
M3  Supplier scan → מצלמה + push lifecycle
M4  Soft public   → חנויות + polish
```

כל עוד M0 לא חי, אין להתחיל M3. אין לבנות אפ שכפולת קטלוג SEO במקום ה-web.

---

## 2. שני מצבים, אפ אחת

| מצב | קהל | יכולות |
|---|---|---|
| Customer | קונים | קטלוג, עגלה, checkout, קופונים+QR, ארנק כסף, הזמנות, Push, Wallet passes, פרופיל Google |
| Supplier | `supplier_members` | סורק QR למימוש, היסטוריית סריקות, התראות מכירה (מוגבל; לא פורטל מלא day-1) |

מעבר מצב: אחרי login, אם יש חברות ספק פעילה → מודול Scan. אחרת רק Customer shell.

---

## 3. Stack

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
| Push | APNs/FCM דרך worker ההתראות; טבלת `push_tokens` |
| Wallet passes | קישורי PassKit / Google Wallet מהשרת (אותם אירועי lifecycle) |
| Brand | ink `#333e48`, yellow `#fed700`, Heebo או מותג תואם |

Secrets אסורים באפ:

```
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
CARDCOM_*
CRON_SECRET
VOUCHER_QR_SECRET
APPLE_WALLET_* private keys
GOOGLE_WALLET_SERVICE_ACCOUNT_JSON
META_WA_TOKEN
```

מותרים באפ (ציבוריים):

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_APP_URL
```

---

## 4. מודל כסף (זהה ל-web)

| סוג | באתר / באפ | פלטפורמה | ספק |
|---|---|---|---|
| קופון | `coupon_price` (אגורות) | `%` מהמקדמה; יתרת מקדמה ב-held עד מימוש | יתרת face בקופה בסריקה |
| פיזי | מחיר מלא | `%` מצולם ב-`order_items` | ledger / payout |

כללי אפ:

1. מחירים רק מ-API שרת / snapshots. אין חישוב עמלה בקליינט.  
2. כסף בחוזים: integer agorot; תצוגה ₪ `he-IL`.  
3. אין מסלול תשלום שמעקף את `finalizeOrder` / webhook.  
4. תצוגת קופון תמיד מציגה **שולם באתר** + **יתרה בעסק** (בלי נוסח Escrow/נאמן).

---

## 5. Shared Supabase Auth

| נושא | חוזה |
|---|---|
| Project | URL + anon key זהים ל-web |
| Provider | Google OAuth (Sign in with Apple בהמשך אם החנות דורשת) |
| Session | JWT של אותו project; RLS זהה |
| Gate | account/checkout דורשים session; browse לאורח מותר |
| Cart merge | אחרי login, כמו `mergeGuestCart` ב-web |
| Logout | מוחק session + cache קופונים מקומי + tokens מקומיים לא רגישים |

```text
Google sign-in (Expo Auth Session / native)
  → Supabase session
  → אותם profiles / wallet_accounts / vouchers / orders
  → קריאות עם user JWT תחת RLS
```

אין טבלת users נפרדת. אין סיסמה כמסלול ראשי באפ.

---

## 6. מפת מסכים (IA)

### 6.1 Customer

```text
/(app)
  /                 Home
  /category/[slug]  Category
  /product/[slug]   PDP
  /cart             Cart
  /checkout         Checkout (server-backed)
  /account          Overview
  /account/orders
  /account/coupons  QR wallet (offline display)
  /account/wallet   Internal cash wallet (read)
  /account/details
```

### 6.2 Supplier (מוגבל)

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
kenyonexpress://wallet
kenyonexpress://scan
```

Universal Links / App Links לאותם נתיבי web כשאפשר (SEO נשאר ב-web).

---

## 7. Coupon QR wallet (offline display)

### 7.1 מטרה

לקוח בקופה בלי קליטה יכול **להציג** QR/קוד. המימוש עצמו תמיד אונליין אצל הספק.

### 7.2 Cache מקומי (`issued` בלבד)

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

Storage: MMKV / SecureStore + SQLite קל לפי רגישות. `qr_payload` לא נשלח ללוגים.

### 7.3 רינדור ו-sync

- `react-native-qrcode-svg` על `qr_payload` (לא URL תמונה משרת כמקור אמת)  
- בהירות מסך מוגברת בזמן הצגת QR  
- באנר "מצב לא מקוון" כשאין רשת  
- Foreground / Push `coupon_issued` → delta sync  
- Redeem הצלחה → מסיר QR מקומית  
- אין redeem מהאפ של הלקוח  

ספק קורא ל-

```
POST /api/supplier/vouchers/redeem
```

(או RPC מקביל) עם JWT של חבר ספק.

### 7.4 הוספה לארנק המכשיר

CTA באפ: "הוסף ל-Apple Wallet / Google Wallet".  
האפ פותחת URL חתום מהשרת (PassKit / Google Save).  
עדכוני סטטוס (מומש/פג) מגיעים כ-`wallet_push` מה-worker (ראה NOTIFICATIONS). האפ לא חותמת passes בעצמה.

---

## 8. Checkout באפ

```text
Cart (local + server carts)
  → begin_checkout (server)
  → Cardcom Low Profile (WebView / system browser)
  → return URL / deep link
  → finalize / webhook (server, זהה ל-web)
  → vouchers issued → sync QR wallet + Push + optional Wallet pass
```

האפ לא מאשרת תשלום לבד. אין כפל `finalizeOrder`.

---

## 9. Push notifications

רישום:

```text
push_tokens (user_id, platform ios|android, token, updated_at)
UNIQUE (user_id, token) או (user_id, platform)
```

| אירוע | לקוח | ספק | Deep link |
|---|---|---|---|
| רכישת קופון / הנפקה | כן | אופציונלי "נמכר" | `kenyonexpress://coupon/{id}` |
| מימוש | אישור | סיכום סריקה | coupons / scan history |
| פקיעה 48ש | כן | לא | coupons |
| קופון פג | כן | לא | coupons |
| פעילות ארנק כסף | לפי prefs | לא | wallet |
| הזמנה פיזית | סטטוס (עתידי) | להכין משלוח | supplier |

Transactional push לא תלוי ב-marketing opt-in.  
בקשת הרשאה אחרי ערך (אחרי רכישה / כניסה לארנק), לא ב-cold start אגרסיבי.  
Pipeline: אותו worker כמו

```
docs/ARCHITECTURE-NOTIFICATIONS.md
```

ערוצים נוספים (מייל / WhatsApp / SMS) לא מיושמים באפ; הם בשרת.

---

## 10. ארנק כסף פנימי (קריאה)

- מסך יתרה + ledger (קריאה בלבד תחת RLS)  
- אין משיכה, אין העברה למשתמש אחר  
- Push `wallet_activity` לפי העדפות  
- אותם `wallet_accounts` כמו ב-web  

---

## 11. מודול ספק

- Gate: `supplier_members.is_active` + role `owner|manager|scanner`  
- מצלמה → payload/code → redeem  
- תוצאות: הצלחה / כבר מומש / פג / לא שייך / rate limited  
- אין גישה לנתוני לקוח מעבר למה שה-redeem מחזיר  
- אטומיות ו-replay: לפי מדיניות fraud / redemption  

---

## 12. אבטחה

| כלל | פירוט |
|---|---|
| RLS | גבול יחיד; anon key בלבד בקליינט |
| Secrets | אין service/Cardcom/Resend/Wallet private keys באפ |
| Biometrics | אופציונלי לכניסה חוזרת; לא תחליף ל-Google בפעם הראשונה |
| Pinning | הערכה אחרי M2; לא חוסם day-0 |
| Account deletion | לפי legal / web flow |
| Offline | תצוגת QR בלבד; לא redeem מקומי |

---

## 13. שלבי מסירה

| Phase | Scope | Exit |
|---|---|---|
| M0 | PWA (ביניים) | ארנק קופונים בדפדפן |
| M1 | Expo: catalog + account + Google + vouchers QR offline cache | TestFlight / internal |
| M2 | Checkout Cardcom + wallet read + push registration | קניית קופון בדיקה |
| M3 | Supplier scanner + push (purchase, redeem, 48h) + Wallet pass CTA | redeem e2e |
| M4 | Physical ship status + polish | soft public |

חנויות: App Store + Google Play (ישראל). מדיניות זהה ל-web.

---

## 14. טסטים

| # | תרחיש |
|---|---|
| MA1 | Guest → Google → purchase coupon → QR על המכשיר |
| MA2 | Airplane: QR מוצג; redeem מהספק נכשל בנימוס בלי רשת |
| MA3 | אותו Supabase user רואה אותם vouchers ב-web ובאפ |
| MA4 | Supplier scan success + replay → `already_used` |
| MA5 | Push expiry 48h + deep link לארנק קופונים |
| MA6 | הוספה ל-Apple/Google Wallet + עדכון אחרי redeem |
| MA7 | אין service role / Cardcom secret ב-binary (סריקת build) |

---

## 15. מה לא בונים

- DB מובייל נפרד / Auth נפרד  
- חישוב עמלה בקליינט  
- משיכת ארנק  
- Make/Zapier ל-push  
- רשת שליחים כתלות שיגור  
- החלפת ה-web כערוץ SEO  
- חתימת PassKit בתוך האפ  

---

## 16. Related

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
```

---

## 17. Revision

| Date | Change |
|---|---|
| 2026-07-31 | רענון + שלבי M0 עד M4 |
| 2026-08-02 | Expo RN, shared Supabase, QR offline, push; Escrow 2026-07-27 |
| 2026-08-03 | יישור ל-notifications lifecycle + Wallet pass CTA; docs-only ב-`ke-arch` |
| 2026-08-03 | rev B: המלצה מנומקת Expo/RN מול PWA (PWA=M0 גשר; Expo=יעד שימור+ספק) |
