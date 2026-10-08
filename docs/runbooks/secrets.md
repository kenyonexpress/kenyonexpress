# ‏Runbook: סודות ומפתחות שדלפו

| שדה | ערך |
| --- | --- |
| רכיב | כל ‏credential ב-Vercel, ב-GitHub ובמסופי הספקים; ‏`.env.local`; ‏`claude_STATE.md` המעוקב |
| ספק | ‏Vercel (אחסון), ‏GitHub push protection (הגילוי היחיד שעובד) |
| כרטיס ב-/admin/health | אין (מפתח דולף אינו "למטה"; הוא עובד מצוין, וזו הבעיה) |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV1 ל-service key ול-Cardcom; ‏SEV2 לשאר |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

**מה שכבר ידוע:** ‏`SUPABASE_SECRET_KEY` שבשימוש נחשף בהתקנה ועוקף כל ‏RLS. הוא
מסומן לפי ‏SHA-256 ב-`scripts/compromised-keys.mjs`, ו-`scripts/deploy-preflight.mjs`
מסרב לבנות איתו. הרוטציה ממתינה לאופיר. סשנים מקבילים כבר דחפו סוד ל-`claude_STATE.md`
המעוקב; ‏push protection תפס, ו-URL ה-unblock שלו **מפרסם** את הסוד.

## 1. רדיוס פגיעה

| מפתח | מי שמחזיק אותו יכול | רוטציה שוברת |
| --- | --- | --- |
| ‏`SUPABASE_SECRET_KEY` | לקרוא ולכתוב כל טבלה, לעקוף ‏RLS, למחוק | כל מופע ישן ברגע הביטול; ‏redeploy חובה |
| ‏`CARDCOM_API_PASSWORD` | לחייב ולהחזיר במסוף שלנו | כלום, אם מחליפים ב-Vercel לפני ביטול |
| ‏`CARDCOM_WEBHOOK_SECRET` | לזייף ‏callback "שולם" | ‏callbacks עד שהמסוף מעודכן גם הוא |
| ‏`VOUCHER_QR_SECRET` | לזייף שובר לסריקה | **כל השוברים החתומים הקיימים** |
| ‏`CRON_SECRET` | להריץ כל ‏cron | המתזמן עד שהסוד מעודכן ב-GitHub |
| ‏`RESEND_API_KEY`, ‏`TWILIO_AUTH_TOKEN` | לשלוח בשמנו | כלום |
| ‏`NEXT_PUBLIC_SUPABASE_ANON_KEY` | מה שכל דפדפן יכול ממילא; ‏RLS הוא הגבול | ‏build (נאפה) |

## 2. זיהוי

- ‏GitHub push protection חוסם ‏push עם הודעה; ‏`commit-monitor.yml`.
- ‏`pnpm deploy:preflight` או ה-build ב-Vercel נכשלים על "compromised key".
- טוקן שהודבק בצ'אט, בלוג של ‏Actions, ב-`logs/`, ב-STATE.md.
- ‏Supabase > Logs: שאילתות ‏service role משעות או מכתובות לא מוכרות.
- ‏Cardcom: עסקאות שלא יזמנו.

## 3. טריאז'

1. **איזה מפתח?** הטבלה ב-§1 קובעת את ה-SEV ואת הסדר.
2. **כבר בשימוש זדוני?** ‏Supabase Logs, ‏Cardcom Dashboard, ‏Resend Logs
   לפי חלון הזמן. אם כן: ‏SEV1 גם למפתח "קטן".
3. **איפה הוא הודלף?** ‏commit (‏`git log -S'<prefix>' --all`), לוג, צ'אט.
   ‏`git filter-repo` לא מבטל דליפה; הרוטציה מבטלת. לא לבזבז זמן על ההיסטוריה
   לפני הרוטציה.
4. **‏`.env.local`?** הוא נוצר ע"י ‏Vercel CLI (‏12 ערכים) ועשוי להחזיק ערך ישן
   במירכאות; שגיאת "Invalid API key" מקומית אינה הוכחה לדליפה.

## 4. צעדי Rollback

הרוטציה **היא** ה-rollback. הסדר תמיד: ערך חדש אצל הספק, ל-Vercel, ‏redeploy,
ואז ביטול הישן. ביטול לפני ‏redeploy מפיל את הפרודקשן.

1. **‏service key**: ‏`SECRETS-ROTATION.md` §Supabase. ‏Dashboard > API > Generate
   new secret key, ‏`vercel env add SUPABASE_SECRET_KEY production`, ‏redeploy,
   לוודא ‏`/api/health` ‏ok, ביטול הישן, ולהוסיף את ה-SHA-256 שלו ל-`scripts/compromised-keys.mjs`
   כדי שאף ‏build לא יחזור אליו.
2. **‏Cardcom**: ‏§Cardcom שם. סיסמת ‏API חדשה במסוף, ל-Vercel, ‏redeploy.
   סוד ‏webhook: במסוף **ובו-זמנית** ב-Vercel, אחרת ‏callbacks נכשלים בשקט
   (‏`RUNBOOK-OPS.md` §5.3).
3. **‏`VOUCHER_QR_SECRET`**: ‏§QR שם. **לא לסובב בלי החלטה של אופיר**: כל שובר
   שכבר הונפק נכשל בסריקה אחרי הרוטציה, והפתרון הוא הנפקה מחדש ללקוחות.
4. **‏`CRON_SECRET`**: ‏`scheduler-cron.md` §4 צעד ‏4, שני המקומות באותו רגע.
5. **‏Resend / ‏Twilio / ‏Sentry / ‏Upstash**: הסעיף המתאים ב-`SECRETS-ROTATION.md`;
   אין תלות בסדר מעבר ל"חדש לפני ביטול".
6. **הסוד ב-git**: אחרי הרוטציה, ‏commit שמסיר אותו מהקובץ. **לעולם לא** ללחוץ
   על ‏URL ה-unblock של ‏push protection.

## 5. מה לא ניתן להחזיר

- דליפה. מפתח שנראה פעם הוא מפתח שרוף; אין "לבדוק אם מישהו ראה".
- שוברים חתומים אחרי רוטציית ‏QR.
- מה שנעשה עם המפתח לפני הביטול (שורות שנמחקו: ‏`database-supabase.md` §4 צעד ‏4).

## 6. מתי להסלים

- **כל רוטציה** דורשת חשבון של אופיר (‏Supabase, ‏Cardcom, ‏Vercel, ‏GitHub).
  הכונן מכין את ההודעה עם: איזה מפתח, איפה דלף, האם יש שימוש זדוני, הסדר
  המדויק מ-§4, ומה יישבר.
- ‏service key או ‏Cardcom: ‏SEV1, מיידי, גם בלילה.
- ‏VOUCHER_QR_SECRET: החלטה עסקית (הנפקה מחדש), לא טכנית.

## 7. אימות אחרי

‏`node scripts/deploy-preflight.mjs` ירוק; ‏`/api/health` ‏ok; קנייה ב-mock
וסריקה אחת; ‏`gh run list --workflow=cron.yml --limit 3` ירוק; המפתח הישן
מחזיר ‏401 בקריאה ישירה ל-Supabase REST.

## 8. מסמכים קשורים

‏`../SECRETS-ROTATION.md`, ‏`../INCIDENT-PLAYBOOKS.md` ‏Playbook 6,
‏`../SECURITY-POSTURE.md`, ‏`../ARCHITECTURE-ENV-SECRETS.md`,
‏`scripts/compromised-keys.mjs`, ‏`scripts/deploy-preflight.mjs`.
