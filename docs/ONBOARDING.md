# Onboarding: יום ראשון ב-KenyonExpress

המסמך הזה הוא מה שקוראים אחרי [README.md](../README.md). בסוף היום אפשר להריץ את האתר מקומית, יודעים איפה כל דבר יושב, ולא נוגעים בכלל שאסור לעגל.

## לפני הקוד

1. קרא את [README.md](../README.md) עד הסוף: מה המוצר, איך מרימים, אילו משתנים חובה.
2. קרא את `STATE.md` בשורש. הכותרת `## המשך מ:` היא המשימה החיה. אל תשאל מה הסטטוס; הוא כתוב שם.
3. קרא את שלושת הכללים הקדושים למטה עד שאתה יכול לחזור עליהם בלי להציץ.
4. אל תפתח עותק שני של הריפו. שורש אחד, `package.json` אחד, `.git` אחד.

## סביבה ביום הראשון

איפה: **Terminal**, משורש הריפו.

```bash
node -v    # 22.x
pnpm -v    # 11.1.2
```

```bash
pnpm install
cp .env.example .env.local
```

ממלאים ב-`.env.local` את המינימום מה-README (Supabase + URLs). סודות מגיעים מחבר צוות, לא מ-git. `.env.test` הוא placeholder שעוקב אחרי git; לא שמים בו מפתח אמיתי (כבר קרה, והמפתח היה של פרויקט אחר שפג. מזל, לא הגנה).

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm dev
```

דפדפן: `http://localhost:3000`.

אם `pnpm start` אחרי `pnpm build` מחזיר 500 על כל דף עם `instrumentation hook`, חסר env והבוט נכשל בכוונה. מקומית בלבד:

```bash
ALLOW_INCOMPLETE_ENV=true pnpm start
```

אסור להציב את זה ב-Vercel.

`npm install` בשורש נכשל. הסיבה כתובה ב-`AGENTS.md`. לא מנקים cache ולא ממציאים `engines.npm`.

## סיור מוצר (בסדר הזה)

| כתובת מקומית | מה רואים | הקוד |
| --- | --- | --- |
| `/` | בית, קטגוריות, דילים | `src/app/(store)/page.tsx` |
| `/category/...` | רשימת מוצרים | `src/app/(store)/category/` |
| `/product/...` | דף מוצר | `src/app/(store)/product/` |
| `/cart` | עגלה | `src/app/(store)/cart/` |
| `/checkout` | תשלום. בלי Cardcom אמיתי הכפתור יישאר סגור או mock | `src/app/(store)/checkout/` |
| `/account` | אזור אישי, אחרי התחברות | `src/app/(account)/` |
| `/admin` | פאנל. RBAC לפי `profiles.role` | `src/app/(admin)/` |
| `/supplier` | פורטל ספק. חברות ב-`supplier_members` בלבד | `src/app/(supplier)/` |
| `/scan` | סריקת שובר | `src/app/(supplier)/scan/` |
| `/legal/terms` | תקנון | `src/app/(legal)/` |

ה-UI עברית RTL. `html` נושא `dir="rtl"` ו-`lang="he"`. מחרוזות למשתמש לא באנגלית.

## איפה כל דבר

### כסף

| מה | איפה |
| --- | --- |
| חישוב אגורות / basis points | `src/lib/money.ts`, `src/lib/commerce/money.ts` |
| עמלה ותצוגת עגלה | `src/lib/commerce/commission.ts` |
| צילום להזמנה | `src/server/domain/orders/settlement.ts` |
| התחלת תשלום | `src/server/actions/payments/checkout.ts` |
| מעבר ל-paid + הנפקת שובר | `src/server/payments/finalize.ts` (הכותב היחיד) |
| Webhook Cardcom | `src/app/api/payments/cardcom/webhook/route.ts` |
| החזר | `src/server/actions/payments/refund.ts` |
| אינווריאנטים SQL | `INVARIANTS.md` |
| סיכום המודל | `src/server/payments/README.md` |

