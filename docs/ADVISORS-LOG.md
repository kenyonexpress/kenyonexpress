# יומן ביקורת Supabase

קריאה בלבד, דרך ‏MCP `execute_sql`. **לעולם לא `apply_migration`, ולעולם לא
‏ALTER/DROP/INSERT/UPDATE/DELETE.** כל ממצא שדורש שינוי סכימה הופך לקובץ
ב-`migrations/pending` עם preflight, ואינו מוחל.

תור הביקורת שייך ל-`W2` בפעם הראשונה ואז לכל סבב של `W50`. כל סבב מריץ שוב
ומשווה מול הרשומה הקודמת.

---

## סבב 1 — 07.09.2026, פריטים 1 עד 5 (סכימה)

הורץ מוקדם, בתוך `W1` בלוק 10, כי חמשת הפריטים האלה קריאה בלבד והם משלימים
ישירות את חבילת גבולות ה-RLS שנכתבה שם.

### 1. טבלאות ציבוריות עם `rowsecurity = false` — **אפס. עובר.**

```sql
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity = false;
```

תוצאה: ‏`[]`. אין אף טבלה ציבורית בלי ‏RLS.

### 2. טבלאות עם ‏RLS דלוק ואפס מדיניויות — **אפס. עובר.**

אותה שאילתה עם `(select count(*) from pg_policies ...) = 0`. תוצאה: `[]`.
אין deny-all מקרי ואין deny-all מכוון בלי מדיניות מפורשת.

### 3. מדיניויות שה-qualifier שלהן הוא `true` — **ממצא אחד.**

```sql
select tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname='public'
  and (btrim(coalesce(qual,'')) = 'true' or btrim(coalesce(with_check,'')) = 'true');
```

| טבלה | מדיניות | cmd | roles | qual |
|---|---|---|---|---|
| `media_assets` | `media_assets: public read` | SELECT | `{public}` | `true` |

**הקשר שנמדד:** ‏`media_assets` מחזיקה **0 שורות** היום, והעמודות הן
`id, url, alt_he, blur_data_url, width, height, renditions, provider, bucket,
base_path, created_by, created_at, updated_at`. אין שם ‏PII ואין כסף.

**הערכה:** לא דליפה היום, כי הטבלה ריקה. מרגע שתאוכלס, כל נכס מדיה נעשה
קריא לאנונימי, כולל נכסים שמחוברים למוצרי טיוטה שטרם פורסמו, ובנוסף
‏`created_by` חושף מי העלה מה.

**פעולה מומלצת:** לצמצם ל-`EXISTS (select 1 from products p where ... p.status
= 'active')` או להחליט במפורש שהדלי ציבורי ולכן ה-URL ציבורי ממילא. **החלטה
נדרשת לפני שהטבלה מאוכלסת, לא אחרי.** נרשם, לא שונה.

### 4. מדיניויות שמעניקות ל-`anon` — **‏16, כולן מוצדקות.**

שמונה מהן הן `deny_all_client_roles` עם `qual = false`, כלומר **סירוב**
מפורש: ‏`legacy_percent_archive_112`, ‏`rate_limits`, ‏`referral_signals`,
‏`search_index_dlq`, ‏`search_index_outbox`, ‏`settlement_events`,
‏`stock_reservations`, ‏`user_rate_limits`. זה הדפוס הרצוי.

שמונה הנותרות הן קריאות קטלוג ציבוריות, **כולן מסויגות** ואף אחת לא `true`:

| טבלה | הסיוג |
|---|---|
| `banners` | `is_active` |
| `categories` | `is_active = true` |
| `homepage_sections` | `is_active` |
| `popular_searches` | `is_active` |
| `products` | `status = 'active' AND deleted_at IS NULL` |
| `product_variants` | פעיל, או שייך למוצר פעיל |
| `seo_redirects` | `is_admin() OR is_active` |
| `supplier_branches` | `is_active` וספק שלא נמחק |

**מוצדק.** זה בדיוק הקטלוג שמבקר מנותק אמור לראות.

### 5. פונקציות `SECURITY DEFINER` — **‏74, וכולן עם `search_path` מוצמד.**

```sql
select count(*) filter (where coalesce(array_to_string(proconfig,','),'')
                               not like '%search_path%')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef;
```

תוצאה: **0**. זו התכונה הבטיחותית המרכזית של definer והיא נקייה לחלוטין.

**‏20 מתוך ה-74 ניתנות להרצה על ידי תפקיד לקוח.** שתיים על ידי `anon`:

- `is_admin` ו-`is_supplier_member`. **מוצדק ומתועד:** מיגרציה ‏165 בוטלה
  בדיוק בגלל זה, כי ‏18 מדיניויות ציבוריות קוראות להן בתוך ה-qual, ו-quals
  רצים כקורא. ביטול ההרשאה היה מפיל את כל הקטלוג האנונימי ל-42501.
  ‏`src/db/__tests__/anon-catalog.test.ts` היא רשת הביטחון.

תשע פונקציות דוח ותשלום שכל משתמש מחובר יכול לקרוא להן
(‏`admin_report_*`, ‏`generate_payout_statement`, ‏`approve_payout_statement`,
‏`cancel_payout_statement`, ‏`mark_payout_statement_paid`, ‏`admin_refresh_reports`):
**לכולן בדיקת תפקיד פנימית ו-`RAISE`.** נבדק אחת-אחת. עובר.

**שתיים סומנו ואז נוקו, והסימון היה שלי ולא שלהן:**
‏`supplier_app_context` ו-`verify_supplier_staff_pin` אינן קוראות
`is_admin()`, ולכן ההיוריסטיקה שלי סימנה אותן כ"בלי בדיקת תפקיד". קריאה של
הגוף מראה שהן גוזרות את ההיקף מ-`supplier_members` דרך `auth.uid()`, שזה
**הדפוס הנכון** ואותו דפוס בדיוק כמו `redeem_voucher`. לא-חבר מקבל אפס שורות.
**ההיוריסטיקה הייתה צרה מדי; הממצא בוטל.**

#### ‏5א. ממצא אמיתי שהתגלה בקריאה הזו: ‏`verify_supplier_staff_pin` מאפס את מונה הניסיונות בהצלחה

הפונקציה מגבילה ל-5 ניסיונות ב-15 דקות, על מפתח `supplier_pin:<uid>`.
בהצלחה היא מריצה:

```sql
DELETE FROM public.rate_limits WHERE key = v_key;
```

המפתח הוא **פר משתמש ולא פר עובד**, ולכן חבר ספק פעיל שמכיר קוד PIN תקף
אחד יכול לאפס את המונה מתי שירצה: ארבעה ניחושים, ‏PIN ידוע, ארבעה ניחושים,
וחוזר חלילה. הנעילה מנוטרלת לחלוטין, ומרחב של ‏PIN בן 4 ספרות הוא ‏10,000.

**חומרה: נמוכה עד בינונית.** התוקף חייב להיות כבר חבר פעיל של אותו ספק
**וגם** להכיר ‏PIN תקף אחד שלו. מה שהוא מרוויח הוא ה-PIN של עובד אחר באותו
עסק, כלומר ייחוס סריקה שגוי ביומן שנועד ליישב מחלוקות.

**נמדד ב-preflight, וזה משנה את הדחיפות:** ‏`active_staff = 0` בפרודקשן.
בלי אף שורת עובד פעילה הפונקציה **אינה יכולה להצליח בכלל**, ולכן מסלול
האיפוס החינמי אינו נגיש והפגם אינו ניתן לניצול היום. זה הופך אותו לתיקון
שצריך לנחות **לפני שהספק הראשון מוסיף עובדים**, ולא לאירוע. זה גם אומר
שאי אפשר לאמת את השינוי מול פרודקשן עד שיהיו עובדים.

**פעולה מומלצת:** לא למחוק את השורה בהצלחה, אלא לאפס `attempts` רק לאחר
אימות מוצלח **של אותו עובד**, או להעביר את המפתח ל-`supplier_pin:<uid>:<staff_id>`
כך שהצלחה על עובד אחד לא מזכה ניחושים על אחר. **דורש שינוי בגוף פונקציה,
כלומר מיגרציה.** נכתבה ‏`migrations/pending/176_supplier_pin_rate_limit_per_staff.sql`
עם `preflight_176.sql`, שכל שישה הבלוקים שלו הורצו מול פרודקשן. **לא הוחלה.**

---

### סיכום סבב 1

| פריט | תוצאה |
|---|---|
| 1 טבלאות בלי RLS | אפס. עובר |
| 2 ‏RLS בלי מדיניויות | אפס. עובר |
| 3 ‏qual = `true` | ‏1: `media_assets`, ריקה היום, דורשת החלטה לפני אכלוס |
| 4 מענקים ל-anon | ‏16, כולן מוצדקות (8 סירוב מפורש, 8 קטלוג מסויג) |
| 5 ‏SECURITY DEFINER | ‏74, אפס בלי `search_path`. ממצא אחד: ‏5א |

**פריטים 6 עד 100 טרם התקבלו.** הסבב הבא ירוץ ב-`W2` ויתחיל מפריט 1 שוב
כדי לייצר diff.
