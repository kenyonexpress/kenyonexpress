# ארכיטקטורה: Mobile App V2 (Expo delta)

חידוד ל-`docs/ARCHITECTURE-MOBILE-APP.md`: Push, QR wallet native, תצוגת קופון אופליין, super-app navigation.

Status: **BINDING (V2 delta)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**.

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-E2E-TESTING.md
```

המסמך הבסיסי (MOBILE-APP) נשאר מקור ל-IA ולשלבי M0–M4. V2 מנצח בפרטי Push/QR/offline.

---

## 1. החלטה

| # | הכרעה |
|---|---|
| V2-1 | אפ אחת = super-app (Customer + Supplier scan mode). |
| V2-2 | Backend יחיד: אותו Supabase project URL / anon key / RLS כמו web. |
| V2-3 | Push הוא ערוץ ב-notifications worker (לא FCM ישירות מהקליינט לדומיין כסף). |
| V2-4 | QR wallet: רינדור **native** מ-`qr_payload` שנשמר מוצפן במכשיר; לא WebView ל-QR. |
| V2-5 | Offline: **תצוגה בלבד** של issued; redeem תמיד אונליין אצל הספק. |
| V2-6 | Secure Store / Keychain ל-refresh token; MMKV/SQLite מוצפן למטא-דאטה קופון. |
| V2-7 | Web נשאר SEO; האפ לא דורשת indexation. |
| V2-8 | ספריית QR: `react-native-qrcode-svg` (או מקביל מתוחזק). |
| V2-9 | Navigation: tabs Home | Search | Coupons | Account; supplier entry מ-Account. |
| V2-10 | Push dedupe: `dedupe_key` עם suffix `:push`. |

### 1.1 Push (V2)

רישום:

```text
App asks permission after value moment
  → Expo Notifications / native device token
  → POST /api/mobile/push-register (user JWT)
  → upsert push_tokens (user_id, platform, token, app_version, updated_at)
```

אירועים:

| event | קהל | Deep link |
|---|---|---|
| coupon purchased / issued | customer | `kenyonexpress://coupon/{voucherId}` |
| coupon redeemed | customer (+ supplier optional) | coupons / scan history |
| expiry 48h | customer | `kenyonexpress://coupons` |
| supplier new order | supplier members | `kenyonexpress://scan` |
| refund succeeded | customer | order deep link |

UX: לא לבקש הרשאה ב-cold start; quiet hours אופציונלי ל-expiry בלבד.

### 1.2 QR wallet native

```text
Full-bleed QR
Code under QR (ltr, copy button)
Product name + supplier
Paid on site + balance due (₪)
Expiry
Banner if offline (last synced_at)
```

Wipe: logout, unwind על `redeemed`/`cancelled`/`expired` אחרי sync.

### 1.3 Offline coupon display

| מצב | התנהגות |
|---|---|
| Online foreground | delta sync `vouchers` where status=issued |
| Offline | מציג cache; באנר "לא מחובר · נכון ל-{{synced_at}}" |
| Offline + share | מותר לשתף קוד; לא redeem |
| Supplier offline | האפ מסרבת לסרוק |

Conflict: שרת מנצח תמיד.

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| WebView ל-QR | בהירות/זום/keep-awake inferior; V2-4 native. |
| FCM/APNs ישיר מהאפ לשליחה | bypass worker/consent/dedupe; V2-3. |
| redeem מקומי offline | fraud + חד-פעמיות; שרת בלבד. |
| AsyncStorage ל-qr_payload | לא encrypted-at-rest; V2-6. |
| IAP לקופונים | MOBILE-APP M4; Cardcom WebView. |
| אפ נפרדת לספק | V2-1 super-app; scan mode מוסתר. |
| Push body עם קוד קופון מלא | leakage; payload מינימלי. |

---

## 3. סכמת DB

**אין DDL חדש ב-V2.** שימוש בטבלאות קיימות:

| טבלה | שדות V2 |
|---|---|
| `push_tokens` | `user_id`, `token`, `platform`, `enabled`, `app_version` |
| `vouchers` | `qr_payload`, `code`, `status`, `expires_at`, `updated_at` (delta sync) |
| `notification_outbox` | `channel=push`, `dedupe_key`, `payload` |
| `supplier_members` | scan mode gate |

מיגרציות مرجع: `114_push_tokens.sql`, outbox מ-029/031.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | Airplane mode אחרי sync | QR מ-cache; באנר offline |
| E2 | Redeem על supplier → customer online | cache clears ב-delta sync |
| E3 | Push replay על finalize | dedupe; MV6 test |
| E4 | Logout mid-display | wipe SecureStore + coupon cache |
| E5 | Brightness / keep-awake timeout | QR screen re-activates on focus |
| E6 | `qr_payload` rotate בשרת | sync מחליף; QR ישן invalid |
| E7 | Permission denied push | in-app inbox fallback אם קיים |
| E8 | Same user web vs app voucher list | MV5: חייב זהות |
| E9 | Supplier taps scan בלי membership | redirect + הודעה |
| E10 | Deep link ל-voucher של user אחר | 403 / redirect login |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | `/api/mobile/push-register` vs `/api/app/push-tokens` | לאחד ל-endpoint אחד ב-M3 | 2026-08-12 |
| O2 | in-app inbox channel | P1; push opt-out fallback | 2026-08-12 |
| O3 | quiet hours timezone | Asia/Jerusalem default | 2026-08-12 |
| O4 | Maestro E2E ל-MV1–MV6 | TESTING-CICD P2 | 2026-08-12 |

---

## 6. Test matrix (V2)

| ID | תרחיש |
|---|---|
| MV1 | Issue → Push → deep link → QR native visible |
| MV2 | Airplane mode: QR still renders from cache |
| MV3 | Redeem on supplier phone → customer cache clears on next sync |
| MV4 | Logout wipes Secure Store + coupon cache |
| MV5 | Same user: web coupons == app coupons |
| MV6 | Push dedupe: no double alert on finalize replay |

---

## 7. Relation to V1

| נושא | V1 | V2 |
|---|---|---|
| Stack / phases M0–M4 | מקור | ירושה |
| Push details | כללי | רישום, dedupe, quiet |
| QR | מוזכר | native + storage + offline UX |
| Super-app | מוזכר | tabs + supplier entry |

סתירה: V2 מנצח בפרטי Push/QR/offline; אחרת V1.

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | V2 delta: Push, native QR, offline display |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
