RESUME FROM: W02
Updated: 2026-10-05 (סשן `audit/final-audit`, Fable 5.1, פריט W01 DONE: שורת
אייקוני ה-header נבנתה מחדש כ-Electro header-v8 בדיוק, שער parity 8.60 /
9.02 / 4.16 PASS ב-380/768/1440; M01-c96 ו-L02..L10 הועברו לארכיון; RESUME FROM
מצביע ל-W02, ואם אין W02 בתור, ההמשך הוא M02-c96)

## המשך מ:

**W01 - DONE (05.10.2026): HEADER ICONS EXACT ELECTRO. שורת האייקונים היא
`div.header-icons` של Electro header-v8 בדיוק, נמדדה מהדף החי; שער parity
8.60% / 9.02% / 4.16% PASS ב-380 / 768 / 1440.** `pwd` אומת, HEAD בהגעה
`6d93cd038`, עץ נקי. W01 לא הופיע ב-STATE.md, ב-BACKLOG או ב-`git log -20`,
לכן בוצע במלואו. **שלב 1, נמדד:** Playwright Chromium (אותו הקשר
אנטי-אוטומציה של `scripts/capture-electro.mjs`) על
`https://electro.madrasthemes.com/home-v7/` ב-1440, `getComputedStyle` על
`.header-icons`, `.header-icon`, `.header-icon i`, `.header-icon-counter`,
`.cart-items-total-price` וה-`dropdown-menu-user-account` פתוח, נכתב
ל-`refs/electro-header-icons.json` (14.9KB, `git add -f` כי `refs/` ב-gitignore
כמו ששת קבצי ה-json המחויבים שם). עיקר המספרים: אייקון 22.7031x40.4531,
גליף `font-electro` 22.8469px על שורה 20.5622, רווח 37.996px, צבע
rgb(51,62,72); מונה 20.9688 עגול, top 22.4688 / left 7, rgb(254,215,0),
11.991px/700; תפריט חשבון 220px, border-top 2px צהוב, radius 0 0 7px 7px,
צל 0 2px 5px rgba(0,0,0,.28), פנים 0 21px, 12px ממורכז, כפתור כניסה צהוב
3px 6px radius 4px 600; מחיר העגלה 15.988px/700 נמדד ומסומן
`rendered_here: false`. **שלב 2, חילוץ הגופן הצליח, אין fallback:**
`font-electro.ttf` (17,120 bytes) הורד מהתבנית, `pip install --user
fonttools` (4.60.2), `SVGPathPen` דרך `TransformPen` להיפוך y, שלושת
הגליפים n/g/r (`ec-shopping-bag`/`ec-favorites`/`ec-user`) נכתבו
ל-`src/components/icons/electro/{ShoppingBag,Favorites,User}.tsx` עם
viewBox של bbox הגליף ביחידות הגופן (1024/em) וגודל ברירת מחדל של אותו
bbox ב-22.8469px. **שלב 3, הבנייה מחדש:** `HeaderIcons.tsx` חדש הוא המקום
היחיד שמרנדר את השורה, ושני ה-headers (handheld ב-`Header.tsx`, masthead
ב-`MastheadNav.tsx`) טוענים אותו; סדר DOM מועדפים, חשבון, עגלה, כלומר
ב-RTL העגלה בקצה השמאלי (נמדד מקומית ב-1440: עגלה x135, חשבון x195.7,
מועדפים x256.3, רווח 38; ב-380: x15 / 57.7 / 100.4, רווח 20 לפי 42px pitch
של האתר החי); המונה הצהוב על העגלה בלבד, מוצג גם ב-0 כמו Electro,
`inset-inline-start: 7px` (מראה של `left: 7px`); **מחיר העגלה הוסר לגמרי**
מ-`CartNavLink.tsx` (אין `shekels`, אין `cart.subtotal`, אין
`total-price`); מונה המועדפים הוסר (ב-header-v8 יש מונה רק ל-compare
ולעגלה); `AccountMenu.tsx` חדש פותח את התפריט בסגנון Electro (hover + click
+ מקלדת, Escape, לחיצה בחוץ) עם "לקוח חוזר?" / התחברות -> `/login`
ו-"עדיין אין לך חשבון?" / הרשמה -> `/signup`, דרך הקטלוג (`nav.returningCustomer`,
`nav.noAccountYet`, `nav.headerActions` נוספו ל-he/en); **בחר אזור עבר
ל-TopBar ליד התחברות** עם `|` משלו ואותו שער `lg` שהיה לו, כך ש-380/768 לא
משנים wrap; הצבעים והאורכים המדויקים ב-`src/styles/header-icons.css` (מיובא
ב-`app.css`), ולא ב-tsx, בגלל שער ה-tokens. **החלטות שהתקבלו לבד:** (א)
`header-icons.test.ts` נכתב מחדש: הכלל הישן "שני אייקונים בלבד ואפס אייקון
חשבון" סתר את המשימה ישירות, הכלל החדש הוא השורה של Electro (3 פריטים
בסדר הזה, אין מחיר, שני ה-headers טוענים רכיב אחד, בחר אזור רק ב-TopBar,
`/login` רק ב-TopBar ו-AccountMenu); (ב) `TopBar.test.tsx` מצפה ל-4
מפרידים במקום 3; (ג) תקרת ה-i18n ירדה 627 -> 626 כי aria-label מילולי של
MastheadNav עבר לקטלוג; (ד) compare אינו פריט בשורת האייקונים כי אין פיצ'ר
השוואה, ואייקון שפותח כלום גרוע מרווח; (ה) שטח המגע 44px נשמר דרך
`::before` בלתי נראה כדי שהקופסה המצוירת תישאר 22.7. **מלכודת סביבה
שנמדדה:** ה-shell מזריק 30 שמות `[SENSITIVE]` ועוד ~40 ערכים אמיתיים
(`RESEND_API_KEY`, מפתחות Supabase זרים, `VERCEL_*`); ב-zsh `env $UNSET`
לא מפצל מילים ולכן ביטול ההזרקה לא פעל בכלל בשני ניסיונות (build נפל על
"Invalid API key", 7 בדיקות resend נפלו); `${=UNSET}` פתר הכל. **שערים:**
`pnpm type-check` exit 0; `pnpm lint` exit 0 (i18n 626/626, tokens, rtl,
docs-index 282 ללא שינוי); `pnpm test` 615/615 קבצים, 7347 עברו, 12 דולגו
(7359); build exit 0, `BUILD_ID` `NnvkKulrgOeCdWsxUvtkm`, 92 שורות
`supabase.rls_denied` על reviews (זהה ל-M01-c96). **השער, בחזית, שרת חדש על
3396 (`env ${=UNSET} PORT=3396 CARDCOM_USE_MOCK=true pnpm start`, חומם
פעמיים 200), `--baseline=refs/ke_live_W.png`, שלוש שורות חדשות
ב-`docs/UI-PARITY-REPORT.md` (`6d93cd038-dirty`):** 380: 8.60% PASS (overall
14.1%); 768: 9.02% PASS (overall 16.03%); 1440: 4.16% PASS (overall 15.46%).
דלתא מול M01-c96: +0.02 / +0.01 / 0.00, בתוך רעש הסקריפט; השורה החדשה
לא הזיזה אף רוחב. השרת על 3396 נסגר בסוף; השרת הזר על 3311 לא נגע.
**לא נעשה:** אין מיגרציה, אין שינוי env/DNS/Vercel, אין deploy ידני
(push לענף הוא פריסה אוטומטית לפי L02, וזה הכלל הקיים). קבצים:
`refs/electro-header-icons.json`, `src/components/icons/electro/*`,
`src/components/layout/{HeaderIcons,AccountMenu,MastheadNav,Header,TopBar,RegionMenu}.tsx`,
`src/components/cart/{CartNavLink,HeaderCart}.tsx`,
`src/components/wishlist/WishlistNavLink.tsx`, `src/styles/header-icons.css`,
`src/app/app.css`, `messages/{he,en}.json`, `scripts/hebrew-literal-scan.mjs`,
שתי בדיקות, `STATE.md`, `docs/STATE-ARCHIVE.md`, `docs/UI-PARITY-REPORT.md`.

