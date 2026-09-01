# יום ראשון ב-KenyonExpress

המסמך הזה הוא למפתח שנכנס לריפו בפעם הראשונה. אחרי שקראת אותו אתה יודע איפה הקוד חי, מה אסור לשבור, ואיך לא להפיל כסף או הרשאות. השער הכללי (ארכיטקטורה, env, פקודות) הוא [README.md](../README.md).

## לפני שכותבים שורה

1. קרא את [README.md](../README.md) עד סוף "הרמת סביבת פיתוח". הרם את האתר מקומית. בית ב-`http://localhost:3000` חייב להיפתח.
2. הרץ משורש הריפו, ב-Terminal:

   ```bash
   pnpm test
   pnpm type-check
   pnpm lint
   ```

   שלושתם צריכים לעבור על `main`. אם לא, הבעיה היא בסביבה שלך, לא במשימה.
3. קרא את שלושת הכללים הקדושים למטה עד הסוף. אחר כך [docs/BUSINESS-MODEL.md](BUSINESS-MODEL.md) ו-[docs/AUTH-MODEL.md](AUTH-MODEL.md).
4. אל תיגע ב-`STATE.md` אלא אם אתה הסוכן האוטונומי שעובד לפי `CLAUDE.md`. זה יומן סשנים, לא מדריך.

אין צורך ב-Docker כדי לפתח את האתר. ה-DB הוא פרויקט Supabase מרוחק (או עותק שהוא שלך). אל תצביע `.env.local` לפרודקשן אם אתה כותב כתיבות.

## איפה כל דבר

### כסף, checkout, שוברים

| מה | איפה |
| --- | --- |
| מודול כסף קנוני | `src/lib/money.ts` (ממתג מחדש את `src/lib/commerce/money.ts`) |
| עמלה לתצוגת עגלה | `src/lib/commerce/commission.ts` |
| צילום כסף להזמנה | `src/server/domain/orders/settlement.ts` |
| מכונת מצבי הזמנה | `src/server/domain/orders/state-machine.ts` |
| התחלת תשלום | `src/server/actions/payments/checkout.ts` |
| המעבר היחיד ל-`paid` | `src/server/payments/finalize.ts` |
| הנפקת שובר, QR, מימוש | `src/server/domain/vouchers/` |
| חוזה סביבת Cardcom | `src/lib/payments/env.ts` |
| README של שכבת התשלום | `src/server/payments/README.md` |

אם אתה מוסיף סכום, אתה עובר דרך `agorot()` / `parseIls()` / `sumAgorot()` / `multiplyAgorot()`. אם אתה כותב `* 100` או `parseFloat` על מחיר, זה באג.

### Auth והרשאות

ארבע שכבות, וכל אחת עונה על שאלה אחרת. אף שכבה לבדה לא מספיקה. הפירוט הנמדד: [docs/AUTH-MODEL.md](AUTH-MODEL.md).

| שכבה | איפה | על מה היא עונה |
| --- | --- | --- |
| Session | Supabase Auth | מי אתה |
| Route guard | `src/lib/admin/rbac.ts`, `src/lib/supplier/rbac.ts` | מותר לפתוח את המסך הזה |
| RLS | policies ב-Postgres | אילו שורות אתה רואה |
| SECURITY DEFINER | פונקציות כמו `redeem_voucher` | פעולה שדורשת יותר מהקורא, ובודקת בעצמה |

תפקידי פאנל חיים ב-`profiles.role` (`src/lib/admin/roles.ts`). כניסה לפורטל ספק היא חברות ב-`supplier_members`, לא `profiles.role = 'vendor'`.

לקוח Supabase בדפדפן / SSR: `src/lib/supabase/client.ts` ו-`server.ts` (anon + RLS).
אדמין שעוקף RLS: `src/lib/supabase/admin.ts`. כל קריאה אליו היא חור מכוון. אל תייבא אותו לקומפוננטה של לקוח.

