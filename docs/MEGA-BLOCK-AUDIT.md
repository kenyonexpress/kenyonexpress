# Mega-block STEPS 2-13 — the scan-first ledger

The block's own rule: "סרוק קודם מה קיים ודלג עליו". This file is that scan,
one section per step, with the verdict and the evidence. A step whose spec
would DUPLICATE or CONTRADICT a live system is closed by this audit, not by
writing the duplicate — the whole closeout has been burying parallel
implementations, not minting them.

Two spec-wide corrections that apply to every step:
- `packages/money.ts` does not exist; money is `src/lib/commerce/money.ts`
  (integer agorot, branded). `src/db` does not exist; there is no Drizzle in
  this repo (the dup-repo port discarded it, on record) — data access is
  Supabase clients + RLS + definer functions.
- Migration numbers 147 and 148 are taken (money twins, refund destination).
  New files continue from 154.

## STEP 2 — AUTH: satisfied by existing, stronger implementations

| Spec item | Exists as | Verdict |
| --- | --- | --- |
| `sessions` table + createSession/rotate/destroy + cookie | Supabase Auth via `@supabase/ssr`: httpOnly cookie sessions with built-in rotation, on every client factory | **Skip.** A parallel sessions table is a second auth system — the exact live-vs-dead split this closeout spent a day burying. |
| `requireRole(roles)` | `requireAdminSession` (`src/lib/admin/rbac.ts`), `requireSupplierRole` (`src/lib/supplier/rbac.ts`), route-guards + tests | **Skip.** Per-domain guards exist and are tested; a generic second door adds a bypass surface, not safety. |
| `user_roles` many-to-many table | `profiles.role` (`user_role` enum: customer, content_uploader, admin, …), RLS-frozen against self-escalation | **Skip.** A second role store forks the model; every existing policy reads `profiles.role`. |
| Login route, Upstash 5/60 per IP | `src/server/actions/auth.ts:136,152` — `signInWithPassword` behind per-IP **and** per-account sliding-window limits | **Skip.** Existing is stricter than the spec. |
| logout / refresh routes | Supabase signOut in actions; rotation is the library's | **Skip.** |
| `rls-enabled.test.ts` (non-empty strings) | `src/lib/auth/rls-manifest.test.ts` + `supabase/rls-manifest.json` + `rls-write-policies.test.ts` | **Skip.** The existing tests assert the actual policy surface, not that a list of strings is non-empty. |
| `docs/AUTH-MODEL.md` | Exists, alongside `DB-SECURITY-MODEL.md` | **Skip.** |

## STEP 3 — PAYMENTS: satisfied, and the spec's machine contradicts the deployed one

| Spec item | Exists as | Verdict |
| --- | --- | --- |
| `state-machine.ts` with pending→authorized→captured→… | `src/lib/checkout/state-machine.ts` + `src/server/domain/orders/status-transitions.json` + **migration 137's triggers, live in production and proven 144/144** (`tests/sql/status_transition_guards.sql`) | **Skip, emphatically.** The spec's states (`authorized`, `captured`, `supplier_settled`) are not members of the deployed `payment_status`/`settlement_status` enums; writing them would 22P02 at runtime and fork the machine the DATABASE now enforces. Same trap as the refund-state names, already documented. |
| `cardcom.ts` createLowProfile + HMAC webhook verify | `src/lib/payments/cardcom.ts` (real legacy `/Interface/*.aspx` endpoints, 15s deadline, no-double-charge retry policy); webhook secret verification per Cardcom's actual IndicatorUrl mechanism (`acceptedWebhookSecrets`, two-secret rotation window) | **Skip.** The spec's HMAC-sha256 header is not what Cardcom sends; implementing it would reject every real callback. |
| `split.ts` executeSplit | `src/lib/checkout/split.ts` + `finalize.ts` (platform_percent snapshotted per line at checkout; splits recorded in `split_executions`, which exists in production) | **Skip.** |
| webhook route with dedup | `src/app/api/payments/cardcom/webhook/route.ts`: signature check, `(provider, external_id)` unique dedup with 23505-as-replay, GetLpResult re-verify, amount check, 13 journal events | **Skip.** Existing is substantially stronger than the spec. |
| `148_payments.sql` (payment_state column, webhook_events, split_executions, payment_discrepancies) | `payments.status` + 137 guard; `payment_webhook_events` live; `split_executions` live; discrepancies covered by `terminal-reconciliation.ts` + `payment_events` reconciliation event types | **Skip**, except `payment_discrepancies` persistence — reconciliation currently alarms rather than persisting rows; noted as a candidate for a future migration if wanted. |

## STEPS 4-13 — text never arrived

The block's message truncated mid-sentence inside STEP 3's migration item.
Steps 4 through 13 have no content in this repository or in the instruction,
and are not executable as named. This ledger takes them one by one when their
text lands.

## STEP 15 — עגלות נטושות: סגור בסריקה (02.09)

