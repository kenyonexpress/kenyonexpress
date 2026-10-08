# ‏Runbook: חיפוש (‏Meilisearch)

| שדה | ערך |
| --- | --- |
| רכיב | ‏`/api/search`, ‏facets, ‏suggest, ‏outbox של האינדקס, ‏reindex |
| ספק | ‏Meilisearch (‏`MEILISEARCH_HOST` / ‏`MEILISEARCH_API_KEY`), אופציונלי |
| כרטיס ב-/admin/health | `search` |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV3. חיפוש ריק הוא חנות מדורדרת; חיפוש ‏500 הוא ‏SEV2 |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

## 1. רדיוס פגיעה

תיבת החיפוש וההצעות בלבד. ‏`/api/search` נופל חזרה ל-`ILIKE` ב-Postgres על
‏`name_he` ו-`description_he` כש-Meilisearch לא מוגדר או לא עונה: תוצאות בלי
‏facets ובלי סובלנות לשגיאות כתיב, אבל תוצאות. קטלוג, קטגוריות, מוצר ועגלה
לא תלויים בו.

## 2. זיהוי

- ‏`/admin/health`: ‏`search` ‏`down` (מוגדר ולא עונה) או ‏`not_configured`.
- ‏`RUNBOOK.md` §4.4: תוצאות בלי ‏facets ובלי ‏typo tolerance, המנוע הראשי לא
  עונה.
- ‏cron ‏`search-outbox` (כל ‏10 דקות) נכשל, או ‏`search_outbox` מצטבר.
- ‏`/api/search/index-dlq` מתמלא.

## 3. טריאז'

1. **איזה מנוע עונה?** ‏`RUNBOOK.md` §6 "Diagnosis": קריאה אחת ל-`/api/search?q=`
   ובדיקה אם יש ‏`facets` בתשובה.
2. **מוגדר ולא עונה?** ‏`curl -sS -o /dev/null -w '%{http_code}' $MEILISEARCH_HOST/health`
   מהמכונה. ‏5xx או ‏timeout: הספק. ‏401: המפתח (‏`secrets.md`).
3. **עונה אבל ישן או ריק?** ה-outbox לא נוקז: ‏`scheduler-cron.md` §3,
   ‏401 שם פירושו ‏`CRON_SECRET` לא תואם וכל ה-cron, לא רק החיפוש.
4. **‏500 בדף?** זה לא "חיפוש למטה", זה באג בנתיב; ‏`web-vercel.md` §4.

## 4. צעדי Rollback

1. **מתג כיבוי**: ‏`KILL_SWITCH_SEARCH=1` ב-Vercel ו-redeploy. המסלול מחזיר
   תוצאה ריקה במקום ‏500.
2. **חזרה ל-Postgres**: להסיר ‏`MEILISEARCH_HOST` ו-`MEILISEARCH_API_KEY`
   מ-Production ו-redeploy. המסלול חוזר ל-`ILIKE` לבד. זה ה-rollback המלא
   ואין בו אובדן נתונים: האינדקס הוא נגזרת של ‏DB.
3. **אינדקס מושחת או ישן**: ‏reindex מלא דרך ה-cron, עם ה-bearer של
   ‏`CRON_SECRET`:

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://kenyonexpress.co.il/api/cron/search-reindex
```

   ואז ‏`search-outbox` כדי לנקז את מה שהצטבר. שניהם אידמפוטנטיים.
4. **מפתח דלף**: ‏`SECRETS-ROTATION.md` אין בו סעיף ‏Meilisearch; המפתח מסובב
   אצל הספק ומוחלף ב-Vercel, ‏redeploy, ואז צעד ‏3.

## 5. מה לא ניתן להחזיר

כלום בצד שלנו. ‏Meilisearch מחזיק נגזרת בלבד; ‏`search_outbox` שומר כל שינוי
עד הניקוז. מחיקת האינדקס אצל הספק עולה ‏reindex אחד.

## 6. מתי להסלים

- שינוי ‏env בפרודקשן (צעדים ‏1 ו-2): חשבון של אופיר.
- רוטציית מפתח: אופיר.
- ‏500 בחיפוש אחרי ‏deploy, שלא נפתר ב-rollback של האפליקציה: ‏SEV2.

## 7. אימות אחרי

```bash
curl -sS 'https://kenyonexpress.co.il/api/search?q=קפה' | head -c 400; echo
```

‏`facets` בתשובה פירושו ‏Meilisearch; בלעדיו ‏Postgres. ‏`/admin/health`
‏`search` ‏`ok` או ‏`not_configured` במודע (זו החלטה, לא תקלה).

## 8. מסמכים קשורים

‏`../INCIDENT-PLAYBOOKS.md` ‏Playbook 4, ‏`../RUNBOOK.md` §4.4 ו-§6,
‏`../ARCHITECTURE-SEARCH.md`, ‏`../ARCHITECTURE-CATALOG-SEARCH-SEO.md`,
‏`src/__tests__/search.pipeline-contracts.test.ts`.