**M01-c96 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-W01): שער parity של `/` נמדד שוב מול build מקומי על 3396, 8.58 / 9.01 /
4.16 PASS ב-380/768/1440, אפס שינוי קוד, ארבעת השערים ירוקים.

**L12 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-M01-c96): שער 12 הכרעה; 7 DONE ו-4 BLOCKED (L06/L08/L09/L11, כולם env או
אישור של אופיר), LAUNCH-READY: pending-cardcom, אין tag `v1.0.0-mvp`, אין
`LAUNCH.flag`, אפס שינוי קוד, ארבעת השערים ירוקים.

**L11 - BLOCKED cardcom-creds (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md`
(הועבר ב-L12): שער 11 Cardcom; ארבעת ערכי `CARDCOM_*` ב-Vercel Production
הם Sensitive ואינם נקראים, נוצרו ב-04.10 בערב על ידי סשן ענן "כדי לעבור את
ה-preflight", אין אישור אמיתי או סנדבוקס במכונה, ולפרודקשן אפס תשלומים
לא-mock מאז ומעולם; אפס שינוי קוד, אפס כתיבה לפרודקשן. אופיר בלבד.

**M18-c95 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md`
(הועבר ב-L02): STATE.md עמד על 216 שורות, M17-c95 הועבר לארכיון, מחזור c95
(18 פריטים) נסגר, אפס שינוי קוד, ארבעת השערים ירוקים.

**M17-c95 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md`
(הועבר ב-M18-c95): RTL/LTR אומת על `/` ושלושת סלאגי הדגימה
ב-380/768/1440, 12/12 PASS, אפס leak, אפס דריפט מ-M17-c94, אפס שינוי קוד.

**M16-c95, M15-c95, M14-c95, M13-c95, M12-c95, M11-c95, M10-c95, M09-c95, M08-c95, M07-c95, M17-c94, M16-c94, M15-c94, M12-c94, M09-c94, M08-c94,
M07-c94, M06-c94, M05-c94, M10-c94** וכל מה שקדם להם (M04-c94..M01-c94,
M18-c93..M03-c93, ועד M01-c55) מתועדים במלואם ב-`docs/STATE-ARCHIVE.md`,
החדש למעלה; כולם DONE עם אפס דריפט וארבעת השערים ירוקים. ההעברות נעשו
שלב-שלב (האחרונה: M17-c95 ב-M18-c95) לשמירה על תקרת 300 שורות; שום
שורה לא נמחקה מהארכיון, רק הוסרה כאן הכפילות.

**DEPLOY-UNBLOCK - RESOLVED ב-L01 (05.10.2026).** פרודקשן מגיש `e1719ad66`
(`dpl_FxGwtE5H6hw4L9ccU4yJNYmuhVni`), ראו L01 למעלה. ההיסטוריה שמתחת
נשמרת כפי שהייתה. הרשומה המקורית, עד M14-c95: הרשומה
המקורית (04.10) אמרה: חסרים שלושה משתני Cardcom ב-Production ו-`ALLOW_INCOMPLETE_ENV`
קיים. **שניהם נסגרו על ידי סשן מקביל ב-04.10** (M14-c94, M14-c95). החוסם
הנוכחי הוא קוד: `39eb43947` הוסיף `refs` ל-`.vercelignore`, ולכן כל
פריסת HEAD נופלת ב-`pnpm build` על `refs/electro-checkout-text.json`
(חמש פריסות ERROR ב-04.10, לוג ב-M14-c95 למעלה). תיקון של שורה אחת
יושב לא-מחויב בעץ של סשן מקביל. פרודקשן READY עדיין `main@18ed044b2`
(`dpl_2zzvvFGMoS5icgrgL94er8USKwsj`, 02.10), 1162 קומיטים מאחורי HEAD.
**לאופיר/לסשן המתקן:** לחייב את תיקון `.vercelignore`, ואז deploy
`target: production` מ-`audit/final-audit`. ההיסטוריה המלאה של הרשומה
ב-`docs/STATE-ARCHIVE.md` (M14-c95).

**M14-c73 - נסגר בפועל ב-L01 (05.10.2026)**: הפריסה הזרה הוחלפה בפריסת HEAD
מהתור. מקור ההחלפה של 02.10 עדיין לא ידוע. הרשומה המקורית: production הוחלף חי מחוץ
לתור (`main`@`18ed044b2`, `SENTRY_DSN` חדש), מקור לא ידוע, לא תוקן/
הוחזר, פורט מלא ב-`docs/BACKLOG.md` סעיף 17 (ארכיון מלא, שבעת
הממצאים, ב-`docs/STATE-ARCHIVE.md`). נבדק שוב בכל סבב עד M14-c80
(למעלה): אפס דריפט, אותה פריסה בדיוק, ממתין להחלטת אופיר.

**כל סעיף מ-M18-c58 ועד M01-c55** (כולל M17-c58..M01-c58, M18-c57..M08-c57,
M06-c57..M01-c55, M18-c55..M01-c56, M16-c55..M13-c55, M07-c55, M03-c55..
M01-c55) היה מסומן כאן "ארכיון מלא ב-`docs/STATE-ARCHIVE.md`" וכווץ לשורה
הזו במספר שלבים (M04-c59, M08-c58) לשמירה על תקרת 300 שורות — שום שורה
לא נמחקה מהארכיון עצמו, רק הוסרה כאן הכפילות. ההיסטוריה המלאה (Q01..Q24,
B01..B10, M01-c1..M15-c56, תור 23.09, וכל מה שקדם) נשארת שלמה, החדש
למעלה, ב-`docs/STATE-ARCHIVE.md`. הקובץ הזה מחזיק רק את מה שחי.

## טבלת מצב לתור `final-queue.txt`

התור נסגר (B10 היה האחרון). כל השורות (Q01..Q24, B01..B10, M01-c1..M09-c1,
M11-c51..M15-c52) הועברו ל-`docs/STATE-ARCHIVE.md` ב-M14-c53 לשמירה על
תקרת 300 שורות; שום שורה לא נמחקה, רק הוזזה. **LAUNCH-READY: pending-cardcom (L12, 05.10.2026; L06/L08/L09 BLOCKED גם).**
SHOWABLE: no, ראו "חוסמים
פתוחים" למטה.

## חוסמים פתוחים (לא בידי הסוכן)

1. **DNS אצל הרשם — RESOLVED (29.09, M01-c52).** ה-NS של `kenyonexpress.co.il`
   כבר `ns1.vercel-dns.com`/`ns2.vercel-dns.com` (לא `ns1/ns2.vercel.com`
   כפי שנמדד בכל בדיקה מ-25.09 ועד M18-c51). `dig +short A` מחזיר
   `216.198.79.1`/`216.198.79.65`, `curl` ל-`www.kenyonexpress.co.il` מחזיר
   `200` עם תוכן אמיתי (`lang="he" dir="rtl"`, כותרת קניון EXPRESS). מי שינה
   ומתי — לא נמדד, רק התוצאה. **לחשבון שלושה פרויקטי Vercel; רק הפרויקט
   בשם `kenyonexpress` (`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`) מחזיק את הדומיין
   — `kenyonexpress-prod` הוא פרויקט אחר שמחזיק רק `.vercel.app`, אל תבלבלו
   ביניהם.** פירוט מלא ברשומת M01-c52.
2. **RESOLVED ב-L01 (05.10):** פרודקשן מגיש את HEAD (`e1719ad66`,
   `dpl_FxGwtE5H6hw4L9ccU4yJNYmuhVni`), `robots.txt` ו-`sitemap.xml` החיים
   כבר בגרסת HEAD. הטקסט שמתחת הוא ההיסטוריה עד 05.10 בבוקר. **M14-c95:** משתני ה-env שחסמו את ה-preflight נסגרו;
   החוסם עכשיו הוא `refs` ב-`.vercelignore` (`39eb43947`), ראו DEPLOY-UNBLOCK
   למעלה. הטקסט שמתחת הוא ההיסטוריה עד 04.10. **פריסת פרודקשן של HEAD (285 קומיטים אחרי `a388118f1` החי, ספירת git
   בלבד, עודכן ב-M01-c65 מ-267 שנמדד ב-M01-c64; ניסיון הפריסה הידני האחרון
   היה ב-M01-c55, 105 קומיטים אז)**:
   נוסתה לאחרונה ב-M01-c55 (Vercel MCP, `create_deployment`, `gitSource`
   github, `audit/final-audit`@`291bc2d88`) **וסורבה ב-`deploy-preflight`**
   באותה סיבה בדיוק, פעם חמישית ברציפות (M01-c1, M01-c52, M01-c53, M01-c54,
   M01-c55): `dpl_FJYf483tkqSNf5pkG9MenghGQF46`, `BUILD_UTILS_SPAWN_1`.
   **מ-M01-c56 ועד M01-c65 לא נוסה ניסיון פריסה ידני נוסף** (כלל "goal שנתקע
   פעמיים, לדלג", מוחל מ-M01-c55, פעם אחת-עשרה ב-M01-c65, כולל דחיית משימת
   התור שביקשה בפירוש build+deploy חדש, ראו M01-c65 למעלה), אך התנאי נבדק
   שוב בקריאה בלבד בכל פעם ואושר ללא שינוי: `CARDCOM_TERMINAL_NUMBER`,
   `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` עדיין חסרים ב-Production
   (קיימים במקומם `CARDCOM_MERCHANT_ID`/`CARDCOM_CLIENT_ID`/`CARDCOM_API_KEY`
   שהקוד לא קורא) ו-`ALLOW_INCOMPLETE_ENV` עדיין מוגדר שם (Vercel MCP,
   `filter_project_envs`, קריאה בלבד, M01-c65).
   **`list_deployments` (target=production, 5 אחרונות) מראה בדיוק את
   אותן חמש פריסות `ERROR` שנמדדו ב-M01-c61 עד M01-c64**, שום push מאז
   לא הפעיל build אוטומטי חדש (`1083b8d8d`, `99b2079cb`, `0bcbdac18`,
   `291bc2d88` פעמיים), כולן `ERROR` באותה סיבה, נמדד שוב M01-c65.
   עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה; פרודקשן נשאר על
   `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY, מאושר שוב
   ב-M01-c65 דרך `curl` ישיר על `www.kenyonexpress.co.il`). **DNS
   אינו קשור לחוסם הזה**, נמדד שוב ב-M01-c65: `www.kenyonexpress.co.il`
   מחזיר 200 עם התוכן החי, `kenyonexpress.co.il` מפנה 308 ל-`www`, ה-NS
   עדיין `ns1/ns2.vercel-dns.com`. **תוצאה קונקרטית נוספת, M12-c68**:
   `robots.txt` החי עדיין בגרסת `a388118f1`, בלי שלוש כתובות-האסימון
   (`/gift/`,`/order/`,`/wishlist/s/`) ו-`/debug/` שתוקנו ב-M12-c67 — ונבדק
   חי ששלושתן מחזירות `200` בפרודקשן כרגע, בלי כיסוי `Disallow`. **עוד
   תוצאה קונקרטית, M11-c73**: `sitemap.xml` החי גם הוא עדיין בגרסת
   `a388118f1` — `urlset` שטוח, לא `sitemapindex` (סעיף 79, 09.09), וחמשת
   נתיבי תתי-המפות של הקוד הנוכחי מחזירים `404` בפרודקשן.
