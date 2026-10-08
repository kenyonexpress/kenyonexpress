# ‏Runbook: בסיס הנתונים (‏Supabase Postgres)

| שדה | ערך |
| --- | --- |
| רכיב | ‏Postgres מנוהל, ‏RLS, מיגרציות, רפליקת קריאה |
| ספק | ‏Supabase, פרויקט ‏`ixvwfbuvfxxsjiywhbbb`, ‏eu-central |
| כרטיס ב-/admin/health | `database`, `read_replica` |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV1: ‏DB לא עונה, או טבלת כסף עם ‏RLS פתוח |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

## 1. רדיוס פגיעה

הכול. אין ‏cache שמחזיק את האתר בלי ‏DB: כל דף קטלוג, כל ‏checkout, כל סריקת
שובר, האדמין, וכל ‏cron. ‏Timeout של ‏10 שניות על כל קריאה
(‏`SUPABASE_TIMEOUT_MS`) מעלה ‏`SupabaseTimeoutError`, נבדל משגיאת רשת.

## 2. זיהוי

- ‏`/admin/health`: כרטיס ‏`database` אדום, או ‏`read_replica` בטבלה למטה.
- ‏Sentry: ‏`SupabaseTimeoutError`, ‏`42703` (עמודה חסרה), ‏`42P01` (טבלה
  חסרה), ‏`23514` (טריגר מעבר מצב דחה), ‏`PGRST201` (‏embed דו-משמעי).
- ‏Supabase Dashboard > Reports: ‏CPU, חיבורים, גודל דיסק.
- ‏`backup-health.yml` יומי מתריע ל-ntfy כשאין גיבוי טרי.

## 3. טריאז'

‏SQL בקריאה בלבד נגד פרודקשן, בלי ‏psql ובלי ‏MCP, דרך הטוקן של ה-CLI (רק
בתוך ‏`BEGIN; ... ROLLBACK;`):

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
DEC=$(echo "${TOKEN#go-keyring-base64:}" | base64 -d)
SQL='select count(*) from pg_stat_activity where state <> '"'"'idle'"'"';'
curl -s --http1.1 -H "Authorization: Bearer $DEC" -H "Content-Type: application/json" \
  --data-binary "$(jq -n --arg q "$SQL" '{query:$q}')" \
  https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/database/query
```

1. **לא עונה בכלל?** ‏Dashboard > Project status. אם ‏Supabase בתקלה אזורית,
   אין מה להחזיר; ‏SEV1, הודעה ללקוחות, ‏§6.
2. **‏42703 / ‏42P01 אחרי ‏deploy?** הקוד החדש מניח מיגרציה שלא הוחלה (כלל
   קבוע: ‏`migrations/pending/` לא מוחל בלי אישור). זו תקרית **קוד**: ‏`web-vercel.md`
   §4, לא מיגרציה דחופה.
3. **‏23514 על סריקה או מעבר הזמנה?** ‏`RUNBOOK.md` §4.3; הטריגרים מ-137
   עושים את עבודתם. לא לכבות לפני שמבינים איזה מעבר נדחה.
4. **איטי?** ‏`/api/cron/slow-statements` ו-`INDEX-USAGE-REPORT.md`. לא למחוק
   אינדקסים בתקרית.
5. **חשד ל-RLS פתוח על טבלת כסף?** להתייחס כחי: ‏`RUNBOOK.md` §7 והסלמה מיידית.

## 4. צעדי Rollback

‏DDL ב-Postgres אין לו ‏undo. "להחזיר מיגרציה" הוא **מיגרציה קדימה שנייה**.

1. **מיגרציה שהוחלה ושוברת**: לכתוב את ההיפוך כקובץ חדש ב-`migrations/pending/`,
   לחזור עליו בפרודקשן בתוך ‏`BEGIN; ... ROLLBACK;` עם ‏`RAISE` שמדפיס את
   המצב בסוף (‏`to_regclass`, ‏`pg_policies`), ורק אז לבקש אישור להחלה.
   ‏`DROP TRIGGER` לפני ‏`DROP FUNCTION`. ‏`DROP`+`CREATE` של פונקציה מאפס
   ‏grants ומחזיר ‏EXECUTE ל-anon; לבדוק ‏`has_function_privilege` אחרי.
2. **טריגר שחוסם בטעות**: להעדיף השבתה על מחיקה בזמן אבחון:
   ‏`ALTER TABLE public.order_items DISABLE TRIGGER tg_order_items_settlement_status_guard;`
   הפיך בפקודה אחת ושומר את גוף הפונקציה לקריאה.
3. **מדיניות ‏RLS שנשברה**: ‏`REVOKE` יכול להשבית מדיניות בשקט ושתי התקלות
   מדווחות על האובייקט הלא נכון. לבדוק ‏`pg_policies` **ו-**`information_schema.role_table_grants`
   יחד לפני כל שינוי.
4. **שורות שנמחקו או הושחתו**: אין ‏PITR (תוסף בתשלום, לא הופעל, נמדד
   ‏08.10). השחזור הוא מהגיבוי היומי של ‏Supabase **לפרויקט חדש**, לעולם לא
   מעל החי: ‏`DB-RESTORE-RUNBOOK.md` §"Restore: real incident", ואז החלפת
   שלושת משתני ‏Supabase ב-Vercel ו-redeploy (‏`DR-RUNBOOK.md` צעדים ‏3 ו-4).
   ‏RPO עד ‏24 שעות.
5. **קוד שנכנס לפני המיגרציה שלו**: ‏rollback של האפליקציה (‏`web-vercel.md`
   §4) ולא החלה דחופה.

## 5. מה לא ניתן להחזיר

- ‏DDL שהוחל: רק קדימה.
- שורות שנמחקו לפני הגיבוי האחרון, כל עוד ‏PITR כבוי.
- ‏`payment_events` הוא יומן ‏append-only בכוונה; "לתקן" שורה שם הוא זיוף
  רשומה, לא תיקון.
- מחיקת פרויקט ‏Supabase.

## 6. מתי להסלים

- **כל** החלה של מיגרציה בפרודקשן, כולל היפוך: מצב קבוע מארבעת המצבים.
- שחזור מגיבוי, הפעלת ‏PITR (‏~115 דולר לחודש), שדרוג תוכנית.
- מחיקת נתונים מכל סוג.
- ‏RLS פתוח על ‏orders, ‏order_items, ‏payments, ‏vouchers, ‏wallet: מיידי,
  ‏SEV1, גם בלילה.
- תקלה אזורית של ‏Supabase מעל ‏30 דקות: אופיר מחליט על הודעה ללקוחות.

## 7. אימות אחרי

```bash
curl -sS https://kenyonexpress.co.il/api/health; echo     # {"ok":true,"database":"ok"}
```

‏`/admin/health` ירוק ב-`database` וב-`read_replica`; ‏`to_regclass` לכל
אובייקט שהוחזר; קנייה אחת ב-mock וסריקה אחת של שובר (‏`DR-RUNBOOK.md` צעד ‏7).

## 8. מסמכים קשורים

‏`../RUNBOOK.md` §5.2 עד ‏5.4 ו-§7, ‏`../DB-RESTORE-RUNBOOK.md`,
‏`../DR-RUNBOOK.md`, ‏`../MIGRATION-REVIEW.md`, ‏`migrations/pending/APPLY-ORDER.md`,
‏`scripts/dr/pitr.mjs`, ‏`../QUERY-COOKBOOK.md`.