הכל קיים ופעיל, בעיצוב חזק מהספק:

- **מעקב פעילות:** `carts.updated_at` מתעדכן בטריגר (001) על כל UPDATE — אין
  צורך ב-`last_activity_at` ידני ולא במיגרציה.
- **בחירת זכאים:** ‏`fn_due_abandoned_carts` (מיגרציות 031/103, חי בפרודקשן) —
  חלון גיל, עגלה לא ריקה, הבעלים לא הזמין מאז, **הסכמת ניוזלטר מאושרת**, לא
  ב-suppression. הכללים ב-SQL ולא בקוד המסלול.
- **מסלול:** ‏`src/app/api/cron/abandoned-cart/route.ts`, ‏Bearer CRON_SECRET,
  ‏limit 100.
- **תזמון:** ‏`.github/workflows/cron.yml` (המתזמן החמוש), בדוק על ידי
  ‏`cron-schedule-inventory.test.ts` (עשרה jobs, דו-כיווני מול הדיסק).

**נדחה במכוון:** תזכורת שנייה אחרי 24 שעות עם תמריץ 5% לארנק. שלוש סיבות,
כולן מבניות: ‏(א) UNIQUE על cart_id ב-`abandoned_cart_nudges` אוכף "נודג' אחד
לעולם" — זו החלטת עיצוב מתועדת בקובץ המסלול (ספאם = כפתור spam); ‏(ב) דוא"ל
עגלה נטושה הוא דיוור מסחרי לפי 30א', ותזכורת שנייה מגדילה את החשיפה בדיוק
במקום שהעיצוב הקיים צמצם; ‏(ג) ‏type חדש `abandoned_cart_incentive` נוגד את
ה-enum הפרוס של wallet_transactions (enums פרוסים = חוק). אם אופיר ירצה
תמריץ, זה שינוי מוצר + מיגרציה שידונו בנפרד.

## STEP 16 — הפניות: סגור בסריקה (02.09)

קיים במלואו וחזק מהספק: טבלת `referrals` בפרודקשן (098), הכרעה כולה ב-SQL
ב-`fn_complete_referral` — ‏FOR UPDATE על שורת ההפניה, חלון זכאות, מינימום,
שני מבחני הונאה (fingerprint), תקרות חודשית ושנתית, תשלום דרך הארנק עם מפתח
אידמפוטנטיות — קרוא מ-`completeReferralForOrder` שכבר מחווט ל-finalize (מסלול
ה-webhook). ‏cookie/קוד/עמודי account+admin קיימים עם טסטים
(claim/complete/program/wired). אין מה להוסיף.

## STEP 17 — קמפיינים: סגור בסריקה + דחייה מנומקת (02.09)

מנוע ההנחות הקיים (`discount_campaigns`/`discount_redemptions`, מיגרציה 096,
‏`src/lib/growth/discount.ts`) מכסה את הצורך העסקי בעיצוב קשיח יותר:
‏basis points במקום percent, תקרת מימון מהעמלה (הנחה לעולם לא יורדת מחלקו של
הספק), ‏UNIQUE (campaign_id, order_id) כמחסום replay, ו-snapshot של
‏amount_agorot בזמן ההזמנה.

**נדחה במכוון:** טבלת `campaigns` שנייה עם `product_ids[]` והנחה אוטומטית על
מחיר המוצר. שלוש סיבות: ‏(א) זהו אתר דילים — המוצר עצמו הוא ההנחה
(‏original_price מול platform_price על coupon_deals); מנוע הנחות אוטומטי שני
על אותם מחירים הוא פיצול מקור אמת למחיר, בדיוק מה שכלל ה-snapshot של C10 בא
למנוע; ‏(ב) הנחה בלי קוד עוקפת את כלל המימון-מהעמלה של discount.ts (חוק 2) —
אין לה guard מי מממן אותה; ‏(ג) redemptions כפולים (discount_redemptions +
campaign_redemptions) על אותה הזמנה. קידום מוצרים נעשה דרך ה-CMS של דף הבית
(homepage/cms.ts) שכבר קיים.

## STEP 19 — מובייל ספקים: נסגר בסריקה + תוספת אחת (02.09)

**קיים וחזק מהספק:** הסורק (`/scan`, ScanClient) עם צעד אימות לפני שריפה
(‏lookup קורא-בלבד לפני redeem), ‏idempotency_key נגד דאבל-טאפ, קלט ידני עם
‏inputMode, כפתורי py-3 ברוחב מלא, והודעות עברית מהשרת לכל תוצאה
(לא נמצא/מומש/פג/ספק אחר — ההכרעה ב-redeem_voucher בפרודקשן).
‏coupon-scan.spec.ts כבר רץ גם על פרויקט mobile-chrome (רק
‏full-purchase-redeem מוחרג שם).

**נוסף:** סיכומי היום/30 יום (ספירה + לגבייה בעסק, ‏sumAgorot) בראש
‏/supplier/redemptions.

