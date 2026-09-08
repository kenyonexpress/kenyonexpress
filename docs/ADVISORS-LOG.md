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

---

## סבב 2 — 08.09.2026, ‏W2-F, דרך `get_advisors`

**‏23 התראות אבטחה, כולן `WARN`, אפס `ERROR`.**

### מה שזהה לסבב 1

‏22 מתוך ה-23 הן `*_security_definer_function_executable` — בדיוק
20 הפונקציות שסיווגתי בסבב 1 plus שתי חתימות נוספות של אותן פונקציות.
שתיים ל-`anon` (‏`is_admin`, ‏`is_supplier_member`) שמוצדקות ומתועדות
(ביטול ההרשאה מפיל את כל הקטלוג האנונימי ל-42501, ולכן 165 בוטלה), והשאר
ל-`authenticated` עם בדיקת תפקיד פנימית ו-`RAISE`. **אין דלתא.**

### הממצא היחיד שהוא חדש, ושהביקורת שלי פספסה

**‏`public.set_updated_at` בלי `search_path`, ו-52 טריגרים משתמשים בה.**

**למה סבב 1 לא מצא אותה, וזו הנקודה החשובה:** שאלתי "כמה פונקציות
‏`SECURITY DEFINER` חסרות `search_path` מוצמד" וקיבלתי אפס. זה **נכון**.
אבל `set_updated_at` היא `prosecdef = false`, כלומר מעולם לא הייתה בקבוצה
שנספרה, ושורת הסיכום שכתבתי ("‏74, אפס בלי `search_path`") **נקראת כאישור
בריאות כללי ל-search_path בעוד היא אישור לפונקציות definer בלבד.**
שאילתה נכונה לא הופכת סיכום שגוי לנכון.

**החומרה נמוכה מכפי שהשם מרמז, ואני אומר את זה במפורש.** הצורה המסוכנת היא
פונקציית `DEFINER` עם נתיב משתנה, כי היא רצה כבעלים; מי שמצליח להחדיר
אובייקט לסכימה מוקדמת יותר בנתיב מקבל את הרשאות הבעלים. הפונקציה הזו רצה
**כקורא**, ולכן חטיפת שם מזכה את התוקף במה שכבר היה לו.

**ובכל זאת ראוי לתקן**, משתי סיבות שאינן חומרה: ‏52 טריגרים הם רדיוס
הפגיעה הרחב ביותר של פונקציה בודדת בסכימה, ואזהרה שחוזרת בכל סבב מאמנת את
הקורא לדלג על רשימה שאמורה להיות ריקה.

**‏`SET search_path = pg_catalog` ולא `''`.** הגוף קורא ל-`now()`, שיושבת
שם. נתיב ריק היה מעלה `function now() does not exist` בכתיבה הבאה לכל אחת
מ-52 הטבלאות — תוצאה גרועה בהרבה מהאזהרה.

‏`migrations/pending/177_set_updated_at_search_path.sql` עם `preflight_177`,
ארבעת הבלוקים הורצו. **לא הוחלה.** הגוף זהה בית-בית; רק הקונפיג נוסף.

### סיכום סבב 2

| פריט | סבב 1 | סבב 2 | דלתא |
|---|---|---|---|
| טבלאות בלי RLS | 0 | 0 | — |
| ‏RLS בלי מדיניויות | 0 | 0 | — |
| ‏qual = `true` | 1 (`media_assets`) | 1 | — |
| מענקים ל-anon | 16, מוצדקות | 16 | — |
| ‏definer בלי search_path | 0 | 0 | — |
| **‏non-definer בלי search_path** | **לא נבדק** | **1** | **חדש** |
| ‏ERROR-level | 0 | 0 | — |

---

## Round 3 — 2026-09-08, after `main` applied five migrations to production

Rounds 1 and 2 predate the autopilot branch applying `audit_full_coverage_169`,
`reporting_tables_170`, `search_fts_171`, `rls_zero_policy_tables_172` and
`coupon_qr_batches_182` to production. New DDL is exactly when this should be
re-read, so it was.

### Security: 23 findings, none actionable

| lint | count | verdict |
| --- | --- | --- |
| `function_search_path_mutable` | 1 | `set_updated_at` — **migration 177, already written and pending.** Unchanged. |
| `anon_security_definer_function_executable` | 2 | `is_admin`, `is_supplier_member`. **Deliberate:** migration 165 was CANCELLED because revoking these 42501s every anonymous catalogue read — eighteen public RLS policies call them. |
| `authenticated_security_definer_function_executable` | 20 | see below |

**NINE OF THE TWENTY HAD NEVER BEEN ASSESSED** — the five `admin_report_*`
functions from `170_reporting_tables` and the four `payout` functions. They are
the ones worth looking at, because `authenticated` means *any signed-in
customer* can POST to `/rest/v1/rpc/approve_payout_statement`.

All nine authorize internally. Verified by reading the highest-stakes one in
full rather than trusting the regex:

```sql
CREATE OR REPLACE FUNCTION public.approve_payout_statement(p_statement_id uuid)
 SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  ...
```

First statement, blocking, before any write, with `search_path` pinned. The
Supabase linter cannot see internal authorization, so it reports every one of
them; that is the linter being correct about what it can observe and not a
finding.

### Performance: 191 findings, and the big group must NOT be acted on