אם אתה נוגע באחד מאלה ביום הראשון, אתה כנראה במקום הלא נכון.

### זהות והרשאות

| מה | איפה |
| --- | --- |
| Login / OTP / OAuth | `src/server/actions/auth.ts`, `src/lib/auth/` |
| שומר פאנל | `src/lib/admin/rbac.ts`, `src/lib/admin/permissions.ts` |
| שומר ספק | `src/lib/supplier/rbac.ts` |
| לקוח עם RLS | `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts` |
| לקוח שעוקף RLS | `src/lib/supabase/admin.ts` |
| מודל שנמדד מול פרודקשן | `docs/AUTH-MODEL.md` |
| מפת RLS חיה | `docs/DB-SECURITY-MODEL.md` |
| מניפסט מדיניות | `supabase/rls-manifest.json` |

`profiles.role = 'vendor'` הוא רמז ניתוב. הוא לא פותח את פורטל הספק. מה שפותח: שורה פעילה ב-`supplier_members`.

### קטלוג ו-UI

| מה | איפה |
| --- | --- |
| קריאת קטלוג | `src/lib/catalogue-read.ts`, `src/lib/catalogue-cache.ts` |
| דף מוצר (לוגיקה) | `src/lib/product-detail.ts` |
| טוקני עיצוב | `src/styles/tokens.ts` |
| CSS של דפים חיים | `src/styles/product-page.css`, `category-page.css`, `checkout-page.css`, `mini-cart.css` |
| ייחוס ויזואלי | `refs/ke_live_singlefile.html` (אחרי צילום; התיקייה gitignored) |
| שער פיקסלים | `scripts/compare.mjs` |

### שוברים וספקים

| מה | איפה |
| --- | --- |
| הנפקה, קוד, QR, מימוש | `src/server/domain/vouchers/` |
| חתימת QR | `src/server/domain/vouchers/qr.ts` |
| סריקה בקופה | `src/app/api/supplier/vouchers/` |
| אפליקציית קופה | `apps/mobile/` (Expo, workspace נפרד) |

### מיגרציות ומסד

| מה | איפה |
| --- | --- |
| סכימה שכבר רצה בפרודקשן | `supabase/migrations/` |
| סכימה שמחכה לאישור | `migrations/pending/` |
| סדר החלה ו-blast radius | `migrations/pending/README.md` |
| טיפוסי DB שנוצרים | `src/types/database.ts` |
| תיאור Drizzle (לא מקור אמת) | `src/db/schema/` |
| חוקי כתיבת SQL | `.claude/skills/supabase-migrations/SKILL.md` |

### בדיקות

| מה | איפה |
| --- | --- |
| יחידה / רגרסיה | לצד הקוד, `*.test.ts` |
| שערים סטטיים | `src/__tests__/` |
| Playwright | `e2e/` |
| SQL של אינווריאנטים | `tests/sql/` |
| כיסוי כסף | `pnpm test:coverage` (יש רצפה לקבצי money) |

### תפעול

| מה | איפה |
| --- | --- |
| עשרת ה-cron | `src/app/api/cron/`, `docs/CRON-EXTERNAL.md`, `scripts/cron-jobs.json` |
| CI | `.github/workflows/ci.yml`, `.github/workflows/README.md` |
| תבנית PR | `.github/PULL_REQUEST_TEMPLATE.md` |
| החלטות זמניות ופערים | `docs/DECISIONS.md` |
| סודות | `.env.example`, `docs/ARCHITECTURE-ENV-SECRETS.md` |

קבצי `ARCHITECTURE-*.md` בשורש הריפו הם עותקים היסטוריים. כשיש כפילות, `docs/` גובר, וסתירה מתועדת ב-`docs/CONTRADICTIONS.md`.

## הכללים הקדושים

שלושה שאי אפשר לשבור, ועוד כמה שצמודים אליהם. אם שינוי שלך נוגע באחד מהם, סמן את זה בתבנית ה-PR.

