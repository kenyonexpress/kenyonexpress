# QA localhost: ממצאים מהרצה בסביבה המרוחקת

תאריך: 2026-08-06. ההרצה: pnpm install + pnpm dev על ה-main הנוכחי, בקונטיינר שבו Supabase חסום ברשת. דווקא בגלל זה נמצאו ממצאי עמידות אמיתיים.

## מה קרה בפועל

| route | תוצאה | זמן תגובה |
|---|---|---|
| / | 500, נרנדר __next_error__ עם not-found meta | ~8s |
| /shop | 404 | מהיר |
| /cart | 500 | מהיר |
| /checkout | תלוי, אין תשובה אחרי 30s | timeout |
| /login | תלוי, אין תשובה אחרי 30s | timeout |

metadata של layout כן נרנדר תקין (title "קניון אקספרס | קופונים ומבצעים", description, canonical, og).

## ממצאים אמיתיים (bugs לתיקון)

1. **אין graceful degradation כש-Supabase לא זמין.** דף הבית מפיל את כל העמוד ל-500 במקום לרנדר shell עם empty states. לאתר production זה אומר: תקלה זמנית ב-Supabase = אתר מת, במקום אתר בלי מוצרים.
2. **/checkout ו-/login נתלים ללא גבול** כשה-DB לא עונה: אין timeout על ה-fetch בצד השרת. חייבים AbortSignal.timeout או deadline על קריאות Supabase, אחרת request יכול להיתקע דקות.
3. **/shop מחזיר 404**: לוודא שזה מכוון (אולי הנתיב הוא /category בלבד) או שחסר route.

## מה לא ניתן היה לבדוק מכאן

השוואה ויזואלית מול electro, שגיאות console מלאות ו-RTL על עמודים עם דאטה: דורשים DB חי. בנוסף הדפדפן בקונטיינר נתקע על העמודים התלויים (ממצא 2 חוסם גם את ה-QA עצמו).

## ההשלמה מהמחשב

Terminal (כשה-dev server רץ עם DB אמיתי):

```bash
node scripts/qa-local-site.mjs
```

מפיק לתיקיית ההורדות: qa-console-errors.md, qa-rtl-issues.md, וצילומי מסך לכל עמוד בשני viewports. להשוואה ויזואלית מול electro כבר קיימת התשתית ב-repo:

```bash
node scripts/compare.mjs
node scripts/compare-product-live.mjs
```
