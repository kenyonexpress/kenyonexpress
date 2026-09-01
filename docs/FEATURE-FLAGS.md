# דגלי מוצר בקוד

אין טבלת `feature_flags`. אין LaunchDarkly. דגל הוא משתנה סביבה, משתנה GitHub, או עמודה על שורה. המסמך הזה הוא רק מה שהקוד קורא היום. שמות מארכיטקטורה שלא מופיעים ב-`src/` רשומים בסוף, כדי שלא ייחשבו קיימים.

שלוש קבוצות:

1. **יכולת בנויה, כבויה עד הדלקה.** הקוד קיים. ברירת המחדל סוגרת.
2. **יכולת בנויה, דולקת עד כיבוי.** הקוד קיים. ברירת המחדל פתוחה, יש בלם.
3. **שם בלי קוד.** מופיע ב-`docs/ROADMAP.md` או בארכיטקטורה. אין קורא. הדלקה דורשת בנייה, לא env.

`is_coupon_enabled` על מוצר אינו דגל מוצר. זה סוג מוצר (קופון מול פיזי). לא מתועד כאן.

---

## סיכום

| דגל | ברירת מחדל | קבוצה |
| --- | --- | --- |
| `CHECKOUT_ENABLED` | פרוד: כבוי. אחרת: דולק | בנוי, כבוי בפרוד עד `true` |
| `PUSH_ENABLED` | כבוי | בנוי, כבוי |
| `PHONE_AUTH_ENABLED` | כבוי | בנוי, כבוי |
| `NEXT_PUBLIC_PHONE_AUTH_ENABLED` | כבוי | בנוי, אין קורא UI |
| `EXPO_PUBLIC_PHONE_AUTH_ENABLED` | כבוי | בנוי, כבוי (אפליקציה) |
| `ALERTS_ENABLED` | דולק | בנוי, דולק עד `false` |
| `SENTRY_DEBUG_ROUTES` | כבוי | בנוי, כבוי |
| `CARDCOM_USE_MOCK` | מחוץ לפרוד: דולק בלי מסוף. בפרוד: כבוי | בנוי |
| `CARDCOM_SANDBOX` | כבוי. בפרוד `true` מפיל boot | בנוי |
| `CARDCOM_ALLOW_SANDBOX` | כבוי | בנוי, כבוי |
| `ALLOW_INCOMPLETE_ENV` | כבוי | boot מקומי / CI, לא דגל מוצר |
| `CRON_SCHEDULER_ENABLED` | כבוי (משתנה GitHub) | בנוי, כבוי |
| `WP_IMPORT_ALLOW_WRITES` | כבוי | כלי ייבוא, כבוי |
| `products.whatsapp_enabled` | `false` (עמודה עדיין pending) | בנוי חלקית, כבוי |
| `referral_program_settings.is_active` | אין שורה | בנוי, כבוי |
| `products.cashback_percent` | `0` | בנוי, כבוי בפועל |
| חיפוש Meili / R2 / Wallet / GA4 / Meta | נעדר = כבוי | בנוי, כבוי בלי סודות |

---

## בנוי, כבוי עד הדלקה

### `CHECKOUT_ENABLED`

**מה זה.** בלם קופה. בלי זה אין חיוב חדש.

**ברירת מחדל.** בפרוד (`NODE_ENV=production`) רק המחרוזת המדויקת `true` פותחת. חסר, ריק, `TRUE`, `1`, `yes`: סגור. מחוץ לפרוד פתוח אלא אם מוגדר `false`.

**איפה נקרא.**

```
src/lib/payments/env.ts
```

`loadCardcomEnv()`. הקוראים:

```
src/server/actions/payments/checkout.ts
```

(`beginCheckout` / `runBeginCheckout`)

```
src/app/api/cron/stranded-payments/route.ts
src/app/api/cron/reconcile/route.ts
```

**דולק.** `beginCheckout` יוצר הזמנה ומעביר ל-Cardcom.

