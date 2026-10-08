# ‏Runbook: אחסון קבצים (‏Cloudflare R2 ו-Supabase Storage)

| שדה | ערך |
| --- | --- |
| רכיב | תמונות מוצר, לוגו ספקים, העלאות מהאדמין, ‏proxy ‏`/images/r2` |
| ספק | ‏Cloudflare R2 (‏`R2_ACCOUNT_ID`, ‏`R2_ACCESS_KEY_ID`, ‏`R2_SECRET_ACCESS_KEY`, ‏`R2_BUCKET`, ‏`R2_PUBLIC_BASE_URL`); ברירת מחדל בפועל ‏Supabase Storage |
| כרטיס ב-/admin/health | `storage` (קונפיגורציה בלבד; אין ‏credential באף סביבה) |
| כונן | אופיר |
| חומרה ברירת מחדל | ‏SEV2: קטלוג בלי תמונות מוכר פחות, לא נשבר |
| סולם הסלמה | ‏`README.md` §סולם ההסלמה |

**מצב נמדד (‏08.10):** ‏R2 אינו מופעל בחשבון ‏Cloudflare, אין ‏credential בשום
סביבה, ‏634 אובייקטים ממתינים לקידום. כל התמונות החיות מוגשות מ-Supabase
Storage. ‏`NEXT_PUBLIC_R2_IMAGES` כבוי, ולכן ‏`/images/r2` אינו בנתיב של אף
תמונה היום.

## 1. רדיוס פגיעה

תמונות בלבד. ‏`isR2Configured()` שקר פירושו העלאות ל-Supabase Storage;
‏`NEXT_PUBLIC_R2_IMAGES` כבוי פירושו הגשה מ-Supabase. אין נתיב שבו תמונה
חסרה חוסמת רכישה; ‏`next/image` עם ‏loader מותאם מחזיר ‏404 לתמונה ולא לדף.

## 2. זיהוי

- ‏`/admin/health`: ‏`storage` ‏`not_configured` הוא **המצב הנוכחי**, לא תקרית.
  ‏`down` יופיע רק אחרי שיוגדר ‏credential.
- תמונות שבורות בבית ובדף מוצר: ‏`naturalWidth 0` ב-DevTools, ‏LCP נופל לטקסט.
- ‏Supabase Dashboard > Storage: ‏bucket ציבורי שאיבד ‏policy, או מכסה.

## 3. טריאז'

1. **תמונה אחת שבורה?** הנתיב ב-`products.image_url`; ‏`curl -I` עליו. ‏404
   מ-Supabase פירושו אובייקט שנמחק או ‏bucket לא ציבורי.
2. **כל התמונות?** ‏Supabase Storage למטה או ‏policy שהוסרה
   (‏`database-supabase.md` §3), או ‏`NEXT_PUBLIC_R2_IMAGES` הופעל בלי ‏R2.
3. **רק אחרי ‏deploy?** ה-loader או ‏`.vercelignore`: ‏`web-vercel.md` §4.

## 4. צעדי Rollback

1. **‏R2 הופעל ונשבר**: להסיר ‏`NEXT_PUBLIC_R2_IMAGES` מ-Production ו-redeploy.
   זהו משתנה ‏`NEXT_PUBLIC_*`, נאפה ב-build, ולכן **חובה ‏redeploy**. ההגשה
   חוזרת ל-Supabase Storage, שעדיין מחזיק את כל האובייקטים (הקידום הוא
   העתקה, לא העברה).
2. **העלאות נכשלות ל-R2**: להסיר ‏`R2_*` ו-redeploy; ‏`isR2Configured()` שקר
   מחזיר את ההעלאות ל-Supabase.
3. **‏policy של ‏bucket נמחקה**: שחזור דרך ‏Dashboard > Storage > Policies
   (קריאה ציבורית ל-`product-images`); זו מיגרציה בפועל, לכן אישור.
4. **אובייקט נמחק ב-R2**: אין ‏versioning ב-R2 בכלל. המקור ב-Supabase
   Storage; קידום מחדש בפקודה אחת (‏`scripts/r2-promote/`) ברגע שיש מפתח.

## 5. מה לא ניתן להחזיר

- אובייקט שנמחק מ-Supabase Storage בלי עותק ב-R2 (היום: כולם כאלה).
- מכסה שנחרגה: שדרוג חשבון, לא פעולה טכנית.

## 6. מתי להסלים

- הפעלת ‏R2 בחשבון ‏Cloudflare (חיוב), יצירת מפתח, ‏`NEXT_PUBLIC_R2_IMAGES`: אופיר.
- כל מחיקה של אובייקטים או ‏bucket: אחד מארבעת המצבים.
- מכסת ‏Storage ב-Supabase: אופיר.

## 7. אימות אחרי

דף הבית ודף מוצר אחד בדפדפן, ‏`naturalWidth > 0` לתמונת ה-LCP;
‏`curl -I` על ‏URL של תמונה אחת מחזיר ‏200 עם ‏`content-type: image/*`.

## 8. מסמכים קשורים

‏`../ARCHITECTURE-MEDIA-R2.md`, ‏`scripts/r2-promote/`, ‏`src/lib/storage/r2.ts`,
‏`../RUNBOOK.md` §"Dependency failures".
