# אבטחה: המפה (‏SECTIONS 81)

נמדד ‏22.09.2026. המסמך הזה הוא האינדקס: תשעת הפריטים של הסעיף, מה קיים,
איפה, ומה הוחלט לא לבנות. הניתוח המלא ב-`SECURITY-POSTURE.md`, מודל ההרשאות
ב-`AUTH-MODEL.md` ו-`DB-SECURITY-MODEL.md`, הסודות ב-`SECRETS-ROTATION.md`,
ההונאה ב-`FRAUD-RULES.md`.

## 1. הסעיף, שורה מול מה שיש

| מה הסעיף ביקש | מצב | הראיה |
| --- | --- | --- |
| ‏CSP עם ‏nonce | **CSP סטטי, בלי ‏nonce, בהחלטה** | ‏`next.config.ts` + ‏`lib/security/frame-policy.ts`. ‏nonce דורש יצירה ב-proxy והזרקה ל-13 ‏`dangerouslySetInnerHTML` ‏(‏JSON-LD, אנליטיקה); הכותרת מוחלפת רק בשני נתיבי ההחזרה של ‏Cardcom, שחייבים להיות ‏framable. |
| ‏HSTS | **יש** | ‏`max-age=63072000; includeSubDomains; preload` |
| ‏COOP / ‏CORP | **נוסף ‏22.09** | ‏`same-origin-allow-popups` ‏(פופאפ ‏Google), ‏`same-site` ‏(תצוגות ‏vercel.app). בלי ‏COEP: ‏`require-corp` היה חוסם את מסגרת התשלום. |
| ‏`pnpm audit` ב-CI | **יש** | ‏`security.yml`, ‏`scripts/audit-gate.mjs`, נכשל על ‏high/critical שניתן לתקן |
| ‏gitleaks | **יש** | ‏`security.yml`, כל ההיסטוריה, בינארי ‏8.28.0 |
| ‏pgTAP לכל טבלה × תפקיד | **מטריצה נמדדת במקום ‏pgTAP** | ‏`supabase/rls-role-matrix.json` ‏(‏98 טבלאות × ‏6 תפקידים, מפרודקשן, בטרנזקציות מגולגלות), ‏`scripts/rls-role-matrix.mjs`, ‏`src/lib/auth/rls-role-matrix.test.ts`. ראה ‏§2. |
| ‏OWASP ZAP baseline ב-CI | **נוסף ‏22.09, לא הורץ מכאן** | ‏`security.yml` ‏job ‏`zap-baseline`, שבועי ו-dispatch, ‏`.zap/rules.tsv`. אין הרשאות ‏GitHub על המכונה; הריצה הירוקה הראשונה היא ההוכחה. |
| אימות ‏env עם ‏zod בעלייה | **יש** | ‏`src/lib/env.ts` ‏(‏`safeParse` ומסרב לעלות בפריסה), נטען מ-`instrumentation.ts` |
| ‏runbook לרוטציית מפתחות | **יש** | ‏`docs/SECRETS-ROTATION.md`, ‏`docs/RUNBOOK.md` §"Rotating the Supabase anon key" |

## 2. המטריצה במקום ‏pgTAP

‏pgTAP רץ בתוך מסד; למכונה הזאת אין מסד מקומי שאפשר להריץ ‏(‏Docker נתקע,
‏`docs/DB-RESTORE-RUNBOOK.md`), והמסד המאוחסן הוא היחיד עם המדיניות
האמיתית. הסקריפט שואל אותו את שאלת ‏pgTAP: לכל תפקיד, ‏`SET LOCAL ROLE`
ותביעות ‏JWT של סשן אמיתי, ‏`count(*)` על כל טבלה ציבורית דרך פונקציה זמנית
שהופכת שגיאת הרשאה למילה ‏`denied`, ואז ‏ROLLBACK. הטסט מחזיק את הטענות
שחייבות להישאר נכונות בכל ספירה:

- ‏anon קורא ‏0 מכל טבלת כסף וזהות ‏(‏18 טבלאות ברשימה), ורואה רק קטלוג:
  מוצרים, ספקים, קטגוריות, דילים, היסטוריית מחירים, הפניות, אזורי משלוח.
- לקוח בלי הזמנות קורא ‏0 מהזמנות/תשלומים/שוברים/חשבוניות/ארנק/כרטיסים
  של כל אחד אחר, ורק את הפרופיל של עצמו.
- חבר ספק אינו רואה תשלומים, כרטיסים, חשבוניות או ארנק של לקוחות.
- אדמין קורא הזמנות, תשלומים ושוברים דרך ‏RLS; **חשבוניות וטוקני כרטיס לא**
  ‏(‏0 שורות): המסכים האלה רצים על ‏service role. נמדד ולא תוכנן; מדיניות
  "קריאת אדמין" עתידית תהפוך את שתי השורות בטסט, ובכוונה.

**שורה שנראתה כדליפה ונמדדה שוב:** חבר ספק רואה ‏23 מתוך ‏26 שורות
‏`order_items` בעוד הזמנותיו הן ‏13. נבדק באותה טרנזקציה: ‏23 שייכות לספק שלו,
‏0 לאחרים. הזמנה אחת מכילה כמה שורות, והמדיניות ‏(‏`is_supplier_member(supplier_id)`)
מסננת לפי הספק של השורה ולא של ההזמנה. לא דליפה.

## 3. מה לא נבנה, ולמה

- **‏nonce ל-CSP.** ‏`unsafe-inline` נשאר לסקריפט ולסגנון. המעבר ל-nonce +
  ‏`strict-dynamic` הוא שינוי בכל מקום שמזריק ‏HTML, ולא ‏"עוד כותרת". נרשם
  ב-`next.config.ts` מאז ‏INFRA-AUDIT.
- **‏COEP.** ‏`require-corp` דורש ‏CORP על כל משאב צד שלישי, ומסגרת ‏Cardcom
  אינה שולחת אותו.

## 4. לאמת מחדש

```
node scripts/rls-role-matrix.mjs     # מודד מחדש את המטריצה מפרודקשן
pnpm exec vitest run src/lib/auth/   # הטענות עליה, ועל המניפסט
node scripts/check-rls.mjs --from <json>
```
