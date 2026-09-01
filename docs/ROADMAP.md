# מפת מצב: דגלים, גלים, ומה שנשאר לעלייה

נכתב 2026-09-01 מול `origin/main`. docs בלבד. מקורות: הקוד ב-`src/`, `migrations/pending/`, `supabase/migrations/`, `git log`/`git tag`, ו-`docs/LAUNCH-CHECKLIST.md` (סטטוס 19.08).

**אין טבלת `feature_flags` ואין מפתחות בשמות**

```
REVIEWS
WISHLIST
SUPPORT
GIFTING
LOYALTY
RECS
DIGEST
WHATSAPP_CHANNEL
```

אלה שמות שמופיעים בארכיטקטורה ובתור ה-goals, לא משתני סביבה ולא שורות DB. `docs/ARCHITECTURE-ADMIN-DASHBOARD.md` מתכנן את הטבלה (`key text PRIMARY KEY`) ומסמן אותה כפער. עד שתיכתב מיגרציה כזו, ההדלקה היא env, עמודה על שורה, או פשוט "הקוד קיים / לא קיים".

המסמך המחייב ליום עלייה הוא `docs/LAUNCH-RUNBOOK.md`. מה שנשאר לבעלים: `docs/OWNER-CHECKLIST.md`. הצ'קליסט למטה הוא מה ש-`LAUNCH-CHECKLIST.md` עצמו עדיין מסמן כפתוח.

---

## 1. שמונת השמות שביקשת, מול הקוד

| דגל (שם מתוכנן) | מה הפיצ'ר | מיגרציה ב-pending | מה חסר להדלקה |
| --- | --- | --- | --- |
| `REVIEWS` | דירוג / NPS לספק, כוכבים בדף מוצר | **אין.** אף קובץ pending, אף טבלת `reviews` ב-`src/types/database.ts` | סכימה + RLS + UI. התור ב-`STATE.md` קרא לזה "(33) דירוג ספקים NPS". `ProductInfo.tsx` מזכיר כוכבים כמקום מדידה מול החי, בלי דאטה |
| `WISHLIST` | מועדפים: לב בכרטיס, מונה בהדר, `/wishlist`, מיזוג אורח כמו עגלה | **אין.** הארכיטקטורה (`docs/ARCHITECTURE-WISHLIST.md`) דורשת `wishlists` + `wishlist_items`. אין `src/lib/wishlist/` | כתיבת המיגרציה, ה-actions, והמסך. הלב הוסר מ-`MastheadNav.tsx` במפורש כי אין מועדפים |
| `SUPPORT` | מרכז תמיכה ללקוח + מספר/וואטסאפ | **אין** | תפקיד `support` ב-RBAC **קיים** (`src/lib/admin/permissions.ts`). אין `/support`, ו-`SUPPORT_CONTACT_TBD` מ-D8 **לא נוצר בקוד** (`docs/DECISIONS.md`). playbook: `docs/CUSTOMER-SUPPORT-PLAYBOOK.md`. תור: "(31) מרכז תמיכה" |
| `GIFTING` | קניית קופון למישהו אחר, תביעת בעלות ב-`/gift/[token]` | **אין pending.** `supabase/migrations/108_gift_vouchers.sql` כבר בתיקיית המוחלות. הקוד: `src/server/actions/gifts.ts` | אין מתג env. אם 108 הוחלה, זה דולק. `src/types/database.ts` **לא** מכיל `gift_claim_token_hash` / `gift_claimed_at` / `gifted_by_user_id` (טיפוסים ישנים מ-108). `pnpm db:types` אחרי אימות שהעמודות קיימות בפרודקשן |
| `LOYALTY` | קאשבק + תוכנית חבר מביא חבר | **141** (`141_money_agorot_growth.sql`) רק לעמודות `_agorot` על `affiliates`/`referrals`. התוכנית עצמה: `098_referral_program.sql` **כבר הוחלה** | דגל אמיתי: `referral_program_settings.is_active`. נמדד 31.08: **אפס שורות** בטבלה, כלומר כבוי בכוונה. קאשבק: `products.cashback_enabled` + `cashback_percent` קיימים, ברירת המנוע 0% (D4). הדלקה = שורת הגדרות עם `is_active=true` (סכומים באגורות) + החלטת שיעור קאשבק. 141 לפני קוראים של `_agorot` |
| `RECS` | מנוע המלצות אישי | **אין** | מה שרץ: `src/lib/related-products.ts` ("מומלצים" = מוצרים פעילים אחרים באותה קטגוריה, זהה לכל מבקר). תור: "(23) מנוע המלצות". אין טבלת צפיות/מודל |
| `DIGEST` | דיוור סיכום לאדמין / ללקוח | **אין.** `ADMIN_DIGEST_EMAIL` מופיע ב-`ARCHITECTURE-ANALYTICS-BI.md` הישן, **לא** ב-`src/lib/env.ts` ולא ב-`.env.example` | אין job, אין תבנית. עגלות נטושות הן cron נפרד (`/api/cron/abandoned-cart`), לא digest |
| `WHATSAPP_CHANNEL` | שני דברים שונים: כפתור וואטסאפ על מוצר, וערוץ outbox `whatsapp` | **123** לכפתור (`123_products_whatsapp_enabled.sql`). ערוץ ההודעות כבר ב-`031_notifications.sql` (הוחלה): CHECK כולל `whatsapp` | כפתור: להחיל 123, ואז לסמן `products.whatsapp_enabled` **וגם** מספר נייד אמיתי אצל הספק (קווים לא נפתחים בוואטסאפ). ערוץ הודעות: ה-worker שולח רק Resend. אין ספק WhatsApp Business, אין `WHATSAPP_NOTIFICATIONS_ENABLED` בקוד (רק במסמך הארכיטקטורה) |

