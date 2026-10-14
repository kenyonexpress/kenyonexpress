# סביבת תצוגה מקדימה לכל Pull Request

נכתב 2026-10-14 (‏STEP 70). כל עובדה כאן נמדדה באותו יום דרך ה-API של ‏Vercel
ושל ‏Supabase, ומסומנת ככזאת. מה שלא נמדד מסומן כ"מתוכנן".

## מה קיים היום, בלי הקובץ הזה

- **‏Vercel כבר בונה כל PR.** הפרויקט `kenyonexpress-prod`
  (‏`prj_keQjjnDoTb41AYmHy3ia59BKumyt`, ‏`productionBranch=main`) מחובר
  לריפו דרך האפליקציה של ‏Vercel ב-GitHub, ‏`previewDeploymentsDisabled` לא
  מוגדר בו, ולכן כל דחיפה לכל ענף נבנית כ-preview. הפרויקט שמשרת את הדומיין,
  `kenyonexpress` (‏`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`), הוא עם
  `previewDeploymentsDisabled=true` ו-`productionBranch=audit/final-audit`, ולא
  נוגעים בו.
- **הבוט של ‏Vercel כבר מגיב.** ‏`gitComments.onPullRequest=true` בשני
  הפרויקטים. ב-PR ‏#72 יש תגובה של ‏`vercel[bot]` עם טבלת הפרויקטים ו-check
  בשם "‏Vercel – kenyonexpress-prod".