**נדחה במכוון:** ‏(א) manifest נפרד "קניון EXPRESS ספקים" — יש manifest אחד
לאפליקציה המשולבת (‏src/app/manifest.ts, החלטת bundle משותף מ-G10);
‏manifest שני על אותו origin היה מחליף את של החנות. ‏(ב) ‏compare.mjs למסכי
ספק — ‏refs/ke_live_singlefile.html הוא תבנית החנות; אין refs למסכי ספק,
אין מול מה למדוד. ‏(ג) route בשם /supplier/vouchers — הסורק חי ב-/scan
ו-/supplier/scan; שם שלישי לאותו מסך מוסיף בלבול בלי יכולת.

## STEP 20 — ‏SEO וסכמה: נסגר בסריקה + תוספת אחת (02.09)

**קיים:** ‏`src/lib/seo/json-ld.ts` (‏Organization, ‏WebSite, ‏BreadcrumbList,
‏Product+Offer ב-ILS מאגורות, ‏priceValidUntil לקופונים) עם ‏json-ld.test.ts;
‏sitemap.ts (‏lastmod.ts, ‏normalize-path.ts); ‏robots.ts עם רשימת disallow
ביטחונית (‏/redeem/ ראשון — טוקן חתום); metadata על 83/97 עמודים (הממצא
ההפוך מ-GAP-AUDIT היה טעות grep שנמשכה). ‏AggregateRating נוסף ב-STEP 18.

**נוסף:** ‏BreadcrumbList לעמוד קטגוריה, נבנה מאותו מערך `crumbs` של פירור
הלחם הנראה כדי שלא יוכלו לסתור זה את זה.

**נשמר בניגוד לספק:** ‏SearchAction ב-WebSite. הספק אמר "בלי SearchAction",
נגזרת של "אין UI חיפוש" — אבל ‏/search קיים ופעיל (וה-header 1:1 כולל אותו
בהוראת 02.09). ‏SearchAction שמצביע על route אמיתי הוא SEO נכון; להסירו היה
צעד אחורה. עמוד ספקים הוא דף נחיתה לליד — אין שם מבנה שראוי לסכמה; עמוד
קמפיינים לא קיים (נדחה ב-STEP 17).

## STEP 21 — ‏WP import ו-seed: נסגר בסריקה + תיעוד (02.09)

**‏WP import הושלם ב-07.08** (קומיט 8404118, ‏61→80 מוצרים, אידמפוטנטי על
‏`products.wp_id` שקיים בפרודקשן; ‏emit-missing-products.mjs פולט את מה
שנשאר בחוץ ולמה). צינור שש-שלבים עם שני מנעולים נגד כתיבה בטעות.

**נדחה במכוון: ‏seed-dev.mjs עם 20 מוצרים מומצאים.** יש מסד נתונים אחד —
הפרודקשן המאוחסן (‏Docker לא רץ כאן, וקבצי המיגרציות הם lineage אחר). ‏seed
"פיתוח" היה שותל מוצרים בדויים בקטלוג החי, ב-sitemap ובדוחות. הפיקסטורות של
‏seed-test-data.mjs (‏namespace קבוע, ‏--clean) הן הגרסה הבטוחה של אותו צורך.
נכתב ‏docs/SEED.md שמתעד את כל זה כולל מלכודת המפתח הישן ב-.env.local.

## STEP 22 — סגירת מגה-בלוק 2 (02.09)

התאמות ספק→מציאות, פעם אחת לכל הבלוקים הבאים:

- **תגים:** ההיסטוריה כבר ב-v1.3.0, אז ‏v1.1.0-rc1 של הספק תפוס מזמן. מיפוי
  קבוע מכאן: בלוק 2 → ‏`v1.4.0-rc1-block2`; בלוק 3 → ‏`v1.5.0-rc1-block3`;
  בלוק 4 → ‏`v1.6.0-rc1-block4`; בלוק 5 → ‏`v1.7.0-rc1-block5`; בלוק 6 →
  ‏`v1.8.0-rc1-block6`; בלוק 7 והלאה — התגים שבספק פנויים (‏v2.0.0-rc1…).
- **‏vercel.json crons: נדחה שוב.** ‏Hobby רושם שני jobs לכל היותר ומריץ פעם
  ביום; המתזמן החי הוא ‏GitHub Actions (‏cron.yml, חמוש ומאומת 02.09).
  ‏block של crons ב-vercel.json היה יוצר מתזמן שני חלקי — בדיוק הכשל
  ש-docs/CRON-EXTERNAL.md מתעד. ‏voucher-expiry קיים בשם ‏expire-vouchers.
- **‏LAUNCH-CHECKLIST.md** נושא באנר "מיושן, המחייב הוא LAUNCH-RUNBOOK" —
  העדכון "רק מה שאופיר עושה" הלך לכן ל-`docs/OWNER-CHECKLIST.md` (נוסף פריט
  המיגרציות 147–154 + ‏db:types). ‏LAUNCH-READINESS קפוא כ"תמונת מצב
  היסטורית" — נוסף לו נספח מתוארך במקום לשכתב מספרים בתוך snapshot חתום.

