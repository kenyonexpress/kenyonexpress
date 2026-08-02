# ARCHITECTURE: Mobile App (Expo)

ארכיטקטורת אפליקציית מובייל ל-KenyonExpress.

Status: **BINDING** · Updated: 2026-08-02  
Scope: docs only.  
Web נשאר ערוץ SEO; האפליקציה = שימור, Push, ארנק קופונים אופליין-לתצוגה, סריקת ספק.

Companions:

```
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-PWA.md
```

Stack יעד:

| רכיב | בחירה |
|---|---|
| Client | **Expo** (React Native) + TypeScript |
| Auth / DB | **אותו** פרויקט Supabase כמו ה-web |
| Payments | Cardcom דרך שרת Next/Edge בלבד (לא סודות באפ) |
| Notifications | אותו pipeline (Resend/WhatsApp/push) |
| QR | `react-native-qrcode-svg` / מצלמה לספק |

אין DB נפרד. אין Make/Zapier. אין PSP שני.

---

## 0. מטרה ושני מצבים

1. **לקוח:** קטלוג, עגלה, תשלום, קופונים+QR, ארנק, הזמנות, Push.
2. **ספק (מוגבל):** סורק QR למימוש + היסטוריית סריקות (`supplier_members` בלבד).

PWA היא שלב ביניים (M0). האפליקציה הנייטיבית לא מחליפה אינדוקס.

---

## 1. מודל כסף (זהה ל-web)

מודל Escrow 2026-07-27:

| סוג | באתר / באפ | פלטפורמה | ספק |
|---|---|---|---|
| קופון | `coupon_price` (אגורות) | `platform_percent` מהמקדמה; יתרת המקדמה ב-held עד מימוש | יתרת face בקופה בסריקה |
| פיזי | מחיר מלא באתר | `platform_percent` מצולם | יתרה ב-ledger / payout |

כללי אפליקציה:

1. מחירים רק מ-API שרת / snapshots. אין חישוב עמלה בקליינט.
2. ארנק פנימי בלבד; **לא יוצא מהמערכת** (אין משיכה).
3. כסף: integer agorot בחוזים; תצוגה ₪.

---

## 2. Expo + React Native

### 2.1 בחירת פלטפורמה

- Expo managed (או CNG) עם EAS Build ל-iOS/Android.
- ניווט: Expo Router (file-based), מקביל לוגית ל-`(account)` / store routes.
- State: TanStack Query לשרת; store קטן לעגלה מקומית.
- RTL: כפיית RTL ברמת ה-native (`I18nManager` / config), לא רק CSS אחרי paint.
- פונט: Heebo או מותג תואם; CTA `#fed700`, ink `#333e48`.

### 2.2 מבנה מודולים

| מודול | הערות |
|---|---|
| Home / Category / PDP | אותם חוזי מחיר כמו web |
| Cart | sync ל-`carts` + אופטימיסטי מקומי |
| Checkout | Server Actions / Route Handlers; WebView ל-Cardcom Low Profile אם נדרש PCI |
| Vouchers | רשימה + QR גדול (אופליין לתצוגה) |
| Wallet | יתרה + ledger (קריאה בלבד) |
| Account | Google profile, tokens (last4), התנתקות |
| Supplier scan | מצלמה → redeem API |
| Push | רישום token + deep links |

### 2.3 Deep links

```
kenyonexpress://checkout
kenyonexpress://coupons
kenyonexpress://coupon/{voucherId}
kenyonexpress://orders/{orderId}
```

Universal Links / App Links לאותם נתיבי web כשאפשר.

---

## 3. Shared Supabase Auth

עקרון: **פרויקט Auth אחד** ל-web ולמובייל. אין טבלת users נפרדת.

| נושא | חוזה |
|---|---|
| Provider | Google OAuth (Sign in with Apple בהמשך אם חנות דורשת) |
| SDK | `@supabase/supabase-js` + Secure Store לרענון טוקנים |
| Session | JWT של אותו project URL / anon key כמו web |
| Gate | מסכי account/checkout דורשים session; browse לאורח מותר |
| מיזוג עגלה | אחרי login, כמו `mergeGuestCart` ב-web |
| RLS | אותן policies; האפליקציה אף פעם לא מחזיקה service role |
| Logout | מוחק session + cache קופונים מקומי |

זרימה:

```text
Google sign-in (Expo Auth Session / native)
  → Supabase session
  → אותם profiles / wallet_accounts / vouchers
  → קריאות עם user JWT תחת RLS
```

אין סיסמה כמסלול ראשי באפ (legacy web לסגירה ב-UX).

---

## 4. Coupon QR wallet (offline)

### 4.1 מטרה

לקוח בקופה בלי קליטה עדיין יכול **להציג** QR/קוד. המימוש עצמו תמיד אונליין אצל הספק.

### 4.2 מודל נתונים מקומי

Cache (MMKV / SecureStore + SQLite קל) לרשומות `issued` בלבד:

| שדה | מקור |
|---|---|
| `voucher_id` | `vouchers.id` |
| `code` | קוד קריא |
| `qr_payload` | מחרוזת לחתימה / רינדור |
| `product_name_he` | snapshot |
| `supplier_name` | snapshot |
| `coupon_price_agorot` | שולם באתר |
| `remaining_due_agorot` | יתרה בעסק |
| `expires_at` | תוקף |
| `synced_at` | זמן סנכרון |

Wipe: logout, או כשהסטטוס בשרת כבר לא `issued`.

### 4.3 רינדור

- `react-native-qrcode-svg` על `qr_payload` (לא URL תמונה משרת).
- בהירות מסך מוגברת בזמן הצגת QR.
- באנר "מצב לא מקוון" כשאין רשת; הנתונים מרגע הסנכרון האחרון.

### 4.4 Sync

| אירוע | פעולה |
|---|---|
| Foreground / פתיחת ארנק | delta sync מ-`vouchers` של המשתמש |
| Push `coupon.issued` / `coupon_delivered` | משוך את השובר החדש |
| Redeem הצלחה (אונליין) | מסמן מקומית נסרק; מסיר QR |
| Airplane + Redeem | האפ מסרבת בנימוס; הסורק של הספק הוא האמת |

אין redeem מהאפ של הלקוח. ספק בלבד קורא ל-

```
POST /api/supplier/vouchers/redeem
```

(או RPC מקביל) עם JWT של חבר ספק.

---

## 5. Push notifications

### 5.1 ערוץ

אותו worker של notifications (ערוץ `push`), לא Zapier/Make.  
רישום:

```
push_tokens (user_id, platform ios|android, token, updated_at)
```

UNIQUE על `(user_id, token)` או `(user_id, platform)`.

### 5.2 אירועים

| אירוע | Push ללקוח | Push לספק | Deep link |
|---|---|---|---|
| רכישת קופון / הנפקה | כן | אופציונלי "נמכר" | `kenyonexpress://coupon/{id}` |
| מימוש | אישור | סיכום סריקה | הזמנות / היסטוריית סריקות |
| פקיעה 48ש | כן | לא | ארנק קופונים |
| הזמנה פיזית | סטטוס (עתידי) | להכין משלוח | פורטל ספק |

Transactional push לא תלוי ב-marketing opt-in; עדיין מכבד suppression / העדפות expiry.

### 5.3 הרשאות UX

- בקשת הרשאה אחרי ערך (אחרי רכישה ראשונה / כניסה לארנק), לא ב-cold start האגרסיבי.
- כבוי מערכת → אין crash; in-app bell יכול להישען על `notifications_outbox` channel `inapp` כשקיים.

---

## 6. מודול ספק (תמצית)

- Gate: `supplier_members.is_active` + role `owner|manager|scanner`.
- מסך מצלמה → payload/code → redeem.
- תוצאות: הצלחה / כבר מומש / פג / לא שייך / rate limited.
- אין גישה לנתוני לקוח מעבר למה שה-redeem מחזיר.

---

## 7. אבטחה

- אין service role / Resend / Cardcom secrets באפ.
- Biometrics לכניסה חוזרת (אופציונלי); לא תחליף ל-Google בפעם הראשונה.
- Certificate pinning: הערכה אחרי M2, לא חוסם day-0.
- מחיקת חשבון: לפי legal / account deletion ב-web.

---

## 8. שלבי מסירה

| Phase | Scope | Exit |
|---|---|---|
| M0 | PWA (ביניים) | ארנק קופונים בדפדפן |
| M1 | Expo: catalog + account + Google + vouchers QR offline cache | TestFlight / internal |
| M2 | Checkout Cardcom + wallet read + push registration | קניית קופון בדיקה |
| M3 | Supplier scanner + push (purchase, redeem, 48h) | redeem e2e |
| M4 | Physical ship status + polish | soft public |

חנויות: App Store + Google Play (ישראל). מדיניות זהה ל-web.

---

## 9. טסטים

| # | תרחיש |
|---|---|
| MA1 | Guest → Google → purchase coupon → QR על המכשיר |
| MA2 | Airplane: QR מוצג; redeem מהספק נכשל בנימוס בלי רשת |
| MA3 | אותו Supabase user רואה אותם vouchers ב-web ובאפ |
| MA4 | Supplier scan success + replay |
| MA5 | Push expiry 48h + deep link לארנק |

---

## 10. מה לא בונים

- DB מובייל נפרד / Auth נפרד
- חישוב עמלה בקליינט
- משיכת ארנק
- Make/Zapier ל-push
- רשת שליחים כתלות שיגור

---

## 11. Revision

| Date | Change |
|---|---|
| 2026-07-31 | רענון מחייב + rev B (M0 עד M4) ב-`ke-arch` |
| 2026-08-02 | עדכון מחייב: Expo RN, shared Supabase auth, QR wallet offline, push; מודל Escrow 2026-07-27 |
