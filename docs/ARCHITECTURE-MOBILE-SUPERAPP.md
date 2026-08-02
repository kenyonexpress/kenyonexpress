# ארכיטקטורת Mobile Super-App: React Native + Expo

מסמך תכנון מחייב. תאריך: 2026-07-17. ענף: `phase5/homepage`.
מיקום קנוני: `docs/`. תיקוני העוגן וספיגת מסמך ה-PWA הישן הושלמו.

מסמכים קשורים:
`docs/MASTER-ARCHITECTURE.md` (הכרעות R1-R38; מסמך זה מעוגן שם כ-R27/R34),
`docs/ARCHITECTURE-COMMERCE.md` (026),
`docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md` (027),
`docs/ARCHITECTURE-ACCOUNT-IDENTITY.md` (029),
`docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md` (031),
`docs/ARCHITECTURE-TESTING-CICD.md` (D1-D22).

---

## 0. היקף ויחס למסמך ה-PWA הקודם (supersession מדויק)

מסמך ה-PWA הקודם (`ARCHITECTURE-SUPERAPP-MOBILE.md`, ‏2026-07-08) **נבלע במסמך
זה ונמחק** באיחוד v3. הוא הכריע (D1/D2): ‏PWA על ה-Next הקיים, עטיפות
TWA/Capacitor בהמשך, בלי React Native. מסמך זה **מחליף את שכבת הפלטפורמה
בלבד** ומשאיר את כל השאר בתוקף; חוזי הליבה שלו (C1-C4, ‏D3-D10) חיים כעת
בסעיף 11 כאן:

| הכרעה קיימת | סטטוס במסמך זה |
|---|---|
| D1 (PWA + עטיפות), D2 (הלקוח הוא תמיד ה-web app) | **מוחלף.** אפליקציית React Native + Expo היא ערוץ הלקוח המובייל; ה-web נשאר קנוני ל-SEO ולדסקטופ |
| D3 (`orders` מעטפת אוניברסלית + `orders.vertical`) | בתוקף מלא. זה הבסיס לורטיקלים גם במובייל |
| D4 (ארנק דרך `fn_wallet_transfer` בלבד, namespace פר ורטיקל) | בתוקף מלא |
| D5 (membership בתבנית `supplier_members`) | בתוקף מלא |
| D6/D7 (ארנק קופונים offline, שרת = אמת, חד-פעמיות ב-DB) | בתוקף; המימוש עובר מ-IndexedDB ל-storage נייטיב (סעיף 5.4) |
| D8 (push שיווקי תחת משטר 30א מלא) | בתוקף מלא |
| D9 (deep links = https בלבד, לא משתפים קופון) | בתוקף; מתווסף scheme פנימי ל-OAuth redirect בלבד (סעיף 5.2) |
| D10 (הקומרס לא נבנה מחדש באף שלב) | בתוקף מלא. עיקרון העל של מסמך זה |
| חוזי C1-C4 (זהות, כסף, התראות, גבולות מודולים; סעיף 11) | בתוקף מלא; סעיף 4 ממפה אותם ל-runtime של המיני-אפים |

מדוע ההכרעה מתהפכת (מה השתנה מאז 2026-07-08):

1. **היעד הוא super-app, לא אתר עם אייקון.** ורטיקלים בסגנון Wolt/Gett דורשים
   מפות חיות, מיקום ברקע, מעקב שליח בזמן אמת ו-navigation נייטיב. PWA ב-iOS
   לא מספק אף אחד מאלה ברמה מסחרית (אין background geolocation, אין push בלי
   התקנה ידנית למסך הבית, אין live activities).
2. **Push הוא עצב ההכנסות** (תזכורות פקיעת קופון = מנוע ההכנסות של 031 סעיף 5.2).
   ב-iOS, PWA push מותנה בהתקנה ידנית שהמרתה חד-ספרתית; APNs נייטיב עובד לכל מתקין.
3. **עלות "codebase שני" נחתכת ב-monorepo.** הטענה המרכזית של מסמך ה-PWA הקודם
   (שיתוף ~20% בלבד עם RN) נכונה רק כשהלוגיקה כלואה בתוך ה-Next app. סעיף 2
   מוציא את הלוגיקה לחבילות משותפות; היעד: 80%+ מהקוד שאינו UI משותף, וה-UI
   בשני הצדדים הוא שכבת views דקה.
4. **הטענה "אין BFF" מתה ממילא חלקית**: route handlers כבר קיימים (webhook,
   cron, `/api/a`). סעיף 3 מוסיף משטח API מינימלי וממופה, לא שכתוב.

מה לא משתנה: ה-web נשאר ערוץ הרכישה הראשי עד שהאפליקציה מוכיחה אחרת, כל
המיגרציות והחוזים של 026-035 נשארים כמות שהם, ואף מסלול כסף חדש לא נפתח.

---

## 1. הכרעת מחסנית (Stack)

### 1.1 המועמדים מול הקריטריונים

| קריטריון | React Native + Expo | Flutter | PWA + Capacitor (D1 הישן) | Native כפול |
|---|---|---|---|---|
| שיתוף קוד עם monorepo TypeScript (zod, drizzle, טיפוסי Supabase, מודול הכסף D2) | **מלא**: אותה שפה, אותם packages, אותם bundlers | אפס (Dart). כל חוזה משוכפל ידנית | מלא, אבל בלי יכולות נייטיב אמיתיות | אפס, פעמיים |
| יכולות superapp (מפות, מיקום ברקע, live tracking, ביומטריה, מצלמה) | מלא, דרך מודולי Expo + native modules | מלא | חלקי מאוד ב-iOS | מלא |
| Push בישראל (APNs/FCM) | מלא | מלא | iOS רק אחרי התקנה ידנית | מלא |
| צוות של מפתח אחד + סוכני AI | שפה אחת לכל הריפו; סוכנים עובדים על חוזים משותפים | שפה שנייה, כפילות חוזים | הכי זול, אבל תקרת יכולות | לא ריאלי |
| OTA updates (תיקון באג קופה בלי app review) | EAS Update (JS bundle, מותר לאפליקציה של עצמנו) | אין רשמי | deploy מיידי (היתרון הגדול) | אין |
| RTL עברית | נתמך, דורש משמעת (סעיף 6) | נתמך | מקבל מה-web בחינם | נתמך |

### 1.2 ההכרעה

**React Native עם Expo (managed workflow + dev client), Expo Router, TypeScript,
NativeWind ל-styling, TanStack Query לשכבת הדאטה, `use-intl` ל-i18n (אותם קבצי
messages של ה-web). לא Flutter, לא Capacitor, לא native כפול.**

נימוק בשורה אחת: הנכס של הפרויקט הוא חוזים ב-TypeScript (zod, טיפוסי DB,
מודול כסף, מכונות מצבים), ו-React Native היא הפלטפורמה היחידה שצורכת אותם
כמות שהם; Expo היא הדרך היחידה לתחזק iOS+Android עם מפתח אחד בלי צוות native.

גרסאות ותלויות עוגן (נכון לכתיבה; לנעול ב-`apps/mobile/package.json`):

```
expo (SDK עדכני יציב), expo-router, react-native
nativewind + tailwindcss        styling באותו דיאלקט של ה-web
@tanstack/react-query           cache, retry, offline queue
@supabase/supabase-js           אותו client כמו ה-web
react-native-mmkv               storage מקומי (ארנק קופונים, cache)
expo-secure-store               טוקני session (Keychain/Keystore)
expo-local-authentication       ביומטריה
expo-notifications              push (APNs/FCM דרך Expo Push Service)
expo-camera                     סורק QR (ורטיקל ספקים עתידי)
react-native-qrcode-svg         רינדור QR של קופון מ-qr_token
expo-web-browser + react-native-webview   Cardcom (סעיף 5.3)
use-intl                        הליבה של next-intl, בלי תלות ב-Next
```