## STEP 23 — מנוע ארנק: סגור בסריקה (02.09)

חי מקצה לקצה, חזק מהספק: ‏`wallet_accounts`/`wallet_transactions` פרוסים
(006), יתרה נקראת ב-checkout עם ‏clamp במקום סירוב (‏wallet-input.ts — כוונת
הקונה אינה דו-משמעית), ‏`spendWallet` ב-finalize עם מפתח dedupe מול replay של
‏webhook, ועמוד ‏/account/wallet קיים. הכלל העסקי המחייב חזק משל הספק: הארנק
מוגבל ל**סכום המשולם באתר** (גם על קופון), לא "פיזי בלבד" — מה שנגבה בקופה
של הספק אינו שלנו להנחה (אותו עיקרון כמו discount.ts חוק 3), ומנוע הסליקה
זורק מעבר לזה. ‏view חדש/עמודות חדשות היו fork של המודל הפרוס.

## STEP 25 — התחשבנות ספקים: סגור בסריקה + ‏CSV אחד (02.09)

**קיים:** מכונת ההתחשבנות היא ‏`payout_statements` + ‏4 פונקציות ב-152
(‏pending, ‏port מ-027/051/079 מותאם לעמודות הפרודקשן), עמודי אדמין וספק
חיים, והיתרות מחושבות מ-sales/redemptions כבר היום (בלי תלות ב-152).
טבלת `settlements` נפרדת הייתה מקבילה כפולה ל-payout_statements.

**נוסף:** ‏`/api/supplier/payouts/csv` — אותם נתונים ואותו fold של עמוד
התשלומים, ‏UTF-8 BOM דרך ‏lib/reports/csv.ts, שקלים כמחרוזת + אגורות
כמספר גולמי זו לצד זו; כפתור הורדה בעמוד. ‏cron חודשי נדחה: הפקת statement
היא פעולה מנוהלת-אדמין עד ש-152 יוחל (אין טבלה לכתוב אליה), ותזמון אוטומטי
נכנס לתור של אופיר יחד עם ההחלה.

## STEP 26 — דשבורד אנליטיקות: סגור בסריקה + שתי תוספות (02.09)

**קיים (G12):** ‏/admin/analytics — תקופות יומי/שבועי/חודשי, ‏buckets,
‏totals, ‏top products, פיצול לפי סוג, ‏take-rate לפי אחוז מצולם, ‏funnel;
‏/admin/dashboard — כרטיסי היום (הזמנות, נגבה, הונפקו, מומשו, לקוחות
חדשים). ‏drizzle שבספק לא בשימוש בפרויקט (תלות מתה — מטופלת ב-STEP 83).

**נוסף:** ‏(א) עשרת הספקים המובילים — ‏SaleLine נושא כעת supplier_id/name
ו-`topSuppliers` הוא אותו fold של topProducts (עם טסט); ‏(ב) מיגרציה 156 —
שני אינדקסים חלקיים לחלונות האנליטיקות (‏orders.paid_at למשולמות,
‏vouchers.redeemed_at לממומשים), ‏dry-run מגולגל.

## STEP 28 — ‏CSP וכותרות: סגור בסריקה + תיקון באג אמיתי (02.09)

**קיים (אבטחה-360):** ‏CSP מלא ב-next.config.ts + ‏frame-policy.ts (חריג
‏frame-ancestors לשני מסלולי החזרה של Cardcom, מקורות לא-חופפים עם lookahead
כדי שלא יישלחו שתי כותרות CSP), ‏HSTS ‏63072000 preload, ‏nosniff,
‏Referrer-Policy. ‏nonce+strict-dynamic מתועד כמגבלה (דורש יצירה פר-בקשה
ב-proxy; ‏unsafe-inline בינתיים) — לא שונה.

**הבאג שהספק תפס:** ‏`Permissions-Policy: camera=()` היה סטטי על **כל**
מסלול — כולל סורק ה-QR של הספקים, שמשתמש במצלמה. סורק שלא רואה, בשקט.
תוקן בתבנית הקיימת: ‏`CAMERA_PATHS` + ‏`permissionsPolicyFor(pathname)`
ב-frame-policy.ts, מקור נפרד ב-headers() עם עוגן ‏`(?:$|/)` כדי ש-`scan`
לא יבלע מסלול עתידי. אומת חי: ‏`/` ו-frame-return מקבלים ‏camera=(),
‏`/supplier/scan` מקבל ‏camera=(self).

## STEP 29 — ‏TOTP לצוות: נבנה על ה-MFA המובנה של Supabase (02.09)