3. **מיגרציות ממתינות**: **218 (טריגר `enforce_profile_privilege_columns` מפיל כל
   עדכון פרופיל של לקוח ב-42703; נמדד 25.09 ב-M05-c1, 5 מ-5 לקוחות, בניגוד לרישום
   "הוחלה" מ-21.09)**, 245 ו-246 (advisors, M05-c1; 245 אחרי 209 ואחרי 203), 204 (הצטרפות ספקים והסכם click-wrap; בלעדיה הטופס
   עונה "עדיין לא פעיל"), 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר), 244 (קמפיינים
   והמרות של תוכנית השותפים; בלעדיה התוכנית "עדיין לא פתוחה"), 247 (`anon`
   בלי הרשאת SELECT על `reviews`, נמדד M18-c52; בלעדיה דף הביקורות הציבורי
   נכשל תמיד, ללא תלות בשום קובץ אחר). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. **אומת שוב
   M10-c95 (05.10, בדיקה ישירה מול פרודקשן בפועל דרך CLI-keychain-token,
   לא רק git, 15 אובייקטים של 13 קבצים): כל 19 הקבצים החוסמים עדיין לא
   הוחלו, אפס סחיפה מ-M10-c93.**
   60 קבצים ב-`migrations/pending/`, `git log -1` עדיין `48c8792dd` (248).