- **וה-preview נכשל בכל דחיפה.** סביבת ה-preview של ‏`kenyonexpress-prod`
  מחזיקה רק ‏`NEXT_PUBLIC_SUPABASE_URL` ו-`NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  ‏`/account/referrals` עובר ‏prerender דרך ‏`lib/supabase/admin.ts`, שזורק
  "‏Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY". לוג הבנייה של
  ‏`dpl_4vqZfEhUdvZ7aE6GY6YBpqu33hpa` (‏14.10, ענף ‏`l10/row4-infinite-scroll`)
  מסתיים בדיוק בזה.
- **‏Supabase הוא ‏Pro ו-branching מופעל.** הארגון ‏`izakjexsygwjsueamxuq`
  מחזיר ‏`plan: pro`; ‏`GET /v1/projects/ixvwfbuvfxxsjiywhbbb/branches` מחזיר
  שני ענפים: ‏`main` (ברירת מחדל) ו-`staging` (‏`sjojzzppqhjxvjlvnwdb`, קבוע,
  ‏`with_data=true`, נוצר ‏08.10). ‏`ARCHITECTURE-PRODUCTION-OPS.md` כתב
  שאין ‏branching כי התוכנית חינמית; זה כבר לא נכון, ושם נוסף תיקון מתוארך.

## ההחלטה

התיקון הקל, להעתיק את ‏`SUPABASE_SECRET_KEY` של פרודקשן לסביבת ה-preview,
**נדחה**. ה-preview הוא דף שכל מי שיש לו קישור ל-PR יכול לגלוש בו, והמפתח
הסודי עוקף ‏RLS. ‏preview ירוק שקורא וכותב לפרודקשן גרוע מ-preview אדום.

במקום זה, **מסד נתונים לכל PR**: ענף ‏Supabase בשם ‏`pr-<מספר>`, שמשתני
הסביבה שלו נכתבים ל-Vercel כ-preview env **מסונן לענף ה-git של ה-PR** (השדה
‏`gitBranch` של ‏Vercel), כך שאף ענף אחר לא רואה אותם; ‏deploy חוזר של ראש
ה-PR דרך ‏`gitSource`, כי הבנייה שהדחיפה הפעילה כבר רצה בלי המשתנים; המתנה
ל-`READY`; ו-alias קבוע ‏`kenyonexpress-prod-pr-<מספר>.vercel.app` שנשאר
אותו דבר בין דחיפות. בסגירת ה-PR, מיזוג או ביטול, הכול נמחק.

### למה ‏`with_data: true`

ענף שנוצר דרך ה-API בלי ‏Git integration **לא** מריץ את ‏`supabase/migrations`.
וגם אם היה מריץ: התיקייה הזאת לא מתארת את פרודקשן (‏`MIGRATION-REVIEW.md`,
שושלת ‏pre-059). הצורה היחידה של ענף שמשחזרת את החנות היא עותק של ההורה,
סכימה ושורות, וזה ‏`with_data: true`, אותה הגדרה שיש ל-`staging`. בפרודקשן
אין הזמנות של לקוחות (‏`INDEX.md`: "‏No customer has ever bought anything",
ארבע ההזמנות הן ‏fixtures), ולכן מה שמשוכפל הוא קטלוג וקבועי בדיקה. ביום
שזה ישתנה, המשתנה ‏`PREVIEW_SUPABASE_WITH_DATA=false` בריפו מכבה את זה
בלי שינוי קוד, והענפים יהיו סכימה ריקה (וה-preview חסר תועלת עד שתהיה
דרך לזרוע אותם).

### למה לא ה-Git integration של ‏Supabase

היא יוצרת ענף לכל PR לבד ומריצה עליו ‏`supabase/migrations`, בדיוק המסלול
שלמעלה נדחה. בנוסף היא לא יודעת לכתוב משתני סביבה מסוננים לענף ב-Vercel,
ולכן גם איתה היה צריך את החצי השני של ה-workflow.

## המימוש

| קובץ | מה הוא עושה |
|---|---|
| `.github/workflows/preview.yml` | שתי עבודות: ‏`provision` על ‏opened / synchronize / reopened, ‏`teardown` על ‏closed; גם ‏`workflow_dispatch` עם מספר ‏PR ופעולה. ‏concurrency לכל ‏PR, שלא מבטל ‏teardown שבאמצע. |
| `scripts/preview/supabase-branch.mjs` | ‏`ensure --pr N --git-branch B`: מוצא או יוצר את ‏`pr-N` (‏`POST /v1/projects/{ref}/branches`), ממתין ל-`ACTIVE_HEALTHY` (‏`GET /v1/branches/{id}`), קורא את המפתחות (‏`GET /v1/projects/{branch_ref}/api-keys?reveal=true`, חדשים ‏`sb_publishable_`/`sb_secret_` לפני ‏legacy), מסווה אותם ב-`::add-mask::`. ‏`teardown --pr N`: מוחק, ומסרב לפי שם לכל ענף שהוא ‏`is_default`, ‏`persistent` או לא ‏`pr-<n>`. |
| `scripts/preview/vercel-preview.mjs` | ‏`wire`: ‏`POST /v10/projects/{id}/env?upsert=true` עם שלושת המשתנים על ‏`target: ["preview"]` ו-`gitBranch`; ‏`POST /v13/deployments` עם ‏`gitSource` ובלי ‏`target` (זה מה שעושה אותו ‏preview); המתנה ל-`READY`; ‏`POST /v2/deployments/{id}/aliases`. ‏`teardown`: מוחק רק רשומות ‏env עם ‏`gitBranch` זהה ואחד משלושת המפתחות, לעולם לא רשומה כלל-פרויקטית; מסיר את ה-alias (‏404 אינו שגיאה). המפתחות עוברים ב-env ולא ב-argv. |
| `scripts/preview/comment.mjs` | תגובה דביקה אחת לכל ‏PR, מזוהה לפי ‏`<!-- ke-preview-bot -->`, נערכת במקום. עברית, ‏`dir="rtl"`. ארבעה מצבים: ‏ready, ‏failed (עם שלוש שורות הלוג האחרונות אחרי ‏redact של ‏tokens ומפתחות), ‏skipped (עם שמות הסודות החסרים), ‏torn-down (כל חצי בנפרד). התגובה של ‏`vercel[bot]` נשארת לידה. |
| `src/__tests__/preview-deployments-wiring.test.ts` | מצמיד את הצורה של ה-workflow כטקסט: אין ‏`secrets.` ב-`if:`, ‏concurrency לא מבטל ‏closed, שני ‏continue-on-error ב-teardown ואז אדום, המפתחות ב-env, ההרשאות ‏`pull-requests: write` בלבד. |

הטסטים של הסקריפטים ב-`scripts/preview/*.test.mjs` (רשומים ב-`vitest.config.ts`).

## מה נדרש כדי שזה ירוץ

שני סודות בריפו, ושניהם **לא מוגדרים** נכון ל-14.10 (‏`gh secret list` מחזיר
רק ‏`CRON_SECRET`). עד שיוגדרו, שתי העבודות מכריזות על הדילוג ויוצאות ירוקות,
והתגובה ב-PR אומרת מה חסר.

| סוד / משתנה | סוג | מה הוא | איך מייצרים |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | secret | ‏Personal access token (‏`sbp_...`) על הארגון ‏`kenyonexpress` | ‏Supabase Dashboard ← ‏Account ← ‏Access Tokens. הטוקן שה-CLI המקומי מחזיק בקיצ'יין עובד, אבל עדיף טוקן נפרד בשם ‏`github-preview` שאפשר לבטל לבד. |
| `VERCEL_TOKEN` | secret | טוקן צוות עם ‏env:write ו-deployments:write על ‏`kenyonexpress-projects` | ‏Vercel ← ‏Settings ← ‏Tokens. אותו סוד ש-`deploy-promote.yml` ו-`auto-rollback.yml` כבר ממתינים לו. |
| `SUPABASE_PROJECT_REF` | var, אופציונלי | ברירת מחדל ‏`ixvwfbuvfxxsjiywhbbb` | |
| `VERCEL_ORG_ID` | var, אופציונלי | ברירת מחדל ‏`team_TUMTPVDP8218QHwedSjmgJWl` | |
| `VERCEL_PREVIEW_PROJECT_ID` | var, אופציונלי | ברירת מחדל ‏`prj_keQjjnDoTb41AYmHy3ia59BKumyt` (‏`kenyonexpress-prod`). **לא** ברירת המחדל של ‏`scripts/deploy/vercel.mjs`, שהיא ‏`kenyonexpress-web` הנטוש. | |
| `PREVIEW_SUPABASE_WITH_DATA` | var, אופציונלי | ברירת מחדל ‏`true` | ‏`false` ביום שיהיו נתוני לקוחות אמיתיים בפרודקשן |

```bash
gh secret set SUPABASE_ACCESS_TOKEN   # מדביקים sbp_...
gh secret set VERCEL_TOKEN
gh workflow run preview.yml -f pr=72 -f action=provision   # ריצה ראשונה ידנית על PR פתוח
```

## עלות ומה קורה אם ‏teardown לא רץ

ענף ‏Supabase מחויב לפי שעות מחשוב (‏Micro, סדר גודל של ‏$0.01 לשעה). ‏PR
שנסגר מפעיל ‏`teardown`; ‏PR שנשאר פתוח שבוע עולה כשני דולר. אם ‏teardown
נכשל, העבודה אדומה והתגובה ב-PR אומרת איזה חצי נשאר. ניקוי ידני:

```bash
TOKEN=...   # sbp_
curl -s -H "Authorization: Bearer $TOKEN" https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/branches \
  | jq -r '.[] | select(.name|test("^pr-")) | "\(.name)\t\(.id)\t\(.created_at)"'
# ואז, לכל ענף pr-* שה-PR שלו סגור:
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" https://api.supabase.com/v1/branches/<id>
```

או ‏`gh workflow run preview.yml -f pr=<n> -f action=teardown`, שעושה את זה
ואת צד ‏Vercel יחד.

## מה **לא** נעשה כאן, בכוונה

- לא שונה אף פרט בפרויקט ‏`kenyonexpress` שמשרת את הדומיין; ‏previews שם
  נשארו כבויים.
- לא נכתב שום מפתח של פרודקשן לסביבת ‏preview.
- לא נוצר ענף ‏Supabase מהמחשב הזה; הסקריפטים נבדקו רק מול ‏fetch מזויף,
  והריצה הראשונה האמיתית תהיה ב-Actions אחרי שהסודות יוגדרו.
- ‏`e2e-preview` ב-`ci.yml` לא שונה. הוא מוצא את ה-deployment דרך רשומות
  ה-GitHub Deployments שהאפליקציה של ‏Vercel יוצרת, וה-redeploy כאן עובר
  באותו ‏gitSource, ולכן גם הוא מקבל רשומה כזאת. השער שלו (‏`CI_SUPABASE_URL`)
  נשאר, כי הוא שער על "האם ל-CI מותר לגעת במסד נתונים", ועם ענף פר ‏PR יש
  סוף סוף מסד נתונים שמותר לגעת בו; לפתוח אותו הוא צעד נפרד.