**נדחה במכוון:** טבלת `admin_totp` + ‏otplib + הצפנת AES צד-אפליקציה. ספק
האימות שמנפיק את הסשנים כבר מחזיק factors, מדרג סשנים ב-AAL (‏aal1 סיסמה,
‏aal2 סיסמה+גורם מאומת) ומגביל נסיונות. טבלה מקבילה = מקור אמת שני לאותה
שאלה, שהספק שמנפיק את הסשן לא קורא. אותו עיקרון כמו הדחייה של sessions
מותאמים ב-STEP 2.

**נבנה:** ‏(א) ‏`lib/auth/mfa.ts` — המדיניות במשפט טהור אחד: סשן צוות שבעליו
בעל גורם מאומת חייב aal2 (המצב ‏nextLevel=aal2∧current≠aal2 הוא היחיד
שנעצר), עם טסטים; ‏(ב) ‏`requireStaffMfa` בכל ארבעת שערי ה-rbac —
כשל-קריאה נסגר, לא נפתח; מפנה ל-`/auth/mfa` ולא ל-login (הסיסמה כבר עברה);
‏(ג) עמוד אתגר ‏`/auth/mfa`; ‏(ד) ‏`/account/security` — הרשמה עם QR של
הספק, הסרה, יציאה מכל המכשירים (‏signOut global). הרשמה נשארת וולונטרית:
אכיפת-הרשמה שנשלחת מריצה אוטונומית היא הדרך לנעול את האדם היחיד עם גישת
פרודקשן מחוץ לפאנל של עצמו. אין מיגרציה — אין סכמה משלנו.

## STEP 30 — ‏rate limits: סגור בסריקה + טסט שער אחד (02.09)

**קיים:** שכבת rate-limit שלמה (‏policies.ts עם טבלת מדיניות בדוקה-סנכרון מול
call sites, ‏sliding window, ‏Upstash + ‏fallback, כותרות 429, עברית).
כל ‏11 המסלולים המשנים מוגנים: אנושיים ב-checkRateLimit, מכונות בחתימה
(‏Cardcom secret ב-timingSafeEqual, ‏QStash signature, ‏Bearer). ‏limiter
"publicRead 100/min" נדחה — ‏rate-limit על GET ציבורי שכבר יושב מאחורי
‏CDN/cache הוא עלות בלי איום מוגדר.

**נוסף:** ‏`mutating-route-guards.test.ts` — סורק את ‏src/app/api ומפיל כל
‏POST/PUT/PATCH/DELETE בלי שער משתי המשפחות. משלים את auth-coverage
(פעולות שרת), ‏cron-auth (משמעת Bearer) ו-policies (טבלת המגבלות).

## STEP 31 — היגיינת תלויות וסודות: נבנה חלקית, נדחה מנומק (02.09)

**נבנה:** ‏(א) מיגרציה 157 — הזדקנות IP על audit_log append-only: החריג חצוב
בטריגר של 149 בצורה הצרה שאפשר (רק ip→NULL, רק >365 יום, שום שינוי אחר;
‏DELETE נשאר אסור), ‏fn_audit_retention_sweep ‏definer עם EXECUTE לשירות
בלבד, ‏dry-run מגולגל; ‏(ב) ‏cron ‏retention חודשי — ה-job האחד-עשר, מחווט
בכל ארבעת המקומות שהבדיקות כופות (‏cron-jobs.json, ‏cron.yml,
‏CRON-EXTERNAL.md, רשימת cron-auth), עונה ok+pending עד ההחלה;
‏(ג) ‏docs/SECRETS-ROTATION.md — סבב לכל סוד כולל שני מנגנוני ה-`_PREVIOUS`
והטוקן שהודבק בצ'אט.

**נדחה:** ‏(א) ‏scripts/env-check.mjs ב-CI — ‏src/lib/env.ts הוא כבר חוזה
boot שנכשל בפרודקשן, ‏env-example-is-complete.test.ts כבר אוכף אי-סחיפה,
ו-CI רץ בכוונה בלי סודות; בדיקה שלישית הייתה נכשלת שם תמיד או נבדקת ריק.
‏(ב) ‏dependabot שבועי — קיים ותוקן היום (‏target-branch הוסר).
‏(ג) מחיקת sessions — אין טבלת sessions משלנו; ‏auth.sessions מנוהל על ידי
Supabase. ‏pnpm audit: ‏1 low + 2 high טרנזיטיביים, כבר KNOWN-ISSUES ‏#7.

## STEPS 33–35 — ‏cache/queue/scale: שלושתם סגורים בסריקה (02.09)

**33 ‏Redis cache — נדחה.** שכבת ה-cache הפרוסה היא `use cache` של Next עם
‏`CATALOGUE_TAG` (‏catalogue-cache.ts): מוצר/קטגוריה/קשורים רצים בתוכה,
וכל מוטציית אדמין כבר קוראת `updateTag`. ‏cache שני ב-Upstash לצד זה =
שתי שכבות עם שני מנגנוני פינוי שמתבדרים בדיוק ברגע שחשוב; ‏Upstash כבר
משרת את מה שהוא טוב בו כאן (‏rate limiting) עם fallback ל-Postgres.

