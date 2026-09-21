# חוויית פיתוח (‏DX)

‏SECTIONS 86. נמדד ‏22.09.2026.

## למה המסמך הזה

הסעיף מונה שבעה פריטים: ‏seed עם נתונים עבריים, ‏Storybook לרכיבי מערכת העיצוב,
תיקיית ‏ADR, ‏CONTRIBUTING, ‏pre-commit ‏(lint, ‏type-check, ‏test), תבנית ‏PR
ו-CODEOWNERS. **ארבעה היו קיימים ולא נגעתי בהם, אחד היה חלקי, ושניים חסרו.**

| # | פריט | היה | נוסף ב-86 |
|---|------|-----|-----------|
| 1 | ‏seed עברי ריאליסטי | ‏`pnpm seed` ‏(14 ספקים, ‏40 דילים, ‏200 מחרוזות עבריות ב-`scripts/seed/catalogue-data.mjs`), ‏`seed:test` ‏(fixtures ל-E2E), ‏`seed:lifecycle` ‏(הזמנה/תשלום/שובר בכל מצב), ‏`scripts/seed/demo-data.mjs` ‏(222), ‏`launch-bar.mjs` ‏(138). כולם ‏dry-run כברירת מחדל ומדפיסים ‏SQL; נמדד: ‏26 ‏kB ו-11 ‏kB | — |
| 2 | ‏Storybook | לא היה. ‏`docs/COMPONENT-INVENTORY.md` הוא סריקה, לא רינדור | **‏`/dev/components`**: כל פרימיטיב ב-`src/components/ui` מרונדר על הטוקנים האמיתיים ב-RTL, וטבלת צבעים ומידות מ-`src/styles/tokens.ts`. ‏404 ב-production כמו ‏`/dev/emails`. ‏Storybook נדחה, ראה החלטות |
| 3 | תיקיית ‏ADR | ‏`docs/adr/` עם ‏12 החלטות ‏(02.09) ו-`docs/DECISIONS.md` המורחב | ‏0013 ‏(דגלי מערכת, ‏83) ו-0014 ‏(חסימה ב-auth, ‏85): שתי החלטות ארכיטקטוניות שהתקבלו אחרי ‏02.09 ולא היה להן ‏ADR |
| 4 | ‏CONTRIBUTING.md | לא היה; החוקים פזורים ב-`CLAUDE.md`, ‏`README`, ‏`docs/TESTING.md` | **‏`CONTRIBUTING.md`** בשורש: הגרסה הקצרה עם מצביעים |
| 5 | ‏pre-commit: ‏lint, ‏type-check, ‏test | ‏`lint-staged` עם ‏biome בלבד | **‏`scripts/precommit-gate.mjs`**: ‏tsc על קבצי ה-TS שב-index ‏(tsconfig זמני עם ‏`files`), ו-`vitest related` על קבצי ‏`src/` שב-index |
| 6 | תבנית ‏PR | ‏`.github/PULL_REQUEST_TEMPLATE.md` בעברית, שואלת "איך זה נמדד" | — |
| 7 | ‏CODEOWNERS | ‏`.github/CODEOWNERS` על מסלול הכסף, הסכימה, ה-RLS והשערים | — |

ועוד אחד שלא בסעיף ונמצא שבור: **‏`.vscode/settings.json` הגדיר ‏Prettier** כמעצב
ברירת המחדל, בריפו שכל שעריו הם ‏Biome. מי שפתח את הריפו ב-VS Code עם
‏formatOnSave קיבל פורמט אחד בעורך ואחר ב-`lint-staged`. תוקן ל-Biome, עם
‏`extensions.json` שממליץ על ‏Biome, ‏Tailwind, ‏Playwright ו-Vitest ומסמן את
‏Prettier ו-ESLint כלא רצויים.

## מה נמדד

| מדידה | ערך |
|-------|-----|
| ‏`tsc --noEmit` על כל הפרויקט | ‏13.3 שניות |
| ‏`vitest related --run` על שני קבצים | ‏2.5 שניות ‏(3 קבצי טסט, ‏25 טסטים) |
| ‏`pnpm seed` ‏(dry run) | ‏14 ספקים, ‏40 מוצרים ‏(37 קופונים, ‏3 פיזיים); ‏`--sql` ‏26,108 בייט |
| ‏`seed:lifecycle --sql` | ‏10,917 בייט |
| ‏ADRs | ‏12 → ‏14 |
| מסמכים ב-`docs/` | ‏273 ‏(שער ‏`ci-docs-inventory` מונה) |

## החלטות

- **גלריה בתוך ‏Next במקום ‏Storybook.** ‏Storybook מוסיף ‏build שני ‏(Vite), עותק
  שני של צינור ‏Tailwind וכמה מאות חבילות, כדי לרנדר ‏11 פרימיטיבים שהאפליקציה
  כבר מרנדרת עם הטוקנים, הפונט וה-RTL האמיתיים, שהם בדיוק מה ש-story היה
  צריך לזייף. הגלריה רצה ב-`pnpm dev`, ומה שהיא מראה הוא האפליקציה. יש לה
  טסט רינדור ‏(`page.test.tsx`) כך שפרימיטיב שנשבר נופל בטסט ולא ביום שמישהו
  פותח את הדף. אם יום אחד יהיה צוות עיצוב שעובד בלי ‏`pnpm dev`, זו הסיבה
  לפתוח את ההחלטה מחדש.
- **‏pre-commit על ה-index ולא על עץ העבודה.** כמה סשנים עורכים את ה-checkout
  במקביל, ולכן "העץ מתקמפל" היא שאלה על עבודה של אחרים. "מה שאני עומד לקמט
  מתקמפל" היא השאלה ש-hook יכול לשאול בהגינות. ה-tsconfig הזמני מונה את הקבצים
  שב-index כשורשים; ‏tsc עוקב אחרי ה-imports, וזה הרעיון.
- **‏`--no-verify` נשאר פתוח.** ‏CI מריץ את אותם שערים על ה-PR, כך שהעקיפה
  מזיזה כישלון ולא מוחקת אותו. שער שאי אפשר לעקוף בחירום הוא שער שמישהו
  מוחק.
- **ה-seed לא נגע.** הוא מדפיס ‏SQL ולא כותב, כי ה-DB היחיד שנגיש מכאן הוא
  פרודקשן ‏(`scripts/seed-lifecycle.mjs` מסביר). "seed שרץ" היה כאן seed שכותב
  שמונה הזמנות מזויפות ליומן החי.

## איך משתמשים

```bash
pnpm dev                       # ואז http://localhost:3000/dev/components
pnpm seed                      # dry run; --sql מדפיס את הבלוק
node scripts/precommit-gate.mjs   # מה ש-commit יריץ, על מה שב-index עכשיו
```

## קבצים

- ‏`src/app/dev/components/page.tsx` ‏(+`page.test.tsx`)
- ‏`scripts/precommit-gate.mjs` ‏(+`precommit-gate.test.mjs`), ‏`.husky/pre-commit`
- ‏`CONTRIBUTING.md`, ‏`docs/adr/0013-*.md`, ‏`docs/adr/0014-*.md`
- ‏`.vscode/settings.json`, ‏`.vscode/extensions.json`