### 1.3 יעד שיתוף הקוד: 80%+ והמנגנון שאוכף אותו

היעד: **לפחות 80% מהקוד שאינו שכבת view חי ב-`packages/` ומשומש משני הצדדים.**
זה לא קורה מעצמו; המנגנון:

1. **כלל האצבע המחייב**: קומפוננטה (web או mobile) מותר לה להכיל JSX, סטיילינג
   וחיווט אירועים בלבד. כל fetch, ולידציה, חישוב כסף, מכונת מצבים, פורמט תאריך,
   טקסט: מ-`packages/`. קומפוננטה שמכילה לוגיקה עסקית נפסלת ב-code review.
2. **hooks משותפים הם הגבול**: `packages/api-client` מייצא hooks של TanStack
   Query (`useMyCoupons`, `useWalletBalance`, `useProductSearch`). ה-web (בצד
   לקוח) וה-mobile צורכים את אותו hook; ה-RSC של ה-web ממשיך לקרוא ישירות
   לפונקציות ה-server (אותה לוגיקה, אותו package, entry point אחר).
3. **מדידה ב-CI**: job שמריץ ספירת שורות (cloc) על `packages/` מול
   `apps/*/`, מדפיס את היחס בכל PR. ירידה מתחת ל-75% = אזהרה, מתחת ל-70% = כישלון.

---

## 2. אבולוציית ה-monorepo: מ-repo יחיד ל-Turborepo

### 2.1 מבנה היעד

```
kenyonexpress/                      (אותו repo, אותו שורש git)
  turbo.json
  pnpm-workspace.yaml               (קיים; מתרחב)
  biome.json                        (נשאר בשורש, כלל אחד לכולם)
  apps/
    web/                            האפליקציית Next 16 הקיימת, מועברת כיחידה
      src/  public/  next.config.ts  messages/ -> עוברים ל-packages/i18n
    mobile/                         Expo app חדש
      app/                          Expo Router (file-based, כמו App Router)
      app.config.ts  eas.json
  packages/
    contracts/                      zod schemas, DTO של ה-API, topics של התראות,
                                    manifest schema של ורטיקלים (סעיף 4.2)
    db/                             src/types/database.ts (generated) + drizzle schema
                                    (src/server/db הקיים), read-only מבחוץ
    core/                           לוגיקה טהורה: מודול הכסף src/lib/money (D2),
                                    מכונות המצבים (order/payment/coupon), חישובי
                                    אגורות, כללי cashback, ולידציות ישראליות
                                    (טלפון, מיקוד), utils
    api-client/                     יצירת Supabase clients (web/native), עטיפות RPC
                                    (redeem_coupon, fn_merge_guest_cart...), hooks של
                                    TanStack Query, ה-fetcher של /api/mobile/v1
    i18n/                           messages/he.json + en.json + עזרי פורמט (ILS,
                                    תאריכים he-IL, bidi wrappers)
    tokens/                         design tokens: צבעים, טיפוגרפיה (Heebo), ריווח,
                                    radius; נצרכים ע"י tailwind.config של שני הצדדים
    config/                         tsconfig בסיס, הגדרות biome משותפות, eslint-rules
                                    לגבולות מודולים (סעיף 4.5)
  verticals/                        (שלב מאוחר, סעיף 4) חבילת קוד פר ורטיקל
    food/  rides/
  supabase/                         נשאר בשורש (מיגרציות הן נכס כלל-מערכתי)
  docs/  e2e/  scripts/  refs/
```

### 2.2 סדר המהלכים המדויק (zero downtime ל-web)

עיקרון: **כל צעד הוא PR עצמאי, ירוק, שנפרס לפרודקשן לפני הצעד הבא.** ה-web
לא יודע שמשהו קרה. אין תקופת ביניים עם שני עותקים של קובץ.

**M0: תשתית workspace (בלי הזזת קבצים)**
1. הוספת `turbo.json` בשורש עם משימות `build`, `dev`, `lint`, `type-check`, `test`.
2. הרחבת `pnpm-workspace.yaml`: `packages: ['apps/*', 'packages/*', 'verticals/*']`.
3. שלד `packages/config` (tsconfig בסיס שכל השאר יורשים).
4. שער יציאה: `pnpm build` בשורש מפעיל את ה-Next build הקיים דרך turbo; deploy רגיל עובר.

**M1: העברת ה-Next app ל-`apps/web` (המהלך המסוכן היחיד, PR אחד אטומי)**
1. `git mv` של: `src/ public/ messages/ next.config.ts postcss.config.mjs
   components.json next-env.d.ts tsconfig.json vitest.config.ts vitest.setup.ts
   playwright.config.ts e2e/` אל `apps/web/`. `package.json` של השורש מתפצל:
   תלויות האפליקציה עוברות ל-`apps/web/package.json`; בשורש נשארים רק devDeps
   כלל-ריפו (turbo, biome, husky).
2. ב-Vercel: שינוי הגדרת **Root Directory** ל-`apps/web` על אותו פרויקט.
   Vercel תומך ב-monorepo נטיבית; ה-preview deployment של ה-PR נבדק ידנית
   (דף בית, דף מוצר, auth callback) לפני merge. זהו מנגנון ה-zero-downtime:
   ה-production deploy הקודם נשאר חי עד שה-deploy החדש ירוק, ו-rollback הוא
   Vercel Instant Rollback (עוגן D20).
3. באותו commit: עדכון `CLAUDE.md` (חוק הנתיב היחיד מקבל סעיף: שורש הריפו נשאר
   `/Users/ofir/kenyonexpress-web/kenyonexpress`, אפליקציית ה-web חיה תחת
   `apps/web`; זה איננו "עותק כפול").
4. שער יציאה: פרודקשן חי מ-`apps/web`, בדיקות E2E של playwright ירוקות, אפס
   שינוי ב-URL או בהתנהגות.

**M2: חילוץ החבילות, אחת-אחת (סדר לפי תלות, כל אחת PR)**
1. `packages/db`: הזזת `src/types/database.ts` + `src/server/db/`. ה-import
   ב-web משתנה ל-`@ke/db`. הסקריפט `db:types` בשורש כותב לחבילה.
2. `packages/contracts`: הזזת `src/lib/validations/` + הגדרת DTO חדשים.
3. `packages/core`: `src/lib/money/` (כשייכתב, D2 דורש אותו לפני checkout ממילא:
   נכתב ישר בחבילה), `src/lib/utils`, קבועים.
4. `packages/i18n`: `messages/*.json` + עזרי הפורמט. ה-web צורך דרך next-intl
   (שיודע לקבל messages מכל מקור), ה-mobile דרך use-intl.
5. `packages/api-client`: חדש. עוטף את `src/lib/supabase/` הקיים: factory
   ל-browser client (web) ו-native client (mobile, עם storage adapter של
   SecureStore), עטיפות typed לכל RPC, hooks.
6. `packages/tokens`: חילוץ הטוקנים מ-`src/lib/electro-hero-tokens.ts` ומה-
   tailwind config לאובייקט אחד.
7. שער יציאה לכל PR: `turbo type-check lint test build` ירוק; אפס שינוי התנהגות.

**M3: הולדת `apps/mobile`**
1. `pnpm create expo-app` בתוך `apps/mobile` עם תבנית Expo Router + TypeScript.
2. חיווט ל-packages: צריכת `@ke/contracts`, `@ke/core`, `@ke/api-client`,
   `@ke/i18n`, `@ke/tokens` מהיום הראשון. metro.config מוגדר ל-monorepo
   (`watchFolders` לשורש, resolution ל-workspaces).
3. שער יציאה: מסך "שלום" בעברית RTL רץ ב-Expo Go + dev build, קורא קטלוג חי
   מ-Supabase דרך `@ke/api-client` (RLS הציבורי הקיים).