**34 תור מייל — נדחה.** ‏outbox קיים וחזק מהספק: ‏`notification_outbox`
בפרודקשן עם ‏attempts, ‏backoff מעריכי (2·4^n דקות), ‏dedupe_key ייחודי
שמוגש ל-Resend כמפתח אידמפוטנטיות, ‏status=dead, ניקוז דרך ‏cron
‏notifications, ועמוד ‏/admin/queues עם Retry לכל dead. מעבר ל-QStash push
היה מחליף מנגנון עובד-ונמדד במנגנון עם עוד ספק בדרך של כל שובר.

**35 פרטישנים — נדחה.** ‏audit_log מחזיק **568 שורות**; פרטישן חודשי הוא
תקורה בלי בעיה. אינדקסים "רק על סריקות מוכחות" — בדיוק מה ש-156 עשה
(שני החלונות של האנליטיקות). ‏DB-SCHEMA.md + ‏DB-HARDENING-AUDIT.md כבר
מכסים את צד התיעוד; ‏pooling הוא של Supabase (‏pgbouncer מובנה).

## STEPS 38–39 — ‏DR והתראות (02.09)

**38:** נכתב ‏docs/DR-RUNBOOK.md (שחזור מגיבוי Supabase — לא מקבצי מיגרציה,
שהם lineage אחר; ‏RTO<2h, ‏RPO 24h; רשימת מה-לא-לסובב). ‏backup-verify דרך
Management API נדחה: אין token, ו-nightly-health + ‏tar יומי (רץ היום,
‏770MB, שלושה נשמרים) הם הבקרה הקיימת. בדיקת הדשבורד = פריט של אופיר.

**39:** ‏**נוצר monitor אמיתי**: ‏Sentry Uptime על ‏/api/health כל 60ש',
‏timeout 10s, ‏down אחרי 3 כשלים (‏id 2159284, נוצר דרך MCP). ‏alert rules
נוספים אי אפשר ליצור מכאן (הקטלוג חושף find/get בלבד ואין SENTRY_AUTH_TOKEN)
— ‏ops/sentry-alerts.json מתעד live (הקיים + החדש) מול desired, עם ההערה
שנתיב ה-pager האמיתי הוא ntfy הישיר של alert.ts.

## STEP 41 — קונסולת אירועים: סגור בסריקה (02.09)

הקונסולה קיימת כשלושה מסכים ממוקדים: ‏/admin/payments עם ‏ReconcileClient
(הרצת התאמה מול המסוף + טיפול בפערים), ‏/admin/queues (שורות dead עם
Retry, כולל DLQ של החיפוש), ‏/admin/status (בריאות תלויות). פערי התאמה
מחושבים מחדש בכל ריצה מ-terminal-reconciliation.ts ומתריעים דרך
‏reconciliation_gap — אין state שהולך לאיבוד בהיעדר טבלה.

**נדחה/נדחה-לעתיד:** טבלת `payment_discrepancies` פרסיסטנטית עם notes
ו-resolve. עם אפס עסקאות אמת (מסוף mock) אין עדיין פער אחד לתעד; שכבת
מעקב-טיפול נכנסת כשיש היסטוריה לטפל בה. נרשם כהרחבה עתידית, לא כחוב.

## STEPS 43–45 — ‏PWA/פוש/ארנק: שלושתם סגורים בסריקה (02.09)

**43 ‏PWA:** קיים במלואו — ‏manifest.ts (‏standalone, אייקונים מ-script
ייעודי, ‏start_url נקי בכוונה), ‏public/sw.js שכל עיצובו הוא "לא לכלוא
deploy שבור" (מסמכים לעולם לא cache-first; ‏API/checkout/account מוחרגים),
‏/offline בעברית, ‏ServiceWorkerRegistrar. ‏install prompt "אחרי רכישה
ראשונה" נדחה — ‏prompt כפוי הוא anti-pattern מתועד; הדפדפן מציע לבד.

**44 ‏web-push:** נדחה — צינור הפוש הפרוס הוא Expo push (‏push_tokens
בפרודקשן, ‏expo.ts, עמודות push_* על ה-outbox, ניקוז באותו cron). ‏VAPID
web-push היה טרנספורט שלישי מקביל לאותם התראות; האפליקציה המשולבת (G10)
היא ערוץ המובייל.

**45 ‏passes ושיתוף:** קיים — חבילת ‏lib/wallet מלאה (‏pkpass, ‏Google
Wallet JWT, ‏/api/wallet/apple/[id], כפתורים שמסתירים עצמם כשה-env חסר),
‏WhatsAppShareButton/FacebookShareButton עם טסטים, ועמוד ‏/coupon/[id]
הוא תצוגת ה-QR הניתנת להדפסה (עם תיקון wa.me למספר מקומי).

## STEP 48 — תור העלאות: המודל הפרוס + אכיפה שנבנתה (02.09)