---

## 2. דגלי env / kill switch שכן קיימים בקוד

אלה משתנים אמיתיים. אין ערכים כאן.

| משתנה | מה הוא עושה | מיגרציה pending | מה חסר להדלקה |
| --- | --- | --- | --- |
| `CHECKOUT_ENABLED` | מתג כסף. בפרודקשן נפתח רק במחרוזת `true`. חסר = סגור | אין | ערך `true` ב-Vercel Production **אחרי** מסוף Cardcom חי ועסקת טסט |
| `ESCROW_FLOW_ENABLED` | אסור. המודל בוטל | `125` מוחק את ענף ה-escrow האחרון ב-`expire_vouchers()` | אל תגדיר. חסר או `false` |
| `CARDCOM_USE_MOCK` | תשלום מצליח בלי חיוב | אין | אסור בפרודקשן. לטסטים מקומיים בלבד |
| `CARDCOM_SANDBOX` | מסוף בדיקות. `env.ts` מפיל boot אם זה `true` ב-`NODE_ENV=production` | אין | להשאיר כבוי בפרודקשן |
| `CARDCOM_ALLOW_SANDBOX` | אישור מפורש לחשבונות sandbox בטעינה | אין | רק אם באמת בודקים sandbox |
| `PHONE_AUTH_ENABLED` + `NEXT_PUBLIC_PHONE_AUTH_ENABLED` | OTP לטלפון. שני החצאים חייבים | אין (הספק ב-Supabase Auth) | להפעיל Phone ב-Dashboard, ואז שני המשתנים `true`/`1` |
| `EXPO_PUBLIC_PHONE_AUTH_ENABLED` | אותו שער באפליקציה | אין | `.env` של Expo, לא Vercel |
| `PUSH_ENABLED` | מדלג על כל push כשכבוי | אין (מיגרציית טוקנים: 114, הוחלה) | `true` + `EXPO_ACCESS_TOKEN` אם שולחים באמת |
| `ALERTS_ENABLED` | `false` משתיק ntfy יוצא | אין | ברירת מחדל דולק. לכבות רק באירוע |
| `SENTRY_DEBUG_ROUTES` | פותח `/debug/sentry` רק במחרוזת `i-know-what-this-does` | אין | להדליק לאימות, לכבות מיד אחרי |
| `ALLOW_INCOMPLETE_ENV` | מאפשר `pnpm start` מקומי בלי סודות Cardcom | אין | אסור ב-Vercel |
| `CRON_SCHEDULER_ENABLED` | GitHub Actions variable. בלי `true` ה-workflow `cron.yml` לא רץ | אין | `true` ב-Actions **וגם** secret `CRON_SECRET`. חלופה עדיפה: cron-job.org (`docs/CRON-EXTERNAL.md`) |