הערת משמעת: אסור "לחלץ" חבילה ע"י copy. תמיד `git mv` (שימור היסטוריה), לעולם
לא שני עותקים חיים של אותו מודול (חוק הפרויקט נגד כפילויות חל גם כאן).

### 2.3 turbo.json (עוגן)

```json
{
  "tasks": {
    "build":      { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "type-check": { "dependsOn": ["^build"] },
    "lint":       {},
    "test":       { "dependsOn": ["^build"] },
    "dev":        { "cache": false, "persistent": true }
  }
}
```

CI רץ עם `--affected`: PR שנוגע רק ב-`apps/mobile` לא בונה את ה-web ולהפך;
PR שנוגע ב-`packages/core` בונה את שניהם (וזה בדיוק הביטוח שהחוזה המשותף לא נשבר).

---

## 3. חוזה הגישה לשרת מהמובייל (אין מסלול כסף חדש)

עיקרון: ה-DB כבר בנוי ללקוח לא-מהימן (RLS על הכול, כתיבות רגישות רק דרך
SECURITY DEFINER). לכן המובייל מקבל **בדיוק שני צינורות**, שניהם קיימים:

### 3.1 צינור A: supabase-js ישיר (ברירת המחדל)

כל מה שהאתר עושה היום מצד לקוח או דרך RLS, עם אותו anon key, אותו session
ואותן policies. אפס קוד שרת חדש. המשטח המדויק (אומת מול קבצי 001-035):

- קטלוג וחיפוש (030, public-read): `search_products()`, `autocomplete_products()`,
  `category_facets()`, `log_search_query()`; טבלאות products/categories/coupon_deals
  בקריאה ישירה.
- אזור אישי (קריאה דרך RLS): orders, order_items, payments, coupon_codes,
  `wallet_accounts.balance_ils` + wallet_transactions, payment_tokens (עמודות
  בטוחות בלבד, בלי `select('*')`, לפי 029 סעיף 3.3).
- כתיבות מותרות דרך RPC: `fn_merge_guest_cart`, `fn_set_marketing_consent`,
  `fn_set_default_payment_token`, `fn_request_account_deletion` /
  `fn_cancel_account_deletion`, `check_my_rate_limit` (SEC-05).
- **מרכז ההתראות באפליקציה** = `notifications_outbox` ב-`channel='inapp'`:
  owner קורא את שלו, ומותר לו לעדכן **רק** את `read_at` (הרשאה עמודתית של 031).
  זהו גם יעד ה-Realtime subscription הראשי של האפליקציה; יעדים משניים:
  `coupon_codes` (מעבר `issued -> used` מרענן את הארנק בזמן אמת) ו-`order_items`
  (עדכוני משלוח). Realtime הוא שיפור UX; ה-delta sync של סעיף 5.4 הוא המנגנון
  האמין.

### 3.2 צינור B: `/api/mobile/v1/*` על apps/web (route handlers, לא BFF נפרד)

רק למה שחייב סוד שרת או orchestration:

| endpoint | תוכן | מקבילה קיימת |
|---|---|---|
| `POST /api/mobile/v1/checkout` | `beginCheckout`: אותה טרנזקציה בדיוק (ולידציה, snapshot, orders+payments, Low Profile URL) | server action של שלב 3 |
| `GET /api/mobile/v1/orders/:id/status` | polling אחרי תשלום (סעיף 5.3); קורא דרך RLS של המשתמש | אין (חדש, קריאה בלבד) |
| `POST /api/mobile/v1/push/register` | רישום token ב-`push_subscriptions` (סעיף 5.1) | מתוכנן ממילא ל-PWA push |
| `POST /api/mobile/v1/agents/:key/chat` | streaming SSE של shopping/support (028) | route קיים בתכנון 028 |
| `GET /api/mobile/v1/app-config` | דגלים: `CHECKOUT_ENABLED` (D22), רישום verticals, גרסת מינימום כפויה (force update) | חדש, קריאה בלבד |

כללים מחייבים:
1. **אימות**: `Authorization: Bearer <supabase access token>`; ה-handler בונה
   client עם הטוקן ומאמת `getUser()` (אותו חוק ברזל של 029: לעולם לא getSession).
2. **הלוגיקה לא חיה ב-handler.** ה-handler הוא עטיפה דקה על אותה פונקציה
   מ-`packages/` שה-server action קורא לה. שני entry points, מימוש אחד.
   זה משמר את עיקרון D10: כשה-web checkout מתוקן, המובייל מתוקן.
3. **versioning**: `/v1` קפוא לאחור; שדות חדשים תמיד אופציונליים. אפליקציה
   מותקנת היא לקוח שאי אפשר לעדכן בכפייה (בניגוד ל-web), לכן שבירת חוזה =
   מסלול force-update דרך `app-config` בלבד.
4. rate limits לפי טבלת 5.4 של מסמך האב, דרך `check_my_rate_limit`; כסף
   fail-closed (1.29).

---

## 4. Runtime של מיני-אפים (מודל WeChat, פנימי בלבד)

הקשר: כל ורטיקל (משלוחים בסגנון Wolt, הסעות בסגנון Gett) נבנה פנימית, לעולם
לא צד ג'. לכן ה"sandbox" איננו VM של קוד זר (שגם אסור לפי App Store 3.3.2
לקוד חיצוני): הוא **גבול חוזי שנאכף בשלוש שכבות**: מבנה חבילות + lint בזמן
בנייה, SDK מוגבל-הרשאות בזמן ריצה, ו-RLS בשרת (האכיפה האמיתית).

### 4.1 מודל ההפעלה

- ורטיקל = חבילה ב-`verticals/<key>` שמקומפלת **לתוך** האפליקציה (לא הורדת
  קוד בזמן ריצה). הפעלה/כיבוי הם server-driven דרך טבלת `verticals` המתוכננת
  (`hidden/beta/active/paused`, `min_users_percent`), שמגיעה ב-`app-config`.
- `paused` מוריד ורטיקל מה-hub ומנתב deep links שלו למסך "לא זמין כרגע" מיידית,
  בלי הוצאת גרסה. זה ה-kill switch (אותו דפוס של `agent_prompts.is_active`).
- ורטיקל שנוסף = גרסת אפליקציה חדשה בחנויות; ורטיקל שמת = דגל, לא גרסה.

### 4.2 סכימת ה-manifest (חיה ב-`packages/contracts`)

```typescript
// packages/contracts/src/vertical-manifest.ts
export const verticalManifestSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,15}$/),        // 'shop' | 'food' | 'rides'
  titleHe: z.string(),
  icon: z.string(),                                        // שם אייקון מ-tokens
  minAppVersion: z.string(),                               // semver; ישן מזה לא מציג
  entry: z.string(),                                       // route שורש: '/v/food'
  deepLinkPrefixes: z.array(z.string()),                   // ['/food'] על הדומיין הקנוני
  permissions: z.array(z.enum([
    'wallet:read',        // הצגת יתרה בתוך הורטיקל
    'payments:checkout',  // פתיחת מסך התשלום של הליבה (לעולם לא כתיבת ארנק ישירה)
    'push:topics',        // רישום ל-topics של הורטיקל בלבד (<key>.*)
    'location:foreground',
    'location:background', // rides/food בלבד; דורש הצהרת חנות (סעיף 7.4)
    'camera',
  ])),
  notificationTopics: z.array(z.string()),                 // חייבים פריפיקס '<key>.'
})
```

ולידציה כפולה: בזמן build (סקריפט שמוודא שכל manifest עובר את הסכימה ושאין
שני ורטיקלים עם אותו prefix) ובזמן טעינת ה-registry מהשרת.

### 4.3 מודל ההרשאות: SDK מוזרק, לא import חופשי