4. **R2 לא מופעל בחשבון Cloudflare** (10.09): תמונות המוצר נופלות ל-Supabase
   Storage, וגיבויי ה-DB החיצוניים אינם נכתבים כלל.
5. **צילומי reference ב-380 וב-768 לסל ולקופה**: קיימים רק ב-1440
   (`refs/live-cart.png`, `refs/live-checkout.png`), ולכן השער של Q10 נמדד ב-1440
   בלבד. **דף המוצר נסגר ב-Q05b (25.09)** עם reference של Electro v7 בשלושת
   הרוחבים (`refs/electro_product_{380,768,1440}.png`, נוצר מחדש בפקודה
   ב-`docs/MISSING-ASSETS.md` סעיף 1; `refs/` אינו ב-git). **לסל ולקופה נוסה
   ב-M09-c1 (25.09): הדמו עונה `403 - Forbidden` על `/cart/` ועל `/checkout/`, עם
   seed ובלי, בעוד המוצר נפתח.** הסקריפט כבר יודע לזרוע (`--add-to-cart=2439`)
   והשער כבר מחווט; הפקודות ליום שהדמו יענה ב-`MISSING-ASSETS.md` סעיף 1b.
6. **`RESEND_API_KEY` בפרודקשן אינו תקף, נמדד.** L08 (05.10): שליחה אמיתית
   מ-server action חי החזירה מ-Resend `401 API key is invalid`
   (`email.refused` בלוג הפרודקשן). עד מפתח חדש ב-Vercel Production שום
   מייל אינו יוצא: צור קשר, קופון, magic link, איפוס סיסמה ו-outbox (72
   שורות `dead`). ההיסטוריה: השם קיים מ-25.09 (Q24), הערך לא נקרא.
