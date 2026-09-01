# AUTH-MODEL — מי מורשה למה, ואיפה זה נאכף

נמדד מול פרודקשן (`ixvwfbuvfxxsjiywhbbb`) ב-19.08.2026. כל מספר כאן הוא תוצאה
של שאילתה, לא הערכה. השאילתות עצמן מופיעות בסוף המסמך כדי שאפשר יהיה לחזור
ולמדוד.

<!-- v1-final-banner:2026-09-01 -->

> ‏**נמדד מחדש 01.09.2026. שלוש מיגרציות הרשאות נחתו מאז 19.08, והן משנות
> מספרים בגוף המסמך:**
>
> ‏1. ‏**`check_rate_limit` אינה חשופה יותר** ל-`anon` ול-`authenticated`, אלא
>    ל-`service_role` בלבד. קודם לכן קורא אנונימי בחר גם את המפתח וגם את הסף.
> ‏2. ‏**‏`authenticated` איבד INSERT/UPDATE/DELETE על שמונה טבלאות server-only**
>    ‏(`legacy_percent_archive_112`, `payment_webhook_events`, `rate_limits`,
>    `referral_signals`, `search_index_dlq`, `settlement_events`,
>    `stock_reservations`, `user_rate_limits`). זו לא הייתה חשיפה פעילה, כי RLS
>    בלי policy דוחה הכל ממילא, אלא סגירת דלת סתרים: מי שיוסיף שם policy אחת
>    לקריאה היה מקבל גם כתיבה.
> ‏3. שש פונקציות עזר יתומות איבדו EXECUTE מ-`authenticated`.
>
> ‏**המספרים החיים היום:** ‏`anon` עם DML על טבלה **אחת** בלבד (`carts`),
> ‏`authenticated` על ‏**56**, ‏`service_role` על ‏**73**. ‏**133** policies על
> ‏**61** טבלאות, RLS דלוק על כולן. ‏**69** פונקציות, מתוכן ‏**61**
> ‏`SECURITY DEFINER`, וכולן מצמידות `search_path` (אפס לא מוצמדות). ל-`anon`
> יש בדיוק ‏**6** הרשאות EXECUTE, ושלוש מהן פונקציות trigger שאינן ניתנות
> לקריאה שימושית דרך PostgREST.
>
> ‏**מיפוי מספרים, כי הם התחלפו:** המיגרציות האלה מופיעות בפרודקשן כ-125, 126
> ו-127, ובקבצים תחת `migrations/pending/` הן **143**, **144** ו-**145**.
> הטבלה המלאה: `docs/ARCHITECTURE-OVERVIEW.md` סעיף 8.1.

---

## 1. ארבע שכבות, וכל אחת עונה על שאלה אחרת

| שכבה | איפה | על מה היא עונה | מה היא **לא** עושה |
| --- | --- | --- | --- |
| 1. Session | Supabase Auth (cookie / bearer) | מי אתה | לא אומרת מה מותר לך |
| 2. Route guard | `lib/admin/rbac.ts`, `lib/supplier/rbac.ts` | האם מותר לך לפתוח את המסך הזה | לא מגנה על שאילתה שנכתבת ישירות |
| 3. RLS | Postgres policies | אילו **שורות** אתה רואה | לא רצה תחת service key |
| 4. SECURITY DEFINER | פונקציות `redeem_voucher`, `check_rate_limit` ועוד | פעולה שדורשת יותר הרשאות ממה שיש לקורא | רצה תחת הבעלים, ולכן חייבת לבדוק בעצמה |

**שכבה 2 לבדה אף פעם לא מספיקה, ושכבה 3 לבדה אף פעם לא מספיקה.** הן נופלות
בכיוונים הפוכים: guard נעקף על ידי מי שמדבר ישירות עם PostgREST, ו-RLS נעקף
בכל מקום שבו הקוד מרים `createAdminClient()`.

---

## 2. תפקידים

### 2.1 תפקידי פאנל (`profiles.role`)

מוגדרים ב-`src/lib/admin/roles.ts`. מטריצת הגישה ב-`src/lib/admin/permissions.ts`.

| תפקיד | כניסה לפאנל | קטלוג | הזמנות | משתמשים | כסף | לוג ביקורת |
| --- | --- | --- | --- | --- | --- | --- |
| `super_admin` | ✅ | כתיבה | כתיבה | כתיבה | כתיבה | קריאה |
| `admin` | ✅ | כתיבה | כתיבה | כתיבה | כתיבה | קריאה |
| `content_uploader` | ✅ | כתיבה | ✖ | ✖ | ✖ | ✖ |
| `support` | ✅ | ✖ | קריאה | קריאה | ✖ | ✖ |
| `vendor` | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| `customer` | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |

