# ‏Onboarding — מפתח חדש, מאפס לריצה

‏נכתב ‏02.09.2026. עשרים דקות קריאה חוסכות את כל המלכודות שמפורטות למטה.

## 1. שלוש עובדות לפני הכל

1. **יש דאטהבייס אחד — הפרודקשן המאוחסן ב-Supabase.** ‏`supabase start`
   לא רץ כאן, וקבצי המיגרציות הם lineage אחר מהפרודקשן. האמת היא ה-DB;
   ‏`src/types/database.ts` נוצר ממנו (‏`pnpm db:types`).
2. **‏npm שבור בריפו הזה בכוונת-מבנה** (‏arborist נחנק מה-virtual store).
   ‏pnpm בלבד: ‏`pnpm install`, ‏`pnpm add -D <pkg>`.
3. **כסף = אגורות שלמות דרך `src/lib/money.ts`.** ‏float במסלול הכסף לא
   עובר review, וגם לא CI.

## 2. סביבה

```bash
pnpm install
cp .env.example .env.local   # ומלא לפי ההערות שבקובץ — כל שורה מתעדת קורא
pnpm dev                     # פיתוח
```

מלכודות env מתועדות בתוך ‏.env.example עצמו (הוא נוצר מקריאת הקוד).
שתיים שכדאי לדעת מראש: המפתח הסודי בצ'קאאוט המקומי הוא demo-key שהפרויקט
דוחה ("Invalid API key" בסקריפטים); ו-`next start` על לפטופ הוא
‏NODE_ENV=production — יש ‏ALLOW_INCOMPLETE_ENV לזה.

## 3. השערים (כולם חייבים ירוק לפני commit)

```bash
pnpm type-check && pnpm lint && pnpm test   # מהיר
pnpm build                                   # שער נפרד! cacheComponents תופס דברים שהשלושה מפספסים
node scripts/migration-lint.mjs              # אם נגעת במיגרציות
node scripts/bundle-gate.mjs                 # ratchet על ה-JS המשותף
E2E_PORT=3412 E2E_WEB_COMMAND='pnpm start' pnpm exec playwright test  # לעולם לא bare
```

‏e2e מול שרת dev ישן מפברק כשלונות — תמיד ‏pnpm start טרי (הקונפיג עושה
זאת כשנותנים לו).

## 4. איפה מה

| שכבה | איפה |
| --- | --- |
| דפי החנות | ‏`src/app/(store)` (+‏main/legal/auth/account/admin/supplier groups) |
| פעולות שרת | ‏`src/server/actions/` — כל אחת שומרת על עצמה (auth-coverage.test) |
| מסלול הכסף | ‏`src/lib/money.ts`, ‏`src/server/payments/`, ‏`src/lib/payments/` |
| שאילתות | ‏`src/server/queries/` (משתמש) / ‏`createAdminClient` (שירות, בשער בלבד) |
| מיגרציות ממתינות | ‏`migrations/pending/` + ‏APPLY-ORDER.md |
| החלטות | ‏`docs/adr/` — התקצירים; המסמכים הארוכים ב-`docs/INDEX.md` |

## 5. הקונבנציות שנאכפות בטסטים (תיפול עליהן, זו הכוונה)

‏route בלי ‏withRequestLog; פעולה בלי שער; ‏cron בלי רישום מרובע
(‏json/yml/md/רשימה); ‏hex גולמי בקומפוננטה; קריאת supabase שזורקת את
ה-error; מיגרציה בלי רישום; ‏kind חדש ל-outbox בלי הרחבת ה-CHECK — לכולם
יש בדיקת-שומר עם הודעה שמסבירה מה לעשות.

## 6. דיפלוי

‏Vercel, פרויקט ‏kenyonexpress, ‏branch פרודקשן — ראה ‏docs/DEPLOYMENT.md
ו-‏docs/LAUNCH-RUNBOOK.md. ‏crons רצים מ-GitHub Actions (‏cron.yml, ‏12
jobs). ‏rollback = ‏redeploy של ה-deployment הקודם ב-Vercel; ‏DR מלא —
‏docs/DR-RUNBOOK.md.