| lint | count | verdict |
| --- | --- | --- |
| `unused_index` | **174** | **Do not act.** "Never used" on a database with 45 products, no orders and no traffic means the queries that need them have not run yet. Dropping them would be removing the indexes for the launch. |
| `multiple_permissive_policies` | 15 | Every pair is the standard `admin-all` + `owner-read` shape. Merging into one `OR` policy is faster and less readable, and at this volume the difference is unmeasurable. |
| `unindexed_foreign_keys` | 1 | `coupon_qr_batches.created_by`, new from `main`'s 182. Real, trivial, and on a branch this one has not merged. |
| `auth_db_connections_absolute` | 1 | Auth capped at 10 connections; a percentage strategy is the recommendation. Infrastructure setting, owner-level. |

**The 174 is the entry that matters for whoever reads this next.** It is the
largest number in the report, it looks like an obvious cleanup, and acting on it
would be the single most damaging thing available in this document. Recorded so
that the next pass does not "fix" it.

---

## Round 4 — 2026-09-08, maintenance pass 39

**No delta.** Security 23 findings, performance 191, the same counts and the same
items as round 3, which assessed every one of them.

| lint | round 3 | round 4 |
| --- | --- | --- |
| `function_search_path_mutable` | 1 | 1 (`set_updated_at`, migration 177 still pending) |
| `anon_security_definer_function_executable` | 2 | 2 |
| `authenticated_security_definer_function_executable` | 20 | 20 |
| `unused_index` | 174 | 174 |
| `multiple_permissive_policies` | 15 | 15 |
| `unindexed_foreign_keys` | 1 | 1 |
| `auth_db_connections_absolute` | 1 | 1 |

Recorded because a round that finds nothing is a result, and because the next
round should be able to see that these numbers have been flat across two
readings rather than re-derive the verdicts a third time.

### What the round did surface, indirectly

The function list named `escrow_holds` and its indexes, and the business model
has had no escrow since 2026-07-28. Chasing that found a live admin surface
still promising a release. It is written up in `STATE.md` under maintenance pass
39; the short version is that `escrow_holds` holds two real rows, they are
history, they stay, and the labels around them no longer describe a future.

---

## Round 5 — 2026-09-09, maintenance pass 89

**No delta, third flat reading.** Security 23, performance 191. Same counts and
same items as rounds 3 and 4.

| lint | round 3 | round 4 | round 5 |
| --- | --- | --- | --- |
| `function_search_path_mutable` | 1 | 1 | 1 (`set_updated_at`, 177 still pending) |
| `anon_security_definer_function_executable` | 2 | 2 | 2 |
| `authenticated_security_definer_function_executable` | 20 | 20 | 20 |
| `unused_index` | 174 | 174 | 174 |
| `multiple_permissive_policies` | 15 | 15 | 15 |
| `unindexed_foreign_keys` | 1 | 1 | 1 |
| `auth_db_connections_absolute` | 1 | 1 | 1 |

### The definer-function findings were re-derived once more, from the bodies

Rounds 3 and 4 assessed these; this round checked the assessment rather than
inheriting it, because 20 of the 23 findings are on the money path and
"assessed before" is not evidence. Every function named by lints 0028 and 0029
was read out of `pg_proc`:

- **Nine are role-guarded in the body.** `admin_refresh_reports`, the four
  `admin_report_*`, `approve_payout_statement`, `cancel_payout_statement`,
  `generate_payout_statement` and `mark_payout_statement_paid` all call
  `is_admin`, `has_role`, `current_user_role` or `is_support` before doing
  anything. The advisor cannot see inside a body, which is why it reports them.
- **Eight are the RLS helpers themselves** (`is_admin`, `has_role`,
  `is_supplier_member`, `is_supplier_owner`, `is_supplier_order`,
  `is_supplier_shipping_order`, `is_support`, `current_user_role`). They must be
  definer and must be callable, or every policy that calls them stops working.
  A caller learns only facts about their own session.
- **Three guard on membership rather than on role**, and were read in full:
  - `redeem_voucher` returns `unauthorized` unless `auth.uid()` is non-null AND
    has an active `supplier_members` row, logs the failed attempt to
    `voucher_redemptions` either way, and carries an idempotency replay guard.
  - `verify_supplier_staff_pin` returns empty unless the caller is an active
    supplier member, scopes the PIN check to that supplier's own staff, and
    rate-limits to 5 attempts per 15 minutes keyed on the caller's uid.
    A malformed PIN counts as an attempt, which closes the obvious bypass.
  - `supplier_app_context` returns the caller's own context.

**Verdict unchanged, now on evidence rather than on inheritance: none of the 22
definer findings is an open door.** The remaining one is `set_updated_at`, and
migration 177 has been waiting for it since 2026-09-08.

### What this round did surface

**Migration 177's stated reason for its `search_path` value was false.** It
claimed `SET search_path = ''` would make the function raise `function now()
does not exist`. pg_catalog is searched implicitly whatever search_path holds,
so an empty path cannot hide `now()`. Proven against this database in a DO
block that raised at the end so nothing committed: `''` and `'pg_catalog'`
returned the same timestamp, neither raised.

The migration's SQL is unchanged, because both values are correct for a body
whose only unqualified name is `now()`. The header and preflight now say why,
and no longer teach the next author that `''` is dangerous when it is the value
Supabase actually recommends.
