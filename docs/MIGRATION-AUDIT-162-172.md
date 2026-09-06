# ביקורת מיגרציות 162, 169, 170, 171, 172

נכתב 2026-09-07 מענף `closeout/v1-final`, סקציה 2 של הסגירה.
כל מספר בקובץ הזה נמדד מול פרודקשן (project `ixvwfbuvfxxsjiywhbbb`)
דרך MCP `execute_sql`, בקריאה בלבד. **אף מיגרציה לא הוחלה.**

המקורות: `migrations/pending/APPLY-ORDER.md` ו-`migrations/pending/README.md`.
הביקורת הזאת לא מחליפה אותם. היא מוסיפה את מה שחסר בהם: רדיוס הפגיעה שנמדד,
מדיניות RLS שכל קובץ נוגע בה, ו-SQL לחזרה לאחור שאפשר להדביק.

## תמונת המצב שנמדדה (07.09, פרודקשן)

| מה | ערך |
| --- | --- |
| ‏`products` פעילים, לא מחוקים | 45 (‏80 שורות בסך הכל) |
| השורה של ₪1 (`9bb347f8…`) | קיימת, `active`, מלאי 10, ‏kenyon 1.00 מול full 400.00 |
| שורות `order_items` שמצביעות עליה | **0** |
| עגלות פתוחות שמחזיקות אותה | **0** |
| ‏`categories.name_he` ל-`under-99` | `עד ₪99` בדיוק (hex `d7a2d79320e282aa3939`) |
| ‏`vault.decrypted_secrets` עם `cron_secret` או `app_url` | **0 משניהם** |
| ‏`cron.job` | שורה אחת, `report_tables_nightly`, לא ‏`ke-*` |
| ‏`analytics_events` | 28 שורות; ה-whitelist עדיין של 151 (בלי `begin_checkout`) |
| עשרת האינדקסים של 170 | **0 מהם קיימים** |

גדלי הטבלאות שכל זה נוגע בהן: `products` 480kB, `carts` 1448kB,
‏`orders` 176kB, `order_items` 136kB, `vouchers` 192kB, `invoices` 88kB,
‏`user_addresses` 80kB, `categories` 80kB, `analytics_events` 112kB.
**הכל קטן.** זה המספר שקובע את רדיוס הפגיעה של 170 (למטה).

---

## 162 — `162_cron_schedule.sql`

**מה זה משנה.** מתזמן שנים-עשר job-ים של `scripts/cron-jobs.json` דרך
‏pg_cron + pg_net (‏161 התקין את שניהם). כל `command` קורא את `app_url` ואת
‏`cron_secret` מ-vault **בזמן הריצה**, ולכן `cron.job.command` לא מאחסן אף
סוד, ורוטציה של הסוד לא דורשת מיגרציה נוספת.

**רדיוס פגיעה.** מוסיף 12 שורות ל-`cron.job` במרחב שמות `ke-*`. השורה
היחידה שקיימת שם היום, `report_tables_nightly`, אינה ‏`ke-*` — ולכן גם
ה-rollback שמוחק לפי `like 'ke-%'` לא נוגע בה. **נמדד, לא הונח.**
אחרי ההחלה, שנים-עשר endpoint-ים מתחילים להיקרא מבחוץ בקצב של עד פעם
ב-5 דקות; זה השינוי ההתנהגותי האמיתי, לא ה-DDL.

**מדיניות RLS.** אין. הקובץ לא נוגע ב-`public` בכלל. הפונקציות שה-job-ים
קוראים דרך HTTP רצות תחת ההרשאות של ה-route, לא של pg_cron.

**חסם.** ה-vault ריק משני השמות (נמדד שוב היום: 0 מתוך 2). הקובץ עצמו
מסרב — שני `raise exception` בראש ה-`do` block — ולכן הרצה מוקדמת נכשלת
נקי במקום לתזמן 12 job-ים שקוראים עם bearer ריק. **זו התנהגות נכונה
ולא צריך לשנות אותה.**

**חזרה לאחור.**
```sql
select cron.unschedule(jobname) from cron.job where jobname like 'ke-%';
```

**בטיחות בפרודקשן: בטוח להחיל, ברגע שה-vault מוזרע.** לא לפני.

