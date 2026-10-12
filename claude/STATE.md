# KenyonExpress — Project State

Updated: 2026-10-13 01:02 (Asia/Bangkok) | **🟢 Autonomous Opus loop active**

## Current Position
**המשך מ: שלב 2 (KEN-8 parity על product / category / cart / checkout)**

## What's Running
- Claude Code with Opus 5.5 on /goal (bypass permissions on)
- Dev server: PM2 on port 3311 (OR pnpm start)
- LaunchAgent com.kenyonexpress.autoloop every 6h
- caffeinate active
- ntfy monitoring to iPhone every 2h

## Stop Criteria (iron rules)
- NEVER apply migrations without human approval
- NEVER push --force
- Max 3 build retries per step
- Quota exhausted: write resume point here, stop

## Stage 1 Detail
Verify refs/electro_v7_*.png are captured from electro.madrasthemes.com (NOT kenyonexpress.co.il live). If missing or wrong source: run scripts/capture-electro.mjs. Then compare.mjs on home/product/category at 380/768/1440. Target < 11% per width. Fix via Tailwind token diffs only. Commit per page.

## Blockers (do NOT attempt autonomously)
- Cardcom production credentials
- Migration apply to production (audit only, no apply)
- R2 configuration
- Vercel Pro upgrade

## Last Known Good
- Server: localhost:3311 returns 200
- Meilisearch: ok
- Build: BUILD_ID valid (Oct 13 00:48)

## Stage 1: סגור (13.10, ענף fix/ken-8-electro-v7-baseline)

נמדד, לא הונח:
- `refs/electro_v7_{380,768,1440}.png` צולמו מ-electro.madrasthemes.com/home-v7/ על ידי `scripts/capture-electro-baseline.mjs`. 118 תמונות, 0 שבורות, בכל רוחב. ה-hash-ים ב-`docs/PARITY-REFERENCE.md`.
- `compare.mjs` בלי דגלים משתמש עכשיו ב-baseline הזה (`scripts/parity-baseline.mjs`). קודם כל ריצה סירבה ב-exit 5.
- דף הבית, build טרי על Next 16.3.8: **10.93 / 10.61 / 7.81** ב-380 / 768 / 1440. עובר.
- `pnpm test` 5913 עברו, `type-check` ו-`lint` נקיים. חמישה טסטים ב-`scripts/*.test.mjs` לא רצו בכלל עד היום (לא היו ב-include של vitest). נוספו, כולם ירוקים.

מה שהמספר לא אומר:
- המספר המדורג הוא "both painted". ההפרש הכולל הוא 41% / 40% / 29%.
- ב-380 הדף שלנו גבוה פי 2.09 מהתבנית (18377 מול 8792), וב-768 פי 1.73. השער עצמו מדפיס "NOT a pixel gate" וכותב PASS.
- 380 עובר עם מרווח של 0.07 נקודה.

## החלטות שהתקבלו אוטומטית

1. **ה-PNG לא נכנסו ל-git.** `docs/REFS-POLICY.md` אוסר baseline מחויב. הסקריפט מייצר אותם מחדש בפקודה אחת.
2. **ל-cart ול-checkout אין ברירת מחדל.** אין צילום של Electro עם שורה בעגלה. הם ממשיכים לסרב עד שלב 2.
3. **שלב 3 (מיגרציות) יהיה חזרה בלבד, BEGIN ו-ROLLBACK, בלי COMMIT.** הקובץ הזה ו-CLAUDE.md אוסרים החלה על פרודקשן בלי אישור, והם גוברים על נוסח ה-goal.
4. **השרת שרץ על 3311 הוחלף.** הוא נבנה על Next 16.3.6 לפני ש-main עלה ל-16.3.8. נעצר לפי PID, נבנה מחדש והופעל.
5. **CLAUDE.md לא נערך.** הוא עדיין מפנה ל-`refs/ke_live_singlefile.html`, קובץ שלא קיים. זו שורה של אופיר.

## Stage 2: בעבודה (13.10)

PR #61 (שלב 1) מוזג ל-main, כל הבדיקות ירוקות.

דף מוצר, מול `refs/electro_product_{width}.png`: **5.53 / 3.98 / 2.11**. עובר.
**המספר הזה לא אומר שהדף דומה לתבנית.** הדף שלנו קצר מ-2600px בכל רוחב, של Electro 7653 עד 11181. ההפרש הכולל 33% / 27% / 17%. לדף שלנו אין לשוניות תיאור / מפרט / ביקורות, ואין שורת חיפוש ב-header.

באג אמיתי שנמצא בעין ולא בשער, ותוקן (ענף fix/pdp-related-heading-overlap):
- הכותרת "מומלצים" התחילה 20px מעל תחתית בלוק הפרטים בכל מוצר ובכל רוחב, וב-1440 נצבעה על שורת "זמני האספקה". הסיבה: `margin-top: -20px` שכוון ל-reference שכבר לא קיים.
- עכשיו 40px רווח, נמדד על שני מוצרים בשלושה רוחבים. נוסף טסט E2E שנכשל אם הכותרת עולה שוב על הבלוק.

פתוח בשלב 2:
- category: השער מסרב, תמונה מקומית אחת לא נטענת (ידוע: `/_next/image` עונה 404 מקומית עם ה-loader המותאם).
- cart ו-checkout: אין צילום Electro עם שורה בעגלה.

## ⚠️ ממצא שחוסם את שלבים 3 עד 13: פרודקשן לא רץ על main (13.10, נמדד)

- `vercel inspect www.kenyonexpress.co.il`: ה-deployment החי נבנה מהענף **`audit/final-audit`**, commit `1e84df0e5`, ב-12.10 23:49, דרך ה-CLI.
- `main` נמצא **1,242 commits מאחורי** הענף הזה ו-122 לפניו. הפער ב-`src/`: 1,395 קבצים, 102,505 שורות נוספות.
- **שני הענפים מחזיקים שני יומני מיגרציות שונים מול אותו DB.** ב-main הקובץ 211 הוא `whatsapp_selfservice`. ב-`audit/final-audit` הקובץ 211 הוא `subscriptions_phase2`. גם 235 עד 242 קיימים רק ב-main.
- ב-main חסרות 43 תמונות מוצר שקיימות בפרודקשן (56 מול 99). זו הסיבה ששער ה-category מסרב מקומית: `/images/products/Free-Photo-_-Client-doing-hair-cut-...webp` עונה 404 על main ו-200 בפרודקשן.
- באג החפיפה של "מומלצים" קיים גם בפרודקשן (אותו `margin-top: -20px`). PR #63 הוא ה-port, **draft, לא ממוזג**, כי push לענף הזה הוא deploy לפרודקשן.

### החלטה שהתקבלה אוטומטית

**לא נבנים פיצ'רים חדשים על main (שלבים 7 עד 10) ולא מוחלת אף מיגרציה, עד שאופיר מכריע איזה ענף הוא קו השחרור.** בנייה על main היא בנייה על בסיס שחסרות בו 102 אלף שורות שכבר חיות בפרודקשן, וחלק מהפיצ'רים שברשימה כנראה כבר קיימים שם. החלת 211 של main על DB שבו 211 של הענף השני אולי כבר רץ היא סיכון שאי אפשר לבטל.

מה כן ממשיך: עבודה שתקפה לשני הענפים. תיקוני באגים קטנים שנמדדו, ובדיקת קריאה בלבד של מצב ה-DB מול הקבצים הממתינים.