דגלים שמופיעים ב-`docs/ARCHITECTURE-FEATURE-FLAGS.md` ו**לא נקראים בקוד**: `NOTIFICATIONS_ENABLED`, `WHATSAPP_NOTIFICATIONS_ENABLED`, `SEARCH_ENABLED`, `WALLET_APPLY_ENABLED`, `SUPPLIER_SCAN_ENABLED`, `AI_CS_AGENT_ENABLED`, `AI_SUPPLIER_AGENT_ENABLED`, `MAINTENANCE_MODE`. חיפוש Meili נופל ל-Postgres כש-`MEILISEARCH_HOST` חסר, בלי דגל.

---

## 3. דגלים ברמת שורה (DB), לא env

| עמודה / טבלה | מה | מיגרציה | מצב הדלקה |
| --- | --- | --- | --- |
| `products.whatsapp_enabled` | כפתור וואטסאפ לדיל | **123 pending** | ברירת מחדל `false`. בלי ההחלה השדה לא קיים והשמירה בטופס האדמין מדווחת על כך |
| `suppliers.app_scanning_enabled` | סריקת QR באפליקציית הספק | 115 **הוחלה**. ברירת מחדל `false` | אדמין מדליק פר-עסק. בלי זה מסך הסריקה באפליקציה כבוי; `redeem_voucher` עדיין בודק חברות |
| `referral_program_settings.is_active` | תוכנית חבר מביא חבר | 098 **הוחלה** | אפס שורות בפרודקשן (31.08). בלי שורה פעילה `fn_claim_referral` מחזיר `program_inactive` |
| `products.cashback_enabled` / `cashback_percent` | קאשבק על מוצר | סכימה חיה | המנוע נופל ל-0% אם אין ערך (`src/lib/cart/pricing.ts`) |
| `cashback_rules` | כללי קאשבק לפי קטגוריה | טבלה חיה בטיפוסים | D4: 0% בשיגור, התשתית קיימת |
| `discount_campaigns.is_active` | קמפיין הנחה | 096 הוחלה | כיבוי נפרד מארכוב |
| `seo_redirects.is_active` | הפניית 301 חיה | 099 הוחלה | כיבוי = ההפניה מפסיקה |
| `agent_prompts.is_active` | kill switch לסוכן AI | 028 הוחלה | אין runtime ב-`src/` (אין `src/**/agents`). המסמך מחייב fallback עברי כשכבוי |
| `popular_searches.is_active` | קישור חיפוש מהיר | 118 הוחלה | עורך ב-`/admin/search` |
| `categories.is_active` / וריאנטים / קופונים | פרסום | סכימה חיה | לא feature flag של מוצר, סטטוס פריט |

---

## 4. גלים שנבנו, לפי `git log` ו-tags

תאריך = תאריך הקומיט או ה-tag ב-git, לא תאריך תכנון. רק גלים **בשם**, לא כל קומיט.