**כבוי.** הקוד מחזיר `CHECKOUT_DISABLED`. לקוח רואה שהתשלום מושבת. webhook ו-`checkout_finalize` להזמנה שכבר חויבה ממשיכים: לקוח ששילם לא נתקע באמצע.

**למה כבוי בפרוד.** מסוף ייצור עדיין לא מחובר. שער הכסף דורש `true` במפורש אחרי עסקת בדיקה.

---

### `PUSH_ENABLED`

**מה זה.** Push לטלפון דרך Expo, רגל נפרדת ממייל Resend באותו outbox.

**ברירת מחדל.** כבוי. רק `true` או `1`.

**איפה נקרא.**

```
src/lib/push/expo.ts
```

`pushEnabled()`. `sendExpoPush()` מדלג לפני רשת. הקורא:

```
src/lib/push/dispatch.ts
```

**דולק.** cron ההתראות שולח לטוקנים רשומים. בלי `EXPO_ACCESS_TOKEN` עדיין שולח (Expo מקבל שליחה לא מאומתת לרוב הפרויקטים).

**כבוי.** `{ skipped: true, reason: 'push disabled' }`. אין ניסיון, אין שריפת retry. הדלקה מאוחרת מוצאת תור שלא נשרף.

**למה כבוי.** בלי אפליקציה מותקנת וטוקנים חיים זה רעש. Preview לא אמור לדחוף ללקוחות אמיתיים.

---

### `PHONE_AUTH_ENABLED`

**מה זה.** כניסה ב-SMS (OTP) לישראלים בלי Google.

**ברירת מחדל.** כבוי. רק `true` או `1`.

**איפה נקרא.**

```
src/lib/auth/phone-otp.ts
```

`phoneAuthEnabled()`. קוראים:

```
src/app/(auth)/login/page.tsx
src/server/actions/auth.ts
```

העמוד קורא בשרת ומעביר `phoneEnabled` ל-`LoginForm`. אין תלות ב-`NEXT_PUBLIC_*` ב-UI, בכוונה: משתנה ציבורי נצלה בזמן build ונשאר אחרי כיבוי.

**דולק.** טופס טלפון בלוגין. השליחה הולכת לספק SMS ב-Supabase. בלי ספק בדשבורד כל שליחה נכשלת בהודעה שהלקוח לא יכול לתקן.

**כבוי.** האופציה לא מרונדרת. הפעולות מחזירות "כניסה בטלפון אינה זמינה כרגע". אימייל ו-Google נשארים.

**למה כבוי.** ספק SMS ב-Supabase הוא פעולת דשבורד, לא קוד. חצי-הגדרה = כפתור שתמיד נכשל.

---

### `NEXT_PUBLIC_PHONE_AUTH_ENABLED`

**מה זה.** העתק ל-bundle, לשימוש בקומפוננטת לקוח.

**ברירת מחדל.** כבוי. רק `true` או `1`.

**איפה נקרא.**

```
src/lib/auth/phone-otp.ts
```

`phoneAuthEnabledPublic()`. **אין קורא בפרודקשן.** רק הטסט.

**דולק / כבוי.** כרגע לא משנה את ה-UI. מי שמדליק רק את זה בלי `PHONE_AUTH_ENABLED` לא יראה טלפון בלוגין.

---

### `EXPO_PUBLIC_PHONE_AUTH_ENABLED`

**מה זה.** אותו שער באפליקציית Expo.

**ברירת מחדל.** כבוי. רק `true` או `1`.

**איפה נקרא.**

```
apps/mobile/app/index.tsx
```

**דולק.** מסך OTP באפליקציה.

**כבוי.** המסך לא מוצג.

נבנה בנפרד מ-Vercel. משתנה ב-Expo, לא בפרויקט Next.

---

### `SENTRY_DEBUG_ROUTES`

**מה זה.** נקודות `/debug/sentry` ו-`/api/debug/sentry` שזורקות בכוונה, כדי להוכיח ש-`onRequestError` ב-instrumentation באמת נורה.