7. **`SUPABASE_SECRET_KEY` חשוף ודורש רוטציה** (CLAUDE.md, `RUNBOOK`);
   `deploy-preflight` מסרב לבנות איתו, ומ-B01 (25.09) הוא רץ בפועל לפני
   `pnpm build` ב-`vercel.json`. **נמדד ב-M01-c1: הסריקה על סביבת Production
   של Vercel לא מצאה את המפתח החשוף** (אף שורת `COMPROMISED`), כלומר החשיפה
   נוגעת לעותקים מקומיים ולנוהל, לא לפריסה.
8. **Cardcom בפרודקשן: אישורים לא-מאומתים.** עד 04.10 ספק התשלום היה
   mock (נמדד 25.09 על `/checkout` החי, `frame-src ... 'self'`; 24 תשלומי
   `mock-` ו-0 אמיתיים). **L11 (05.10):** ה-build החי כבר אינו mock
   (`frame-src https://secure.cardcom.solutions`, `/api/ready` ‏`cardcom: ok`),
   אך `CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD`/`SANDBOX` נוצרו
   ב-04.10 21:40 על ידי סשן סוכן בענן "כדי לעבור את ה-preflight", הם Sensitive
   ואינם ניתנים לקריאה, ואין אישור אמיתי או סנדבוקס במכונה. עד שאופיר יזין
   ערכים אמיתיים ויבצע הזמנת ₪1 וזיכוי, סליקה אמיתית אינה מוכחת
   (BACKLOG סעיף 6; השמות הישנים `API_KEY`/`CLIENT_ID`/`MERCHANT_ID`, סעיף 19).