---

## 169 — `169_analytics_server_event_names.sql`

**מה זה משנה.** ‏`CREATE OR REPLACE` של `fn_ingest_analytics_events`,
זהה ל-151 חוץ מרשימת ה-`IN`, שמקבלת את ארבעת השמות של `SERVER_EVENT_NAMES`
ב-`src/lib/analytics/events.ts`: ‏`begin_checkout`, `purchase`,
‏`voucher_redeemed`, `order_refunded`.

**רדיוס פגיעה.** ‏`CREATE OR REPLACE FUNCTION` נועל את הפונקציה בלבד, לא את
הטבלה. ‏`analytics_events` הוא 112kB. ההחלה היא מילישניות.
מה שמשתנה אחרי ההחלה: ארבעה אירועים שהיו נזרקים בשקט מתחילים להיכתב.
זה בדיוק פריט 2 ב-`CLAUDE.md`.

**מדיניות RLS.** הפונקציה היא `SECURITY DEFINER` עם `search_path` ריק,
ולכן היא כותבת מעבר ל-RLS של `analytics_events` — כפי ש-151 קבע.
המדיניות היחידה על הטבלה נשארת `analytics_events_admin_read`
(‏SELECT, ‏`authenticated`, ‏`is_admin()`). **169 לא נוגעת בה.**
ההרשאות נשארות `service_role` בלבד; בלוק (3) ב-`preflight_169.sql` מוכיח את זה.

**חזרה לאחור.** להריץ מחדש את בלוק ה-`CREATE OR REPLACE FUNCTION`
מ-`migrations/applied/151_analytics_ingest.sql` (הרשימה בת שמונה השמות).

**בטיחות בפרודקשן: בטוח.** הרחבה בלבד. שם לא מוכר עדיין מדולג ולא זורק.

---

## 170 — `170_composite_indexes_top_queries.sql`

**מה זה משנה.** עשרה `CREATE INDEX IF NOT EXISTS` על
‏`products` (5), ‏`orders`, ‏`vouchers`, ‏`invoices`, ‏`carts`,
‏`user_addresses`. בלי drop, בלי שינוי נתונים.

**רדיוס פגיעה — הנקודה היחידה שדורשת תשומת לב.** הקובץ לא משתמש ב-
‏`CONCURRENTLY`, ולכן כל `CREATE INDEX` לוקח `SHARE` על הטבלה וחוסם כתיבות
לאורך הבנייה. **בגדלים שנמדדו זה לא משנה:** הטבלה הגדולה ביותר ברשימה היא
‏`carts` ב-1448kB ו-2027 שורות. בנייה כזאת היא מילישניות בודדות.
‏`CONCURRENTLY` היה דווקא גרוע יותר כאן, כי הוא לא יכול לרוץ בתוך טרנזקציה
ו-MCP `apply_migration` עוטף את הקובץ באחת. **להשאיר כמו שהוא, ולתעד את
הסיבה** — כשהטבלאות יגדלו, ההחלטה הזאת צריכה להיבדק מחדש.

**מדיניות RLS.** אין. אינדקסים לא משתתפים ב-RLS. אבל הם כן משנים תוכניות
של שאילתות שרצות תחת RLS — וזה שיפור, לא סיכון: ה-`qual` של
‏`products_select_anon` הוא `status = 'active' AND deleted_at IS NULL`,
בדיוק ה-predicate של האינדקסים החלקיים (1), (3), (4), (5).

**חזרה לאחור.**
```sql
drop index if exists public.products_active_category_created_idx;
drop index if exists public.products_status_created_idx;
drop index if exists public.products_active_category_price_idx;
drop index if exists public.products_active_price_created_idx;
drop index if exists public.products_active_category_name_idx;
drop index if exists public.orders_user_created_active_idx;
drop index if exists public.vouchers_order_item_issued_idx;
drop index if exists public.invoices_order_doc_status_idx;
drop index if exists public.carts_session_profile_idx;
drop index if exists public.user_addresses_user_default_created_idx;
```

**בטיחות בפרודקשן: בטוח.** אפס מעשרת השמות קיים היום, ולכן אין התנגשות שמות.

---

## 171 — `171_category_name_shekel_order.sql`

