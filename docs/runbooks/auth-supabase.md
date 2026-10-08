# ‏Runbook: הזדהות (‏Supabase Auth)

| שדה | ערך |
| --- | --- |
| רכיב | התחברות במייל וסיסמה, ‏OTP בטלפון, ‏passkeys, ‏MFA, ‏cookie של ‏session, מגביל קצב |
| ספק | ‏Supabase Auth; ‏Upstash Redis למגביל (נופל **פתוח**) |
| כרטיס ב-/admin/health | `rate_limiter` (ההזדהות עצמה אין לה כרטיס; כרטיס בסיס הנתונים מכסה אותה) |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV2: אף אחד לא נכנס. ‏SEV1: מישהו נכנס לחשבון לא שלו |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

## 1. רדיוס פגיעה

אזור אישי, ארנק, שוברים של הלקוח, אדמין, פורטל ספק וסריקת שוברים. **הקטלוג
והעגלה אנונימיים** ולא נפגעים; ‏checkout כאורח תלוי במימוש. פדיון בבית
העסק דורש ספק מחובר, ולכן תקלת הזדהות היא תקלת פדיון.

## 2. זיהוי

- פניות "לא מצליח להיכנס", "הקוד לא מגיע" (‏`messaging-twilio.md`), "הלינק
  לאיפוס לא עובד".
- ‏429 על ‏`/login`: המגביל (‏10 לשעה לכל ‏IP; ‏E2E מאותו ‏IP נראה כמו תקלה).
- ‏Sentry: ‏`AuthApiError`, ‏`invalid_grant`, ‏`PGRST301` (‏JWT פג).
- ‏Supabase Dashboard > Auth > Logs.
- ‏`/admin/health` ‏`rate_limiter` ‏`down`: המגביל נופל פתוח, ההתחברות ממשיכה
  **בלי** הגנה מניסיונות.

## 3. טריאז'

1. **כולם?** ‏Supabase Auth בתקלה, או ‏Site URL / ‏Redirect URLs שונו
   (‏Dashboard > Authentication > URL Configuration חייב להצביע על הדומיין;
   אחרי שחזור ‏DR זה הדבר הראשון שנשכח).
2. **רק אחרי ‏deploy?** ‏cookie של ‏session או ‏route guard: ‏`web-vercel.md` §4.
3. **רק ‏passkeys?** ה-nudge מכסה דפי ‏`/account` ובולע לחיצות ב-headless;
   בדפדפן אמיתי זה לא קורה. ‏`PASSKEY_CHALLENGE_TTL_MS` קצר מדי מייצר
   "פג תוקף" מיידי.
4. **רק ‏OTP בטלפון?** ‏`messaging-twilio.md` §3.
5. **מישהו רואה נתונים של אחר?** לא הזדהות, ‏RLS: ‏`database-supabase.md` §6, מיידי.

## 4. צעדי Rollback

1. **קוד**: ‏rollback של האפליקציה (‏`web-vercel.md` §4). שינויי הזדהות הם
   כמעט תמיד בקוד שלנו ולא אצל הספק.
2. **‏URL Configuration**: ‏Site URL ‏`https://kenyonexpress.co.il`, ‏Redirect
   URLs כוללים את הדומיין, ‏`www`, ו-`kenyonexpress.vercel.app`. שינוי ב-Dashboard,
   מיידי, הפיך.
3. **‏Leaked Password Protection**: מתג ידני ב-Dashboard, לא משוחזר ב-DR.
4. **מפתח ‏anon** דלף או סובב: ‏`RUNBOOK.md` §"Rotating the Supabase anon
   (publishable) key"; ‏`NEXT_PUBLIC_*` נאפה ב-build, לכן ‏redeploy.
5. **‏session של משתמש מסוים**: ‏Dashboard > Auth > Users > Sign out user.
   לא הפיך; המשתמש נכנס מחדש.
6. **מגביל כבוי לזמן אבחון**: אין מתג; הסרת ‏`UPSTASH_REDIS_REST_URL` גורמת
   לנפילה פתוחה. **לא** לעשות זאת בתקרית אבטחה.

## 5. מה לא ניתן להחזיר

- ‏session שבוטל.
- ‏OTP או לינק איפוס שפגו.
- ‏passkey שהמשתמש מחק מהמכשיר.
- רוטציית ‏service key: כל מופע ישן נופל ברגע הביטול (‏`secrets.md`).

## 6. מתי להסלים

- כל שינוי ב-Dashboard של ‏Supabase Auth או רוטציית מפתח: חשבון של אופיר.
- חשד לכניסה לחשבון זר, או ‏RLS פתוח: ‏SEV1 מיידי.
- ‏Supabase Auth בתקלה אזורית מעל ‏30 דקות: אופיר מחליט על הודעה ללקוחות.

## 7. אימות אחרי

כניסה אחת לכל תפקיד (לקוח, ספק, אדמין) מדפדפן אמיתי, לא מאותו ‏IP של ‏E2E;
‏`/account` נטען; סריקת שובר אחת בפורטל הספק; ‏`/admin/health` ‏`rate_limiter`
‏`ok`.

## 8. מסמכים קשורים

‏`../ARCHITECTURE-ACCOUNT-IDENTITY.md`, ‏`../ARCHITECTURE-FRAUD-RATE-LIMITS.md`,
‏`../RATE-LIMITS.md`, ‏`src/lib/auth/`, ‏`../DR-RUNBOOK.md` צעד ‏4.