| תאריך | גל | ראיה ב-git |
| --- | --- | --- |
| 2026-08-10 | גל v1.3.0 (מובייל + 12 goals [70]–[81]: אפליקציה, ספק, OTP, קבלות, מלאי, חיפוש, תוכן, אנליטיקס, webhook) | tag `v1.3.0`; `docs(state): v1.3.0 wave report` (`1a4f4ee2`) |
| 2026-08-10 | tag `v1.0.0` | `v1.0.0` |
| 2026-08-12 | גל שער הפיקסלים (הכלי מודד מול `refs/`, שבעה דפים) | tag `wave-pixel-gate`; `docs(state): the pixel wave closes` (`3fee144f`) |
| 2026-08-12 | גל קישורי דילים בדף הבית | tag `wave-deal-links` |
| 2026-08-12 | שלושת הלידים שנמדדו אחרי גל הפיקסלים | tag `wave-measured-leads` |
| 2026-08-12 | סבב docs אוטונומי pass-2 | `docs(batch-2): STATE after autonomous docs pass-2 wave` (`e391e05c`) |
| 2026-08-12 | סגירת תור האוטופיילוט של אותו יום | tag `autopilot-2026-08-12` |
| 2026-08-19 | גל הידוק DB, שלבים 13–15 | `chore(db): close the DB hardening wave` (`b0dbda27`) |
| 2026-08-19 | תור MONEY-WHOLE-SHEKELS כשלבים 22–25 (אגורות) | `chore(autopilot): queue the MONEY-WHOLE-SHEKELS wave` (`d7b98fa2`) |
| 2026-08-19 | גל פיקסלים (23) נמדד ומוזג; לא סגר את כל הדפים מתחת ל-11% | `merge(pixel): (23) pixel wave measurement`; `docs/PIXEL-WAVE-REPORT.md`; ענף `feat/pixel-wave` |
| 2026-08-19 | תור AUTOPILOT 23–26 (פיקסלים, seed, גיבוי, סריקה סופית) | `feat(autopilot): queue 23-26` (`69c17011`) |
| 2026-08-19 | rc / סיום פרויקט | tags `v1.0.0-rc1`, `v1.0.0-rc2`, `v1.0.0-rc3`, `v1.0.0-final` |
| 2026-08-20 | גל הידוק Auth, חמישה שלבים | `chore(auth): close the auth hardening wave` (`59d3bff6`) |
| 2026-08-21 | גל הידוק DB מול פרודקשן (רייט-לימיט פתוח ל-anon; 125 הייתה משביתה קופות) | `STATE.md` 03:20; אחריו `feat(rate-limit)` (`8e26c375`) |
| 2026-09-01 | גל כלי האדמין | `STATE.md` 01.09 |
| 2026-09-01 | tag מוכן לפרודקשן | `production-v1.0.0` |

`feat/ux-wave-final` מוזכר ב-`STATE.md` כענף שמוזג/נמחק; אין tag בשם הזה.

---

## 5. מה שנשאר פתוח מ-`docs/LAUNCH-CHECKLIST.md`

המסמך עצמו נושא באנר: מיושן מ-01.09, והרצף המחייב הוא `docs/LAUNCH-RUNBOOK.md` (שלבים 1–6 שם בוצעו). הסטטוסים בטבלאות הם **19.08**. כאן רק שורות שאינן PASS / N/A. עמודת "עדכון 01.09" היא מה שנמדד מאז ב-`OWNER-CHECKLIST` / `LAUNCH-RUNBOOK` / `FINAL-REPORT`, לא שינוי של הקובץ הישן.

### כסף ו-Cardcom

| # | שער | 19.08 | עדכון 01.09 |
| --- | --- | --- | --- |
| CC1–CC3 | מסוף ייצור + סודות ב-Vercel Production | BLOCKED_OWNER | עדיין אצל הבעלים (פריט 2 ב-OWNER-CHECKLIST) |
| CC4 | Low Profile על host קנוני | OPEN | תלוי DNS. עד אז: `kenyonexpress.vercel.app` |
| CC5 | GetLpResult ב-finalize | OPEN | קוד קיים; אין עסקה חיה |
| CC6 | עסקת קופון קצה-לקצה | FAIL (0 שוברים בפרודקשן, 07.08) | עדיין אין מסוף ייצור |
| CC7–CC10, CC13–CC14 | replay, סכום, settlement, כשל, preview≠prod, admin payments | OPEN | תלוי CC6 |
| CC11 | Refund ביום החיוב | OPEN (P1) | קוד החזר קיים; אין עסקה חיה |