ורטיקל לא מייבא את `@ke/api-client` ישירות. הליבה יוצרת עבורו instance של
`KenyonKit` מצומצם לפי ה-manifest:

```typescript
// מה שורטיקל מקבל ב-mount, ורק את זה
interface KenyonKit {
  identity: { userId: string; displayName: string }        // תמיד; בלי email/phone
  wallet?: { getBalance(): Promise<Agorot> }               // רק עם wallet:read
  payments?: {                                             // רק עם payments:checkout
    // יוצר order עם vertical=<key> דרך /api/mobile/v1/checkout,
    // מציג את מסך התשלום של הליבה (ארנק + Cardcom), מחזיר תוצאה סופית.
    checkout(draft: VerticalOrderDraft): Promise<CheckoutResult>
  }
  notifications?: { subscribe(topic: `${string}.${string}`): Promise<void> }
  navigation: { openCore(route: CoreRoute): void }         // ניווט למסכי ליבה בלבד
  data: SupabaseScopedClient                               // client רגיל; הגבול האמיתי הוא RLS
}
```

עקרונות:
1. **הכסף**: לורטיקל אין שום מסלול אל `wallet_transactions`, `payments` או
   Cardcom. `payments.checkout()` הוא הדלת היחידה, והוא ממומש פעם אחת בליבה
   על מעטפת `orders` (+`orders.vertical`, D3). כללי ה-namespace של D4
   (`wallet_reason` פר ורטיקל, `idempotency_key` עם קידומת `food:...`) נאכפים
   בצד השרת של הליבה, לא בורטיקל.
2. **דאטה**: detail tables של ורטיקל (`delivery_jobs`, `ride_details`) מגיעות
   במיגרציה שלו עם RLS משלהן; ה-client המוזרק הוא רגיל כי ההגנה האמיתית היא
   RLS. ה-SDK קיים בשביל שהקוד יהיה בלתי-תלוי וניתן לביקורת, לא כאשליית אבטחה.
3. **PII**: הליבה לא מוסרת email/phone לורטיקל; אם ורטיקל צריך ליצור קשר,
   הוא שולח דרך `notifications.subscribe` + outbox של הליבה.

### 4.4 חוזה הניווט

- Expo Router; הליבה מחזיקה את ה-tab bar (בית/קטגוריות/ארנק/חשבון) ואת ה-hub.
- כל ורטיקל מקבל stack משלו תחת `app/v/<key>/` וחופשי בתוכו; אסור לו לגעת
  ב-tab bar, ב-root layout או במסכי ורטיקל אחר.
- ה-hub נבנה מה-registry (סעיף 4.1): ורטיקל `active` מופיע, `beta` מופיע
  למשתמשי בטא, `hidden/paused` לא. deep link `/food/*` מנותב ל-stack של food
  רק אם הורטיקל פעיל.
- **חוק הגבול נאכף סטטית**: כלל lint (ב-`packages/config`) שאוסר import
  מ-`verticals/<a>` אל `verticals/<b>` ואוסר על `verticals/*` לייבא מ-
  `apps/*`; מותר רק `packages/*` ו-SDK. אותו כלל C4 של מסמך ה-PWA, ברמת חבילות.

### 4.5 ארנק משותף: הרקמה המחברת

התרחיש המכונן: יתרה שנצברה מ-cashback על קופון משולמת על נסיעה. המימוש:
`payments.checkout()` של הליבה מציג את יתרת הארנק ומאפשר `apply_wallet_ils`,
בדיוק כמו ב-web checkout; החיוב קורה ב-webhook בטרנזקציה אחת דרך
`fn_wallet_transfer` (service role, SEC-01). הורטיקל רואה רק את התוצאה.
שום שינוי סכימה מעבר למתוכנן (`orders.vertical` + registry).

---

## 5. דאגות נייטיב

### 5.1 התראות Push

תשתית: הצנרת של 029/031 (events -> fanout -> outbox -> worker) נשארת המוח.
המובייל מוסיף רק ערוץ שליחה.

1. **ספק: Expo Push Service.** API אחד ל-APNs+FCM, token אחיד
   (`ExponentPushToken[...]`), receipts מובנים. ההחלטה חוסכת ניהול חיבור ישיר
   לשני ספקים; אם בעתיד יידרש (עלות/שליטה), ה-adapter ב-worker מתחלף בלי
   שינוי סכימה (עיקרון 031: הספק מנותק מהסכימה).
2. **סכימה**. אומת מול 001-035: לא קיימת שום טבלת device/push token בסכימה
   כיום (`push` הוא רק ערך channel ב-outbox). המיגרציה העתידית שהוכרעה ב-1.26
   (בבעלות דומיין ההתראות) היא תנאי מוקדם קשיח לשלב P2; מסמך זה קובע את צורתה:

```sql
push_subscriptions (
  id uuid PK,
  user_id uuid NOT NULL -> auth.users ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('web','expo')),
  token text NOT NULL,                  -- endpoint (web) או ExponentPushToken (expo)
  device_label text, locale text,
  last_seen_at timestamptz, failed_count int NOT NULL DEFAULT 0,
  UNIQUE (platform, token)
)
```

