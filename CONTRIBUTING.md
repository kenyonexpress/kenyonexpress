<div dir="rtl" align="right">

# תרומה לקוד

הקובץ הזה הוא הגרסה הקצרה. הארוכה: ‏`docs/DX.md` ‏(כלי הפיתוח), ‏`docs/TESTING.md`,
‏`docs/CI-AND-BRANCH-PROTECTION.md`, ו-`docs/adr/` ‏(ההחלטות שאין לפתוח מחדש).

## לפני הכל

- **‏pnpm בלבד.** ‏`npm install` מת כאן לפני כל ‏hook, והסיבה המדודה ב-`AGENTS.md`.
- **‏Node ‏22.11** ‏(`.nvmrc`). ‏`pnpm install`, ‏`cp .env.example .env.local`, ‏`pnpm dev`.
- **הריפו הוא ‏`/Users/ofir/kenyonexpress-web/kenyonexpress` ואין לו עותקים.** גיבוי הוא ‏git.

## ארבעת החוקים שאין עליהם דיון

1. **כסף = אגורות, ‏integer בלבד**, דרך ‏`src/lib/money.ts`. אין ‏float במסלול הכסף. ‏(ADR ‏0001)
2. **אין ‏`db push`.** שינוי סכימה הוא קובץ ב-`migrations/pending/` + שורה ב-README שלו, ולא מוחל
   על פרודקשן בלי אישור מפורש. ‏(ADR ‏0006)
3. **‏`platform_percent` דינמי פר מוצר**, מצולם ל-`order_items` בזמן ההזמנה. ‏(ADR ‏0003)
4. **עברית ‏RTL בכל ה-UI**, לפי ‏`refs/ke_live_singlefile.html`, ושער ההשוואה מתחת ל-11%.

## מה רץ על כל commit

‏`.husky/pre-commit` מריץ שלושה דברים על **הקבצים ב-index** ולא על עץ העבודה:

| שלב | מה | זמן נמדד |
|-----|-----|----------|
| ‏`lint-staged` | ‏`biome check --write` | שניות בודדות |
| ‏`scripts/precommit-gate.mjs` | ‏`tsc` על קבצי ה-TS שב-index ‏(עוקב אחרי ה-imports) | עד ‏13 שניות |
| אותו סקריפט | ‏`vitest related` על קבצי ‏`src/` שב-index | כ-3 שניות |

‏`git commit --no-verify` עוקף, ו-CI מריץ את אותם שערים על ה-PR, כך שהעקיפה רק דוחה.

## מה רץ לפני ‏push ‏(עליך)

```bash
pnpm test && pnpm type-check && pnpm lint && pnpm build
```

‏`pnpm build` הוא שער נפרד: ‏`cacheComponents` מסרב לקריאה לא מקושת בדף, ושלושת
הקודמים לא רואים את זה. ‏`pnpm lint` הוא ‏biome ועוד ‏12 שערים ‏(tokens, ‏i18n,
‏docs-index, …) שכל אחד מהם הוא ‏ratchet: מותר לרדת, אסור לעלות.

## ‏commit

- **נתיבים מפורשים בלבד, לעולם לא ‏`-A`.** ‏`git commit -- <paths>` לוקח את **עץ העבודה**
  של הנתיבים, כך שקומיט רחב סוחף עבודה של סשן אחר.
- הודעת ה-commit אומרת מה נמדד ומה הוחלט, לא רק מה השתנה. ‏backticks בהודעה
  דרך ‏`-m` מורצים כפקודת ‏shell; להשתמש ב-`-F file`.
- ‏`main` מוגן ודורש ‏PR עם ‏4 בדיקות. ענף העבודה ב-`CLAUDE.md`.

## ‏PR

התבנית ב-`.github/PULL_REQUEST_TEMPLATE.md` שואלת "איך זה נמדד" ומצפה לפלט אמיתי.
‏`CODEOWNERS` מסמן את מסלול הכסף, הסכימה, ה-RLS והשערים עצמם.

## מסמכים

כל מסמך חדש ב-`docs/` צריך שורה ב-`docs/INDEX.md`, וה-README מונה את המסמכים
‏(שער ‏`ci-docs-inventory`). החלטה ארכיטקטונית חדשה היא קובץ ב-`docs/adr/`
במספר הבא, קצר, עם מצביע לראיה.

</div>
