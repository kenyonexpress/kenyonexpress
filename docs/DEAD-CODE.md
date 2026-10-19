# מלאי קוד מת — ממתין לאישור מחיקה

‏נמדד ‏02.09.2026 (‏STEP 83). **מחיקת קבצים היא עצירה קשה לפי כללי
הפרויקט**, ולכן זה מלאי לאישור אופיר, לא מחיקה שבוצעה.

## מת מוכח, בטוח למחיקה

| מה | ראיה |
| --- | --- |
| `drizzle-orm` + `drizzle-kit` (‏package.json) | אפס imports בכל ‏src/apps/scripts/e2e מלבד ‏src/db עצמו |
| `src/db/schema/commerce.ts` + `commerce-managed.ts` | לא מיובאים מאף מקום (האזכור היחיד — הערה בטסט); תפקיד "הסכימה כקוד" שייך ל-`src/types/database.ts` (שנוצר מפרודקשן) ול-`supabase/migrations/` |
| `drizzle.config.ts` | משרת רק את השניים למעלה |

צעד המחיקה, כשמאושר:

```bash
git rm -r src/db drizzle.config.ts
pnpm remove drizzle-orm drizzle-kit
pnpm type-check && pnpm test && pnpm build
```

## נמצא ‏07.09 (סגירת בלוק 6): פעולת שרת שנייה להעלאה, בלי אף קורא

| מה | ראיה |
| --- | --- |
| ‏`src/server/actions/admin/upload.ts` (‏`requestUploadUrl`) | ‏grep על כל `src/` מוצא רק את ההגדרה עצמה ואת אזכור בהערה ב-`lib/storage/r2.ts`. אף רכיב לא קורא לה. |

**מה כן חי, וזה מה שהופך אותה למיותרת:** ‏`ImageUploader` מעלה דרך
‏`processAndUploadImage` (‏`src/server/actions/admin/images.ts`), שמעבד את
הקובץ בשרת ל-webp/avif, ואז עושה בעצמו ‏PUT ל-URL חתום דרך
‏`createR2PresignedPutUrl`. כלומר מסלול ה-R2 עובד; מה שאין לו קורא הוא
**הווריאנט השני**, זה שמחזיר URL חתום ללקוח כדי שהדפדפן יעלה ישירות.

**למה זה לא סתם קובץ מיותר:** כל ‏`'use server'` מיוצא הוא גם נקודת קצה.
היא מוגנת ב-`requireStaffSession`, ולכן זו לא חשיפה, אבל היא משטח שאיש לא
בודק כי איש לא משתמש בו.

**לא נמחק**, כמו כל השאר בקובץ הזה: מחיקת קבצים היא עצירה קשה לפי כללי
הפרויקט. אם וכאשר יוחלט, זה `git rm src/server/actions/admin/upload.ts`
ובדיקה ש-`pnpm type-check` נשאר ירוק.

## נבדק ונמצא חי (לא למחוק)

- ‏`node-forge` — חתימת pkpass (‏wallet), עם טסט.
- ‏`qrcode` — ‏QR לשוברים (‏qr-image.ts).
- ‏`recharts` — דשבורד האנליטיקות.

## הערת הקשר

הספק של STEP 26 ביקש "‏SQL aggregates עם drizzle" — אבל ה-ORM מעולם לא
חובר; שכבת הנתונים כולה ‏supabase-js. התלות נכנסה בשלב מוקדם ונשארה.
