# תוכנית פריטי UI (מתחת ל-11%)

השער: ‏`scripts/compare.mjs` מול האתר החי, סף 11% בכל אחד מ-380 / 768 /
1440. כל ריצה רושמת שורה ב-
`docs/UI-PARITY-REPORT.md`
.

## קו בסיס אחרון (‏home)

| רוחב | diff | סטטוס | מקור |
|---:|---:|---|---|
| 380 | 10.68% | PASS | 07.09, ‏`dd60ac508` |
| 768 | 7.72% | PASS | 07.09 |
| 1440 | 8.12% | PASS | 07.09 |

‏380 הוא הקרוב לתקרה. כל שינוי בכותרת, הירו או גריד הדילים חייב מדידה ב-380
לפני commit שנוגע בחזית.

## מסלולים שהסקריפט תומך בהם

| ‏`--page` | ייחוס חי (ברירת מחדל) | מקומי |
|---|---|---|
| home | ‏kenyonexpress.co.il/ | `/` |
| product | מוצר לדוגמה בחי | `/product/<slug>` |
| category | ‏product-category/hot-deals | `/category/<slug>` |
| products | ‏/shop/ | `/products` |
| search | ‏`?s=` של וורדפרס | חיפוש מקומי (אם קיים) |
| cart | ‏/cart/ | `/cart` |
| checkout | ‏/checkout/ | `/checkout` |

הערות בסקריפט: ‏account ו-coupon מוזכרים ככיוון, ודורשים ‏STORAGE_STATE /
התאמת מוצר.

## מצב לפי מסלול

| מסלול | מצב | תוכנית להישאר / לרדת מתחת ל-11% |
|---|---|---|
| home | ירוק, 380 צמוד | לא לגעת בגאומטריית הירו בלי מדידה; placeholders אפורים יציבים |
| product | היה גבוה בעבר על פער קטלוג | להצמיד slug ייחוס; לא לערבב תמונות ספק זרות |
| category / products | נמדדים | canonical + פרידת כרטיס; בלי שינוי גובה כרטיס אחרי paint |
| cart | רגיש לכפילות מיני-עגלה ב-DOM | locator לפי נראות; CSS display:none לשני העותקים |
| checkout | היה מעל השער, ירד | לא להחזיר outline:none בלי טבעת פוקוס נראית |
| search | UI חיפוש אסור (‏ADR 0010) | לא לפתוח מסלול עד החלטת מוצר מפורשת |

## פקודת מדידה

```
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home --width=380
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home --width=768
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home --width=1440
```

ב-CI: ‏job ‏`pixel-gate` מחווט; בלי סודות ‏Supabase הוא מדלג במכוון. ראה בלוק 13
ב-‏STATE.md.

## חסמים למדידה מקומית

1. ‏`SUPABASE_SECRET_KEY` קצר מפיל את ה-boot אחרי build. לריצת צילומים בלבד:
   ערך דמה באורך תקין (קריאות service-role ייכשלו באימות, הצילום הציבורי חי).
2. האתר החי עדיין וורדפרס (חסם 0). השער משווה מול מה שאופיר רואה בדומיין,
   לא מול בילד Next שטרם נפרס.

## אחרי כל שינוי חזותי

1. מדידה בשלושת הרוחבים על המסלולים שנגעו.
2. וידוא שנרשמה שורה ב-‏UI-PARITY-REPORT (הסקריפט כותב לבד; ‏`-dirty` אם העץ מלוכלך).
3. אם 380 חוצה 11%: לא לדחוף; לצמצם או לגלגל.
