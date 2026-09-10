# Kenyon Express

‏זירת מסחר עברית ‏RTL: קופונים למימוש אצל ספק, ומוצרים פיזיים במשלוח. אתר
לקוחות, פאנל אדמין, מסך מימוש לספק ואפליקציית קופה במובייל, מעל ‏Next.js 16 /
‏React 19, ‏Supabase (‏Postgres + RLS) ותשלומי ‏Cardcom.

## דרישות מקדימות

| | |
| --- | --- |
| ‏Node | ‏`>=22.11.0` (`.nvmrc` נועל את ‏22.11.0) |
| מנהל חבילות | ‏**‏pnpm 11.1.2 בלבד** |

**‏`npm install` לא יכול לעבוד כאן.** הוא מת עם
`Cannot read properties of null (reading 'matches')` בתוך ‏`buildIdealTree`,
לפני כל ‏lifecycle hook, ולכן אין דרך להחליף את ההודעה במשהו מועיל מתוך
הריפו. הסיבה המדודה נמצאת ב-`AGENTS.md`. התקנה: ‏`pnpm add -D <pkg>`.

## התחלה

```bash
pnpm install
cp .env.example .env.local   # ואז למלא ערכים אמיתיים
pnpm dev                     # http://localhost:3000
```

‏`.env.example` נוצר מקריאת הקוד ולא מהזיכרון: כל משתנה שם נקרא באמת במקום
כלשהו, ומעל כל אחד רשום היכן. ‏`[required]` ‏/ ‏`[optional]` ‏/ ‏`[tooling]`
מסומנים בשורה עצמה, ו-`src/lib/env.ts` מסרב לעלות כשהוא רואה ‏`NEXT_PUBLIC_*`
עם שם שנראה כמו סוד.

## פקודות

| פקודה | מה היא עושה |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | ‏Next.js. שים לב: ‏`pnpm start` רץ ב-`NODE_ENV=production` גם על מחשב נייד |
| `pnpm test` | ‏Vitest, ריצה אחת. `test:watch`, `test:coverage` לצדה |
| `pnpm test:e2e` | ‏Playwright. חייב שרת ‏`pnpm start` חי, לא ‏`dev` |
| `pnpm type-check` | ‏`tsc --noEmit` |
| `pnpm lint` | ‏biome + שערי ‏tokens ‏/ ‏copy ‏/ ‏assets |
| `pnpm ci:diff-gates` | אותם שערים, מוגבלים ל-diff. זה מה שרץ על ‏PR |
| `pnpm audit:final` | שער ההיגיינה של ‏`docs/FINAL-AUDIT.md` (סמני עבודה, ‏`any`, ‏`console`, משתני סביבה לא מתועדים) |
| `pnpm gate:hardcoded` | קסמים ופיקסלים קשיחים מול הפנקס ב-`docs/hardcoded-audit.md` |
| `pnpm db:types` | מייצר את ‏`src/types/database.ts` מהמסד המקושר |
| `pnpm seed:test` | נתוני בדיקה |
| `pnpm lighthouse:smoke` | ‏Lighthouse מקומי |
| `pnpm sentry:verify` / `sentry:alerts` | אימות התצורה של ‏Sentry וכללי ההתראה (`:dry` ‏/ ‏`:ci` לגרסאות שאינן כותבות) |

הרשימה המלאה ב-`package.json`; ‏`pnpm audit:final` מוודא שכל script מצביע על
קובץ שקיים.

## מבנה

| נתיב | מה יש שם |
| --- | --- |
| `src/app/` | מסלולי ‏App Router, בעשר קבוצות מסלולים: ‏`(main)`, ‏`(shop)`, ‏`(store)`, ‏`(marketing)`, ‏`(account)`, ‏`(auth)`, ‏`(admin)`, ‏`(supplier)`, ‏`(supplier-public)`, ‏`(legal)` |
| `src/server/` | ‏server actions ולוגיקת שרת |
| `src/lib/` | תשתית משותפת, ובתוכה ‏`money.ts`, ‏`env.ts` ו-`observability/` |
| `src/db/`, `src/types/database.ts` | ‏Drizzle והטיפוסים שנוצרים מהמסד |
| `apps/mobile/` | אפליקציית הקופה לספק. **קוראת ל-RPC ישירות**, ולכן שינוי הרשאות שנבדק רק מול ‏`src/` יכול לשבור אותה |
| `migrations/pending/` | מיגרציות שנכתבו וטרם הוחלו. סדר והתניות ב-`APPLY-ORDER.md` |
| `supabase/migrations/` | ההיסטוריה. **אינה מתארת את פרודקשן** — הטיפוסים שנוצרים כן |
| `scripts/` | שערים, סקריפטים תפעוליים וכלי מדידה |
| `docs/` | ‏258 מסמכים. נקודת הכניסה: `docs/INDEX.md`, ש-`pnpm lint:docs` מוודא שהוא מונה את כולם |
| `e2e/`, `tests/`, `load/` | ‏Playwright, ‏Vitest, ‏k6 |

## חוקים שיעלו לך ביוקר אם תפספס אותם

1. **כסף הוא ‏integer של אגורות, ואחוזים הם ‏basis points.** כל חישוב עובר
   דרך ‏`src/lib/money.ts`. אסור ‏`float` בשום מקום במסלול הכסף.
2. **אין ‏`db push`.** שינוי סכימה נכתב כקובץ ל-`migrations/pending/` וממתין
   לאישור מפורש. ‏`docs/RUNBOOK.md` מחזיק את סדר ההחלה.
3. **‏`platform_percent` דינמי פר מוצר**, ומצולם ל-`order_items` בזמן ההזמנה.
   הוא לא נקרא מחדש בהמשך החיים של ההזמנה.
4. **עברית ‏RTL בכל ה-UI**, עם ‏logical properties ולא ‏`left`/`right`.
5. **‏`refs/` הוא תוצר, לא מקור.** ראה `docs/REFS-POLICY.md`.

## שער ההשוואה החזותית

```bash
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

השער מצלם את שני הצדדים בכל ריצה, מודד ב-380 ‏/ ‏768 ‏/ ‏1440, כותב שורה
ל-`docs/UI-PARITY-REPORT.md` בעצמו, והתקציב הוא מתחת ל-11%.

**הצד החי אינו נלקח מארכיון.** כשמה שהוצבע עליו אינו רפרנס אמיתי השער
**מסרב** ויוצא בקוד ‏5, במקום להשוות את הריפו לעצמו ולדווח ירוק. הסיבה
והעלות ב-`docs/PARITY-REFERENCE.md`.

## תשתית ותפעול

- **‏CI:** ‏10 workflows ב-`.github/workflows/`, וגם מה שבמכוון **אינו** רץ
  שם מתועד ב-`.github/workflows/README.md`.
- **תקריות:** `docs/RUNBOOK.md` (נכתב להיקרא ב-03:00), ‏`docs/RUNBOOK-OPS.md`.
- **ניטור:** `docs/MONITORING.md` — כולל מי מהשומרים עיוור כרגע ולמה.
- **הרשאות:** `docs/AUTH-MODEL.md` — מטריצת תפקיד ‏× משאב ‏× פעולה, מדודה מול
  פרודקשן.
- **תשלומים:** `docs/PAYMENT-FLOW.md`. **שוברים:** `docs/VOUCHER-LIFECYCLE.md`.
- **ענפים ומודל עבודה:** `docs/BRANCH-AUDIT.md`, ו-`CLAUDE.md` בשורש.

## רישוי

פרטי. כל הזכויות שמורות.