9. **מספר עוסק/ח.פ לשורת המוכר** באישור הרכישה (Q09): אינו קיים בריפו.
   עריכה אחת ב-`messages/he.json`, `purchaseConfirmation.sellerName`.
10. **המתזמן מתוזמן ונדחה** (Q24, נמדד שוב L09 05.10): `cron.yml` על `main`
    נכשל בכל ריצה, האחרונה 04.10 19:11 UTC (`abandoned-cart -> 401`), כל 21
    הנתיבים עונים 401 גם לסוד המקומי; סוד Vercel הוא Sensitive ולא נקרא.
    72 הודעות `dead` ב-`notification_outbox`, 0 חדשות ב-24 שעות;
    `expire-vouchers` ושאר 20 העבודות לא רצות. pg_cron מחזיק רק
    `report_tables_nightly` (רץ). תיקון: אותו ערך בשני המקומות. אופיר בלבד.
11. **הקטלוג החי מכיל שורות תבנית וכפילויות** (`supabase/catalogue-known-issues.json`,
    **26** ממצאים על 44-46 מוצרים פעילים לפי המדידה — לא 25; ראו M15-c53
    למעלה): שלוש שורות `מאסטר`, חמש `-copy`/`-העתק`/`-לדוגמא`, שמות שסותרים
    slug, מחיר שסותר את הטקסט של עצמו, ותמונה חסרה (`מזקקת וויסקי`). **לא
    היה רשום כחוסם ב-STATE.md עד M15-c51** (נמדד ב-`docs/LAUNCH-READINESS.md`
    שורה חוסמת 6 ו-`CLAUDE.md` §"מצב נוכחי", ששניהם עדיין אומרים 25); שער
    `pnpm test src/lib/catalogue` ירוק מול הפנקס — הפנקס הוא הכרעת מפעיל,
    לא תקלה שנמדדת.