**ברירת מחדל.** כבוי. לא boolean. רק המחרוזת `i-know-what-this-does`. `true` / `1` לא פותחים.

**איפה נקרא.**

```
src/lib/observability/debug-error-gate.ts
src/app/api/debug/sentry/route.ts
src/app/debug/sentry/page.tsx
```

**דולק.** אפשר לייצר 500 מבוקר. אם הנתיב טועה לכיוון תשלום, זה גם pager.

**כבוי.** 404 / סגור.

**למה כבוי.** 500 חופשי לכל מי שמוצא את ה-URL.

---

### `CARDCOM_USE_MOCK`

**מה זה.** ספק תשלום מזויף. חיוב מצליח בלי כרטיס.

**ברירת מחדל.** `true` בטסטים, או כשאין מספר מסוף **מחוץ לפרוד**. בפרוד לא נדלק משתיקה: בלי מסוף `loadCardcomEnv` זורק, לא עובר ל-mock.

**איפה נקרא.**

```
src/lib/payments/env.ts
src/server/payments/invoices.ts
```

**דולק.** הזמנות "ששולמו" בלי כסף. מותר רק ב-CI / מחשב מפתח.

**כבוי.** Cardcom אמיתי, סודות חובה.

**אסור בפרוד.** חנות שנראית חיה וגובה אפס.

---

### `CARDCOM_SANDBOX` / `CARDCOM_ALLOW_SANDBOX`