**מה זה משנה.** ‏`update` אחד על עמודת טקסט אחת של שורה אחת: ‏`name_he` של
‏`under-99` עובר מ-`עד ₪99` לצורת ספרות-ואז-סימן עטופה ב-U+2066…U+2069.

**רדיוס פגיעה.** שורה אחת מתוך 12 ב-`categories` (80kB). ה-`where` תופס גם
את ה-slug וגם את המחרוזת השבורה המדויקת, ולכן הרצה שנייה מעדכנת אפס שורות.
נמדד היום: המחרוזת בפרודקשן היא בדיוק זו שהקובץ מחפש (hex למעלה),
ו-`already_isolated` מחזיר `false`.

**מה זה לא משנה.** האתר כבר נכון בלי זה. ‏`getAllCategories` מתקן את הסדר
בקריאה (‏`repairPriceOrder`), ו-`e2e/price-bidi.spec.ts` מודד את הגאומטריה
ב-380/768/1440. ‏171 מתקנת את **הנתון**, כדי שייצוא, feed, או קורא עתידי
שידלג על העוזר יסכימו עם הדף.

**מדיניות RLS.** אין שינוי. הארבע הקיימות (`categories_select_anon`,
‏`categories_select_authenticated`, ‏`categories_insert/update/delete_unified`)
נשארות כמות שהן. ה-`update` עצמו רץ תחת תפקיד המיגרציה, שעוקף RLS —
ולכן `categories_update_unified` (`is_admin()`) אינו רלוונטי להחלה.

**חזרה לאחור.**
```sql
update public.categories set name_he = 'עד ₪99' where slug = 'under-99';
```

**בטיחות בפרודקשן: בטוח.** ‏`preflight_171.sql` נכתב בסקציה הזאת ובלוקים
‏(1)–(4) שלו הורצו מול פרודקשן: השורה קיימת, פעילה, `sort_order` 2,
אין שורה שבורה נוספת, ואין מפתח זר שמצביע על `categories` דרך משהו שאינו `id`.

---

## 172 — `172_hide_master_product_test_row.sql`

### הבקשה לשכתב את 172 נדחית, ולהלן הסיבה

הבריף של הסגירה ביקש שהמיגרציה תשכתב כך ש"‏insert של מוצר הבדיקה בשקל ירוץ
רק כאשר `current_setting('app.env', true) = 'development'`", או שה-insert
יעבור ל-`seeds/dev_only_172.sql`.

**אין ב-172 שום insert.** יש בה `update` אחד, והוא **התיקון**: הוא מאפס את
המלאי של השורה שנמכרת בשקל. להתנות אותו ב-`app.env = 'development'` פירושו
להפוך אותו ל-no-op בפרודקשן ולהשאיר את השורה על דף הבית — ההפך הגמור ממה
שהתבקש. הקובץ נשאר **ללא שינוי**.

השורה עצמה לא הגיעה מ-seed. היא נכנסה בייבוא מוורדפרס:
‏`supabase/migrations/128_wp_publish.sql` שורה 236 מתעדת את ההתאמה
‏`restaurants-meat-3 → live kenyon 1, full 400 → match`. כלומר האתר החי
מכר אותה כך, והייבוא העתיק נאמנה.

הקריאה הקוהרנטית של הבקשה נכתבה ל-`seeds/dev_only_172.sql`: פיקסצ׳ר פיתוח
עם שומר `app.env`, שיוצר שורה **נפרדת** (`dev-implausible-discount-fixture`)
כדי שאפשר יהיה לשחזר את התקלה מקומית בלי שאי-פעם ייווצר מוצר ₪1 מול לקוח.

### מה 172 עושה, ומה היא לא עושה

**מה זה משנה.** ‏`stock_quantity` מ-10 ל-0 על שורה אחת, לפי `id` **וגם**
‏`name_he`. לא מחיקה: מחיקה הייתה מייתמת שורת `order_items` היסטורית.

**נמדד: אין היסטוריה כזאת.** אפס שורות `order_items` ואפס עגלות פתוחות
מצביעות על המוצר. כלומר גם מחיקה הייתה בטוחה — ובכל זאת אפס-מלאי הוא
המהלך השמרן יותר ונשאר הנכון.

