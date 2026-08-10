# דוח שלוש המשימות, 2026-08-07

## 1. Ruleset בשם protect-main

**ממצא ודאי: לא קיים.** נבדק ישירות מול GitHub API (קריאה עובדת מהסביבה):

```
GET /repos/kenyonexpress/kenyonexpress/rulesets  ->  []
```

התשובה שמורה כראיה ב:
docs/research/github-rulesets-evidence-2026-08-07.json

באותו קובץ גם התשובה על branch protection הקלאסי:
`403 Resource not accessible by integration`, כלומר גם דרך ה-API הישן אי אפשר לאמת מכאן. מה שכן ודאי: **אין אף ruleset בריפו**, ולכן אין הגנה על main דרך המנגנון הזה.

### למה לא נוצר אוטומטית

ה-proxy של הסביבה חוסם כתיבה ל-API:

```
POST /repos/.../rulesets
-> "Write access to this GitHub API path is not permitted through this proxy."
```

קריאה מותרת, כתיבה לא. זו מגבלת סביבה, לא הרשאה חסרה בחשבון.

### צילום מסך

לא צולם, ובכוונה. github.com לא נגיש לדפדפן מהסביבה הזאת, וגם אם היה, הסשן לא מחובר לחשבון שלך, כך שכל "צילום" של עמוד ההגדרות היה מסך התחברות או תמונה מפוברקת. הראיה האמיתית היא תשובת ה-API למעלה.

### להחלה, פקודה אחת

ה-payload המדויק שמור ב:
docs/research/protect-main-ruleset.json

Terminal (במחשב, עם gh מחובר):

```bash
gh api -X POST repos/kenyonexpress/kenyonexpress/rulesets \
  --input docs/research/protect-main-ruleset.json
```

או ידנית: GitHub > Settings > Rules > Rulesets > New branch ruleset. שם protect-main, Enforcement status = Active, Target branches = main, ולסמן "Block force pushes" ו-"Require a pull request before merging".

**אזהרה תפעולית אחת, לפני שאתה מפעיל:** ה-ruleset הזה יחסום גם אותך מלדחוף ישירות ל-main, וגם את הסוכן. היום נדחפים commits ישירות ל-main (ראיתי את זה בהיסטוריה של הלילה). מרגע ההפעלה כל שינוי ל-main חייב לעבור PR. זה בדיוק מה שביקשת, רק תדע שזה משנה את שגרת העבודה. אם תרצה חריגה, אפשר להוסיף bypass actor לחשבון שלך.

## 2. השוואה ויזואלית ב-380px ו-768px

**לא בוצעה. שני הצדדים חסומים מהסביבה הזאת, אומת שוב היום.**

| צד | בדיקה | תוצאה |
|---|---|---|
| מקומי | הרמתי dev server אמיתי ובדקתי | `/` מחזיר 500, `/shop` מחזיר 500 |
| תבנית | curl ל-electro | `CONNECT tunnel failed, 403` |
| הסיבה למקומי | curl ל-Supabase | `CONNECT tunnel failed, 403` |

כלומר: האתר המקומי עולה, אבל ה-DB לא נגיש מהקונטיינר, אז כל עמוד שקורא נתונים נופל ל-500. אין דף לצלם ואין מול מה להשוות. לא אמציא צילומים ולא אמציא רשימת פערים.

### הכלי שמבצע את המשימה במלואה מהמחשב

נכתב, נבדק (syntax + lint נקיים) ונדחף:
scripts/qa-visual-compare.mjs

Terminal (במחשב, כשה-dev server רץ מול DB אמיתי):

```bash
git pull origin claude/terminal-cursor-work-2mr2pq
pnpm dev
node scripts/qa-visual-compare.mjs
```

מה הוא עושה:

1. מזהה אוטומטית מוצר וקטגוריה אמיתיים מדף הבית המקומי, ומוצר אמיתי מ-electro.
2. פותח Chrome אמיתי (עוקף את ה-Cloudflare challenge) ברוחב 380px ואז 768px.
3. מצלם full page שישה זוגות: דף בית, מוצר, קטגוריה, בשני הרוחבים, בשני הצדדים.
4. מודד בכל דף: גובה עמוד, מספר סקשנים, גלישה אופקית, כרטיסים בשורה, גובה header ו-footer, גודל כותרת, גודל וצבע מחיר, רקע ו-radius של כפתור, radius של כרטיס, ו-dir של html.
5. כותב טבלת פערים בעברית, שורה לכל מדד, עם עמודת "פער" מספרית.

## 3. שמירה ל-refs עם שמות תאריך

הצילומים נשמרים אוטומטית על ידי הסקריפט לתוך refs/ בתבנית:

```
refs/qa-mine-<page>-<width>-<date>.png
refs/qa-live-<page>-<width>-<date>.png
refs/qa-visual-gaps-<date>.md
```

לדוגמה: `refs/qa-mine-home-380-2026-08-07.png` מול `refs/qa-live-home-380-2026-08-07.png`.

מה שכן נשמר כבר עכשיו ל-refs עם שם תאריך:

- docs/research/github-rulesets-evidence-2026-08-07.json (ראיית ה-API למשימה 1)
- docs/research/protect-main-ruleset.json (ה-payload להחלה)
