# ארכיטקטורה: אפליקציית מובייל (Expo)

Expo React Native כערוץ מובייל על **אותו backend** של Next.js + Supabase: Auth deep links, Push דרך `push_tokens`, סריקת ספק עם PIN, ארנק קופונים עם מטמון אופליין לתצוגה, ו-RTL עברית מהיום הראשון.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**.

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-APP-V2.md
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-APP-STORE-LAUNCH.md
docs/ARCHITECTURE-PWA.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-API-CONTRACTS.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
```

עקרון: **Web = SEO + רכישה ראשונית בדסקטופ.** האפ = שימור, Push, ארנק קופונים, סריקת ספק. אין DB שני, אין Auth שני, אין PSP שני.

---

## 1. החלטה

| # | הכרעה |
|---|---|
| M1 | Client: Expo + TypeScript + Expo Router + EAS. |
| M2 | Backend: אותו Supabase + אותם `/api/**` כמו web. |
| M3 | כסף ו-redeem רק דרך API מאומת. אין service role באפ. |
| M4 | תשלום: Cardcom ב-WebView (Low Profile); לא IAP לקופונים/פיזי. |
| M5 | קופון: **No Escrow**; מחיר מלא באתר, יתרה בעסק. |
| M6 | RTL native מהיום הראשון (`I18nManager` / expo-localization). |
| M7 | Push דרך outbox `channel=push` + טבלת `push_tokens` (מיגרציה `114`). |
| M8 | ארנק: QR **אופליין לתצוגה**; redeem תמיד אונליין אצל הספק (שרת מכריע). |
| M9 | סריקת ספק: device = `supplier_members`; PIN = ייחוס עובד (`115`), לא הרשאה. |
| M10 | PWA = גשר עד החנויות; לא מחליף את האפ (ראה PWA). |
| M11 | Session: SecureStore ל-refresh token; לא AsyncStorage לטוקנים. |
| M12 | Scheme: `kenyonexpress` + Universal/App Links על `kenyonexpress.co.il`. |

### 1.1 Auth + deep links

```text
https://kenyonexpress.co.il/...  → מוצר / חשבון / checkout / קופון
kenyonexpress://               → OAuth / magic-link / חזרה מ-Cardcom
```

| כלל | פירוט |
|---|---|
| Redirect URLs | רשימה סגורה ב-Supabase Dashboard בלבד |
| Callback | מסך באפ מחליף code/session; אין service role |
| Push/מייל | https בלבד החוצה; scheme פנימי |
| סנכרון | `src/lib/app/deep-links.ts` ↔ `app.json` |

### 1.2 Push (`push_tokens`)

| פריט | ערך |
|---|---|
| טבלה | `public.push_tokens` (`114`) |
| רישום | אחרי login + הרשאת התראות |
| שליחה | Drain outbox → Expo Push Service |
| כיבוי | `DeviceNotRegistered` → `enabled=false` |
| שיווק | אסור בלי מסלול consent נפרד (30א) |

### 1.3 סריקת ספק (staff PIN)

```text
supplier_members → app_scanning_enabled
  → PIN → verify_supplier_staff_pin
  → staff_id בסשן קופה
  → POST redeem (+ staff_id)
```

| כלל | פירוט |
|---|---|
| PIN | ייחוס, לא הרשאה; bcrypt ב-DB; 4-8 ספרות |
| Lockout | `failed_attempts` + `locked_until` |
| אופליין | תור סריקה מקומי; אסור "מומש" לפני תשובת שרת |

### 1.4 מטמון קופונים אופליין

```text
עם רשת: רשימה פעילה → מטמון מוצפן (QR + expires_at + id)
בלי רשת: הצגת QR + באנר "מימוש דורש חיבור"
Logout: מחיקת המטמון
```

### 1.5 Checkout (WebView)

עגלה/סליקה = האתר בתוך WebView. Finalize = webhook + `GetLpResult` בשרת. אותו `CHECKOUT_ENABLED`. אין חישוב כסף באפ.

### 1.6 סדר יישום

1. ייצוב Auth deep links  
2. Push end-to-end  
3. מטמון ארנק אופליין  
4. סריקת ספק + PIN  
5. תור סריקה אופליין (UX "בתור" ≠ "מומש")  
6. EAS + soft store (בלי IAP לקופונים)  
7. shared contracts אופציונלי (DTOs בלבד)

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| Flutter / native כפול (Swift + Kotlin) | אין שיתוף zod/drizzle/טיפוסי Supabase; עלות צוות כפולה. |
| Capacitor / TWA כערוץ ראשי | iOS push/chcamera/background מוגבלים; superseded ב-MOBILE-SUPERAPP M1. |
| IAP (Apple/Google) לקופונים | דחיית 30% + מדיניות חנות; Cardcom WebView + SAQ-A. |
| service role באפ ל-redeem מהיר | סיכון אבטחה; RLS + JWT בלבד. |
| AsyncStorage ל-session | חשיפת refresh token; SecureStore חובה. |
| redeem אופליין "אמין" | חד-פעמיות רק ב-DB; offline = cache תצוגה בלבד. |
| DB / Auth נפרדים למובייל | כפילות סכימה; אותו Supabase project. |

---

## 3. סכמת DB

**DDL קיים** (לא חדש במסמך זה):

| טבלה / מיגרציה | שדות / שימוש |
|---|---|
| `push_tokens` (`114`) | `user_id`, `token`, `platform`, `enabled`, `app_version`, `updated_at` |
| `supplier_staff_pins` (`115`) | PIN bcrypt, `failed_attempts`, `locked_until`, `staff_id` |
| `supplier_members` | `app_scanning_enabled`, role owner/manager/scanner |
| `vouchers` | `status`, `qr_payload`, `expires_at`, `code` (קריאה RLS) |
| `profiles` | זהות משותפת web/app |
| `orders`, `order_items` | checkout; `platform_percent` snapshot |

אחסון מקומי (לא DB): SecureStore (tokens), encrypted store (qr_payload cache).

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | Push token כפול אחרי reinstall | UNIQUE `(user_id, token)` upsert; ישן disabled |
| E2 | `DeviceNotRegistered` מ-Expo | `enabled=false`; לא retry אינסופי |
| E3 | Redeem בזמן offline (ספק) | תור מקומי; UI "בתור"; לא "מומש" |
| E4 | שרת אומר redeemed, cache issued | sync מוחק QR מיד בכניסה לרשת |
| E5 | PIN lockout אחרי 5 ניסיונים | `locked_until`; הודעה בעברית |
| E6 | WebView Cardcom: redirect לא חוזר לאפ | deep link fallback + polling שרת |
| E7 | Logout | wipe SecureStore + coupon cache |
| E8 | OAuth redirect ל-URL לא ברשימה | reject; לא לפתוח session |
| E9 | אותו user: web coupons ≠ app | bug; sync חייב אותה רשימת vouchers |
| E10 | Push dedupe על finalize replay | `dedupe_key` כמו email (`…:push`) |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | `apps/mobile/` מחוץ ל-pnpm-workspace | מכוון עד M0 monorepo (SUPERAPP M2) | 2026-08-12 |
| O2 | Apple Sign-In לפני iOS submit | חובה אם Google בלבד | 2026-08-12 |
| O3 | shared package `@ke/contracts` | P1; DTOs ידניים עד אז | 2026-08-12 |
| O4 | quiet hours ל-expiry push | אופציונלי; ראה MOBILE-APP-V2 | 2026-08-12 |

---

## 6. Acceptance

- [ ] אין service role באפ  
- [ ] אותם מחירי API כמו web  
- [ ] RTL בכל מסכי כסף וסריקה  
- [ ] QR קופון זמין בלי רשת; redeem לא  
- [ ] Push transactional עם deep link https  
- [ ] PIN מייחס `staff_id` בלי להרחיב הרשאות  
- [ ] Cardcom רק ב-WebView; finalize בשרת  
- [ ] אין נוסח Escrow  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | Expo RN, QR, push, No Escrow |
| 2026-08-11 | מבנה audit; מיגרציות `114`/`115` |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
