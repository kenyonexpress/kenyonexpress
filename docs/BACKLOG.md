# Backlog: manual items for Ofir

Created 2026-09-29 (M15-c51) as the single canonical list. Before this file
existed, `STATE.md` and `docs/LAUNCH-READINESS.md` each kept their own
"ידני לאופיר" list, and the two had drifted: different migration numbers,
two items present in one and missing from the other (the catalogue decision,
the `cron-jobs.json`/`main` mismatch), two more present in `STATE.md`'s
blockers but never carried into its own action list (`RESEND_API_KEY`, the
ח.פ line). This file merges both, in the order that a real customer would
hit them, deduplicated. `STATE.md` and `docs/LAUNCH-READINESS.md` now point
here instead of keeping their own copy — see each file's own evidence
sections (STATE.md "חוסמים פתוחים", LAUNCH-READINESS.md "Blocking line")
for the measurement behind each item; this file lists the action and its
source, not the evidence itself.

Nothing here is an action an agent may take alone (Vercel env, DNS, secret
rotation, a value only Ofir has, or a decision the ledger says is an
operator's, not the agent's — see `CLAUDE.md`'s stop conditions).

**Re-checked 2026-09-29 (M15-c52) against `git log -20`:** still 15 items,
same order, no duplicate, no new item. Only item 4's commit count changed
(47 -> 66, git-only, production not re-probed).

**Updated 2026-09-29 (M18-c52):** item 5's file list gained `247` (`anon`
holds zero grants on `public.reviews`, measured read-only against
production; see `migrations/pending/247_reviews_grant_anon_select.sql`).

**Re-checked 2026-09-29 (M15-c53) against `git log -20`:** still 15 items,
same order, no duplicate, no new item. Item 1 (DNS) was already RESOLVED
(M01-c52) but this file's own wording still called it an open action; fixed
below. Item 4's commit count changed again (66 -> 83, git-only). Item 7's
finding count was wrong since 2026-09-10: the ledger
(`supabase/catalogue-known-issues.json`) holds 26 rows, not 25 — a
`no-image` entry (`מזקקת וויסקי`, empty images array) was added in the same
commit (`00375d705`) that introduced the other 25 and the count was never
corrected anywhere; fixed below.

**Re-checked 2026-09-29 (M15-c54) against `git log -20`:** still 15 items,
same order, no duplicate, no new item. Nine code-change commits landed since
M15-c53 (M06-c54..M14-c54); none touched a blocking line or added a manual
item — see `STATE.md` for each one's own DONE entry. Item 4's commit count
changed again (83 -> 101, `git rev-list --count a388118f1..HEAD`, git-only,
production not re-probed this item). Item 7's finding count (26) re-checked
against the ledger, unchanged.

**Re-checked 2026-09-29 (M15-c55) against `git log -20`:** still 15 items,
same order, no duplicate, no new item. Sixteen commits landed since M15-c54
(M01-c55..M14-c55); only two touched code (`posthog-js` patch bump, M04-c55;
new `refund-requests` branch-coverage tests, M10-c55), neither touched a
blocking line or added a manual item. Item 4's commit count changed again
(101 -> 118, `git rev-list --count a388118f1..HEAD`, git-only, production
not re-probed this item — M01-c55's own deploy attempt measured 105 on the
same day, before nine more commits landed). Item 7's finding count (26)
re-checked directly against `supabase/catalogue-known-issues.json`'s
`known` object, unchanged.

**Re-checked 2026-09-29 (M09-c55) via a direct read-only Vercel API call
(`filter_project_envs`, no value decrypted) on all 39 env vars of project
`kenyonexpress`:** item 3 and item 8 both confirmed unchanged (still no
`CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD` in Production, still
`ALLOW_INCOMPLETE_ENV` set, `SUPABASE_SECRET_KEY` still flagged
`readable-secret` by Vercel itself). Same call surfaced that
`CARDCOM_WEBHOOK_SECRET` also carries the `readable-secret` flag — not
previously recorded anywhere. No new numbered item: rotating it is the same
Ofir-only action as item 8 (secret rotation), just a second key needing it;
folded into item 8's wording below rather than given its own number.