### 1. כסף = אגורות, integer בלבד

1 ש״ח = 100 אגורות. כל סכום פנימי הוא `Agorot` (number שלם עם brand). כל אחוז הוא basis points: `1000` = 10%, `10000` = 100%. מע״מ מוגדר פעם אחת: `VAT_RATE_BP` ב-

```
src/lib/money.ts
```

אסור:

- `float` / `number` רגיל במסלול כסף
- `price * 0.18`
- `Math.round` על שקלים עשרוניים מחוץ למודול
- חיבור מחירים כמחרוזות
- כתיבה ישירה לעמודות `*_agorot` גנרטיביות ב-Postgres (הן `GENERATED ALWAYS`; הכתיבה נדחית)

מותר:

- קריאה מ-`src/lib/money.ts` / `src/lib/commerce/money.ts`
- המרה `ilsToAgorot` / `agorotToIls` דרך המודול
- הצגה למשתמש דרך הפורמטר, לא דרך חישוב מקביל

`platform_percent` נקבע בדף המוצר באדמין, חובה, בלי `DEFAULT` בסכימה. בזמן ההזמנה הוא מצולם ל-`order_items`. שינוי באדמין אחרי הקנייה לא זז להזמנות ישנות.

בדיקה מהירה אחרי שינוי במסלול כסף:

```bash
pnpm test
pnpm test:coverage
```

אם הרצפה של קבצי money יורדת, זה לא "נראה ירוק". זה שער אדום.

### 2. אין מיגרציות ישירות

אין `supabase db push`. אין `drizzle-kit push`. אין להריץ SQL על פרודקשן מחלון אד-הוק "רק הפעם".

המסלול היחיד:

1. כותבים קובץ חדש ב-`migrations/pending/`, אידמפוטנטי, עם מספר שלא תפוס ב-`supabase/migrations/` ולא ב-pending.
2. מעדכנים את המניפסט ב-`migrations/pending/README.md` (יש טסט שמוודא שכל `.sql` מופיע שם וכל שורה במניפסט קיימת בדיסק).
3. מחכים לאישור מפורש להחלה על פרודקשן. זו אחת מארבע העצירות של הפרויקט.
4. אחרי החלה הקובץ שייך להיסטוריה החיה, לא ל-pending.

כל טבלה חדשה:

```sql
ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;
```

ואז `DROP POLICY IF EXISTS` / `CREATE POLICY` לכל פעולה שמותרת. RLS בלי policy = deny לכל `anon` ו-`authenticated`. זה מצב חוקי לטבלאות שרת-בלבד, לא שכחה.

Enums: ליטרל מול עמודת enum תמיד עם cast מפורש (`'admin'::public.user_role`). בלי זה המיגרציה עוברת בסביבה אחת ונופלת באחרת.

`001_initial_schema.sql` אינה אידמפוטנטית. מיגרציות חדשות כן. אל תערכו קובץ שהוחל כבר כדי "לתקן היסטוריה"; כותבים קובץ חדש.

### 3. RLS תמיד

PostgREST חושף את המסד דרך `anon` ו-`authenticated`. `service_role` עוקף RLS (`BYPASSRLS`). לכן:

- כל טבלת `public` עם RLS דלוק.
- Guard ב-Next **לא** מגן על מי שמדבר עם PostgREST ישירות.
- RLS **לא** מגן על קוד שקורא `createAdminClient()`.
- פונקציית `SECURITY DEFINER` רצה כבעלים. היא חייבת לבדוק הרשאה בגוף שלה, לא להניח שהקורא מורשה.

לפני כתיבת שאילתה חדשה שואלים: באיזה לקוח זה רץ. אם התשובה "אדמין כי יותר קל", זו עקיפת RLS בלי סיבה. הקופה, ה-webhook וה-cron הם המקומות שבהם admin client לגיטימי, כי הם צריכים לכתוב מעבר ל-`auth.uid()` של המבקר.

אחרי שינוי מדיניות:

```bash
node scripts/check-rls.mjs
```