### מסכים

| משטח | תיקיית routes | קומפוננטות |
| --- | --- | --- |
| חנות | `src/app/(store)` | `src/components/storefront`, `home`, `cart`, `category` |
| חשבון | `src/app/(account)` | `src/components/account` |
| אדמין | `src/app/(admin)` | `src/components/admin` |
| ספק | `src/app/(supplier)` | `src/components/supplier` |
| Auth | `src/app/(auth)` |  |
| API | `src/app/api` |  |
| מימוש שובר | `src/app/redeem`, `src/app/coupon` | `src/components/coupon` |

UI עברית RTL. Skill מחייב: `.claude/skills/rtl-hebrew-ui/SKILL.md`. ייחוס ויזואלי לחי: `refs/ke_live_singlefile.html` (נוצר מקומית, לא ב-git).

### סכימה ומיגרציות

| תיקייה | מה יש בה |
| --- | --- |
| `supabase/migrations/` | מה שכבר רץ בפרודקשן. אל תוסיף לכאן קובץ חדש |
| `migrations/pending/` | הנתיב היחיד לשינוי סכימה שעוד לא הוחל. קרא את ה-README שם לפני שאתה כותב SQL |
| `src/types/database.ts` | טיפוסים שנוצרים. `pnpm db:types`. לא לערוך ביד |
| `src/db/schema/` | Drizzle לקריאה. **לא** מקור הסכימה. הסכימה חיה ב-SQL |
| `supabase/rls-manifest.json` | מניפסט שנמדד מול הפרודקשן |

### בדיקות

| רץ | איפה | מתי |
| --- | --- | --- |
| Vitest | `src/**/*.test.ts(x)`, `src/__tests__/` | כל שינוי. כסף: חובה |
| Playwright | `e2e/` | זרימות UI. תלוי בזריעה (`pnpm seed:test`) |
| SQL | `tests/sql/` | RLS ומחזור שובר מול Postgres |
| CI | `.github/workflows/ci.yml` | lint, typecheck, test, build על כל PR. E2E מדלג עד שיש `CI_SUPABASE_URL` |

אין `deploy.yml`. Vercel מפרסם דרך האינטגרציה ל-GitHub. להוסיף workflow שמריץ `vercel deploy` זה שני דיפלוימנטים שרצים על אותו alias.

### אפליקציה

`apps/mobile` היא Expo Router. היא לא מממשת checkout. `pnpm test` / `lint` / `type-check` בשורש **לא** בודקים אותה (`biome.json` ו-`tsconfig.json` מוציאים את `apps`). קרא `apps/mobile/README.md` לפני נגיעה.

## שלושת הכללים הקדושים

### 1. כסף = אגורות, integer בלבד

יחידת המנוע היא אגורה אחת (1 ש"ח = 100 אגורות). אחוז הוא basis point שלם (100% = 10000 bp, מע"מ נוכחי = 1800 bp ב-`VAT_RATE_BP`).

מותר:

```ts
import { agorot, parseIls, sumAgorot, multiplyAgorot } from '@/lib/money'
const price = parseIls('12.34') // 1234
```

`parseIls` הוא השם ש-`src/lib/money.ts` מייצא ל-`ilsToAgorot`. היישום עצמו חי ב-`src/lib/commerce/money.ts`. אל תייבא משם ישירות ממסך או מ-action: השער הוא `@/lib/money`.

אסור בכל מסלול כסף (עגלה, checkout, שובר, ארנק, עמלה, חשבונית, settlement):

- `parseFloat`, `Number(price)`, `* 0.1`, `/ 100` על ערך כסף ב-JS
- `price.toFixed(2)` כמקור אמת (תצוגה עוברת ב-`formatIls` / `formatAgorot`)
- עמודה `real` / `double precision` / `float` לסכום
- חישוב עמלה מ-`products.platform_percent` אחרי שההזמנה נוצרה. הצילום ב-`order_items` הוא האמת