**המודל קיים:** ‏products.approval_status (‏draft/pending/approved/rejected,
‏enum פרוס), תפקיד ‏content_uploader עם גישת catalog בלבד, עמוד
‏/admin/approvals עם אישור/דחייה מבוקרי-audit. טבלת ‏product_submissions
נפרדת עם payload jsonb נדחתה — תור שני מקביל לאותה שאלה.

**שני חורים אמיתיים שהספק תפס, נסגרו:**
1. ‏content_uploader יכול היה לכתוב ‏platform_percent/supplier_split_percent
   ישירות (המסמך אומר "admin-only write") — עכשיו ‏applyUploaderPolicy
   (מודול טהור + טסטים) מפשיט את זוג-הפיצול מכתיבת uploader; ביצירה הפיצול
   נשאר NULL (העגלה מסמנת לא-זמין, ‏C1), בעריכה הערך השמור שורד.
2. ברירת המחדל של ‏approval_status היא **'approved'** — מוצר של uploader
   דילג על תור האישורים לגמרי. עכשיו כל כתיבת uploader נוחתת ‏'pending'.

## STEPS 49–51 — ‏CSV/תמונות/מדדים (02.09)

**49 ‏bulk CSV — נדחה.** אין ‏papaparse ואין צורך בו: ייבוא מרוכז קיים
כ-`scripts/wp-import` (שש-שלבים, שני מנעולים) לזרם האמיתי היחיד שהיה —
וורדפרס. ‏UI העלאת-CSV לצד מעלה-תוכן פותח ערוץ כתיבה עוקף-טופס לקטלוג חי
בשביל תרחיש שאין לו משתמש עדיין (מעלה תוכן אחד, 80 מוצרים).

**50 כלי תמונה — נבנה החלק המדיד:** שער ממדים ב-sharp צד-שרת
(‏רוחב ≥800px, יחס 1:2–2:1, הודעות עברית, ‏validateImageDimensions +
טסטים) מחווט ל-processAndUploadImage אחרי הדקודינג — הממדים לעולם לא
מדווחים על ידי הלקוח. ‏sha256-dedupe נדחה (אין טבלת product_images —
התמונות הן מערך URLs על המוצר; מיגרציה+עמודה בשביל דדופ של קטלוג בן 80
מוצרים) ו-crop צד-לקוח נדחה (תלות חדשה react-easy-crop; הודעת השער אומרת
לחתוך לפני ההעלאה).

**51 מדדי מעלי תוכן — נדחה כרגע.** ‏products.created_by קיים, אבל עם מעלה
תוכן יחיד ואפס submissions היסטוריים אין מה למדוד; ‏top-suppliers ב-26 הוא
המדד העסקי. יצטרף כשיש יותר ממעלה אחד.

## מגה-בלוק 9 (‏STEPS 53–57) — שירות לקוחות: סגור בסריקה + דחייה מנומקת (02.09)

**קיים:** ‏(54) טופס ‏/contact בדיוק לפי הספק — ‏zod, ‏honeypot (מעמיד פני
הצלחה כדי שהבוט לא ינסה צורה אחרת), ‏rate limit ‏contact:5/שעה, ‏RTL,
נשלח לתיבה עם ‏reply-to של הלקוח; ‏(55) ‏/faq עם ‏12 שאלות שמכסות את כל
נושאי הספק (קופון, תוקף, ביטול/החזר, ארנק, חשבונית, אשראי, אחריות ספק,
לא-הגיע-למייל, הצטרפות עסק) + ‏FAQPage JSON-LD + קישור בפוטר.

**נדחה במכוון: מערכת טיקטים מלאה (53, 56, 57 החלק הטיקטי).** שתי טבלאות,
ארבעה עמודים, תשובות מוכנות ו-SLA cron — משטח מוצר שלם בשביל ערוץ תמיכה
שיש לו כרגע **אפס פניות** ומפעיל אחד. מודל התמיכה הפרוס הוא המייל עם
‏reply-to: השרשור קורה בתיבה, שם המפעיל ממילא עובד, וזה עומד בחוק "אל
תבנה מקבילה למה שחי". מערכת טיקטים נכנסת כשנפח הפניות מצדיק תור, לא לפניו.
נרשם כהרחבה עתידית.

## מגה-בלוק 10 (‏STEPS 58–62) — שותפי קופון: סגור בסריקה (02.09)

**המודל קיים ופרוס, בשמות אחרים:** "‏coupon_partner staff" של הספק הוא
בדיוק ‏`supplier_members` עם תפקיד ‏**scanner** — קיים בפרודקשן, עם
‏invited_by, פעולות אדמין להוספה/הסרה (מבוקרות audit), והפרדת הרשאות
שהעמודים כבר אוכפים (‏scanner לא רואה תנאים מסחריים — עיצוב מפורש של עמודי
הפורטל). מימושים כבר מיוחסים גם ל-supplier וגם ל-user
(‏redeemed_by_user_id/redeemed_by_supplier_id). תפקיד ‏user_roles חדש
בשם ‏coupon_partner היה fork של ‏enum פרוס ושל מודל חי.

