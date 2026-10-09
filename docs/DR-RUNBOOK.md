# ‏DR — התאוששות מאסון

‏נכתב ‏02.09.2026. תרחיש הייחוס: פרויקט ה-Supabase המאוחסן אבד או הושחת.

## מה יש לנו ביד, היום

| נכס | איפה | טריות |
| --- | --- | --- |
| גיבויי Supabase יומיים | ‏Dashboard → Database → Backups (‏Pro plan; ‏PITR אם הופעל) | ‏24 שעות (‏RPO) |
| ‏tar מלא של הריפו כולל ‏.git | ‏`~/Desktop/kenyonexpress-backup-*.tar.gz`, שלושת האחרונים | יומי (ידני-אוטונומי; רץ גם היום 02.09) |
| הריפו המרוחק | ‏GitHub ‏kenyonexpress/kenyonexpress | כל push |
| סכימה כקוד | ‏`supabase/migrations/` (עד 121 החלים) + ‏`migrations/pending/` (147–157) + ‏`src/types/database.ts` שנוצר מפרודקשן | כל קומיט |

**מגבלה מתועדת:** שרשרת קבצי המיגרציה איננה ‏lineage של פרודקשן
(‏hosted-db-is-pre-059; ‏from-zero reset לא ריץ). שחזור סכימה נקי הוא
**מהגיבוי של Supabase**, לא מהרצת הקבצים מאפס.

## ‏RTO יעד: מתחת לשעתיים. ‏RPO: עד 24 שעות (גיבוי יומי)

## שחזור, צעד אחר צעד

1. **פרויקט חדש** — ‏Supabase Dashboard → New project (אותו region,
   ‏eu-central). ‏~5 דק'.
2. **שחזור הגיבוי** — ‏Dashboard → Backups → Restore לפרויקט החדש (או
   ‏PITR לנקודת זמן). ‏~20–40 דק' לפי גודל.
3. **מפתחות** — קח מהפרויקט החדש URL + anon + secret. עדכן ב-Vercel:
   ‏`NEXT_PUBLIC_SUPABASE_URL`, ‏`NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   ‏`SUPABASE_SECRET_KEY`. ‏**redeploy** (המשתנים הציבוריים נאפים ב-build).
4. **Auth** — ‏Site URL + Redirect URLs בפרויקט החדש (‏Authentication →
   URL Configuration) חייבים להצביע על הדומיין; בלי זה אף התחברות לא חוזרת.
   הפעל מחדש גם ‏Leaked Password Protection (מתג ידני, לא משוחזר).
5. **Storage** — אם התמונות ב-R2 (‏`R2_*` מוגדר) אין מה לשחזר; אם ב-Supabase
   Storage — ה-bucket משוחזר עם הגיבוי, לוודא public/policies.
6. **סודות שאינם בגיבוי** — ‏`CARDCOM_*`, ‏`VOUCHER_QR_SECRET(!)`,
   ‏`CRON_SECRET`, ‏Resend — כולם חיים ב-Vercel ולא נפגעו; אין לסובב אותם
   כחלק מהשחזור (סיבוב QR מבטל שוברים חתומים — ‏SECRETS-ROTATION.md).
7. **בדיקת חיים** — ‏`/api/health` ירוק; קנייה אחת ב-mock; סריקה אחת.
8. **crons** — ‏GitHub Actions ממשיך לבד (המתזמן מצביע על הדומיין, לא על
   פרויקט Supabase). לוודא ריצת ‏health ירוקה אחת.
9. **DNS** — לא משתנה: הדומיין מצביע על Vercel, ‏Vercel מצביע על Supabase
   דרך משתני סביבה. ‏failover של DNS נדרש רק אם ‏Vercel הוא שנפל, וזה
   תרחיש אחר (סטטי-חירום מ-Cloudflare; מחוץ לתחולת המסמך).

## למה אין `scripts/backup-verify.mjs`

‏Management API של Supabase דורש ‏Personal Access Token שאינו קיים באף
סביבה כאן (ה-CLI לא מקושר — ‏memory ‏vercel-not-linked דומה), והוספת סוד
רחב-הרשאות רק כדי לשאול "יש גיבוי מהיום?" מגדילה את שטח התקיפה יותר משהיא
מקטינה סיכון. הבקרה הקיימת: ‏nightly-health (‏Actions, יומי) מוודא שהאתר
וה-DB עונים, וגיבוי ה-tar המקומי ממילא נבדק ידנית (‏ls, לא ‏exit code —
‏memory ‏desktop-backup-per-session). בדיקת הגיבויים בדשבורד היא פריט
שבועי של אופיר ב-OWNER-CHECKLIST.