‏`support` **מחוץ להיררכיה** של `has_role()`. הוא לא "פחות מ-admin", הוא קבוצת
הרשאות אחרת: קריאה תפעולית בלי כסף ובלי קטלוג.

### 2.2 תפקידי ספק (`supplier_members.member_role`)

חברות ב-`supplier_members` פעיל היא **אות ההרשאה היחיד** לפורטל הספקים.
‏`profiles.role = 'vendor'` הוא רמז ניתוב בלבד ואינו מעניק דבר.

---

## 3. כל מסלול מוגן — נמדד, לא מונח

‏**‏48 קבצי route** תחת `(admin)`, ‏`(supplier)`, ‏`api/admin`, ‏`api/supplier`.
‏`src/lib/auth/route-guards.test.ts` סורק את כולם בכל `pnpm test` ונופל על
קובץ בלי guard.

### מה הסריקה מצאה, ומה תוקן

**‏`/admin/products` היה בלי guard.** הוא הסתמך על `(admin)/layout.tsx` בלבד,
וה-layout קורא `requirePanelSession` — שמוכיח **כניסה לפאנל** ותו לא. כלומר
משתמש `support`, שהמטריצה שוללת ממנו קטלוג במפורש, יכול היה לפתוח את רשימת
המוצרים המלאה, כולל `platform_percent` ו-`coupon_price_ils`. כל שאר המסכים
תחת `/admin/products/*` כן דרשו `requireSection('catalog', ...)`. תוקן ל-
`requireSection('catalog', 'read')`.

זה בדיוק סוג התקלה שסריקה סטטית תופסת ובדיקת יחידה לא: הקובץ נכון תחבירית,
עובר type-check, ועושה בדיוק מה שנכתב בו.

### שני פטורים, וכל אחד מנומק בטסט

| קובץ | למה בלי guard |
| --- | --- |
| `(supplier)/supplier/scan/page.tsx` | `redirect('/scan')` בלבד. לא קורא כלום. `/scan` מוגן. |
| `api/supplier/redeem/route.ts` | alias שמייצא מחדש את ה-handler המוגן של `vouchers/redeem`. |

הטסט לא מסתפק ברשימה: לכל פטור יש `mustContain`, כך שקובץ שהופך למשהו אחר
נופל למרות שהוא ברשימה.

### ‏API של הקופה מזדהה אחרת, ובכוונה

`api/supplier/app/pin`, `vouchers/lookup`, `vouchers/redeem`, `redeem-batch`
משתמשים ב-`identityScopedClient(request)` ולא ב-guard שעושה `redirect`.
אפליקציית הקופה שולחת bearer token, ו-307 לדף התחברות הוא תשובה חסרת משמעות
ל-`fetch`. ההחלטה זהה, הצורה שונה: `null` למי שלא מזוהה, ‏401 חוזר.

---

## 4. RLS — ‏61 טבלאות, ‏61 עם RLS דלוקה

נמדד ב-19.08. הצילום שמור ב-`supabase/rls-manifest.json`, והשער ב-CI הוא
`src/lib/auth/rls-manifest.test.ts`.

**למה manifest ולא שאילתה חיה.** ל-CI אין בסיס נתונים, ולמכונה הזאת אין
מחרוזת חיבור — `.env.local` מחזיקה URL ומפתחות בלבד, ולקוח PostgREST לא יכול
לקרוא את `pg_class` בכלל. בנוסף `supabase/migrations/` מתאר שושלת אחרת
מפרודקשן (`docs/DB-HARDENING-AUDIT.md`), ולכן הרצת שרשרת הקבצים הייתה בודקת
סכימה שאף אחד לא מריץ. מה ש-CI **כן** יכול להחזיק ביושר: צילום מדוד, בתוספת
הכללים שהצילום חייב לקיים.

מה שהטסט תופס: טבלה חדשה שנכנסת ל-manifest עם `rls_enabled: false`, או בלי
policies ובלי נימוק. מה שהוא **לא** תופס: drift שאף אחד לא מדד מחדש. לכן
ה-manifest נושא את תאריך המדידה, ולכן קיים `scripts/check-rls.mjs`.

### ‏8 טבלאות בלי policies — וזה המצב ההדוק, לא הרפוי

‏Postgres חוסם **כל שורה לכל תפקיד** כשה-RLS דלוקה ואף policy לא מתאימה.
טבלה עם RLS ובלי policies נגישה רק ל-service key ולפונקציות SECURITY DEFINER.
זו בדיוק הכוונה, וה-`rls_enabled_no_policy` שה-advisor מסמן הוא INFO.

