# הקמת מפתח חדש (macOS, מאפס)

Status: DRAFT · docs only  
Audience: מפתח אנושי במק, לא סוכן ענן.  
Root: `/Users/ofir/kenyonexpress-web/kenyonexpress` (או clone מקומי של אותו repo). אין עותק מקונן `kenyonexpress/kenyonexpress/`.

כסף: אגורות integer דרך `src/lib/money.ts`. אין float במסלול כסף. אין `db push`. אין `npm install` בשורש.

---

## 0. מה מתקינים על המק לפני הקלון

| כלי | גרסה / הערה |
|---|---|
| Xcode CLT | `xcode-select --install` |
| Homebrew | brew.sh |
| Node | **22** (כמו CI `NODE_VERSION: '22'`). `nvm install 22` או fnm |
| pnpm | `corepack enable` ואז `corepack prepare pnpm@11.1.2 --activate`. השדה `packageManager` ב-`package.json` הוא `pnpm@11.1.2` |
| Git | gh מאומת אם צריך PRs |
| Docker Desktop | רק אם מריצים Supabase local |
| Supabase CLI | `brew install supabase/tap/supabase` |
| Playwright browsers | אחרי `pnpm install`: `pnpm exec playwright install chromium` אם `compare.mjs` דורש |

`npm i` בשורש **נכשל** על יער הסימלינקים של pnpm (`Link.matches` על `target: null`). זו לא cache מקולקלת. תמיד:

```bash
pnpm add -D <pkg>
```

---

## 1. Repo

Terminal, תיקיית אב (לא בתוך עותק קיים):

```bash
git clone git@github.com:kenyonexpress/kenyonexpress.git
cd kenyonexpress
git fetch origin main
git checkout main
git pull origin main
pwd
```

צפי `pwd`: נתיב שנגמר ב-`kenyonexpress` ובו `package.json`, `.git`, `src/`.

Fork מותר. כוח דחיפה ל-`main` הוא לבעלים בלבד.

---

## 2. pnpm והתקנת חבילות

```bash
node -v   # v22.x
pnpm -v   # 11.x
pnpm install --frozen-lockfile
```

בלי `--frozen-lockfile` רק כשמוסיפים חבילה במכוון ואז בודקים את `pnpm-lock.yaml` ב-PR.

Next כאן שונה ממה שאימנתם עליו. לפני API חדש: לקרוא ב-

```
node_modules/next/dist/docs/
```

---

## 3. env

```bash
cp .env.example .env.local
```

`.env.example` נגזר מקריאות אמיתיות בקוד. לא להוסיף משתנה "ליתר ביטחון".

חובה מקומית כדי שהאתר לא ייראה כקטלוג ריק בשקט:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- אחד מ-`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` לפעולות אדמין
- `NEXT_PUBLIC_APP_URL` + `NEXT_PUBLIC_SITE_URL` (אותו ערך, בלי slash בסוף). מקומי: `http://localhost:3000`

לסליקה מקומית: או מצב mock אם הקוד מאפשר, או מפתחות Cardcom **סנדבוקס**. בייצור `CARDCOM_SANDBOX=true` מפיל boot במכוון.

אין לשים סוד בקידומת `NEXT_PUBLIC_`. `src/lib/env.ts` מסרב לעלות על דפוסי SECRET/PASSWORD/SERVICE_ROLE בדפדפן.

`.env.local` ב-`.gitignore`. אין commit.

---

## 4. Supabase local (אופציונלי, מומלץ לסכימה)

פרויקט מרוחק קיים. Local stack:

```bash
supabase start
```

ואז לעדכן `.env.local` ל-URL המקומי. אם ה-stack כבוי וה-URL מצביע עליו, **הקטלוג נראה ריק בלי שגיאה** (מלכודת שתועדה ב-`.env.example`).

מיגרציות חיות תחת `supabase/migrations/` ו-`migrations/pending/`. כלל:

- שינוי סכימה = קובץ מיגרציה חדש ב-`migrations/pending`
- **אסור** `supabase db push` / `drizzle-kit push` לפרודקשן
- החלת מיגרציה על פרודקשן = אישור בעלים (אחד מארבעת תנאי העצירה)

RLS: לא לכבות בלוקל "כדי שזה יעבוד". באגים של הרשאה צריכים להישבר בלוקל כמו בייצור.

---

## 5. Drizzle

יש `drizzle-orm` ו-`drizzle.config.ts`. הסכימה המנוהלת חלקית:

```
src/db/schema/commerce-managed.ts
```

פלט:

```
./supabase/drizzle
```

דורש `SUPABASE_DB_URL`. Drizzle הוא כלי עזר, **לא** מחליף את מיגרציות Supabase. אין `db push`. אין לייצר מיגרציית Drizzle ולמחוק את קבצי SQL הקיימים.

`pnpm db:types` דורש פרויקט מקושר וכותב ל-`src/types/database.ts`. לא להריץ אלא אם התבקשתם לרענן טיפוסים, וב-PR נפרד מקוד התנהגות.

---

## 6. הרצה מקומית

```bash
pnpm dev
```

Chrome: `http://localhost:3000`. RTL, Heebo. קופון: שלושה מחירים ב-PDP. כסף `dir=ltr`.

חשבון בדיקה: Google OAuth רק אם הגדרתם redirect ב-Supabase ל-localhost.