3. **זרימה**: האפליקציה מבקשת הרשאת OS ברגע ערך (אחרי רכישה ראשונה: "הקופון
   בארנק; רוצה תזכורת לפני שהוא פג?"), לא בהפעלה ראשונה. הרשמה דרך
   `POST /api/mobile/v1/push/register`. ה-worker של ה-outbox שולח ב-channel
   `push` לפי `platform`, קורא receipts של Expo וכותב אותם ל-
   `notification_delivery_events`; `DeviceNotRegistered` = מחיקת השורה
   (המקבילה ל-410 של web push).
4. **מדיניות תוכן**: בדיוק D8 + סעיפים 2/4 של 031. טרנזקציוני דולק, שיווקי
   opt-in מפורש עם `consent_events`, שעות שקט ושבת נאכפים ב-fanout (כבר קיים).
   כל push נושא deep link לעצם (`/account/coupons/<id>` לתזכורת פקיעה).
5. ה-payload לעולם לא נושא PII (עיקרון 3.2 של 031): כותרת גנרית + ids;
   המסך פותר פרטים דרך RLS.

### 5.2 Deep links

1. **https בלבד כלפי חוץ** (D9 בתוקף): אותם URLs קנוניים. ההפעלה:
   - iOS Universal Links: `apple-app-site-association` מוגש מ-`apps/web`
     ב-`/.well-known/` (route handler סטטי).
   - Android App Links: `assetlinks.json` באותו מקום.
   - ה-linking config של Expo Router ממפה: `/products/[slug]`,
     `/category/[slug]`, `/deals/[slug]`, `/account/wallet`,
     `/account/coupons/[id]`, `/r/[code]`, וכל `deepLinkPrefixes` של ורטיקלים.
   - path שהאפליקציה לא מכירה (דף תוכן, אדמין): נפתח in-app browser אל האתר.
     כך אף קישור לא נשבר לעולם, גם באפליקציה ישנה.
2. **scheme פנימי `kenyonexpress://` קיים לשני שימושים בלבד**: redirect של
   OAuth (סעיף 5.5) ומעברי מסכים פנימיים מ-push. הוא לא מתפרסם לעולם בקישור
   יוצא (D9 נשמר: כל שיתוף הוא https).
3. **ייחוס**: `/r/[code]` שנפתח באפליקציה קורא endpoint מדידה (אותו route של
   ה-web) ואז מנווט ליעד; העוגייה של ה-web מוחלפת ברישום מקומי + פרמטר
   attribution ל-`beginCheckout` (השדות של 033 על orders).
4. deferred deep link (התקנה מתוך קישור): Android דרך Install Referrer API;
   iOS נשאר בלי (ההכרעה מ-8.5 של מסמך ה-PWA: לא מכניסים SDK ייחוס צד ג'
   בשלב זה. נשקל מחדש רק אם שיווק ממומן יידרוש).

### 5.3 Cardcom: WebView, לא SDK

**ההכרעה: מסך תשלום = `react-native-webview` במודאל מלא שטוען את Cardcom Low
Profile URL. אין SDK נייטיב.**

נימוקים: (1) ל-Cardcom אין SDK רשמי ל-React Native; המוצר שלה הוא hosted page.
(2) ה-hosted page הוא מה ששומר אותנו ב-SAQ-A (פרטי כרטיס לא נוגעים בקוד שלנו,
עיקרון 029). (3) כל צנרת ה-webhook, האימות server-to-server וה-idempotency
(T3 של 026) עובדת כמות שהיא. (4) Apple 3.1.5(a): מוצרים/שירותים שנצרכים מחוץ
לאפליקציה חייבים להיסלק מחוץ ל-IAP; Cardcom בדפדפן/WebView הוא המסלול התקין.

פרטי המימוש:
1. הזרימה: `payments.checkout()` -> `POST /api/mobile/v1/checkout` -> קבלת
   `redirect_url` -> WebView במודאל (נעול לדומיין Cardcom בלבד דרך
   `onShouldStartLoadWithRequest`; ניווט חיצוני נחסם). 3DS רץ בתוך ה-WebView.
2. **סיום העסקה לא נקבע ב-WebView.** יירוט ה-redirect לעמוד ה-success סוגר
   את המודאל ומעביר למסך "מאמת תשלום..." שעושה polling על
   `GET /api/mobile/v1/orders/:id/status` (עד 60 שניות, ואז מסך "התשלום
   בבדיקה, נעדכן בהתראה"). מקור האמת היחיד: מעבר ההזמנה ל-`paid` ע"י ה-webhook
   המאומת (R12: browser redirect לעולם לא משנה state; חל גם על WebView).
   ה-push של `coupon_delivered` הוא ההשלמה גם אם המשתמש סגר את האפליקציה.
3. שמירת כרטיס לרכישה הבאה: אותו מנגנון token של ה-web (הטוקן נשמר ב-webhook,
   service role, SEC-15). one-click עתידי: `chargeWithToken` דרך endpoint
   בצינור B, בלי WebView בכלל.
4. `CHECKOUT_ENABLED=false` (D22, מגיע ב-`app-config`): כפתור התשלום מוחלף
   בהודעת תחזוקה. נבדק לפני פתיחת המודאל וגם בשרת.

### 5.4 ארנק קופונים offline עם QR

עקרונות D6/D7 בתוקף מלא (שרת = אמת, סטטוסים חד-כיווניים, החתימה מוכיחה
אותנטיות ולא חד-פעמיות). המימוש הנייטיב:

1. **אחסון: MMKV** (`react-native-mmkv`), אזור `coupon_wallet`, רשומה פר קופון
   באותה סכימה של מסמך ה-PWA סעיף 3.2 (coupon_id, code, qr_token, qr_key_id,
   שם דיל, שם עסק, face_value_ils, collect_amount_ils, expires_at, status,
   updated_at). MMKV ולא SQLite: עשרות רשומות, קריאה סינכרונית במסך הארנק,
   אפס migrations מקומיות. יתרון מבני על ה-PWA: אין eviction של Safari;
   ה-cache שורד עד מחיקת האפליקציה.
2. **רינדור QR מקומי**: `react-native-qrcode-svg` על מחרוזת ה-`qr_token`
   (`KE1.<payload>.<sig>` של 027). אפס תלות רשת בזמן הצגה; `expo-brightness`
   מקפיץ בהירות בזמן הצגת ה-QR (קופה עם סורק).
3. **סנכרון**: delta לפי cursor (`updated_at > last_sync`) בכל כניסה
   ל-foreground + בפתיחת מסך הארנק; push בנושאי `coupon_delivered` /
   `coupon_redeemed` מפעיל סנכרון מיידי (notification handler), כך שקופון חדש
   יושב בארנק לפני שהמסך נפתח. אין קונפליקטים: הלקוח לעולם לא כותב סטטוס.
4. **UI אמת**: באנר "עודכן לפני X" במצב offline (קופון שמומש ממכשיר אחר לא
   יפתיע בקופה); קופונים שמומשו/פגו לא נשמרים ב-cache (בלבול בקופה); מסך
   הקופון מציג את הקוד הידני בספרות גדולות כ-fallback לסורק.
5. **נעילה ביומטרית של מסך הארנק**: מופעלת כברירת מחדל, ניתנת לכיבוי בהגדרות.
   `expo-local-authentication` לפני פתיחת `/account/coupons`. (זה ה-nice-to-have
   שהיה "עתידי" ב-PWA והופך כאן לסטנדרט.)
6. הצד הסורק (הספק) נשאר PWA לפי 027 סעיף 3.5; ורטיקל "supplier" נייטיב עם
   `expo-camera` הוא מועמד עתידי, לא בהיקף המסמך. כשיגיע, התשתית כבר מוכנה
   לו בצינור A: `redeem_coupon()` (מוענק ל-authenticated, אנטי-אנומרציה
   ו-rate limit בפנים) ו-views הספק של 034 (`v_supplier_sales_daily` וכו',
   `security_invoker` שמסתמך על ה-RLS של 027) נקראים ישירות מהמכשיר.

### 5.5 התחברות וביומטריה

1. **OAuth נייטיב**: Google דרך `expo-auth-session` בזרימת id_token ->
   `supabase.auth.signInWithIdToken({ provider: 'google' })`. **חובה להוסיף
   Sign in with Apple** (`expo-apple-authentication` -> `signInWithIdToken`):
   App Store guideline 4.8 מחייב חלופת Apple כשיש התחברות צד ג'. פעולה נגזרת:
   הפעלת ספק Apple ב-Supabase Auth (רישום Services ID). email/magic-link נשאר גיבוי.
2. **אחסון session**: storage adapter של supabase-js מעל `expo-secure-store`
   (Keychain/Keystore). לא AsyncStorage: refresh token הוא סוד.
3. **ביומטריה = שער מקומי, לא זהות.** Face ID/טביעה פותחים את הגישה ל-session
   השמור (cold start עם נעילת אפליקציה מופעלת, ומסך הארנק לפי 5.4.5). כישלון
   ביומטרי = fallback לקוד מכשיר, ואחריו re-login מלא. הביומטריה לעולם לא
   מדלגת על תוקף ה-session של Supabase.
4. **re-auth לפעולות רגישות** (מחיקת חשבון, מחיקת אמצעי תשלום, שינוי email):
   בדיוק מנגנון 029 סעיף 5.4 (גיל `amr`, מקסימום 15 דקות): האפליקציה שולחת
   ל-OAuth מחדש עם `prompt=login`. ביומטריה איננה תחליף (הדרישה היא אימות מול
   ה-IdP, לא מול המכשיר).
5. ניתוק מכל המכשירים (`signOutAll` scope global) מוצג במסך privacy, כמו ב-web.

---

## 6. אסטרטגיית RTL עברית-first ב-React Native

עיקרון: האפליקציה היא עברית-first עם תשתית i18n מלאה (אותם messages של ה-web),
לא אפליקציה אנגלית שתורגמה.

1. **כפיית RTL ברמת ה-native build**, לא בזמן ריצה:
   `expo-localization` plugin + `"forcesRTL": true` (ו-`supportsRTL`)
   ב-app.config, שמתרגם ל-`I18nManager.forceRTL(true)` לפני טעינת JS.
   כך אין מסך ראשון LTR ואין צורך ב-reload אחרי שינוי. שפת בסיס `he`;
   locale המכשיר לא קובע כיווניות, רק את שפת המערכת בדיאלוגים.
2. **סטיילינג לוגי בלבד**: NativeWind עם utilities לוגיים (`ms-*`, `me-*`,
   `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`). `left`/`right` פיזיים
   אסורים בקוד מובייל (כלל lint; אותו עיקרון של סקיל `rtl-hebrew-ui` של ה-web).
   RN ממפה start/end אוטומטית תחת forceRTL.
3. **אייקונים וכיווניות**: חיצי ניווט והתקדמות מתהפכים (chevron "קדימה" מצביע
   שמאלה); אייקונים סימטריים או א-כיווניים (טלפון, לב, סל) לא מתהפכים; אייקון
   ה-back של ה-header מגיע הפוך מ-Expo Router תחת RTL אוטומטית. רשימת האייקונים
   ב-`packages/tokens` מסומנת `mirrorInRtl: boolean` פר אייקון.
4. **טקסט דו-כיווני**: כל טוקן LTR משובץ (קוד קופון, מספר הזמנה `KE-...`,
   URL, מספר טלפון) נעטף ב-Unicode isolates (`⁦...⁩` או `‏`)
   דרך עזר `bidi()` ב-`packages/i18n` (אותם כללים של תבניות המייל ב-031 סעיף
   3.5, מיושמים פעם אחת ומשומשים בכל הפלטפורמות).
5. **מספרים וכסף**: ספרות מערביות, `Intl.NumberFormat('he-IL')` דרך עזרי
   `@ke/i18n`; סכום תמיד עם ש"ח אחרי המספר; תאריכים `he-IL` (`Intl` מלא זמין
   ב-Hermes).
6. **פונט**: Heebo דרך `expo-font` (אותו פונט של ה-web), משקלים 400/500/700;
   fallback מערכת. נטען לפני splash hide (אין FOUT).
7. **בדיקות RTL**: snapshot tests על מסכי הליבה תחת forceRTL; בדיקת
   ידנית בכל release על מכשיר iOS ו-Android פיזיים (רינדור RTL שונה ביניהם
   בקצוות: TextInput alignment, FlatList horizontal).
8. אנגלית (`en.json` הקיים) נשארת נתמכת ברמת המסגרת אבל לא ב-scope שיווקי;
   ה-store listing עברית בלבד בשלב הראשון.

---

## 7. צינור ההפצה: EAS ומגבלות החנויות

### 7.1 EAS Build + Update + Submit

```
eas.json profiles:
  development   dev client, סימולטור/מכשיר, APS sandbox
  preview       internal distribution (TestFlight internal + APK), ENV של dev Supabase
  production    store builds, ENV פרודקשן, אוטו-increment של buildNumber/versionCode
```

1. **ערוצים**: EAS Update channels תואמים ל-profiles. `runtimeVersion:
   { policy: "appVersion" }`: כל שינוי native (מודול חדש, הרשאה חדשה) = גרסת
   חנות; תיקוני JS/UI = OTA לערוץ production אחרי אימות ב-preview.
2. **מדיניות OTA**: OTA מותר לתיקונים ושיפורים בתוך אותו runtime, לעולם לא
   לפיצ'ר שמשנה את מה שהחנות ביקרה (זה גם החוק של Apple 3.3.2 לגבי קוד שמוריד
   האפליקציה: מותר רק דרך מנגנון כמו expo-updates ובלי לשנות את מהות האפליקציה).
   באג בקופה/ארנק = OTA תוך שעות; זה סוגר את רוב הפער מול יתרון ה-deploy המיידי
   של ה-PWA.
