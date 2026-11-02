# `migrations/quarantine/`

קבצי ‏SQL שהופיעו ב-`migrations/pending/` ולא עומדים בכללי התיקייה.
**לא נמחקו, ולא ניתנים להחלה כפי שהם.** כל קובץ כאן ממתין להכרעה.

## `supplier_onboarding_001.sql` — הועבר 08.09.2026

נמצא לא-מחויב ב-`migrations/pending/` בתחילת סשן. הפיל שלושה שערים
(‏`pending-migrations-inventory`), ומפר ארבעה כללים:

1. **שם בלי מספר ובלי preflight.** המוסכמה היא `NNN_name.sql` plus
   `preflight_NNN.sql` לצידו. בלי מספר אין סדר החלה ואין מקום ב-APPLY-ORDER.
2. **‏`amount NUMERIC(12,2)` ב-`payout_requests`.** הכלל הקבוע הוא
   **אגורות שלמות בלבד** דרך `money.ts`. עמודת עשרוני במסלול תשלומי ספקים
   היא בדיוק סוג העמודה שכבר נסרקה ותוקנה כאן פעם אחת.
3. **‏`payout_requests` מקבלת `ENABLE ROW LEVEL SECURITY` ואפס מדיניויות.**
   זה deny-all מקרי: הטבלה נעולה לחלוטין גם לספק שאמור לראות את הבקשות
   שלו. פריט 2 בתור ביקורת ה-Supabase בודק בדיוק את המצב הזה, והוא היה
   אפס עד עכשיו.
4. **‏`bank_iban TEXT` בטקסט גלוי.** מספר חשבון בנק של ספק אינו שדה טקסט
   רגיל, ואין כאן החלטה כתובה על הצפנה או על vault.

**מה שצריך לקרות:** אם הרשמת ספקים נכנסת לתור (‏`W7`), המיגרציה נכתבת
מחדש עם מספר, preflight, אגורות שלמות, מדיניות מפורשת לכל טבלה, והכרעה על
אחסון ה-IBAN. הקובץ הזה הוא הטיוטה, לא המקור.

## `130_pg_cron_pg_net.sql`, `cron_jobs.sql` — moved 02.11.2026 (C142)

Written by C38 into `supabase/migrations/` and `supabase/schedules/`, outside
`migrations/pending/` and without a preflight. 130 clashes with the applied
`130_payment_events.sql`. pg_cron and pg_net are live from applied 161/162, so
these drafts are not to be applied as they are.