**Re-checked 2026-09-29 (M15-c56) against `git log -20`:** still 15 items,
same order, no duplicate, no new item. Fourteen commits landed since
M15-c55 (M01-c56..M14-c56); only two touched code (`posthog-js` patch
bump, M04-c56; new `orders/status-transitions.ts` branch-coverage tests,
M10-c56), neither touched a blocking line or added a manual item. Item 4's
commit count changed again (118 -> 136, `git rev-list --count
a388118f1..HEAD`, git-only, production not re-probed this item). Item 5's
18-file list re-checked directly against `migrations/pending/`, all
present, no new file. Item 7's finding count (26) re-checked directly
against `supabase/catalogue-known-issues.json`'s `known` object,
unchanged.

**Re-checked 2026-09-30 (M15-c57) against `git log f96702549..HEAD`:**
still 15 items, same order, no duplicate, no new item. Sixteen commits
landed since M15-c56 (M16-c56..M18-c56, M01-c57..M14-c57); only two
touched code (`money-format.ts` branch-coverage tests, 20.83% to 100%,
M10-c57; two minor 0.x dependency bumps, `@anthropic-ai/sdk` and
`@supabase/ssr`, M04-c57), neither touched a blocking line or added a
manual item. Item 4's commit count changed again (136 -> 153, `git
rev-list --count a388118f1..HEAD`, git-only, production not re-probed
this item). Item 5's 18-file list re-checked directly against
`migrations/pending/`, all present, no new file. Item 7's finding count
(26) re-checked directly against
`supabase/catalogue-known-issues.json`'s `known` object, unchanged. Item
15's stash count (32) re-checked with `git stash list`, unchanged.

**Re-checked 2026-09-30 (M15-c58) against `git log e636a64f9..HEAD`:**
still 15 items, same order, no duplicate, no new item. Seventeen commits
landed since M15-c57 (M16-c57..M18-c57, M01-c58..M14-c58); only two
touched code (`refund-wallet.ts` branch-coverage test, M10-c58; one
minor dependency bump, `@aws-sdk/client-s3`+`@aws-sdk/s3-request-presigner`,
M04-c58), neither touched a blocking line or added a manual item. Item
4's commit count changed again (153 -> 171, `git rev-list --count
a388118f1..HEAD`, git-only, production not re-probed this item). Item
5's 18-file list re-checked directly against `migrations/pending/`, all
present, no new file. Item 7's finding count (26) re-checked directly
against `supabase/catalogue-known-issues.json`'s `known` object,
unchanged. Item 15's stash count (32) re-checked with `git stash list`,
unchanged.

**Re-checked 2026-09-30 (M15-c59) against `git log 456becb9c..HEAD`:**
still 15 items, same order, no duplicate, no new item. Seventeen commits
landed since M15-c58 (M16-c58..M18-c58, M01-c59..M14-c59); only two
touched a path this file's items depend on (`pnpm-lock.yaml`
`caniuse-lite` bump, M04-c59; `payment-money-columns.test.ts` test-only,
M10-c59), neither touched a blocking line or added a manual item. Item
4's commit count changed again (171 -> 189, `git rev-list --count
a388118f1..HEAD`, git-only, production not re-probed this item). Item
5's 18-file list re-checked directly against `migrations/pending/`, all
present, no new file. Item 7's finding count (26) re-checked directly
against `supabase/catalogue-known-issues.json`'s `known` object,
unchanged. Item 12's `dns-watch.sh` process re-checked with `pgrep -fl`,
still pid 957 under `caffeinate` pid 999, unchanged. Item 15's stash
count (32) re-checked with `git stash list`, unchanged.

**Re-checked 2026-09-30 (M15-c60) against `git log a353fa3db..HEAD`:**
still 15 items, same order, no duplicate, no new item. Seventeen commits
landed since M15-c59 (M16-c59..M18-c59, M01-c60..M14-c60); none touched
code on a path this file's items depend on (`git diff --stat
a353fa3db..HEAD -- src/ next.config.ts next.config.mjs package.json
pnpm-lock.yaml vercel.json supabase/ migrations/` returns only three
test files: `bought-this-week.test.ts`, `stock-live.test.ts`,
`scan-context.test.ts`). Item 4's commit count changed again (189 ->
207, `git rev-list --count a388118f1..HEAD`, git-only, production not
re-probed this item). Item 5's 18-file list re-checked directly against
`migrations/pending/`, all present, no new file. Item 7's finding count
(26) re-checked directly against `supabase/catalogue-known-issues.json`'s
`known` object, unchanged. Item 12's `dns-watch.sh` process re-checked
with `pgrep -fl`, still pid 957 under `caffeinate` pid 999, unchanged.
Item 15's stash count (32) re-checked with `git stash list`, unchanged.

**Re-checked 2026-09-30 (M08-c61) against `git log 466ebc6fa..HEAD`:**
still 15 items, same order, no duplicate, no new item. Ten commits
landed since M15-c60 (M16-c60..M18-c60, M01-c61..M07-c61); only two
touched a path this file's items depend on (`fast-xml-parser` patch
bump, M04-c61, `package.json`+`pnpm-lock.yaml`), neither touched a
blocking line or added a manual item (`git diff --stat
466ebc6fa..HEAD -- docs/BACKLOG.md migrations/pending
supabase/catalogue-known-issues.json src/ next.config.ts
next.config.mjs package.json pnpm-lock.yaml vercel.json supabase/`
confirms). Item 4's commit count changed again (207 -> 218, `git
rev-list --count a388118f1..HEAD`, git-only, production not
re-probed this item). Item 5's 18-file list re-checked directly
against `migrations/pending/`, all present, no new file (59 files
total). Item 7's finding count (26) re-checked directly against
`supabase/catalogue-known-issues.json`'s `known` object, unchanged.
Item 15's stash count (32) re-checked with `git stash list`,
unchanged. All 15 items remain actions this file's own preamble
excludes an agent from taking alone; no phase 1 item available for
the queue task this cycle (M08-c61 result: BACKLOG EMPTY).

**Re-checked 2026-09-30 (M15-c61) against `git log 466ebc6fa..HEAD`:**
still 15 items, same order, no duplicate, no new item. Seventeen commits
landed since M08-c61's own check point (M16-c60..M18-c60, M01-c61..M14-c61);
only the `fast-xml-parser` patch bump (M04-c61, `package.json`+
`pnpm-lock.yaml`, dev-only) and this file's own re-check note touched a
tracked path — `git diff --stat 466ebc6fa..HEAD -- docs/BACKLOG.md
migrations/pending supabase/catalogue-known-issues.json src/ next.config.ts
next.config.mjs package.json pnpm-lock.yaml vercel.json supabase/` confirms
(`docs/BACKLOG.md` +20/-0 from M08-c61's own note, `package.json` +1/-1,
`pnpm-lock.yaml` +18/-18). Item 4's commit count changed again (207 -> 225,
`git rev-list --count a388118f1..HEAD`, git-only, production not re-probed
this item). Item 5's 18-file list re-checked directly against
`migrations/pending/`, all present, no new file (59 files total). Item 7's
finding count (26) re-checked directly against
`supabase/catalogue-known-issues.json`'s `known` object, unchanged. Item
12's `dns-watch.sh` process re-checked with `pgrep -fl`, still pid 957
under `caffeinate` pid 999, unchanged. Item 15's stash count (32)
re-checked with `git stash list`, unchanged. `type-check`, `lint` (12
gates) and `test` (610/610 files, 7296/7308) all re-run clean this item;
`build` not re-run — ~48 `next-server`/`pnpm start` processes were running
concurrently (~63MB RAM free, `vm_stat`), and the existing `.next`
(`BUILD_ID` `JvTmoHwdiXPpaSeOjzjaw`) was confirmed source-identical to HEAD
(`git diff --stat 8fd11aae4..HEAD -- next.config.ts next.config.js
middleware.ts vercel.json src/ package.json` returns empty).

## ידני לאופיר, לפי סדר קריטיות

1. **DNS ברשם — RESOLVED (נמדד 29.09, M01-c52, שורת החסימה עודכנה ב-LAUNCH-READINESS.md ב-M15-c53).**
   ה-NS כבר `ns1.vercel-dns.com` / `ns2.vercel-dns.com`, הדומיין עונה 200 עם
   התוכן האמיתי. שום פעולה נוספת נדרשת מאופיר על הסעיף הזה. מקור: STATE.md
   חוסם 1 (עודכן), LAUNCH-READINESS.md שורה חוסמת 1 (עודכן ב-M15-c53).
2. **`CRON_SECRET` זהה ב-GitHub וב-Vercel.** כרגע 40/40 הרצות מתוזמנות
   נכשלות ב-401 (סוד שונה בכל צד), ו-`notification_outbox` מחזיקה הודעות
   ממתינות מ-10.09. לקרוא את הערך ב-Vercel (פרויקט `kenyonexpress`,
   Production) ולהדביק אותו ב-GitHub Settings > Secrets > Actions >
   `CRON_SECRET`. הריצה הבאה צריכה להראות `notifications -> 200`.
   מקור: STATE.md חוסם 10, LAUNCH-READINESS.md שורה חוסמת 3.
3. **סביבת Production ב-Vercel לפני כל פריסה.** להוסיף
   `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`
   (השמות שהקוד קורא בפועל; `CARDCOM_API_KEY`/`CLIENT_ID`/`MERCHANT_ID`
   הקיימים שם אינם נקראים) ולהסיר `ALLOW_INCOMPLETE_ENV`. בלעדיה
   `deploy-preflight` מסרב לכל build. מקור: STATE.md חוסם 2,
   LAUNCH-READINESS.md שורה חוסמת 4.
4. **אישור פריסת HEAD לפרודקשן**, אחרי סעיף 3. פרודקשן עדיין מגיש
   `a388118f1`, שהיה 22 קומיטים מאחורי ב-25.09, 47 קומיטים מאחורי ב-29.09
   המוקדם (M15-c51), 66 ב-M15-c52, 83 ב-M15-c53, 101 ב-M15-c54, 118
   ב-M15-c55, 122 ב-M01-c56, 136 ב-M15-c56, 153 ב-M15-c57, 171 ב-M15-c58,
   189 ב-M15-c59, 207 ב-M15-c60, וכעת (30.09, M15-c61,
   `git rev-list --count a388118f1..HEAD`, git-only — לא נוסתה פריסה
   חוזרת בפריט הזה) **225** קומיטים מאחורי HEAD (וניסיונות פריסה חוזרים
   ב-M01-c54 וב-M01-c55 סורבו באותה סיבה בדיוק, פרודקשן נשאר על
   `a388118f1`).
   `POST /v13/deployments` עם `gitSource.sha`,
   `target=production`, לפי `docs/RUNBOOK.md`. מקור: STATE.md חוסם 2,
   LAUNCH-READINESS.md שורה חוסמת 4.
5. **החלת המיגרציות הממתינות**, לפי הסדר והתנאים המוקדמים ב-
   `migrations/pending/APPLY-ORDER.md` ו-`docs/RUNBOOK.md` — **לא** לפי
   סדר מספרי גרידא (218 חייב לקדום ל-217, למשל). האיחוד של שתי הרשימות
   שהיו כתובות בנפרד (STATE.md חוסם 3: 218, 245, 246, 204, 240-244;
   LAUNCH-READINESS.md שורה 5: 204, 223, 224, 234-236, 239-244), פלוס 209
   ו-220 שנזכרים כתלות של 245/246 באותה רשומה: **204, 209, 218, 220, 223,
   224, 234, 235, 236, 239, 240, 241, 242, 243, 244, 245, 246, 247** (18
   קבצים, ‏247 בלי תלות בשום קובץ אחר). אחרי ההחלה: `pnpm db:types` ו-commit.
6. **Cardcom אמיתי.** לבדוק את הערכים של `CARDCOM_API_KEY`/`CLIENT_ID`/
   `MERCHANT_ID` הקיימים בשם ב-Vercel, לקבוע `CARDCOM_USE_MOCK=false` ו-
   `CHECKOUT_ENABLED=true`, לפרוס מחדש (ה-CSP נאפה בזמן build, לא בזמן
   ריצה), ולבצע חיוב אמיתי אחד קטן וזיכוי דרכו. מקור: STATE.md חוסם 8,
   LAUNCH-READINESS.md שורה חוסמת 2.
7. **הכרעה על 26 שורות הקטלוג** ב-`supabase/catalogue-known-issues.json`
   (26, לא 25 — שורה `no-image` נוספה ל-`מזקקת וויסקי` ב-00375d705,
   09.09.2026, יחד עם ה-25 האחרות, ומספר הממצאים לא תוקן בשום מסמך מאז;
   תוקן כאן ב-M15-c53):
   אילו משתי ה-`עיסוי מאסטר` הכפולות היא האמיתית, מה המחיר שלה (₪9 או
   ₪108, לפי מה שה-slug של ארבע שורות טוען), מחיקת חמש שורות ה-`-copy`/
   `-העתק`/`-לדוגמא`, ובחירת תמונה ל-`מזקקת וויסקי` (מערך תמונות ריק, אין
   מקור לשחזר ממנו). שום דבר כאן אינו לתיקון אוטומטי — ראו `CLAUDE.md`
   §"מצב נוכחי" סעיף 1. **לא היה ברשימת STATE.md;** מקור:
   LAUNCH-READINESS.md שורה חוסמת 6, `CLAUDE.md`.
8. **רוטציית `SUPABASE_SECRET_KEY`, וגם `CARDCOM_WEBHOOK_SECRET`.** המפתח
   הראשון בשימוש נחשף בהתקנה; מסומן ב-`scripts/compromised-keys.mjs`,
   ו-`deploy-preflight` מסרב לבנות איתו. Vercel מסמן את שניהם
   `readable-secret` (נמדד M09-c55, `filter_project_envs` בקריאה בלבד).
   נוהל ב-`docs/RUNBOOK.md`. מקור: STATE.md חוסם 7, LAUNCH-READINESS.md
   שורה חוסמת 7.
9. **`RESEND_API_KEY` בפרודקשן.** השם קיים ב-target Production אך הערך לא
   נקרא; בלעדיו כל חמשת סוגי המייל נופלים בשקט ל-`skipped` ואיפוס סיסמה
   חוזר ל-SMTP של Supabase. **לא היה ברשימת הפעולות של STATE.md** (רק
   ברשימת החוסמים שלו); מקור: STATE.md חוסם 6.
10. **הפעלת R2 בדשבורד Cloudflare.** בלעדיה תמונות המוצר נופלות ל-Supabase
    Storage וגיבויי ה-DB החיצוניים לא נכתבים. מקור: STATE.md חוסם 4,
    LAUNCH-READINESS.md שורה חוסמת 8.
11. **`scripts/cron-jobs.json` ב-`main`** מכיל שבעה נתיבים שאינם קיימים
    ב-HEAD (`search-reindex`, `job-dlq`, `search-outbox`,
    `cashback-settlement`, `email-retry`, `expire-cashback`,
    `expire-coupons`); כל אחד עונה 404 גם אחרי שסעיף 2 נסגר. נפתר מעצמו
    כשהענף הזה יתמזג ל-`main` (PR, ארבע בדיקות). **לא היה ברשימת
    STATE.md;** מקור: LAUNCH-READINESS.md ידני 9.
12. **`scripts/dns-watch.sh` (pid 957 בזמן המדידה)** עדיין רץ תחת
    `caffeinate` ומשגר סשן פריסה כשיופיעו NS של Cloudflare; המעבר
    ל-vercel-dns (סעיף 1) לא אמור להפעיל אותו, אבל לבדוק לפני שמפעילים
    משהו אחר. מקור: STATE.md ידני 8, LAUNCH-READINESS.md ידני 10.
13. **מספר עוסק/ח.פ לשורת המוכר** באישור הרכישה: עריכה אחת ב-
    `messages/he.json`, `purchaseConfirmation.sellerName`, ברגע שהערך
    מגיע מאופיר — הסוכן אינו מחזיק אותו. מקור: STATE.md חוסם 9,
    LAUNCH-READINESS.md ידני 11.
14. **כניסה בטלפון (Q17).** ספק SMS בהגדרות ה-auth של Supabase, ואז
    `PHONE_AUTH_ENABLED=true` ב-Vercel. בלעדיהם הכפתור מוסתר והשאר עובד.
    מקור: STATE.md ידני 10, LAUNCH-READINESS.md ידני 12.
15. **32 stash-ים לא נמחקו** (נמדד 29.09, M09-c54; היה רשום כ"עשרה", הרשימה
    המקורית תחת Q01 בארכיון תיארה מצב ישן יותר — `git stash list` מחזיר 32
    כרגע). כלל הפרויקט אוסר מחיקת נתונים בלי אישור מפורש, כך שההכרעה עצמה
    היא של אופיר, לא רק הביצוע. מקור: STATE.md ידני 9, LAUNCH-READINESS.md
    ידני 13.

## מה לא ברשימה, ולמה

`docs/MIGRATION-BACKLOG.md` ו-`docs/POST-LAUNCH-BACKLOG.md` הם קבצים
נפרדים, לא תורים פעילים (הראשון ריק לפי הבאנר שלו, השני "כל מה שנדחה
במכוון") — נבדק ונרשם ב-B02..M08-c1, בארכיון. הפריט הזה (M15-c51) אינו
נוגע בהם.
