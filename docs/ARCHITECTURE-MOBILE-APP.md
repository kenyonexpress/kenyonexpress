# ארכיטקטורה: אפליקציית מובייל (Expo Super-App)

Expo React Native כערוץ מובייל על **אותו backend** של Next.js + Supabase: Auth deep links, Push דרך `push_tokens`, סריקת ספק עם PIN לפי `115_supplier_app_scanning`, ארנק קופונים עם מטמון אופליין לתצוגה, ו-RTL עברית מהיום הראשון.

Status: **BINDING** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-APP-STORE-LAUNCH.md
docs/ARCHITECTURE-PWA.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-API-CONTRACTS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-INTEGRATIONS.md
docs/CONTRADICTIONS.md
apps/mobile/README.md
supabase/migrations/114_push_tokens.sql
supabase/migrations/115_supplier_app_scanning.sql
```

עקרון: **Web = SEO + רכישה ראשונית בדסקטופ.** האפ = שימור, Push, ארנק קופונים, סריקת ספק. אין DB שני, אין Auth שני, אין PSP שני. **No Escrow** בנוסח ובזרימות.

---

## 1. Current-state audit (ריפו אמיתי)

נבדק READ-ONLY מול
`/Users/ofir/kenyonexpress-web/kenyonexpress`
(2026-08-11).

### 1.1 מה קיים

| אזור | מצב נמדד |
|---|---|
| Scaffold Expo | `apps/mobile/` (Expo ~52, Expo Router, TypeScript). **מחוץ** ל-`pnpm-workspace` בכוונה (README). |
| `app.json` | `scheme: kenyonexpress`, Universal Links / App Links ל-`/account`, `/checkout`, `/product`, מצלמה לסריקה, `expo-notifications`, `expo-secure-store`. |
| מסכים | `app/index`, `wallet`, `coupons`, `checkout` (WebView), `supplier/*` (סריקה + היסטוריה). |
| Auth session | `apps/mobile/src/lib/supabase.ts`: session ב-`expo-secure-store` (לא AsyncStorage). |
| Push client | `apps/mobile/src/lib/push.ts` → `POST /api/app/push-tokens` עם Bearer. |
| Push server | מיגרציה `114_push_tokens.sql` + `src/lib/push/expo.ts` + outbox channel push (`ARCHITECTURE-NOTIFICATIONS.md`). |
| סריקת ספק (DB) | `115_supplier_app_scanning.sql`: `suppliers.app_scanning_enabled` (ברירת מחדל false), `supplier_staff` + `pin_hash` (bcrypt), `verify_supplier_staff_pin` / `set_supplier_staff_pin`, `voucher_redemptions.staff_id`. |
| סריקה (אפ) | מצלמה → `POST /api/supplier/vouchers/redeem`; תור אופליין מקומי ב-`src/lib/supplier/queue.ts` (AsyncStorage) + batch drain. |
| Checkout | WebView על האתר; חזרה דרך `/checkout/app-return` ו-scheme `kenyonexpress://`. אין חישוב כסף באפ. |
| RTL | `I18nManager.allowRTL(true)` + `forceRTL(true)` ב-`app/_layout.tsx`. |
| Deep links (שרת) | `src/lib/app/deep-links.ts` + API תחת `src/app/api/app/`. |
| PWA | קיים ב-web כגשר; לא מחליף את האפ. |

### 1.2 פערים / חוב

| פער | פירוט |
|---|---|
| Monorepo packages | אין `packages/shared-*` פעילים; חוזים עדיין ב-web `src/`. |
| ארנק קופונים אופליין | רשימת קופונים קוראת ישירות מ-`vouchers` כשיש רשת; **אין** מטמון מוצפן מקומי לתצוגת QR בלי רשת (היעד בסעיף 2). |
| Auth deep link מלא | Scheme קיים ל-OAuth/return; יש לייצב redirect URLs ב-Supabase Dashboard + מסך callback באפ לכל ספקי Auth בשימוש. |
| Staff PIN UI | RPC/מיגרציה קיימים; זרימת בחירת עובד + PIN לפני סריקה באפ עדיין חלקית מול החוזה המלא. |
| CI על האפ | שערי השורש לא רצים על `apps/mobile` (מכוון); אין EAS CI מחייב עדיין. |
| Store | אין TestFlight / Play internal יציב כשער השקה. |

### 1.3 מה אסור לפרש שגוי מהקוד הקיים

- תור סריקה אופליין בספק **אינו** מימוש מקומי. המימוש האמיתי רק כשהשרת מקבל redeem (או batch) ומכריע. עד אז זה "בתור", לא "מומש".
- אין service role באפ. רק anon key + session משתמש.
- Cardcom לא רץ native; רק WebView על אותו checkout של ה-web.

---

## 2. Target architecture

### 2.1 המלצה אחת (מחייבת)

**Expo + Expo Router + EAS**, צורכת את אותם Route Handlers / server actions של Next + אותו Supabase, בלי service role באפ. PWA = גשר עד החנויות. Flutter נדחה.

יעד מבנה (אחרי חילוץ הדרגתי):

```text
apps/web          → Next.js (src/ היום)
apps/mobile       → Expo (קיים, מחוץ ל-workspace pnpm)
packages/shared-types
packages/shared-validation
```

עד שקיימים packages: האפ קוראת DTOs/OpenAPI מהשרת בלי לשכפל לוגיקת כסף.

### 2.2 הכרעות

| # | הכרעה |
|---|---|
| M1 | Client: Expo + TypeScript + Expo Router + EAS. |
| M2 | Backend: אותו Supabase + אותם `/api/**` כמו web. |
| M3 | כסף ו-redeem רק דרך API מאומת. אין service role באפ. |
| M4 | תשלום: Cardcom ב-WebView (Low Profile); לא IAP לקופונים/פיזי. |
| M5 | קופון: **No Escrow**. |
| M6 | RTL native מהיום הראשון (`I18nManager` / expo-localization / `writingDirection`). |
| M7 | Push דרך outbox `channel=push` + טבלת `push_tokens` (`114`). |
| M8 | ארנק: QR **אופליין לתצוגה**; redeem תמיד אונליין אצל הספק (שרת מכריע). |
| M9 | סריקת ספק: device = `supplier_members`; PIN = ייחוס עובד (`115`), לא הרשאה. |

### 2.3 Supabase Auth + deep links

```text
Universal / App Links (https://kenyonexpress.co.il/...)
  → מוצר / חשבון / checkout / קופון (שיתוף, מייל, push)

Scheme פנימי (kenyonexpress://)
  → OAuth / magic-link redirect של Supabase Auth
  → חזרה מ-Cardcom WebView / 3-DS לדפדפן מערכת
```

כללים:

1. ב-Supabase Auth: להגדיר Redirect URLs שכוללים את ה-scheme ואת דומיין האפ בלבד (רשימה סגורה).
2. מסך callback באפ מחליף את ה-code/session דרך Supabase JS; אין embedding של service role.
3. קישורי push/מייל הם https בלבד; scheme לא יוצא החוצה.
4. מקור אמת ל-paths: `src/lib/app/deep-links.ts` בשרת **ו** `app.json` באפ חייבים להישאר מסונכרנים.

### 2.4 Push (`push_tokens`)

| פריט | ערך |
|---|---|
| טבלה | `public.push_tokens` (`114`): `expo_token` UNIQUE, `platform` ios/android/unknown, `device_id`, `enabled`, RLS בעלים |
| רישום | אחרי login + הרשאת התראות → `POST /api/app/push-tokens` |
| שליחה | Drain outbox → `src/lib/push/expo.ts` → Expo Push Service |
| כיבוי | `DeviceNotRegistered` → `enabled=false` + `disabled_reason` (לא מחיקה) |
| Deep link ב-payload | https path לעצם (למשל קופון); האפ ממפה ל-Expo Router |
| שיווק | אסור דרך הטבלה הזו בלי מסלול consent נפרד |

### 2.5 מצב סריקת ספק (staff PIN)

```text
supplier_members (התקן מאומת)
  → app_scanning_enabled = true
  → בחירת/הזנת PIN
  → verify_supplier_staff_pin
  → staff_id בזיכרון סשן קופה
  → סריקת מצלמה
  → POST redeem (+ staff_id)
  → voucher_redemptions.staff_id
```

| כלל | פירוט |
|---|---|
| PIN | ייחוס, לא הרשאה. bcrypt ב-DB (`extensions.crypt`). 4–8 ספרות. |
| Lockout | `failed_attempts` + `locked_until`; rate limit ב-route. |
| כתיבת עובדים | פורטל ספק / service role בלבד (`set_supplier_staff_pin`). |
| אופליין | מותר **תור סריקה** מקומי; אסור להציג "מומש" לפני תשובת שרת. |
| Web portal | לא תלוי ב-`app_scanning_enabled`. |

### 2.6 אסטרטגיית מטמון קופונים אופליין (לקוח)

```text
עם רשת:
  GET רשימת קופונים פעילים (API או RLS מ-vouchers)
  → שמירה מקומית מוצפנת (SecureStore למפתחות קצרים / SQLite מוצפן לרשימה)
  → payload לתצוגת QR + expires_at + id

בלי רשת:
  → הצגת קופונים שמורים + QR (בהירות מסך)
  → באנר: "מימוש דורש חיבור אצל העסק"
  → אין redeem מקומי, אין שינוי סטטוס מקומי

Logout / החלפת משתמש:
  → מחיקת המטמון כולו
```

מגבלות: רק `issued` פעילים (+ חלון קצר אחרי redeem לתצוגה). שעון מכשיר לסמן expired מקומית; סנכרון מתקן. אין service secrets במטמון.

### 2.7 RTL עברית

| נושא | כלל |
|---|---|
| כיוון | `I18nManager.forceRTL(true)` + בדיקת reload אחרי החלפה |
| טקסט | עברית בכל מסכי כסף / קופון / סריקה |
| LTR ממוקד | קודים, URLs, מספרים טכניים ב-`direction: 'ltr'` |
| אייקונים | mirroring לחץ חזרה / chevron |
| תאריכים | Asia/Jerusalem |
| WebView | דפי האתר כבר RTL; לא לשבור עם wrapper LTR |

### 2.8 Checkout (WebView)

עגלה/סליקה = האתר בתוך WebView. Finalize = webhook + `GetLpResult` בשרת. `CHECKOUT_ENABLED` נאכף כמו ב-web. אחרי חזרה: רענון הזמנות/קופונים מה-API/DB.

---

## 3. Numbered migration path

1. **ייצוב Auth deep links:** Redirect URLs ב-Supabase + מסך callback באפ + בדיקת Google/OTP/magic-link על iOS ו-Android.
2. **השלמת Push end-to-end:** הרשאה → רישום `push_tokens` → שליחת issued/expiry מ-outbox → פתיחת deep link באפ.
3. **מטמון ארנק אופליין:** שכבת cache מוצפנת לרשימת קופונים + QR display; בדיקות logout wipe; באנר offline.
4. **סריקת ספק + PIN:** UI בחירת עובד, `verify_supplier_staff_pin`, העברת `staff_id` ב-redeem, נעילת PIN, כיבוי כש-`app_scanning_enabled=false`.
5. **תור סריקה אופליין:** יישור UX ("בתור" ≠ "מומש") + drain batch + ניקוי בתור ב-signOut.
6. **EAS + soft store:** dev client, TestFlight / Play internal, ללא IAP לקופונים.
7. **חילוץ shared contracts (אופציונלי):** `packages/shared-validation` ל-DTOs בלבד; בלי העברת לוגיקת כסף לאפ.
8. **ורטיקלים:** לפי `ARCHITECTURE-INTEGRATIONS.md` / SUPERAPP אחרי יציבות הליבה.

---

## 4. Acceptance

- [ ] אין service role באפ  
- [ ] אותם מחירי API כמו web  
- [ ] RTL בכל מסכי כסף וסריקה  
- [ ] QR קופון זמין בלי רשת; redeem לא  
- [ ] Push transactional עם deep link https  
- [ ] PIN מייחס `staff_id` בלי להרחיב הרשאות  
- [ ] Cardcom רק ב-WebView; finalize בשרת  
- [ ] אין נוסח Escrow  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | Expo RN, QR, push, No Escrow |
| 2026-08-10 | shared packages, deep links, supplier QR |
| 2026-08-11 | WebView checkout + push סביב תשלום |
| 2026-08-11 | API layer reuse, RTL, coupon wallet offline display |
| 2026-08-11 | session-only API auth; SecureStore/SQLite להצגת QR אופליין |
| 2026-08-11 | מבנה audit → target → migration; `114`/`115`, scaffold `apps/mobile`, Auth deep links, staff PIN, offline cache |