**נדחה כמוקדם:** ‏(א) ‏supplier_locations רב-סניפי — לספקים יש lat/lng
יחיד (‏136 pending) ואין בקטלוג ספק מרובה-סניפים אחד; ‏(ב) אנליטיקות
פר-סניף/פר-עובד — אין נפח; סיכומי היום/30 יום (‏STEP 19) הם הרזולוציה
המתאימה לנפח הנוכחי. שניהם ייכנסו כשיהיה ספק עם שני סניפים.

## מגה-בלוק 11 (‏STEPS 63–67) — וריאנטים ומלאי: סגור בסריקה (02.09)

**הכל פרוס:** ‏`product_variants` בפרודקשן (‏sku, ‏price/price_modifier,
‏stock_quantity) עם בורר בעמוד המוצר (‏ProductInfo), נשיאה בעגלה לפי
מפתח ‏product::variant, וטופס אדמין (‏variantSchema + ‏soft-delete
בעריכה). מניעת oversell היא שריון מלאי **אטומי** מ-[74] (מיגרציה 117) —
לא ‏SELECT FOR UPDATE בקוד אלא RPC; ‏"נותרו X" זורם ב-Suspense
(‏StockScarcity). התראות מלאי נמוך: ‏cron ‏stock קורא ‏v_low_stock מול
‏low_stock_threshold פר-מוצר ושולח דרך ה-outbox (‏kind ‏low_stock פרוס).

**נדחה:** ‏(א) ‏stock_movements ledger עם view נגזר — ריפקטור של מנגנון
אטומי עובד למודל אחר, בלי בעיה שמניעה אותו; ‏(ב) ‏CSV וריאנטים —
כמו 49/66, ערוץ עוקף-טופס בלי משתמש.

## מגה-בלוק 12 (‏STEPS 68–72) — שיווק: סגור בסריקה (02.09)

- **69 ניוזלטר והסכמה — קיים:** הרשמה עם double opt-in
  (‏/newsletter/confirm), הסרה בקליק (‏/newsletter/unsubscribe), ‏salt
  ל-hash של ה-IP (‏CONSENT_IP_SALT), וההסכמה נאכפת בפועל — ‏dying proof:
  ‏fn_due_abandoned_carts מסרב לנג'ז בלי מנוי מאושר (סעיף 30א').
- **71 ‏UTM — קיים:** ‏attribution.ts, ‏cookie ‏ke_attr ל-30 יום, ‏UTM
  בלבד בהחלטת בעלים מ-20.07 (אין מדיה בתשלום → אין צרכן ל-click IDs);
  ‏jsonb שומר מקום להרחבה בלי מיגרציה.
- **68 ‏react-email — נדחה:** תבניות המייל חיות ב-buildNotification עם
  בדיקת ההסכם התלת-כיווני (‏outbox-kinds); שכתוב HTML עובד ל-JSX עם תלות
  חדשה וסנאפשוטים הוא ריפקטור בלי באג שמניע אותו.
- **70 סגמנטים ושיגורים — נדחה:** מנוע קמפיינים המוני לרשימת תפוצה בת
  אפסים; ‏RESEND_AUDIENCE_ID כבר מוכן לרגע שיש רשימה.

## מגה-בלוק 13 (‏STEPS 73–77) — חשבונאות ישראלית: סגור בסריקה (02.09)

**המסמכים מונפקים על ידי Cardcom, לא על ידינו — וזה העיצוב.** [73] קבע:
קבלה לקופון (‏document type 4), חשבונית מס לפיזי, ‏credit note בהחזר
(‏type 3), תור הנפקה שמוזן מ-finalize ומנוקז ב-cron ‏invoices, עם התראת
‏invoice_dead כשמסמך נתקע. ‏VAT באגורות דרך ‏extractVat (‏1800bp, עם
override ‏INVOICE_VAT_PERCENT שזורק על ערך לא-תקין — לא נופל לברירת מחדל
שקטה). הורדת מסמך ללקוח: ‏/account/orders/[id]/invoice (מוגש רק אחרי
בדיקת session מחדש — לא URL של הספק). מסב/ייצוא: ‏/admin/reports +
‏/api/admin/reports/[report] (‏CSV עם BOM) + ‏settlement-report עם טסטים.

**נדחה:** ‏(א) ‏PDF משלנו ב-@react-pdf + ‏R2 — מנפיק מסמכים מקומי מקביל
ל-Cardcom הוא בדיוק מה שרגולציית מסמכים ממוחשבים לא צריכה מאיתנו; ‏(ב)
טבלת `invoices` נפרדת — המסמך חי אצל Cardcom, ‏orders.invoice_number הוא
הרפרנס; ‏(ג) ‏self-billing לספקים — נכנס עם הפעלת מכונת ה-payouts (152).