**מה זה.** מסוף בדיקה של Cardcom, או אישור מפורש להריץ sandbox ב-`NODE_ENV=production` (סטייג'ינג).

**ברירת מחדל.** כבוי.

**איפה נקרא.**

```
src/lib/env.ts
src/lib/payments/accounts.ts
```

**דולק (`CARDCOM_SANDBOX=true`).** בפרוד: **התהליך לא עולה.** `src/lib/env.ts` מפיל boot. זו לא קופה סגורה, זו פריסה שנדחית.

**דולק (`CARDCOM_ALLOW_SANDBOX=true`).** `loadCardcomAccounts` לא זורק על חשבון sandbox בפרוד. מיועד לסטייג'ינג שמדמה פרוד.

**כבוי.** מסוף אמיתי, או mock מחוץ לפרוד.

---

### `CRON_SCHEDULER_ENABLED`

**מה זה.** מתג ל-workflow שמפעיל את עשרת ה-cron מ-GitHub Actions.

**ברירת מחדל.** כבוי. לא משתנה של האפליקציה. זה `vars.CRON_SCHEDULER_ENABLED` ב-GitHub.

**איפה נקרא.**

```
.github/workflows/cron.yml
```

`if: vars.CRON_SCHEDULER_ENABLED == 'true'`

**דולק.** Actions קורא ל-`/api/cron/*` עם `CRON_SECRET`. בלי הסוד כל קריאה 401.

**כבוי.** אף runner לא עולה. אפס עלות, אפס קריאות.

**למה כבוי.** הדומיין עדיין WordPress. המתזמן החיצוני לא הוגדר. שני מתזמנים = כפילות שליחה.

---

### `WP_IMPORT_ALLOW_WRITES`

**מה זה.** מנעול כתיבה לייבוא WooCommerce. דורש גם `--apply`.

**ברירת מחדל.** כבוי. רק `1`.

**איפה נקרא.**

```
scripts/wp-import/config.mjs
```

**דולק + `--apply`.** כותב לקטלוג.

**כבוי.** dry-run בלבד.

לא דגל ריצה של החנות. כלי חד-פעמי (D10).

---

### `products.whatsapp_enabled`

**מה זה.** כפתור וואטסאפ על דיל, פר מוצר. לא ערוץ הודעות, לא `WHATSAPP_NOTIFICATIONS_ENABLED` (השם ההוא לא קיים בקוד).

**ברירת מחדל.** `false`. העמודה מגיעה מ-

```
migrations/pending/123_products_whatsapp_enabled.sql
```

שעדיין לא הוחלה.

**איפה נקרא.**

```
src/lib/supplier-contact.ts
src/components/storefront/SupplierInfo.tsx
src/server/actions/admin/products.ts
src/components/admin/ProductForm.tsx
```

הכתיבה משמיטה את השדה אם העמודה חסרה, כדי לא להפיל שמירת מוצר.

**דולק על שורה.** כפתור `wa.me` אם יש נייד אצל הספק.

**כבוי / בלי עמודה.** אין כפתור. 80 הדילים היום בלי opt-in.

**למה כבוי.** מיגרציה 123 pending. מספרי ספק בפרוד הם קווים.

---

### `referral_program_settings.is_active`

**מה זה.** חבר מביא חבר, זיכוי ארנק בלבד.

**ברירת מחדל.** אין שורה. נמדד 31.08: אפס שורות. `getReferralProgram()` מחזיר `null`. `fn_claim_referral` עונה `program_inactive`.

**איפה נקרא.**

```
src/server/referrals/program.ts
```

**דולק.** שורה אחת עם `is_active=true` וסכומים באגורות. אז הדף מציג תוכנית.

**כבוי.** "התוכנית לא רצה". אין הבטחת ₪0.

**למה כבוי.** D4: קאשבק 0% בשיגור. מיגרציה 141 עדיין pending לפני קוראי `_agorot`.

אין משתנה `LOYALTY`. זה עמודה, לא env.

---

### `products.cashback_percent`

**מה זה.** אחוז קאשבק למוצר, נכנס לחישוב הזמנה.

**ברירת מחדל.** `0`. חסר = אפס.

**איפה נקרא.**

```
src/lib/cart/pricing.ts
src/lib/cart/load-products.ts
src/server/actions/payments/checkout.ts
```

העמודה `cashback_enabled` קיימת ב-`src/types/database.ts` ו**לא נקראת** ב-`src/` מחוץ לטיפוסים.

**דולק (אחוז > 0).** מנוע הקאשבק רושם זיכוי ארנק לפי האחוז שצולם להזמנה.

**כבוי (0).** אין קאשבק. זה המצב החי.

---

## בנוי, דולק עד כיבוי

### `ALERTS_ENABLED`

**מה זה.** ntfy לכישלון כסף. לא Sentry (Sentry תמיד יכול לקלוט אם יש DSN).

**ברירת מחדל.** דולק. רק המחרוזת `false` מכבה. חסר = דולק.

**איפה נקרא.**

```
src/lib/observability/alert.ts
```

**דולק.** POST ל-ntfy על כשל במסלול כסף.

**כבוי.** `sendAlert` חוזר `false` בלי רשת. נוח בטסטים ובמחשב מקומי.

---

## שער boot, לא דגל מוצר

### `ALLOW_INCOMPLETE_ENV`

**מה זה.** ויתור על בדיקות סוד ב-`NODE_ENV=production`, כדי ש-`next build` / `pnpm start` מקומי ו-CI יוכלו לרוץ בלי Cardcom.

**ברירת מחדל.** כבוי. רק `true`.

**איפה נקרא.**

```
src/lib/env.ts
```

**דולק.** השרת עולה בלי סודות, עם אזהרה בלוג. GitHub Actions Build מגדיר את זה. **אסור ב-Vercel.**

**כבוי בפרוד אמיתי.** חסר סוד = התהליך לא עולה.

Preview ב-Vercel לא משתמש בזה. הוא מדלג על אותן בדיקות כש-Vercel מזריק `VERCEL_ENV=preview`. פרוד (`VERCEL_ENV=production`) עדיין נופל בלי סודות. `CHECKOUT_ENABLED` נשאר סגור בפרוד בלי `true`, גם ב-Preview.

---

## יכולת בנויה שנדלקת מנוכחות סודות (אין שם ENABLED)

אין משתנה `SEARCH_ENABLED` / `WALLET_APPLY_ENABLED`. השער הוא "כל הסודות קיימים, או כלום".

| יכולת | תנאי הדלקה | איפה | כבוי |
| --- | --- | --- | --- |
| Meilisearch | `MEILISEARCH_HOST` ו-`MEILISEARCH_API_KEY` | `src/lib/search-server.ts` `meiliConfigured()` | חיפוש Postgres ILIKE |
| R2 | חמשת `R2_*` | `src/lib/storage/r2.ts` | Supabase Storage |
| Apple Wallet | סט ה-PEM המלא | `src/lib/wallet/config.ts` | אין כפתור |
| Google Wallet | issuer + SA + מפתח | אותו קובץ | אין כפתור |
| GA4 | `GA4_API_SECRET` + `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | `src/lib/analytics/` | לא נשלח כלום |
| Meta Pixel / CAPI | `META_CAPI_TOKEN` + `NEXT_PUBLIC_META_PIXEL_ID` | אותו מקום | לא נשלח כלום |
| Resend | `RESEND_API_KEY` | `src/lib/email/resend.ts` | מייל שובר לא יוצא |
| Upstash Redis | URL **וגם** token | `src/lib/rate-limit/` | Postgres `check_rate_limit` |

כפתור Wallet חסר עדיף על כפתור שעונה 500.

---

## שמות שעוד לא נבנו (אין קורא)

מפורט ב-

```
docs/ROADMAP.md
```

אין להם משתנה, אין טבלה, אין מתג לכבות ביום עלייה בלי דיפלוי.

| שם | מה חסר |
| --- | --- |
| `REVIEWS` | אין טבלה, אין טופס. PDP מודד מקום לכוכבים בלי דאטה |
| `WISHLIST` | מפרט ב-`docs/ARCHITECTURE-WISHLIST.md`. הלב הוסר מההדר |
| `SUPPORT` | תפקיד RBAC קיים. אין `/support`, אין `SUPPORT_CONTACT_TBD` |
| `GIFTING` | הקוד חי (`gifts.ts`, `/gift/[token]`, מיגרציה 108). **אין דגל.** הטיפוסים ב-`database.ts` חסרים עמודות מתנה |
| `LOYALTY` | ראה `is_active` ו-`cashback_percent` למעלה. אין env בשם הזה |
| `RECS` | `src/lib/related-products.ts` = אותה קטגוריה, לא מנוע אישי |
| `DIGEST` | `ADMIN_DIGEST_EMAIL` לא ב-`src/lib/env.ts`. אין cron סיכום |
| `WHATSAPP_CHANNEL` | כפתור: `whatsapp_enabled` למעלה. ערוץ outbox: worker רק Resend. `WHATSAPP_NOTIFICATIONS_ENABLED` לא בקוד |

---

## שמות בארכיטקטורה שאין להם קורא

`docs/ARCHITECTURE-FEATURE-FLAGS.md` רשם דגלים. אלה **לא** ב-`src/` (חיפוש מחרוזת, 01.09):

| שם במסמך | מצב בקוד |
| --- | --- |
| `ESCROW_FLOW_ENABLED` | אין. הכלל הוא אין escrow. תוויות אדמין לסטטוס ישן לא מדליקות מסלול |
| `NOTIFICATIONS_ENABLED` | אין. outbox רץ אם ה-cron רץ |
| `WHATSAPP_NOTIFICATIONS_ENABLED` | אין |
| `SEARCH_ENABLED` | אין. ראה Meili למעלה |
| `WALLET_APPLY_ENABLED` | אין. ראה Wallet למעלה |
| `SUPPLIER_SCAN_ENABLED` | אין. מימוש שובר חי בלי מתג env |
| `AI_CS_AGENT_ENABLED` | אין runtime. `agent_prompts` ממיגרציה 028 בלי קורא ב-`src/` |
| `AI_SUPPLIER_AGENT_ENABLED` | אין |
| `MAINTENANCE_MODE` | אין דף תחזוקה לפי env |

בניית טבלת `feature_flags` (מוזכרת ב-`docs/ARCHITECTURE-ADMIN-DASHBOARD.md`) לא מדליקה אף אחד מאלה לבד.