12. **`scripts/cron-jobs.json` ב-`main` מכיל שבעה נתיבים ש-HEAD אינו מגיש**
    (`search-reindex`, `job-dlq`, `search-outbox`, `cashback-settlement`,
    `email-retry`, `expire-cashback`, `expire-coupons`), כל אחד עונה 404 גם
    אחרי שחוסם 10 נסגר. נפתר מעצמו במיזוג הענף הזה ל-`main`. **לא היה רשום
    ב-STATE.md עד M15-c51** (נמדד ב-`docs/LAUNCH-READINESS.md` ידני 9).
13. **הענף המקומי `main` בריפו הזה סוטה מ-`origin/main`, לא רק מאחורה**
    (נמדד M16-c54, re-verified M16-c55 אפס שינוי): קצה מקומי `3f6ca53c3` (10.09), קצה remote
    `18ed044b2` (18.09), אין קשר-אב בין השניים. **לא עבודה אבודה**: קצה
    ה-`main` המקומי הוא ancestor של `origin/audit/final-audit` וגם
    `origin/work/goal-queue-0923` — מצביע-ישן משורשלת ה-`audit`, לא ענף
    נפרד. **לא לפעולה מצד הסוכן**: `main` מוגן ב-GitHub, וסטייה כזו
    תדרוש force-push כדי לדחוף, אסור לפי הכללים. אם רוצים לנקות את
    ה-ref המקומי המבולבל (`git branch -f main origin/main`, לא מיזוג
    ולא מחיקה) — החלטה של אופיר.

14. **`kenyonexpress.co.il` עצמו נסרב כ-live reference ב-`scripts/compare.mjs`
    (נמדד לראשונה ב-Q31, 01.10.2026, `--page=home`)**: ה-DNS כבר מצביע
    לפריסת Vercel שלנו (חוסם #2 למעלה), כך שניווט חי לדף הבית מחזיר את
    הבנייה שלנו ("live side is our-build", REFUSED, לא PASS שקרי). מאותו
    רגע **כל מדידה על `home` חייבת `--baseline='refs/ke_live_{width}.png'`**
    (קיים בשלושת הרוחבים, נבדק PASS ב-Q31: `8.51%`/`9.02%`/`3.95%`). לדף
    המוצר יש כבר באותו תבנית (`refs/ke_live_product_{width}.png`, Q05b).
    **`category` נסגר כבר ב-Q27**: `refs/electro_shop_{width}.png`
    (Electro `/shop/`) קיים בשלושת הרוחבים, נבדק PASS שוב ב-M03-c66
    (01.10.2026, אפס דריפט: 3.53%/2.52%/1.69%). **לא נבדק**: אם
    `products`/`search` נתקלים באותו סירוב — יש להם רק צילום בודד
    לא-ממותג-רוחב (`refs/live-{products,search}.png`), לא `{width}` לכל
    רוחב, כך שהם עלולים להיתקע ללא reference תקין בכלל. בדיקה והקפאת
    reference תלת-רוחבי לשניהם, אם יידרש מדד חזותי עליהם, היא עבודה של
    פריט עתידי.
    **L07 (05.10):** הצד הנמדד יכול להיות פרודקשן עצמו
    (`LOCAL_BASE=https://www.kenyonexpress.co.il`) מאז שתיקון `shoot()`
    גוזר את הצד מהקורא ולא מה-hostname; נמדד 7.91 / 8.98 / 4.09 PASS.
    **M01-c96 (05.10):** אותו reference, build מקומי של HEAD על 3396:
    8.58 / 9.01 / 4.16 PASS.
    **W01 (05.10):** אחרי בניית שורת האייקונים מחדש, אותו reference ואותו
    מסלול: 8.60 / 9.02 / 4.16 PASS.

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