---

## 7. בדיקות

מהשורש, תמיד:

```bash
pnpm test
pnpm type-check
pnpm lint
```

שער דיף (כמו CI):

```bash
pnpm ci:diff-gates
```

E2E:

```bash
pnpm test:e2e
```

דורש secrets/משתנים; ב-CI חלק מה-E2E מדלג בלי `CI_SUPABASE_URL`. לא להמציא נתוני כסף בטסט עם float.

כיסוי כסף: `pnpm test:coverage` כולל רצפות על מסלול agorot. אל תשברו אותן.

---

## 8. `scripts/compare.mjs` (שער פיקסלים)

יעד: דיף מתחת ל-**11%** מול החי (`refs/ke_live_*.html` בדרך כלל gitignored). דפדפן Playwright כבר ב-devDependency. אין צורך ב-`npm i playwright`.

בניית שרת ואז השוואה:

```bash
pnpm build
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home --width=380
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home --width=1440
```

רוחבים חשובים: 380, 768, 1440. שינוי UI בחנות בלי להריץ compare הוא חצי עבודה.

---

## 9. חוקי branch

| מי | איך |
|---|---|
| סוכן ענן / PR | ענף `cursor/<name>-<suffix>` מ-`main`, PR ל-`main` |
| מפתח מקומי | `feat/...` או `fix/...` מ-`origin/main` מעודכן. לא לעבוד ישירות על `main` |
| לולאה אוטונומית במק של הבעלים | `main` לפי `CLAUDE.md` / `STATE.md`. לא להעתיק את זה למק שלכם בלי תיאום |

לפני branch:

```bash
git fetch origin main
git checkout -b feat/your-thing origin/main
```

אין force-push ל-`main`. אין שני סוכני קוד על אותו repo באותו זמן.

ארבע עצירות שדורשות אדם:

1. push לפרודקשן ב-Vercel (promote / env ייצור)
2. מחיקת DB או מחיקת קבצים המונית
3. מיגרציה על פרודקשן
4. סוכן קוד שני על אותו repo

---

## 10. חוקי commit

- הודעה מתארת **מה** נכנס. ל-docs: `docs: path/to/file.md`
- בלי מקף ארוך (em dash) בשום טקסט שמוצג לבעלים, כולל הודעת commit
- בלי סודות, בלי `.env`, בלי `refs/` גדולים אם gitignored
- כסף: לא "תיקון עיגול float", אלא agorot
- PR: לא לערב קוד ו-docs-only אלא אם זה אותו נושא

```bash
git add -p
git commit -m "feat: describe the change"
git push -u origin HEAD
```

---

## 11. פרוטוקול `STATE.md`

`STATE.md` בשורש הוא מקור האמת בין סשני הסוכן במק של הבעלים. **מפתח ב-PR רגיל לא עורך אותו** אלא אם זה התפקיד שלו בסשן האוטונומי.

כשכן עורכים (סשן אוטונומי בלבד):

1. בתחילת סשן: לקרוא, למצוא `## המשך מ:`, להתחיל מה-goal הראשון שם.
2. אחרי goal: טסטים ירוקים, commit, push, עדכון `המשך מ:`, ואז ntfy.
3. החלטות לבד: תחת "החלטות שהתקבלו לבד" / "אוטומטית", עם ראיה.
4. Goal שנתקע פעמיים: לדלג, לתעד, לא לנסות שלישית בפתרון שלא נמדד.

מבנה מינימלי שהפרוטוקול דורש (אל תמחקו כותרות קיימות רק כדי לצמצם):

- Current Phase
- Last Completed (שמות קבצים)
- In Progress
- Blocking Issues (שגיאות מדויקות)
- Next Task
- Working Directory (תמיד שורש הפרויקט)
- Supabase Project URL

אל תדביקו סודות ב-`STATE.md`.

---

## 12. UI וחוקים קבועים

- עברית RTL בכל ה-UI ללקוח. מחיר `dir=ltr`.
- `platform_percent` דינמי פר מוצר, מצולם ל-`order_items` בזמן הזמנה.
- קופון: הלקוח משלם באתר את מחיר הקופון. יתרה בבית העסק אחרי QR. אין Escrow. ארנק לא משיך החוצה.
- השוואה חזותית: מתחת ל-11%.
- אסור להמציא "הכי זול בארץ", מלאי מזויף, QR כתמונה במייל כעותק יחיד.

---

## 13. יום ראשון מוצלח (צ'קליסט)

- [ ] `pnpm install --frozen-lockfile`
- [ ] `.env.local` מלא, `pnpm dev` מציג בית עם דילים או empty אמיתי (לא שגיאת URL כבוי)
- [ ] `pnpm test` ירוק
- [ ] `pnpm type-check` ו-`pnpm lint` נקיים
- [ ] קראתם `docs/BUSINESS-MODEL.md` ו-`docs/product/PRODUCT-COPY-GUIDE.md`
- [ ] לא רצתם `db push`

---

## 14. קישורים

- `AGENTS.md` (pnpm, Next docs)
- `.env.example`
- `docs/CI-AND-BRANCH-PROTECTION.md`
- `docs/ARCHITECTURE-ENV-SECRETS.md`
- `migrations/pending/README.md`
- `docs/ops/RUNBOOK-INCIDENTS-HE.md`