| טבלה | מי כן ניגש |
| --- | --- |
| `legacy_percent_archive_112` | אף אחד בזמן ריצה. צילום עמלות היסטורי. |
| `payment_webhook_events` | ה-webhook של Cardcom, service key |
| `rate_limits` | דרך `check_rate_limit()` בלבד (SECURITY DEFINER) |
| `referral_signals` | קוד השיוך; מסוכם ל-`referrals` לפני שמישהו רואה |
| `search_index_dlq` | ה-cron, מול `CRON_SECRET` |
| `settlement_events` | קוד הסליקה. ספר חשבונות, לא מסך. |
| `stock_reservations` | מסלול ה-checkout וה-reaper |
| `user_rate_limits` | `check_user_rate_limit()` — ראה סעיף 6 |

**הוספת policies לטבלאות האלה כדי לרצות linter הייתה מרפה בקרה.**

---

## 5. הספק הוא קריאה-בלבד ב-RLS — נמדד

שאילתה על כל policy שאינה `SELECT` בכל הסכימה החזירה **‏76 policies** (נמדד 01.09,
מתוך **‏133** בסך הכל). מתוכן,
כאלה שמזכירות ספק בביטוי: **שלוש בלבד**, וכולן על אותה טבלה.

| טבלה | פקודה | ביטוי |
| --- | --- | --- |
| `supplier_members` | INSERT | `is_supplier_owner(supplier_id)` |
| `supplier_members` | UPDATE | `is_supplier_owner(supplier_id)` |
| `supplier_members` | DELETE | `is_supplier_owner(supplier_id)` |

כלומר: **בעל עסק מנהל את הצוות שלו, ואת שום דבר אחר.** אין לספק נתיב כתיבה
ל-`products`, ל-`orders`, ל-`order_items`, ל-`vouchers` או ל-`payments` —
לא כחבר, לא כבעלים.

**איך בכל זאת מתבצע מימוש שובר.** דרך `redeem_voucher()`, שהיא SECURITY
DEFINER וגזורה מ-`auth.uid()` של הקורא. הספק לא מעדכן שורה; הוא קורא לפונקציה
שמחליטה בעצמה אם הוא רשאי. זה ההבדל בין "מותר לך לכתוב `redeemed_at`" לבין
"מותר לך לבקש מימוש".

**היוצא מן הכלל שכדאי לזכור:** `src/server/queries/supplier.ts` רץ על
`createAdminClient()` — service key, שעוקף RLS לגמרי — כי השאילתות מצטרפות
ל-`orders` ו-`products` שאין להם policy קריאה לספק. שם **המסנן
`.eq('supplier_id', ...)` הוא המנעול היחיד**, ולכן קיים
`supplier-tenant-scope.test.ts` שנופל אם מישהו מסיר אותו.

---

## 6. הגבלות קצב על auth

| פעולה | מפתח | תקרה | חלון |
| --- | --- | --- | --- |
| כניסה עם סיסמה | `login:<ip>` | 10 | שעה |
| כניסה עם סיסמה | `login-account:<email>` | 20 | שעה |
| הרשמה | `signup:<ip>` | 5 | שעה |
| קישור קסם | `magic:<ip>` | 5 | שעה |
| שליחת SMS | `phone-otp:<ip>` | 5 | שעה |
| שליחת SMS | `phone-otp-number:<e164>` | 5 | שעה |
| אימות SMS | `phone-verify:<ip>` | 20 | שעה |
| איפוס סיסמה | `reset:<ip>` | 5 | שעה |
| איפוס סיסמה | `reset-address:<email>` | 5 | שעה |
| קביעת סיסמה חדשה | `update-password:<ip>` | 10 | שעה |
| ‏PIN של קופאי | `staff-pin:<user>` | 15 | שעה |
| מימוש שובר | `voucher-redeem:<user>` | 120 | שעה |
| ריקון תור offline | `voucher-redeem-batch:<user>` | 40 | שעה |

**מה נוסף בשלב הזה:** שלוש השורות `login-account`, ‏`reset-address`,
‏`update-password`. שלושתן סוגרות את אותו חור: תקרה לפי IP היא תקרה על
**חיבור אחד של תוקף**, לא על **חשבון אחד של לקוח**. רשימת proxies הופכת עשרה
ניסיונות בשעה לעשרה **לכל proxy** מול אותה כתובת. התבנית כבר הייתה בקובץ —
`phone-otp-number` קיים בדיוק מהסיבה הזאת — והורחבה לשאר.