המניפסט ב-`supabase/rls-manifest.json` הוא מה שהשער משווה אליו. סחיפה = או שהקוד שיקר או שהמסד זז בלי מיגרציה.

## חוקים צמודים (גם הם לא רשות)

**UI.** עברית, RTL, לפי האתר החי. Tailwind לוגי (`ps`/`pe`, `start`/`end`) לא `pl`/`pr`. שער הפיקסלים נשאר מתחת ל-11%:

```bash
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

**סודות.** כל `NEXT_PUBLIC_` נדחס ל-JavaScript של הדפדפן. מפתח service role עם הקידומת הזאת הוא דליפה שכבר קרתה. הבוט מסרב לעלות אם הוא רואה דפוס כזה.

**Cardcom לא חותם webhooks.** האות היחיד הוא `CARDCOM_WEBHOOK_SECRET` על `?s=`. רוטציה בלי `CARDCOM_WEBHOOK_SECRET_PREVIOUS` זורקת callbacks של דפים פתוחים, ומחזירה 200, אז Cardcom לא מנסה שוב.

**אין deploy שני.** Vercel מחובר ל-GitHub. אין `deploy.yml`. הוספת אחד תרוץ מול האינטגרציה על אותו alias.

**אין עותקים.** לא `src copy`, לא ריפו מקונן. גיבוי = git.

**מובייל לא ב-workspace.** `cd apps/mobile && pnpm install --ignore-workspace`. checkout של הלקוח רץ ב-WebView על האתר; האפליקציה לא מממשת מסלול כסף מחדש.

## איך נראה שינוי תקין

1. Branch קצר, נושא אחד.
2. קוד + טסט באותו commit כשאפשר.
3. `pnpm test`, `pnpm type-check`, `pnpm lint` ירוקים. `pnpm build` הוא שער נפרד; שלושת הראשונים לא מכסים אותו.
4. תבנית `.github/PULL_REQUEST_TEMPLATE.md`: מה השתנה, למה, איך נמדד, אילו כללים קדושים נוגעים.
5. אם נוספו hex או px ב-`src/`, שורה ב-`docs/hardcoded-audit.md`. השער חוסם גידול, לא חוב ישן.

## ארבע עצירות

בכל מצב אחר מקבלים את ההחלטה השמרנית, מתעדים ב-`docs/DECISIONS.md` או ב-`STATE.md`, וממשיכים. עוצרים ושואלים רק אם:

1. Push לפרודקשן ב-Vercel (מעבר ל-merge הרגיל ל-`main`).
2. מחיקת DB או מחיקת קבצים.
3. הרצת מיגרציה על פרודקשן.
4. סוכן קוד שני שרץ על אותו repo.

## מה לא לפתור ביום הראשון

- מיגרציות ב-`migrations/pending/` שמחכות לאישור. לקרוא את ה-README, לא להחיל.
- הפניית DNS. ידנית, לא מהקוד.
- מתזמן ה-cron. כתוב ב-`docs/CRON-EXTERNAL.md`; כבוי עד שמשתנה וסוד קיימים.
- ייבוא WooCommerce. `WP_IMPORT_ALLOW_WRITES` כבוי במכוון.
- "תיקון" עמודות כסף numeric לעומת `_agorot`. יש מסלול additive מתועד; לא ממציאים המרה במקום.

## אחרי היום הראשון

אתה מוכן כשאלה נכונים בלי לחפש:

1. איפה חישוב כסף, ואיפה אסור לגעת ב-`float`.
2. איפה כותבים מיגרציה, ואיפה אסור להריץ אותה.
3. למה guard ב-Next לא מספיק בלי RLS, ולמה RLS לא מספיק ליד `createAdminClient()`.
4. איך מריצים את שלושת שערי הבדיקה, ומה `pnpm build` בודק שהם לא בודקים.

אז בוחרים משימה מ-`STATE.md` ומתחילים מקובץ אחד. לא משכתבים את הקטלוג בדרך.
