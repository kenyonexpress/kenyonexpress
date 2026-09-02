# DEPLOY

<!-- stale-banner:2026-09-01 -->
> ⛔ **‏מיושן החל מ-01.09.2026. המסמך המחייב הוא `docs/LAUNCH-RUNBOOK.md`.**
>
> שתי שורות כאן שגויות, והשנייה היא זו שהפילה אחד עשר דיפלוימנטים:
>
> ‏1. ‏**‏Production Branch אינו `cursor/add-supabase-3c830`.** זה ענף נטוש,
>    וההצבעה אליו היא הסיבה שאף קומיט מהמיינליין לא נבנה. הענף הוא
>    ‏`main`. **‏עדכון 01.09.2026:** ‏`phase5/homepage` מוזג ‏(PR #6) ו-`main` הוא
>    היום הענף היחיד שעובדים עליו, ברירת המחדל ב-GitHub, ויעד כל push.
> ‏2. ‏**התיאור של `.vercelignore` מתאר את הבאג ולא את התיקון.** ‏`supabase/`
>    בלי לוכסן מוביל מוחק גם את `src/lib/supabase/`, שהאפליקציה מייבאת ‏155
>    פעם. הקובץ היום מעגן נתיבים בלוכסן מוביל, וההסבר המלא כתוב בתוכו.


מדריך פריסה מלא ל-Kenyon Express. כל הפקודות רצות משורש הפרויקט:

```
/Users/ofir/kenyonexpress-web/kenyonexpress
```

---

## 1. דרישות מקדימות

| כלי | גרסה | בדיקה |
|---|---|---|
| Node | 20+ | `node --version` |
| pnpm | 11.1.2 | `pnpm --version` |
| Supabase CLI | 2.98+ | `supabase --version` |
| Docker Desktop | רץ | `docker info` |
| Vercel CLI | דרך npx | `npx --yes vercel@latest --version` |

Terminal:

```bash
corepack enable
pnpm install --frozen-lockfile
```

---

## 2. משתני סביבה

הרשימה המלאה עם תיעוד לכל משתנה נמצאת ב:

```
.env.example
```

לפיתוח מקומי:

```bash
cp .env.example .env.local
```

### חובה בפרודקשן

בלי אלה האתר לא עולה או נשבר בזמן ריצה:

| משתנה | סוד? | מה נשבר בלעדיו |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | לא | כל גישה ל-DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | לא | כל גישה ל-DB |
| `SUPABASE_SERVICE_ROLE_KEY` | **כן** | כל פעולת אדמין, webhook של Cardcom |
| `NEXT_PUBLIC_APP_URL` | לא | auth callbacks, כתובות חזרה של Cardcom, SEO |
| `CARDCOM_TERMINAL_NUMBER` | **כן** | checkout זורק `Missing required env` |
| `CARDCOM_API_NAME` | **כן** | אותו דבר |
| `CARDCOM_API_PASSWORD` | **כן** | אותו דבר |
| `CARDCOM_WEBHOOK_SECRET` | **כן** | webhook מסמן כל קריאה כלא מאומתת |

ארבעת משתני Cardcom נדרשים רק כאשר `NODE_ENV=production`. מחוץ לפרודקשן, `CARDCOM_TERMINAL_NUMBER` ריק מפעיל אוטומטית את ספק ה-mock. הלוגיקה נמצאת ב:

```
src/lib/payments/env.ts
```

### כללי זהב

- כל משתנה עם קידומת `NEXT_PUBLIC_` נצרב לתוך ה-bundle של הדפדפן. אסור לשים בו סוד.
- `.env.local` נמצא ב-`.gitignore` ולא נכנס ל-git אף פעם. אומת מול כל היסטוריית ה-git.
- `.env.example` הוא הקובץ היחיד שנכנס ל-git, והוא מכיל רק placeholders.

---

## 3. מסד נתונים

### הרצה נקייה מאפס (אימות לפני פריסה)

Terminal:

```bash
supabase start
supabase db reset
```

`db reset` מוחק את ה-DB המקומי ומריץ את כל 44 המיגרציות לפי סדר שם הקובץ. המצב התקין הוא יציאה בקוד 0 בלי שורות `ERROR` ובלי `WARN`. אם משהו נכשל, הפריסה נעצרת כאן.

### סדר קריטי

- `041_seed_suppliers_link_products.sql` **חייב** לרוץ לפני `042_commerce_core.sql`. המיגרציה של 042 עוצרת בבדיקה מקדימה אם קיים מוצר בלי `supplier_id`, ו-041 היא זו שממלאת אותו. הקובץ מוספר 043 בעבר וזה שבר כל הרצה מאפס.
- `004_storage_buckets.sql` חייב לרוץ אחרי `003_rbac.sql` (תלוי ב-`public.has_role()`).

### החלה על פרודקשן

Terminal:

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

`supabase db push` מחיל רק מיגרציות שעדיין לא רשומות בטבלת `supabase_migrations.schema_migrations`. כל המיגרציות בפרויקט הזה כתובות idempotent, ולכן הרצה חוזרת בטוחה. הכללים המחייבים כתובים ב:

```
.claude/skills/supabase-migrations/SKILL.md
```

### seed

`[db.seed]` בקובץ `supabase/config.toml` מכובה בכוונה. נתוני הדמו יושבים בתוך המיגרציות עצמן (018, 022, 023, 024, 041). הקובץ:

```
supabase/seed/categories.sql
```

הוא כלי חד פעמי ידני, ואסור שירוץ אוטומטית.

---

## 4. שערי איכות לפני פריסה

Terminal:

```bash
pnpm type-check
pnpm test
pnpm build
```

שלושתם חייבים לצאת בקוד 0. מצב נוכחי: build עובר נקי, 149 טסטים ב-19 קבצים עוברים.

`pnpm lint` מדווח על 45 שגיאות סגנון, **כולן** בסקריפטים חד פעמיים תחת `scripts/` (כלי scraping והשוואה ויזואלית מול האתר החי). אף אחת מהן לא ב-`src/`, והתיקייה הזו לא נפרסת. זה לא חוסם פריסה.

---

## 5. Vercel

### חיבור ראשוני

Terminal:

```bash
npx --yes vercel@latest login
npx --yes vercel@latest link
```

`link` יוצר את התיקייה `.vercel/` שנמצאת ב-`.gitignore`.

### הגדרות פרויקט

| הגדרה | ערך |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `.` (אין monorepo, שורש יחיד) |
| Build Command | ברירת מחדל (`next build`) |
| Install Command | `pnpm install` |
| Node Version | 20.x |
| Production Branch | **`main`** ‏(לא `cursor/add-supabase-3c830`; ראה הבאנר בראש הקובץ) |

אין צורך ב-Build Command מותאם. הפרויקט הוא אפליקציית Next.js יחידה בשורש הריפו, עם `pnpm-lock.yaml` אחד. `next.config.ts` כבר מקבע את `turbopack.root` לתיקייה הזו.

הקובץ `.vercelignore` מוציא מהפריסה את `supabase/`, את קבצי הטסטים ואת קונפיגורציות הבדיקה.

### משתני סביבה ב-Vercel

Terminal, לכל משתנה בנפרד:

```bash
printf '%s' "<VALUE>" | npx --yes vercel@latest env add <NAME> production
```

לחזרה על אותו ערך גם ל-preview:

```bash
printf '%s' "<VALUE>" | npx --yes vercel@latest env add <NAME> preview
```

בדיקה:

```bash
npx --yes vercel@latest env ls
```

### Preview מול Production

- כל push ל-branch שאינו ה-Production Branch יוצר Preview Deployment עם כתובת ייעודית. זו התנהגות ברירת המחדל ולא צריך להגדיר אותה.
- Production עולה אך ורק מ-**`main`**.
- ל-Preview חייב להיות `NEXT_PUBLIC_APP_URL` נפרד שמצביע על כתובת ה-preview, אחרת auth callbacks וחזרות מ-Cardcom ינותבו לדומיין הפרודקשן.

### Supabase Auth

Supabase Dashboard > Authentication > URL Configuration:

יש להוסיף לרשימת ה-Redirect URLs את שתי הכתובות:

```
https://<production-domain>/auth/callback
https://<preview-domain>/auth/callback
```

בלי זה כל התחברות תיכשל בהפניה חזרה.

### פריסה

Preview:

```bash
npx --yes vercel@latest
```

Production:

```bash
npx --yes vercel@latest --prod
```

---

## 6. Cardcom

`CARDCOM_WEBHOOK_SECRET` הוא מחרוזת אקראית שאתה מייצר:

```bash
openssl rand -hex 32
```

Cardcom **לא חותם** על ה-callbacks שלו. אין HMAC ואין header לאימות. האותנטיות נשענת על שני דברים:

1. הסוד שנוסע בתוך ה-IndicatorUrl כפרמטר `?s=`, ומושווה בזמן קבוע.
2. אימות חוזר server-to-server מול `GetLpResult`, שהוא המקור היחיד שסומכים עליו לסכום, לסטטוס ולטוקן.

הקוד נמצא ב:

```
src/app/api/payments/cardcom/webhook/route.ts
```

בממשק הניהול של Cardcom צריך להגדיר את ה-IndicatorUrl לכתובת:

```
https://<production-domain>/api/payments/cardcom/webhook
```

החלפת הסוד מחייבת deploy לפני התשלום הבא, אחרת כל webhook ייכשל באימות.

---

## 7. בדיקות אחרי פריסה

Chrome, מול כתובת הפריסה:

1. דף הבית עולה, הסליידר והקטגוריות מוצגים.
2. `/products` ו-`/category/<slug>` מציגים מוצרים.
3. `/product/<slug>` עולה עם תמונות.
4. הרשמה, התחברות והתנתקות עובדות (בודק ש-`NEXT_PUBLIC_APP_URL` וה-Redirect URLs נכונים).
5. הוספה לסל ומעבר ל-`/checkout`.
6. `/admin` חוסם משתמש שאינו אדמין.
7. `/api/search?q=test` מחזיר JSON.

בדיקה שאין דליפת סודות ל-client:

```bash
grep -rIl "SUPABASE_SERVICE_ROLE_KEY\|CARDCOM_API_PASSWORD\|CARDCOM_WEBHOOK_SECRET" .next/static/ || echo "clean"
```

הרשימה המלאה של בדיקות ידניות נמצאת ב:

```
docs/QA-CHECKLIST.md
```

---

## 8. Rollback

Vercel Dashboard > Deployments > הפריסה הקודמת > Promote to Production. זה מיידי ולא מריץ build מחדש.

מיגרציות **לא** מתגלגלות אחורה אוטומטית. אין down migrations בפרויקט. לפני `db push` לפרודקשן יש לקחת snapshot:

Supabase Dashboard > Database > Backups.

---

## 9. נקודות פתוחות

- 45 שגיאות lint ב-`scripts/`, כולן סגנוניות, אף אחת לא ב-`src/` ולא נפרסות.
- פערי מספור במיגרציות (036 עד 040 ריקים) הם שאריות של טיוטות שלא נכתבו. אין להם השפעה על סדר ההרצה.
- `035_security_hardening.sql` ו-`032_wp_import_staging.sql` היו מסומנות כטיוטות שלא הוחלו על ה-DB החי. אחרי `db push` הן ייכנסו. יש לקרוא אותן לפני ההחלה הראשונה על פרודקשן.