שתי ההודעות שנוספו **זהות בניסוח** להודעה הרגילה. "יותר מדי ניסיונות בחשבון
הזה" למי שלא ניסה כלום מה-IP שלו היא אישור שהכתובת רשומה.

### למה לא Upstash, למרות שהתור ביקש

‏`Upstash rate limits on auth` היה סעיף בתור. **אין לפרויקט הזה אישורי Upstash
Redis, ולא נכשלו — הם לא קיימים.** ב-`.env.local` אין `UPSTASH_REDIS_REST_URL`
ואין `UPSTASH_REDIS_REST_TOKEN`, ו-`QSTASH_TOKEN` היחיד שכן קיים תועד ב-11.08
כמחזיר 401 מול `qstash.upstash.io/v2/keys`, כלומר הוא לא תקף.

מה שכן קיים ונמדד עובד: `check_rate_limit(p_key, p_max_attempts,
p_window_seconds)`, ‏SECURITY DEFINER, מוענקת ל-`anon` ול-`authenticated`.
כל הטבלה למעלה עוברת דרכה.

**ההחלטה: להישאר על המונה ב-Postgres.** להחליף מנגנון שנמדד עובד במנגנון בלי
אישורים היה מוריד את כל הטבלה הזאת לאפס אכיפה בפרודקשן ביום שהוא עולה. אם
אופיר יפתח חשבון Upstash, הנקודה היחידה להחלפה היא
`src/lib/utils/rate-limit.ts` — כל שאר הקוד קורא ל-`checkRateLimit` ולא יודע
מה מאחוריה.

### שני דברים שצריך לדעת על המנגנון הזה

1. **הוא fail-open.** אם ה-RPC נכשל, `checkRateLimit` מחזירה `true` = מותר.
   זה מכוון: תקלה במונה לא תנעל לקוחות אמיתיים בחוץ. המחיר הוא שתקלה בטבלת
   `rate_limits` מסירה את כל התקרות בבת אחת. השגיאה נרשמת כ-
   `rate_limit.check_failed`, וכדאי שיהיה עליה alert.
2. **‏`check_user_rate_limit` לא מוענקת ל-`authenticated`.** ההרשאות שנמדדו:
   `postgres` ו-`service_role` בלבד. כלומר קריאה דרך הלקוח המשתמשי תחזיר
   `permission denied`, וה-fail-open יהפוך אותה ל"מותר" בשקט. **כרגע אין לה
   אף קורא בכל `src/`**, ולכן זו לא פרצה חיה — אבל מי שיוסיף קורא יקבל מגביל
   מת בלי אף סימן. או להעניק את הפונקציה ל-`authenticated`, או לקרוא לה רק
   דרך service key.

---

## 7. איך למדוד את זה שוב

```bash
node scripts/check-rls.mjs --sql          # מדפיס את השאילתה
# להריץ אותה דרך Supabase MCP, ואז:
node scripts/check-rls.mjs --from measured.json
```

השאילתות הנוספות ששימשו כאן:

```sql
-- כל policy שאינה SELECT, כדי לראות מי בכלל יכול לכתוב
select tablename, policyname, cmd, roles::text,
       coalesce(qual,'') as using_expr, coalesce(with_check,'') as check_expr
  from pg_policies
 where schemaname = 'public' and cmd <> 'SELECT'
 order by tablename, cmd;

-- הרשאות EXECUTE על הפונקציות שה-policies נשענות עליהן
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef, array_to_string(p.proacl, ' | ') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('check_rate_limit','check_user_rate_limit','is_admin',
                     'has_role','is_supplier_owner','is_supplier_member',
                     'current_user_role','redeem_voucher');
```

---

## 8. מה שנשאר פתוח

1. **‏`REVOKE EXECUTE` על `is_admin()` ואחיותיה — לא לעשות.** נמדד 01.09:
   ‏`is_admin` לבדה מוזכרת ב-**‏81** policies מתוך ‏133, ‏`has_role` ב-**‏19**
   ו-`current_user_role` ב-**‏10**, וביטוי policy מוערך בהרשאות התפקיד השואל.
   הפירוט ב-`docs/DB-HARDENING-AUDIT.md`.
2. **‏`migrations/pending/143_revoke_unused_definer_execute.sql`** — שש
   פונקציות שנמדדו בלי אף קורא. ממתין לאישור להרצת DDL.
3. **ההענקה של `check_user_rate_limit`** — סעיף 6, נקודה 2.
4. **alert על `rate_limit.check_failed`** — בלעדיו fail-open הוא שקט.
