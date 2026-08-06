# GITHUB-SETTINGS.md

הגדרות GitHub שאי אפשר לבצע מהקוד, ושאתה מבצע ידנית ב-UI.

Status: **ACTIONABLE** · 2026-08-07 · repo `kenyonexpress/kenyonexpress`
Scope: docs only. שום סעיף כאן לא מבוצע על ידי סוכן; כולם דורשים הרשאת admin ב-GitHub.

---

## 0. מה כבר עובד, ולמה זה משנה לפני שאתה נוגע בהגדרות

**ה-CI כבר מריץ את ארבעת השערים על כל push.** `.github/workflows/ci.yml` קיים
ורץ על `push` ל-`main`, ‏`phase5/homepage` ו-`cursor/add-supabase-3c830`, וגם על
כל `pull_request` ל-`main`. ארבע העבודות:

| job | שם התצוגה (זה השם שתסמן כ-required) | מה מריץ |
|---|---|---|
| `lint` | `Lint (changed files)` | `pnpm lint:changed` + `pnpm lint` לא-חוסם |
| `typecheck` | `Typecheck` | `pnpm type-check` |
| `test` | `Unit tests + money coverage floors` | `pnpm test:coverage` |
| `build` | `Build` | `pnpm build` (תלוי בשלושת הקודמים) |
| `e2e` | `E2E (Playwright)` | מדלג בשקט כל עוד `CI_SUPABASE_URL` לא מוגדר |

**המסקנה המעשית: אין צורך לכתוב workflow חדש.** מה שנשאר הוא שני דברים
שהקוד לא יכול לעשות בעצמו: להפוך את השערים למחייבים ב-GitHub, ולסגור פרצה
אחת שנמדדה.

---

## 1. הפרצה שנמדדה: יש כלל, והוא נעקף

כשנדחף קוד ל-`main` ב-06.08, השרת ענה:

```
remote: Bypassed rule violations for refs/heads/main:
remote: - Changes must be made through a pull request.
```

כלומר **כבר קיים ruleset שדורש PR ל-`main`, והדחיפה עברה בכל זאת** דרך הרשאת
bypass. כלל שנעקף בשקט גרוע מכלל שלא קיים: הוא מייצר תחושה שהענף מוגן בזמן
שכל דחיפה ישירה מצליחה ורק מדפיסה שורה שאיש לא קורא.

**זה הסעיף הראשון לטפל בו** (‏1.3 למטה), ולא הוספת שערים חדשים.

---

## 2. מה לעשות, לפי סדר

### 2.1 להפוך את ארבעת השערים ל-required

```
https://github.com/kenyonexpress/kenyonexpress/settings/rules
```

‏Rulesets ← הכלל הקיים על `main` ← Edit. תחת **Require status checks to pass**:

הוסף בדיוק את ארבעת השמות האלה, **מילה במילה**:

```
Lint (changed files)
Typecheck
Unit tests + money coverage floors
Build
```

**המלכודת:** ‏GitHub מזהה check לפי **שם התצוגה** (`name:` של ה-job), לא לפי
מזהה ה-job. אם תקליד `lint` או `typecheck` הוא ייצור דרישה לבדיקה שלא קיימת,
היא לעולם לא תדווח, וכל PR ייתקע ב-"Expected — Waiting for status to be
reported" לנצח. השמות למעלה הועתקו מ-`ci.yml` כפי שהם.

סמן גם **Require branches to be up to date before merging**. בלי זה שני PR-ים
ירוקים בנפרד יכולים להישבר יחד אחרי המיזוג.

**אל תסמן `E2E (Playwright)` כ-required.** היא מדלגת בכוונה כל עוד סודות
Supabase לא מוגדרים (סעיף 2.4), ובדיקה חובה שאף פעם לא מדווחת חוסמת כל מיזוג.

זמן: ‏5 דקות.

### 2.2 להפוך את repo-wide lint לחוסם

