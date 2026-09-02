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