### Resend

| # | שער | 19.08 | עדכון 01.09 |
| --- | --- | --- | --- |
| RS1 | מפתח API תקין ב-Production | FAIL (400) | LAUNCH-RUNBOOK: אימות דומיין עדיין לפני היום |
| RS2–RS5 | From מאומת, SPF, DKIM, DMARC | BLOCKED_OWNER | אותו חסם |
| RS6 | מייל רכישה אחרי עסקה | FAIL | תלוי RS1 + CC6 + cron `notifications` |
| RS7 | גילוי 14ג(ב) | OPEN | |
| RS10 | `CONTACT_TO` | OPEN (P1) | |

### DNS

| # | שער | 19.08 | עדכון 01.09 |
| --- | --- | --- | --- |
| DN1–DN11, DN13 | ייצוא אזור, TTL, חיבור Vercel, apex/www, HTTPS, Auth allowlist, canonical | OPEN | **לא בוצע.** האתר החי ב-`vercel.app`. cutover = שלב 7 ב-RUNBOOK, פריט 3 ב-OWNER-CHECKLIST |
| DN12 | מפת 301 מ-WP | חלקי | מיגרציה 128 פרסמה קטלוג אמיתי; הדומיין עדיין WP |
| DN14 | הקפאת מכירה ב-WP | BLOCKED_OWNER | |
| DN16 | Production Git branch = `main` | FAIL | PR #6 מוזג (STATE 31.08). עדיין צריך לוודא ב-Vercel שהפרויקט מצביע ל-`kenyonexpress/kenyonexpress` על `main` |

### סודות ו-cron

| # | שער | 19.08 | עדכון 01.09 |
| --- | --- | --- | --- |
| SE1 | Supabase URL/anon של prod | OPEN | `/api/health` חי מחזיר `database: ok` על `vercel.app` |
| SE2 | service role לא-demo | FAIL מקומית | לא נמדד מחדש על Vercel מכאן |
| SE3 | `VOUCHER_QR_SECRET` | BLOCKED_OWNER | |
| SE4 | `CRON_SECRET` | BLOCKED_OWNER | **מוגדר בדיפלוימנט:** `/api/cron/health` מחזיר 401 בלי Bearer |
| SE5 | Sentry DSN | BLOCKED_OWNER | STATE 21.08: Sentry EU דווח כחי |
| SE9 | Preview ≠ prod | OPEN | |
| SE10 | עשרה cron רצים | BLOCKED_OWNER | המסלולים פרוסים וסגורים. **אף מתזמן לא קורא להם.** פריט 1 ב-OWNER-CHECKLIST |
| SE11–SE13 | rollback, Deployment Protection, Meili/R2 | OPEN | R2: RUNBOOK מזהיר ש-32 תמונות עדיין מ-WP |

`SE6`/`SE7`/`SE8` כבר PASS בקוד/מדיניות.

### קטלוג

| # | שער | 19.08 | עדכון 01.09 |
| --- | --- | --- | --- |
| SD5 | כתובת/לוגו/טלפון לספקים | FAIL | |
| SD6 | picsum על מוצרים פעילים | FAIL (P1) | |
| SD7 | alt עברי | חלקי (P1) | |
| SD8 | כרטיסי בית לא 404 | FAIL (P1) | tag `wave-deal-links` 12.08 טיפל בקישורים שבורים; לא נמדד מחדש כאן |
| SD9 | השלמת מוצרים חסרים | OPEN (P1) | 128 פרסמה 19 מוצרים אמיתיים (נמדד ב-RUNBOOK) |
| SD10 | לא להחיל seed על prod | OPEN | |
| SD11 | seed לסטייג'ינג | לא ממוזג (P1) | |
| SD13 | slugs כפולים ב-WP | BLOCKED_OWNER (P1) | |