למה: `0.1 + 0.2 !== 0.3`. בסכום של הזמנה זה אגורה שנוצרת או נעלמת. Cardcom מצפה ליחידות משנה שלמות. הטסטים ב-`src/lib/money.test.ts` וב-`src/lib/commerce/` נופלים על סטייה, ו-CI מחזיק רצפות כיסוי על קבצי הכסף.

כשה-DB מחזיק גם עמודת `numeric` וגם תאום `_agorot` גנרטיבי, **אל תכתוב** לעמודת האגורות. Postgres דוחה כתיבה אליה (`SQLSTATE 428C9`). קרא אותה, כתוב ל-numeric דרך המודול, או (אחרי שהקוראים עברו) קרא רק את האגורות.

`platform_percent` הוא פר-מוצר, חובה, בלי ברירת מחדל בשום מקום. מוצר בלי ערך לא נמכר.

### 2. אין מיגרציות ישירות, אין `db push`

שינוי סכימה הוא קובץ SQL חדש ב-

```
migrations/pending/
```

המספור ממשיך את הרצף שב-README של אותה תיקייה. הקובץ ממתין לאישור. החלה על פרודקשן היא אחת מארבע העצירות של הפרויקט: מישהו עם גישה מאשר במפורש, ואז מיישמים דרך `apply_migration` (MCP / Dashboard), לא דרך ה-CLI של Drizzle ולא דרך `supabase db push`.

`supabase db push` אסור. הוא מנחש diff מול מה ש-Drizzle או ה-CLI חושבים שהסכימה, ועל DB חי עם RLS, enums ופונקציות DEFINER זה שובר דברים שאי אפשר לראות ב-PR.

כל מיגרציה חייבת להיות אידמפוטנטית:

- `CREATE TABLE IF NOT EXISTS`
- `ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `DROP POLICY IF EXISTS ...` ואז `CREATE POLICY`
- enums עטופים ב-`DO $$ BEGIN ... EXCEPTION WHEN duplicate_object`
- טריגרים: `DROP TRIGGER IF EXISTS` ואז יצירה

כל טבלה חדשה מקבלת RLS באותו קובץ (הכלל הבא). Skill מחייב: `.claude/skills/supabase-migrations/SKILL.md`.

אל תערוך קובץ ב-`supabase/migrations/` שכבר הוחל. תיקון הוא קובץ pending חדש.

אל תריץ SQL על הפרודקשן מ-SQL Editor "רק הפעם". אותו כלל.

### 3. RLS תמיד

כל טבלה ב-`public` עם

```sql
ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;
```

באותה מיגרציה שיוצרת אותה. RLS בלי policy תואם = דחייה ל-`anon` ול-`authenticated`. זה מצב מכוון לטבלאות שרת-בלבד (כסף, לוגים, outbox). אל "תתקן" אותן בהוספת policy פתוח.

PostgREST חושף את ה-DB לשני תפקידים ציבוריים. כל מי שיש לו את ה-anon key יכול לדבר עם PostgREST ישירות, בלי לעבור ב-route guard. לכן:

- Guard על הדף לא מגן על השורה
- `createAdminClient()` עוקף RLS. השתמש בו ל-webhook, cron, finalize, ופעולות שחייבות service role. אל תשתמש בו כדי "שפשוט יעבוד" ממסך לקוח
- פונקציית `SECURITY DEFINER` רצה כבעלים. היא חייבת לבדוק `auth.uid()` / חברות / תפקיד בעצמה. אחרת היא חור RLS
- `GRANT EXECUTE` ל-`anon` / `authenticated` על DEFINER הוא החלטה מתועדת, לא ברירת מחדל

מפת המדיניות החיה: [docs/DB-SECURITY-MODEL.md](DB-SECURITY-MODEL.md). אל תשכתב policy מאפס. השתמש במוסכמת `<table>_<cmd>_unified`, או בזוג `_select_anon` / `_select_authenticated` כשהחשיפה שונה.

טסט ששומר על זה: `src/__tests__/` (מניפסט pending, פונקציות שנגנז מהן EXECUTE, guards על routes). אם הוספת קובץ תחת `(admin)` או `(supplier)` בלי guard, `pnpm test` נופל.

## עוד כללים שמפילים אנשים ביום השני

**`npm install` נכשל.** רק `pnpm`. הסיבה הטכנית כתובה ב-`AGENTS.md`. `pnpm add` / `pnpm add -D`.

**`NEXT_PUBLIC_` הוא דליפה בבילד.** `src/lib/env.ts` מסרב לעלות על `NEXT_PUBLIC_*(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY)`. סוד Cardcom, service role, `CRON_SECRET`, `VOUCHER_QR_SECRET`, `RESEND_API_KEY` הם שרת בלבד.

**אין escrow.** המודל הישן בוטל. אל תחזיר `held`, J5, או דגל `ESCROW_FLOW_ENABLED`. קופון: 100% נשאר בפלטפורמה. פיזי: פיצול לפי הצילום ב-`order_items`.

**Cardcom לא חותם webhooks.** האימות הוא `?s=` מול `CARDCOM_WEBHOOK_SECRET` (השוואה בזמן קבוע) ואז `GetLpResult`. 200 על קריאה כושלת עוצר retries. אל תחזיר 200 אם לא טיפלת.

**Cron לא רץ מ-Vercel.** עשרה `GET /api/cron/*` עם `Authorization: Bearer <CRON_SECRET>`. המתזמן החיצוני מתועד ב-`docs/CRON-EXTERNAL.md`. חסר סוד = 401 על כולם, לא "פתוח".

**עברית RTL.** `dir="rtl"` ב-layout. אל תיישר שמאלה "רק לדף הזה". שדות לטיניים (אימייל, מספר כרטיס) מקבלים `dir="ltr"` נקודתית.

**שער פיקסלים.** שינוי חזותי בדף הבית נמדד עם `scripts/compare.mjs`. הסף הוא מתחת ל-11% הבדל מול האתר החי. אל תנחש.

**שני סוכני קוד על אותו ריפו.** עצור. אל תדחוף מעל העבודה של האחר.

## איך נראית עבודה תקינה

1. ענף מ-`main`. PR קטן, דבר אחד.
2. כסף או הרשאות: טסט יחידה ליד הקוד, לא "נבדוק ידנית".
3. מיגרציה: קובץ pending + עדכון המניפסט ב-`migrations/pending/README.md` (הטסט `pending-migrations-inventory` בודק את שני הכיוונים).
4. לפני push: `pnpm test && pnpm type-check && pnpm lint`.
5. לא מפעילים מיגרציה על פרודקשן מה-PR. לא מוחקים DB. לא עושים `vercel --prod` מהלפטופ בלי אישור מפורש.

## סדר קריאה ליום הראשון (אחרי הכללים)

1. [docs/BUSINESS-MODEL.md](BUSINESS-MODEL.md): מה נמכר ואיך הכסף זז
2. [src/server/payments/README.md](../src/server/payments/README.md): הקבצים במסלול התשלום
3. [docs/AUTH-MODEL.md](AUTH-MODEL.md): מי מורשה למה
4. [docs/DB-SECURITY-MODEL.md](DB-SECURITY-MODEL.md): RLS כפי שנמדד בפרודקשן
5. [migrations/pending/README.md](../migrations/pending/README.md): מה ממתין ומה אסור להחיל
6. [docs/ARCHITECTURE-DOCS-INDEX.md](ARCHITECTURE-DOCS-INDEX.md): השאר, לפי הדומיין שלך

אל תתחיל מ-`MASTER-ARCHITECTURE.md` בשורש או מ-`ARCHITECTURE.md`. שניהם מצביעים למסמכים ב-`docs/` ומכילים שכבות שבוטלו.