זה שינוי קוד ולא הגדרה, ולכן הוא **לא שלך** אלא של הסוכן שעל main. נרשם כאן כי
הוא חלק מאותה החלטה.

‏`ci.yml` מריץ היום `pnpm lint` על כל הריפו עם `continue-on-error: true`,
וההערה שם מסבירה למה: "‏a repo-wide `pnpm lint` reports 45 pre-existing errors".

**הנימוק הזה כבר לא נכון. נמדד ב-06.08:**

```
$ pnpm lint
Checked 681 files in 201ms. No fixes applied.
```

אפס שגיאות. החוב שולם, ולכן `continue-on-error` יכול לרדת וה-lint המלא יכול
להיות שער אמיתי. כל עוד הוא נשאר לא-חוסם, השורה הבאה שתישבר לא תעצור כלום.

### 2.3 לדרוש PR ולאסור דחיפה ישירה

באותו ruleset:

- **Require a pull request before merging** — כבר מוגדר, ראה סעיף 1.
- **Required approvals: 0.** אתה עובד לבד; דרישת מאשר אחד תנעל אותך מחוץ לריפו
  שלך. ה-PR קיים כאן כדי להריץ את הבדיקות, לא כדי להביא דעה שנייה.
- **Block force pushes** — סמן.
- **Restrict deletions** — סמן.

### 2.4 להסיר את ה-bypass מעצמך

```
https://github.com/kenyonexpress/kenyonexpress/settings/rules
```

בכלל של `main`, תחת **Bypass list**: הסר את `Repository admin` / `Organization
admin`, או הורד ל-`Pull requests only`.

**זה הסעיף היחיד כאן שמשנה משהו בפועל.** כל השאר מוסיף שערים; זה מה שגורם להם
לחסום אותך במקום להדפיס אזהרה. שים לב שאחרי זה **גם הסוכנים לא יוכלו לדחוף
ישירות ל-`main`**, וזו הכוונה, אבל זה משנה את זרימת העבודה האוטונומית: הם
יצטרכו לעבוד ב-branch ולפתוח PR.

זמן: ‏2 דקות. תלות: אחרי 2.1, אחרת תחסום את עצמך משערים שעדיין לא מוגדרים.

### 2.5 סודות ה-CI

```
https://github.com/kenyonexpress/kenyonexpress/settings/secrets/actions
```

| Secret | לְמה משמש | מה קורה בלעדיו |
|---|---|---|
| `CI_SUPABASE_URL` | job `build` ו-`e2e` | ‏E2E מדלג עם warning; ה-build רץ בלי DB |
| `CI_SUPABASE_ANON_KEY` | אותו דבר | אותו דבר |
| `CI_SUPABASE_SECRET_KEY` | אותו דבר | אותו דבר |

**המלצה: פרויקט Supabase נפרד ל-CI, לא הפרודקשן.** ה-E2E קונה, סורק ומממש
שוברים; הרצה מול הפרודקשן תזהם את הנתונים האמיתיים בהזמנות בדיקה.

אחרי שהסודות קיימים, אפשר להוסיף גם את `E2E (Playwright)` ל-required.

זמן: ‏15 דקות, פלוס הקמת פרויקט Supabase ל-CI.

---

## 3. סדר ביצוע ותלויות

```
2.1  required checks       ─┐
2.3  require PR             ├─► 2.4  הסרת bypass   (רק אחרי ששלושתם עומדים)
2.2  lint חוסם (סוכן main) ─┘

2.5  סודות CI  ──►  הוספת E2E ל-required   (עצמאי, בכל זמן)
```

**אל תבצע את 2.4 ראשון.** הסרת ה-bypass לפני שהשערים מוגדרים משאירה אותך עם
ענף שדורש PR בלי בדיקות שירוצו עליו, וזו כל העלות בלי שום תועלת.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-07 | נכתב. נמדד: ה-CI כבר מריץ את ארבעת השערים; ה-ruleset קיים ונעקף; `pnpm lint` נקי ולכן `continue-on-error` מיותר |