SD1–SD4, SD12 PASS. SD14/SD15 החלטות זמניות.

### משפט

| # | שער | 19.08 | עדכון 01.09 |
| --- | --- | --- | --- |
| LG7 | `/cancel` (14ט) | FAIL (חוסם GA) | |
| LG8 | checkbox תקנון+18 | OPEN | |
| LG9 | `terms_version` על הזמנה | OPEN (P1) | |
| LG10–LG12 | עו"ד, ח.פ/DPO, סיווג 14ח | BLOCKED_OWNER | |
| LG13 | דמי ביטול | OPEN | |
| LG14 | a11y ≥ 90 | חלקי (P1) | |
| LG15 | הסכם ספק חתום | OPEN (P1) | |

LG1–LG5 PASS קוד.

### DB ו-QA

| # | שער | 19.08 | עדכון 01.09 |
| --- | --- | --- | --- |
| DB5 | leaked password protection | FAIL (P1) | Dashboard, Q33 |
| DB6–DB7 | PITR + גיבוי ידני לפני cutover | OPEN | |
| DB8 | מע"מ 17 מול 18 | FAIL | **קוד:** `VAT_RATE_BP = 1800` ב-`src/lib/money.ts`. לא נמדד מחדש מול חשבונית חיה |
| A1–A4 | guest cart, Google בקופה, מחיר זהה, RLS בין משתמשים | OPEN | קוד קיים; אין E2E חי |
| V1 | שובר אחרי תשלום | FAIL על prod | תלוי CC6 |
| V2–V5 | סריקה, settlement 0, HMAC, פקיעה | OPEN | פורטל ספק קיים ב-main; cron פקיעה לא מתוזמן |
| Q1–Q4 | type-check, test, build, Playwright | OPEN על המועמד | שערי CI רצים על כל PR. E2E מדלג בלי `CI_SUPABASE_URL` |
| S1 | CVE קריטי בכסף | OPEN (P1) | |
| S2–S4 | rate limit, RBAC אדמין, לוגים בלי PAN | OPEN | rate-limit Upstash+Postgres נכנס 21.08; RBAC קיים |
| S5 | Sentry על checkout | תלוי SE5 | |
| S6 | 2FA ל-Dashboard | BLOCKED_OWNER | |

### ארבעת הפריטים שחוסמים עלייה היום (01.09)

מ-`docs/OWNER-CHECKLIST.md`, לא מהצ'קליסט של 19.08:

1. עשרת ה-cron ב-cron-job.org (או `CRON_SCHEDULER_ENABLED=true` + סוד ב-Actions).
2. מסוף Cardcom לייצור.
3. DNS cutover של `kenyonexpress.co.il` (אחרי עסקת טסט על `vercel.app`).
4. אימות ש-Vercel Production על `main` של הריפו הזה (PR #6 כבר מוזג בקוד).

---

## 6. איפה להמשיך

| מסמך | מתי |
| --- | --- |
| `docs/OWNER-CHECKLIST.md` | מה שנשאר בידיים, לא בקוד |
| `docs/LAUNCH-RUNBOOK.md` | סדר הפקודות ביום ה-cutover |
| `docs/CRON-EXTERNAL.md` | עשרת הלוחות |
| `migrations/pending/README.md` | מה מותר להחיל ומה אסור |
| `docs/ARCHITECTURE-FEATURE-FLAGS.md` | החוזה הישן לדגלים (חלקו לא מומש) |
| `docs/ARCHITECTURE-WISHLIST.md` | אם בונים מועדפים |