3. **CI (הרחבת ci.yml של D8, אותו workflow)**: על PR: turbo affected
   (type-check, lint, vitest של packages, בדיקות web). PR שנוגע ב-mobile:
   גם `eas build --profile preview --non-interactive` + בדיקות Maestro smoke
   (פתיחה, התחברות demo, מסך ארנק, רינדור QR) על ה-build. tag `mobile-v*`:
   build פרודקשן + `eas submit` לשתי החנויות; ההגשה לביקורת נשארת כפתור ידני.
4. **secrets**: EAS secrets נפרדים מ-Vercel env; אותו משטר rotation של מסמך
   התפעול. באפליקציה אין שום סוד שרת (anon key איננו סוד; כל היתר בצינור B).
5. Node 22 ננעל גם כאן (D19); pnpm + turbo cache ב-CI.

### 7.2 מגבלות App Store (אפליקציית קופונים/ארנק בישראל)

| Guideline | משמעות אצלנו | טיפול |
|---|---|---|
| 3.1.5(a) גם 3.1.3(e): מוצרים ושירותים פיזיים שנצרכים מחוץ לאפליקציה | חובה לסלוק מחוץ ל-IAP; אסור IAP על קופונים/מוצרים פיזיים | Cardcom ב-WebView (5.3). בלי עמלת 30%. לציין במפורש ב-review notes |
| 4.2 minimum functionality | "אתר עטוף" נדחה | האפליקציה נייטיב אמיתית: push, ארנק offline, ביומטריה, מצלמה. לא עטיפת webview |
| 4.8 Login Services | יש Google -> חובה Sign in with Apple שווה-ערך | סעיף 5.5.1 |
| 5.1.1(v) account deletion | חובת מחיקת חשבון מתוך האפליקציה | מסך privacy קורא `fn_request_account_deletion` (029). קיים בתכנון ממילא |
| 2.1 App Completeness | reviewer חייב לחוות רכישה ומימוש | חשבון demo ייעודי בפרודקשן + דיל demo של "ספק ביקורת" עם קופון אמיתי במחיר מינימלי; הוראות בעברית+אנגלית ב-review notes. הערה: SEC-14 אוסר seed של demo בפרודקשן; חשבון ה-review נוצר ידנית ומתועד, לא במיגרציה |
| 5.1.1/5.1.2 פרטיות | privacy labels, הצהרת איסוף | מיפוי מ-033 (analytics first-party) + הצהרת מיקום רק כשורטיקל ידרוש |

הערת ארנק: הארנק הוא closed-loop credit (אין טעינה בכסף, אין משיכה, רק
cashback שמתממש בפלטפורמה): לא "wallet פיננסי" במובן רגולטורי ולא Apple Pay
competitor; מוצג בחנות כ"יתרת קניות". ניסוח ה-listing נמנע מהמילה "ארנק
דיגיטלי" באנגלית (financial app classification).

### 7.3 מגבלות Google Play

1. Payments policy: מוצרים/שירותים פיזיים ושוברים למימוש פיזי פטורים מ-Play
   Billing במפורש. Cardcom תקין.
2. הצהרות Data Safety + הצהרת הרשאות רגישות: מיקום רק כשורטיקל geo יופעל
   (`ACCESS_FINE_LOCATION` לא נכלל ב-build עד אז; ההרשאה מתווספת רק עם
   הורטיקל שדורש אותה, כדי לא לעבור הצהרות מיותרות).
3. Financial features declaration: לענות "לא" (אין הלוואות, אין e-money;
   closed-loop credit).
4. מסלול השקה: internal testing -> closed track (משפחה/מכרים) -> production
   עם staged rollout 10%->50%->100%.

### 7.4 הרשאות עתידיות (ורטיקלים)

`location:background` (rides/food) גורר ביקורת מחמירה בשתי החנויות (הצהרת
שימוש, וידאו הדגמה ל-Apple). לכן ההרשאה נכנסת ל-build רק בגרסה שמפעילה ורטיקל
שדורש אותה, לעולם לא "מראש".

---

## 8. שלבי בנייה ושערי יציאה

התלות בקומרס: שלב 0 של מסלול המדורג (סעיף 11.5) בתוקף: אין אפליקציה לפני שיש
checkout web חי (מסמך האב, שלבים 1-3). המובייל נבנה במקביל לשלבים 4-5, לא לפניהם.