**מדיניות RLS — וכאן הממצא.** ה-`qual` של `products_select_anon` הוא
```
(status = 'active'::product_status) AND (deleted_at IS NULL)
```
**אין בו איבר מלאי.** ולכן אפס-מלאי **אינו** מסיר את השורה מ-RLS: הדאטהבייס
ממשיך להגיש אותה. היא נעלמת מהחזית רק היכן שהאפליקציה מסננת
(‏`FeaturedProductsTabs` מסננת `stock_quantity > 0`) או מציגה מצב אזל
(‏`ProductCard`, `CategoryProductCard`, `ProductDealCard` בודקות `=== 0`).
**דף המוצר `/product/restaurants-meat-3` ימשיך להיטען אחרי ההחלה,**
מסומן כאזל מהמלאי. אם המטרה היא שהדף יחזיר 404, צריך `status <> 'active'`
או `deleted_at`, וזו מיגרציה אחרת. זה לא ליקוי ב-172 — זה גבול שלה,
והוא לא היה מתועד עד עכשיו.

### הדחיפות בפועל נמוכה ממה שכתוב ב-CLAUDE.md

‏`CLAUDE.md` פריט 1 אומר "מי שיקנה ייצור הזמנה אמיתית ותשלום אמיתי בלי מה
לספק". **נמדד: אי אפשר לקנות אותה היום.**
‏`src/lib/commerce/implausible-discount.ts` מסרב לכל שורה שמחיר המכירה שלה
קטן-שווה ל-5% מה-compare-at (`MAX_PLAUSIBLE_DISCOUNT_PERCENT = 95`).
החשבון על השורה הזאת: ‏100 אגורות × 100 = 10,000, מול 40,000 × 5 = 200,000.
‏10,000 ≤ 200,000 → **מסורב**. והסירוב קורה שלוש פעמים בנפרד:
‏`addToCart` (‏`src/server/actions/cart.ts:337`), מתמחר העגלה
(‏`src/lib/cart/pricing.ts:119`) ו-`beginCheckout` דרך `validateCartView`.

כלומר 172 סוגרת **ליקוי תצוגה** — תג הנחה של 99.75% על שורה ששמה מכריז
שהיא תבנית — ולא קופה פתוחה. זה לא הופך אותה למיותרת; זה משנה את סדר
הדחיפות, וצריך שיהיה כתוב.

**נמדד גם:** השורה הזאת היא **היחידה** בקטלוג הפעיל שנופלת בבדיקת
ההנחה הלא-סבירה. אין זנב.

**חזרה לאחור.**
```sql
update public.products set stock_quantity = 10
 where id = '9bb347f8-03ec-48ce-8ff2-2503fb74c895';
```

**בטיחות בפרודקשן: בטוח.** שורה אחת, עמודה שלמה אחת, `where` שהוא בעצמו
הבדיקה. ‏`preflight_172.sql` נכתב בסקציה הזאת; בלוקים (1)–(6) הורצו מול
פרודקשן והתוצאות מופיעות בטבלה בראש הקובץ הזה.

---

## סיכום: מה מוכן להחלה

| קובץ | מוכן טכנית | ממתין ל | preflight |
| --- | --- | --- | --- |
| `162_cron_schedule.sql` | לא | הזרעת ‏vault (‏`cron_secret`, `app_url`) | `preflight_162.sql` |
| `169_analytics_server_event_names.sql` | **כן** | אישור | `preflight_169.sql` |
| `170_composite_indexes_top_queries.sql` | **כן** | אישור | `preflight_170.sql` |
| `171_category_name_shekel_order.sql` | **כן** | אישור | `preflight_171.sql` (חדש) |
| `172_hide_master_product_test_row.sql` | **כן** | אישור | `preflight_172.sql` (חדש) |

‏169 ו-172 הן שתי השורות הפתוחות בראש `CLAUDE.md`. שתיהן בטוחות, שתיהן
נבדקו עמודה-עמודה מול פרודקשן, ואף אחת מהן לא הוחלה — `migrations/pending/`
הוא לא-מוחל בהגדרה, וההחלה היא אחד מארבעת המצבים שמחייבים אישור מפורש.
