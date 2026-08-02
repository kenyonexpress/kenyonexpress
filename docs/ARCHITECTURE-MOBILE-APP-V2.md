# ARCHITECTURE: Mobile App V2 (Expo Super-App)

חידוד ל-

```
docs/ARCHITECTURE-MOBILE-APP.md
```

Expo React Native super-app, אותו Supabase, Push, QR wallet native, תצוגת קופון אופליין.

Status: **BINDING (V2 delta)** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

המסמך הבסיסי נשאר מקור ל-IA ולשלבי M0–M4. מסמך זה מחדד חוזים ל-Push, ארנק QR נייטיבי, ואופליין.

Companions:

```
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-E2E-TESTING.md
```

---

## 0. הכרעות V2 (מחדדות)

| # | הכרעה |
|---|---|
| V2-1 | אפ אחת = super-app (Customer + Supplier scan mode). |
| V2-2 | Backend יחיד: אותו Supabase project URL / anon key / RLS כמו web. |
| V2-3 | Push הוא ערוץ ב-notifications worker (לא FCM ישירות מהקליינט לדומיין כסף). |
| V2-4 | QR wallet: רינדור **native** מ-`qr_payload` שנשמר מוצפן במכשיר; לא WebView ל-QR. |
| V2-5 | Offline: **תצוגה בלבד** של issued; redeem תמיד אונליין אצל הספק. |
| V2-6 | Secure Store / Keychain ל-refresh token; MMKV/SQLite מוצפן למטא-דאטה קופון. |
| V2-7 | Web נשאר SEO; האפ לא דורשת indexation. |

---

## 1. Shared Supabase backend (V2)

| נושא | חוזה |
|---|---|
| Auth | Google (Expo Auth Session); Apple Sign-In לפני הגשת iOS אם נדרש |
| Session | `@supabase/supabase-js` + auto refresh ב-Secure Store |
| RLS | זהה ל-web; אפס service role באפ |
| Realtime (אופציונלי) | רק לערוצים לא-כספיים (למשל ticket); לא למאזן ארנק כמקור אמת |
| Edge/Next APIs | checkout, redeem, wallet debit כמו web |

מיפוי טבלאות זהה: `profiles`, `orders`, `vouchers`, `wallet_*`, `supplier_members`, `push_tokens`.

---

## 2. Push notifications (V2)

### 2.1 רישום

```text
App asks permission after value moment
  → Expo Notifications / native device token
  → POST /api/mobile/push-register (user JWT)
  → upsert push_tokens (user_id, platform, token, app_version, updated_at)
```

UNIQUE `(user_id, token)`. מחיקה ב-logout / 410 מ-FCM/APNs.

### 2.2 שליחה

Worker ההתראות מוסיף channel `push`:

| event | קהל | Deep link |
|---|---|---|
| coupon purchased / issued | customer | `kenyonexpress://coupon/{voucherId}` |
| coupon redeemed | customer (+ supplier optional) | coupons / scan history |
| expiry 48h | customer | `kenyonexpress://coupons` |
| supplier new order | supplier members | `kenyonexpress://scan` או orders |
| refund succeeded | customer | order deep link |

Payload: מינימלי; בלי קוד קופון מלא ב-push body אם אפשר (רק לאחר פתיחת האפ).

Idempotency: `dedupe_key` כמו מייל (`…:push`).

### 2.3 UX

- לא לבקש הרשאה ב-cold start האגרסיבי
- כבוי מערכת → in-app inbox אם קיים (`inapp` channel)
- Quiet hours אופציונלי לתזכורות expiry בלבד

---

## 3. QR wallet native

### 3.1 למה native

- אמינות בקופה (בהירות, מסך מלא, לא זום WebView)
- עבודה בלי רשת אחרי sync
- שליטה ב-`Brightness` / keep-awake בזמן הצגה

ספרייה יעד: `react-native-qrcode-svg` (או מקביל מתוחזק) על מחרוזת `qr_payload`.

### 3.2 מסך קופון

```text
Full-bleed QR
Code under QR (ltr, copy button)
Product name + supplier
Paid on site + balance due (₪)
Expiry
Banner if offline (last synced_at)
```

אין כפתור "ממש עכשיו" ללקוח.

### 3.3 אבטחת אחסון

| נתון | אחסון |
|---|---|
| refresh token | Secure Store |
| qr_payload + code | encrypted-at-rest store (Keystore/Keychain-backed אם אפשר) |
| product images | disk cache רגיל |

Wipe: logout, unwind על `redeemed`/`cancelled`/`expired` אחרי sync.

---

## 4. Offline coupon display

| מצב | התנהגות |
|---|---|
| Online foreground | delta sync `vouchers` where status=issued |
| Offline | מציג cache; באנר "לא מחובר · נכון ל-{{synced_at}}" |
| Offline + user taps share | מותר לשתף קוד; לא redeem |
| Supplier offline | האפ מסרבת לסרוק; הודעה בעברית |

Conflict: שרת מנצח תמיד. אם השרת אומר redeemed והמטמון issued → מסיר QR מיד בכניסה לרשת.

---

## 5. Super-app navigation (V2 sharpening)

```text
Root tabs (customer): Home | Search | Coupons | Account
Hidden stack: Product, Cart, Checkout (Cardcom WebView), Order detail
Supplier mode entry: Account → "סורק לעסק" if supplier_members active
  → Scan tab (camera) + History
```

Deep links נשמרים מ-V1; Universal Links ל-`/coupon/*` פותחים את המסך הנייטיבי אחרי auth.

---

## 6. Checkout + wallet (V2)

- Cardcom Low Profile ב-WebView / דפדפן מערכת עם return deep link
- Wallet debit רק דרך שרת (ARCHITECTURE-WALLET-CASHBACK)
- אחרי הצלחה: sync vouchers + local notification אופציונלית + Push מהשרת

---

## 7. Test matrix (V2)

| ID | תרחיש |
|---|---|
| MV1 | Issue → Push → deep link → QR native visible |
| MV2 | Airplane mode: QR still renders from cache |
| MV3 | Redeem on supplier phone → customer cache clears on next sync |
| MV4 | Logout wipes Secure Store + coupon cache |
| MV5 | Same user: web coupons == app coupons |
| MV6 | Push dedupe: no double alert on finalize replay |

---

## 8. Relation to V1

| נושא | V1 | V2 |
|---|---|---|
| Stack / phases M0–M4 | מקור | ירושה |
| Push details | כללי | רישום, dedupe, quiet |
| QR | מוזכר | native + storage + offline UX |
| Super-app | מוזכר | tabs + supplier entry |

סתירה: V2 מנצח בפרטי Push/QR/offline; אחרת V1.

---

## 9. Acceptance

- [ ] Shared Supabase only
- [ ] Push דרך notifications pipeline + push_tokens
- [ ] QR native מ-qr_payload
- [ ] Offline display בלי redeem מקומי
- [ ] Wipe ב-logout
- [ ] Docs only; main worktree לא נגע

---

## 10. Revision

| Date | Change |
|---|---|
| 2026-08-03 | V2 delta על arch/docs-queue: Push, native QR wallet, offline display |