| שלב | תוכן | שער יציאה |
|---|---|---|
| P0 | M0-M2: monorepo, חילוץ packages | web בפרודקשן מ-`apps/web`, אפס רגרסיה, יחס שיתוף נמדד ב-CI |
| P1 | M3 + שלד: auth נייטיב (Google+Apple), קטלוג, דף דיל, RTL מלא | התחברות ורכישת-דמה על מכשירים אמיתיים; snapshot RTL ירוקים |
| P2 | ארנק קופונים offline + push (מיגרציית `push_subscriptions` + worker) | קופון מוצג במצב טיסה; תזכורת פקיעה נוחתת כ-push ומנווטת לקופון |
| P3 | checkout Cardcom ב-WebView + deep links (AASA/assetlinks) | עסקת אמת מקצה לקצה באפליקציה; קישור מוצר מ-WhatsApp נפתח באפליקציה |
| P4 | חנויות: TestFlight/closed track -> ביקורת -> production | אישור שתי החנויות; staged rollout הושלם |
| P5 | מסגרת המיני-אפים: KenyonKit, registry, מיגרציית `verticals`+`orders.vertical` | ורטיקל demo פנימי עובר מ-hidden ל-active בלי deploy; PR שלו לא נוגע בקוד ליבה |

---

## 9. סיכום החלטות

| # | החלטה |
|---|---|
| M1 | פלטפורמה: React Native + Expo (managed + dev client, Expo Router, NativeWind, TanStack Query, use-intl). מחליף את D1/D2/R27. ה-web נשאר קנוני ל-SEO ולרכישה בדסקטופ |
| M2 | Monorepo: Turborepo + pnpm workspaces; `apps/web`, `apps/mobile`, `packages/{contracts,db,core,api-client,i18n,tokens,config}`, `verticals/*`; מעבר בצעדים אטומיים M0-M3 עם Vercel Root Directory ו-rollback מיידי |
| M3 | יעד שיתוף: 80%+ מהקוד הלא-UI ב-packages, נאכף בכלל review ובמדד CI |
| M4 | גישת שרת: צינור A = supabase-js ישיר (RLS + RPCs קיימים); צינור B = `/api/mobile/v1` דק על apps/web רק לסודות שרת (checkout, push register, agents, config). אין BFF נפרד, אין מסלול כסף חדש |
| M5 | מיני-אפים: ורטיקלים כחבילות פנימיות מקומפלות, manifest מוצהר (zod), SDK מוזרק מוגבל-הרשאות, ניווט ב-stack מבודד, כיבוי server-driven דרך registry. אכיפה אמיתית: RLS + מסך תשלום של הליבה בלבד |
| M6 | ארנק בורטיקלים: דרך `payments.checkout()` של הליבה בלבד, על מעטפת `orders.vertical` (D3/D4 בתוקף) |
| M7 | Push: Expo Push Service; `push_subscriptions(platform 'web'/'expo')`; ה-outbox/fanout של 029/031 ללא שינוי; opt-in שיווקי לפי D8/30א |
| M8 | Deep links: https בלבד דרך Universal/App Links על הדומיין הקנוני; scheme פנימי רק ל-OAuth; path לא מוכר נפתח in-app browser |
| M9 | Cardcom: WebView נעול-דומיין על Low Profile; אישור עסקה רק מ-webhook דרך polling/push; שומר SAQ-A ו-3.1.5(a); אין SDK נייטיב |
| M10 | ארנק קופונים offline: MMKV + רינדור QR מקומי מ-`qr_token`; delta sync + סנכרון מונע-push; נעילה ביומטרית כברירת מחדל; שרת = אמת (D6/D7) |
| M11 | זהות: OAuth נייטיב (Google + Apple חובה) -> `signInWithIdToken`; session ב-SecureStore; ביומטריה = שער מקומי; re-auth 15 דק' לפעולות רגישות (029) |
| M12 | RTL: forceRTL בזמן build, סטיילינג לוגי בלבד (lint), עזרי bidi משותפים ב-`@ke/i18n`, Heebo, עברית-first |
| M13 | הפצה: EAS Build/Submit/Update; runtimeVersion=appVersion; OTA לתיקוני JS בלבד; CI מורחב מ-ci.yml עם turbo affected + Maestro |
| M14 | חנויות: סליקה חיצונית כדין לקופונים/פיזי; Sign in with Apple; מחיקת חשבון במסך privacy; חשבון review ידני (לא seed, SEC-14); הרשאות מיקום נכנסות רק עם הורטיקל שצריך אותן |

## 10. תיקונים נדרשים במסמכים הקנוניים (כשההקפאה על docs/ תוסר)

1. `MASTER-ARCHITECTURE.md`: עדכון R27 (פלטפורמת מובייל: RN+Expo לפי מסמך זה;
   PWA יורד מ"יעד" ל"גשר עד ההשקה"), הוספת הכרעות M1-M14 לרישום, ועדכון שלב 6.
   **בוצע ב-v2.**
2. ‏`ARCHITECTURE-SUPERAPP-MOBILE.md`: **בוצע באיחוד v3**: המסמך נבלע בסעיף 11
   כאן ונמחק; D1/D2 מסומנים כמוחלפים והחוזים C1-C4 ‏+ ‏D3-D10 נשמרו במלואם.
3. מיגרציית push העתידית (1.26): לאמץ את הסכימה מסעיף 5.1.2 (platform
   'web'/'expo').
4. `ARCHITECTURE-TESTING-CICD.md`: הרחבת ci.yml למשימות turbo + mobile lane.
5. `CLAUDE.md`: עדכון חוק הנתיב היחיד אחרי M1 (apps/web), באותו commit של המעבר.
6. שאלות שנשארות פתוחות בכוונה: מספר חשבון Apple Developer/Play Console (על מי
   נרשם), עיתוי הוספת WhatsApp כערוץ push חלופי, וורטיקל הספקים הנייטיב.

---

## 11. נספח: החוזים המחייבים מהמסמך שנבלע (ARCHITECTURE-SUPERAPP-MOBILE, ‏2026-07-08)

המסמך המקורי נמחק באיחוד v3. ‏D1/D2 שלו הוחלפו (סעיף 0); כל השאר כאן, בתוקף
מלא. מקור הסמכות להכרעות שכבר עוגנו במסמך האב: המסמך האב.

### 11.1 עקרונות על שנשארים

1. **הליבה המשותפת היא חוזה, לא ספרייה.** זהות, ארנק, תשלומים, התראות ו-audit
   הם חוזים יציבים שכל ורטיקל צורך. ורטיקל לעולם לא נוגע בורטיקל אחר, רק בליבה.
2. **הכסף זז רק בצינורות הקיימים.** ‏`orders` + ‏`payments` + ‏`fn_wallet_transfer()`
   ‏+ פונקציות ‏SECURITY DEFINER. ורטיקל חדש לא ממציא מסלול כסף; הוא מרכיב
   ‏detail tables על המעטפת הקיימת.
3. **offline הוא cache, השרת הוא אמת.** חתימת Ed25519 מוכיחה אותנטיות offline;
   חד-פעמיות נאכפת רק ב-DB (העיקרון מ-027 סעיף 3.1).
4. **קטלוג הוא לא ליבה.** לכל ורטיקל הדומיין שלו (לקומרס `products`, למשלוחי
   אוכל `restaurants`/`menus`, להסעות אין קטלוג). אין "קטלוג גנרי".

### 11.2 חוזה C1: זהות והרשאות

- ‏`profiles` + ‏`user_role` הם המקור היחיד לזהות. אין ערכי enum פר ורטיקל.
- **תבנית ה-membership של 027 היא החוזה**: כמו `supplier_members`
  ‏(owner/manager/scanner), ורטיקל חדש מביא טבלת membership משלו באותה תבנית:

```
supplier_members  (קיים, 027)    ->  is_supplier_member()
courier_members   (food, עתידי)  ->  is_courier_member()
driver_members    (rides, עתידי) ->  is_driver_member()
```

- כל טבלת membership מגיעה עם פונקציות עזר SECURITY DEFINER משלה, RLS משלה
  ו-audit trigger מ-025. אין קשר בין חברות של אותו משתמש בשני ורטיקלים.

### 11.3 חוזה C2: מעטפת הכסף

- **`orders` היא מעטפת התשלום האוניברסלית של כל הורטיקלים.** מיגרציה עתידית
  מוסיפה עמודה אחת: ‏`orders.vertical` (ברירת מחדל `'shop'`). זה כל השינוי.
- ורטיקל מוסיף detail tables שמפנות אל המעטפת ולא נוגע בשום טבלת כסף:

```
food:  delivery_jobs (order_id FK, restaurant_id, courier_id, eta, geo...)
rides: ride_details  (order_id FK, driver_id, pickup, dropoff, route...)
```

- מה מתקבל בחינם לכל ורטיקל: ‏payments + ‏payment_webhook_events ‏(idempotency,
  ‏replay protection), ‏refund flow, ‏reconciliation מול Cardcom, ‏snapshot פר
  שורה ב-`order_items`, ‏settlement דרך מנוע ה-statements של 027, ‏cashback
  והחלת ארנק בצ'קאאוט.
- **הארנק**: ורטיקל קורא ל-`fn_wallet_transfer()` בלבד (דרך הליבה, ‏service_role,
  ‏SEC-01), עם שני כללי namespace: ערכי ‏`wallet_reason` חדשים נוספים במיגרציה
  של הורטיקל (`ride_fare`, ‏`food_refund_credit`); ‏`idempotency_key` עם קידומת
  ורטיקל (`food:order:<uuid>:cashback`).

### 11.4 חוזי C3 ו-C4: התראות וגבולות קוד

- ‏C3: ‏registry של ‏topics בקונבנציה ‏`<vertical>.<entity>.<event>`
  ‏(`shop.order.paid`, ‏`food.courier.assigned`). ורטיקל שולח דרך
  ‏`notify(user_id, topic, payload)` אחת; ‏preferences, חוק הספאם, ‏quiet hours
  וה-log נאכפים במקום אחד. (מפתחות האירועים הפנימיים של 031 נשארים snake_case
  שטוח לפי הכרעת האב [1.27]; המוסכמה המנוקדת שמורה לורטיקלים עתידיים.)
- ‏C4 (בצד ה-web): ‏route group פר ורטיקל, ‏UI פרטי ב-`src/components/<vertical>/`,
  ‏server actions פרטיים; ‏`src/server/actions/payments/` = ליבה בלבד. אכיפה
  סטטית: קובץ תחת ורטיקל לא מייבא מורטיקל אחר. אין FK בין טבלאות של שני
  ורטיקלים; FK מותר רק אל הליבה. (המקבילה ברמת החבילות: סעיף 4.4 כאן.)

### 11.5 רישום ורטיקלים, המסלול המדורג וה-PWA כגשר

- טבלת `verticals` (עתידית): ‏`key`, ‏`title_he`, ‏`icon`, ‏`status`
  ‏(hidden/beta/active/paused), ‏`sort_order`, ‏`min_users_percent`. ‏`paused`
  מוריד ורטיקל מה-UI מיידית בלי deploy (דפוס ה-kill switch של `agent_prompts`).
- שלב 0 של המסלול המקורי בתוקף: אין אפליקציה לפני checkout web חי.
- **מה נשאר מהמסלול הישן כגשר ה-PWA** (עד השקת אפליקציית ה-RN):
  ‏`app/manifest.ts` ‏(display standalone, ‏dir rtl), ‏service worker ‏(Serwist,
  ‏precache ל-app shell), ארנק קופונים offline ב-IndexedDB ‏(store ‏`coupon_wallet`,
  אותה סכימת רשומה של סעיף 5.4 כאן, ‏delta sync לפי ‏`updated_at`, הלקוח לעולם
  לא כותב סטטוס), ‏prompt התקנה ברגע ערך, מרכז התראות in-app על ‏outbox.
- **מה מת עם D1**: עטיפות החנות (TWA ל-Play, ‏Capacitor ל-App Store). ההפצה
  לחנויות היא דרך אפליקציית ה-RN בלבד (סעיף 7).
- **סורק הספק נשאר PWA** (027 סעיף 3.5) גם אחרי השקת האפליקציה: אימות Ed25519
  ‏offline בסורק (מפת מפתחות ציבוריים לפי ‏`kid`, רוטציה: מפתח חדש נכנס, ישנים
  נשארים); ‏intent מקומי בתור ‏(`redeem_intents` ב-IDB) שמנוקז אל
  ‏`redeem_coupon()` בחזרת רשת; ‏`already_used` מהתור מוצג כהתראה. **הכלל העסקי
  לא מתרכך: אין מסירת סחורה לפני אישור online.**

### 11.6 סטטוס הכרעות D1-D10 של המסמך שנבלע

| # | החלטה | סטטוס |
|---|---|---|
| D1 | ‏PWA + עטיפות TWA/Capacitor | **הוחלף** ב-M1 ‏(RN+Expo); ‏PWA = גשר בלבד |
| D2 | הלקוח הוא תמיד ה-web app | **הוחלף** ב-M4 (שני צינורות: supabase-js ‏+ ‏`/api/mobile/v1`) |
| D3 | ‏`orders` מעטפת אוניברסלית + ‏`orders.vertical` | בתוקף (11.3) |
| D4 | ארנק דרך ‏`fn_wallet_transfer` בלבד + ‏namespace פר ורטיקל | בתוקף (11.3) |
| D5 | ‏membership בתבנית ‏`supplier_members`, לא enum | בתוקף (11.2) |
| D6 | ארנק קופונים offline: ‏cache מקומי, שרת = אמת | בתוקף; מימוש נייטיב ב-MMKV (5.4), גשר ה-PWA ב-IndexedDB (11.5) |
| D7 | מימוש offline: ‏Ed25519 = אותנטיות; חד-פעמיות online בלבד | בתוקף (11.5) |
| D8 | ‏push שיווקי תחת מלוא משטר 30א | בתוקף; ממומש ב-031 ‏(consent_events) |
| D9 | ‏deep links = https בלבד; לא משתפים קופון | בתוקף; ‏scheme פנימי ל-OAuth בלבד (5.2) |
| D10 | הקומרס לא נבנה מחדש באף שלב | בתוקף; עיקרון העל |

### 11.7 סטטוס השאלות הפתוחות של המסמך שנבלע

1. סדר החלת ההתראות: נסגר. ‏029 ואז 031; ‏push_subscriptions במיגרציית push
   עתידית בבעלות דומיין ההתראות [1.26], בסכימת סעיף 5.1.2 כאן.
2. דומיין קנוני: נסגר. ‏kenyonexpress.co.il (אותו דומיין, ‏cutover לפי OPS).
3. סיווג תזכורות תוקף כהודעת שירות: העמדה אומצה; הנוסח בסבב הייעוץ המשפטי
   המאוחד (LEG-14).
4. חשבון Apple Developer / Play Console: פתוח (גם בסעיף 10.6 כאן).
5. ‏deferred deep link ב-iOS: נסגר. בלי SDK צד ג' (5.2.4 כאן).
6. ‏WhatsApp Business API: נסגר. ‏Meta Cloud API ישיר [1.44].
7. ביומטריה לארנק: נסגר. סטנדרט באפליקציית ה-RN ‏(5.4.5); לא נבנה WebAuthn בגשר.
8. ‏retention להתראות: נסגר ברישום ה-retention של האב [1.31].
