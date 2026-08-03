# בדיקות עומס (‏goal 19)

מימוש של `docs/ARCHITECTURE-TESTING.md` סעיף 5. הכלי הוא **k6**, כפי שהמסמך
נוקב, והוא בינארי ולא חבילת npm:

```
brew install k6
```

## מה כאן

| קובץ | תרחיש | כותב? | רץ מקומית? |
|---|---|---|---|
| `browse.js` | ‏L1 גלישה בקטלוג | לא | **כן** |
| `search.js` | ‏L6 סורק חיפוש | לא | **כן** |
| `checkout.js` | ‏L2 ‏checkout במקביל | כן | לא, ‏staging |
| `webhooks.js` | ‏L3 הצפת webhooks | כן | לא, ‏staging |
| `redeem.js` | ‏L4 תור מימוש | כן | לא, ‏staging |
| `pool.js` | ‏L5 ‏connection pool | קריאה בלבד, אבל הורס | לא, ‏staging |

הספים ב-`lib/thresholds.js` הם טבלת 5.3 עצמה. ‏k6 יוצא בקוד 99 כשסף נחצה,
ולכן כל קובץ כאן הוא שער ולא דוח.

## שני השערים

**‏(א) פרודקשן חסום לגמרי.** ‏`lib/guard.js` מפיל את הריצה ב-init, לפני
שבקשה אחת יוצאת מהמכונה, אם ה-host הוא `kenyonexpress.co.il`. **אין דגל
שפותח את זה** - גם `LOAD_ALLOW_WRITES=1` לא. סעיף 5.4 אומר "לעולם לא מול
פרודקשן", והערה במסמך אינה שער.

**‏(ב) כתיבה דורשת אישור מפורש.** כל תרחיש שמשאיר שורות דורש
`LOAD_ALLOW_WRITES=1`, אותה צורה בדיוק כמו `WP_IMPORT_ALLOW_WRITES`.

שלושתם אומתו: ריצה בלי הדגל נופלת, ריצה מול הדומיין החי נופלת, וריצה מול
הדומיין החי **עם** הדגל נופלת גם היא.

## הרצה מקומית (‏L1 ו-L6)

מול build ולא מול `pnpm dev` - ‏dev לא עושה prerender ולכן מודד דבר אחר:

```
pnpm build
PORT=3411 pnpm start &
LOAD_BASE=http://localhost:3411 LOAD_VUS=50 LOAD_RAMP=20s LOAD_HOLD=40s k6 run load/browse.js
LOAD_BASE=http://localhost:3411 k6 run load/search.js
```

`LOAD_VUS`, `LOAD_RAMP`, `LOAD_HOLD`, `LOAD_DURATION` קיימים כדי לכווץ את
הפרופיל של 0→200 ב-9 דקות לגודל שנייד יכול למדוד. הפרופיל המלא מהמסמך הוא
ברירת המחדל.

**מה מדידה מקומית שווה, ומה לא.** היא לא תשובה על "האתר מחזיק 200
משתמשים": התשובה הזו תלויה ב-Vercel וב-pool של Supabase, וגם השרת וגם
מחולל העומס כאן הם אותו מעבד. מה שהיא כן תופסת זה מה שהוא תכונה של הקוד:
עמוד שיצא מהקאש ופונה ל-DB בכל בקשה, שאילתת N+1, ורייט-לימיט שנסגר על
תעבורה תמימה.

## התרחישים שדורשים staging

לא ניתנים להרצה מהמכונה הזו, ולא בגלל הכלי: **אין סביבת staging**, וה-DB
היחיד שמוגדר כאן הוא זה שמשרת את האתר. הם כתובים במלואם וממתינים לסביבה.

```
# L3 - הסוד הוא כל מה שצריך, כי Cardcom לא חותם על callbacks
LOAD_ALLOW_WRITES=1 LOAD_BASE=https://staging.example \
  LOAD_CARDCOM_WEBHOOK_SECRET=... k6 run load/webhooks.js

# L4 - עוגיית ספק וקודים אמיתיים; הסקריפט לא מנפיק שוברים בעצמו
LOAD_ALLOW_WRITES=1 LOAD_BASE=https://staging.example \
  LOAD_SUPPLIER_COOKIE='sb-...=...' LOAD_VOUCHER_CODES=AAA,BBB,CCC k6 run load/redeem.js

# L5 - 500 VU. מפיל את ה-pool של הפרויקט כולו, ולכן הדגל נדרש גם לקריאות
LOAD_ALLOW_WRITES=1 LOAD_BASE=https://staging.example k6 run load/pool.js
```

### ‏L2 ומה שאי אפשר לזייף בו

`beginCheckout` הוא **server action**, לא route handler. פונים אליו ב-POST
לכתובת העמוד עם כותרת `Next-Action` שנושאת מזהה שהוא **hash של הבנייה**, ואין
לו URL יציב. בנוסף הוא מוגבל ל-10 בדקה **פר משתמש** (`checkout.ts:242`), ולכן
"50 ‏checkout במקביל" הוא 50 חשבונות מזורעים ולא חשבון אחד 50 פעם.

הסקריפט מקבל את שניהם כקלט במקום להעמיד פנים. בלי `LOAD_CHECKOUT_ACTION_ID`
הוא עדיין מודד את מסלול ה-checkout תחת מקביליות, **ואומר בפירוש בפלט שהחצי
שכותב כסף לא נמדד** - ולא מדווח p95 ירוק על משהו שלא רץ. את המזהה מוציאים
מהבנייה:

```
grep -ro '[0-9a-f]\{40\}' .next/server/app/checkout/page.js | head
```

## שלוש השורות שאינן ביצועים

סעיף 5.3 קובע ששלוש שורות הן **נכונות ולא ביצועים**, וריצה שמסתיימת בחיוב
כפול אחד היא כישלון גם כשכל ה-p95 ירוקים: ‏0 שגיאות חיבור, ‏0 חיוב כפול,
‏0 מימוש כפול.

- **שגיאות חיבור** נספרות ב-`pool.js` לפי גוף התשובה, במטרייה נפרדת מ-5xx רגיל.
- **מימוש כפול** נאכף **בתוך k6**: כל ה-VUs מתחרים על אותם קודים, `redeem_voucher`
  אטומי, ולכן סך ההצלחות חייב להיות בדיוק מספר הקודים. אחת יותר = נעילת השורה
  נשברה, והריצה נעצרת מיד.
- **חיוב כפול** אינו נגזר מהתשובות אלא מהשורות, ולכן הוא שאילתה אחרי הריצה:

```sql
-- אפס שורות = אין חיוב כפול. כל שורה היא כישלון של הריצה.
select order_id, count(*)
from payment_events
where provider = 'cardcom' and status = 'captured'
group by order_id having count(*) > 1;

-- אפס שורות = dedup עבד: אירוע חיצוני אחד נרשם פעם אחת
select external_event_id, count(*)
from payment_webhook_events
where provider = 'cardcom'
group by external_event_id having count(*) > 1;
```

## מתי מריצים

טבלת 5.4, ובמכוון **לא ב-CI**: יקר, איטי ורועש על runner משותף.

| מתי | תרחישים |
|---|---|
| לפני שיגור, פעם | ‏L1-L6 |
| לפני מבצע גדול | ‏L1, ‏L2 |
| אחרי שינוי במסלול הכסף | ‏L2, ‏L3, ‏L4 |
| רבעוני | ‏L1, ‏L5 |
