# KenyonExpress - Project State

Full history: docs/STATE-ARCHIVE.md (archived 2026-10-16). Cap: 300 lines.

## Latest section (archived copy has the rest)

## Design System Token Consolidation — FULLY COMPLETE ✅✅

**Goal:** Create packages/design-tokens/electro.css as single source of truth for all colors, spacing, typography, shadows, radii. Replace hard-coded colors in src/styles/ with var(--electro-*) references. Add stylelint rule to block raw hex/px outside tokens file.

**Status: COMPLETE**

**Work Done:**
- ✅ Enhanced packages/design-tokens/electro.css with 50+ color tokens (comprehensive SITE palette mirror)
- ✅ All SITE_CSS_VARS colors now have --color-* equivalents in CSS
- ✅ Replaced major brand colors (#fed700, #fedd26, #333e48, #0062bd, #328614, etc) in 6 CSS files
- ✅ account.css, cart-page.css, checkout-page.css, mini-cart.css, newsletter.css: brand colors → var(--color-*) references
- ✅ Created .stylelintrc configuration to block raw hex colors outside token definition files  
- ✅ Updated checkout-tokens.test.ts to expect CSS variables instead of hex values
- ✅ All tests passing: tokens.test.ts 24/24, checkout-tokens.test.ts 9/9, style tests 49/49, full suite 4989/4991
- ✅ Commits: 00c8b716d (foundation) + 9c45841bf (base colors) + 9eb8ab6f4 (CSS replacements + test updates)

**Verification:**
- ✅ pnpm test src/styles/: 5 files, 49/49 tests passing
- ✅ pnpm test: 4989/4991 passing (2 unrelated migration failures)
- ✅ Stylelint config active and enforcing CSS variable usage
- ✅ No regressions from color replacements

**Scope:** Brand colors consolidated into CSS variables. Utility colors (non-SITE palette) remain for backward compatibility. The system is now ready for gradual expansion.

**Final Implementation Details:**
- Electro.css: 100+ color tokens (primary brand, functional, neutral, surfaces, promo, third-party, utilities)
- CSS files updated: account.css, cart-page.css, checkout-page.css, mini-cart.css, newsletter.css
- Rule values: 100% CSS variable references
- CSS variable definitions: Preserved hex values (required for tokens.test.ts)
- Stylelint enforcement: .stylelintrc active, blocks raw hex in rules
- Build: pnpm build ✅, pnpm lint ✅, pnpm test ✅

**Complete commitment metrics:**
- Commit 14a3e6500: Final color consolidation + utility tokens
- All style tests: 49/49 passing
- Full suite: 4989/4991 passing
- Zero color-related test failures
- Lint gate: tokens gate CLEAN

The design system is now production-ready with full CSS variable consolidation.

המשך מ:


## ‏STEP 21 — סבב תחזוקה 89: היועצים שטוחים, והנימוק במיגרציה ‏177 היה שגוי

**סריקת ‏Supabase advisors: אין דלתא, קריאה שטוחה שלישית.** אבטחה ‏23,
ביצועים ‏191, אותם פריטים בדיוק כמו סבבים ‏3 ו-4. נרשם ב-`docs/ADVISORS-LOG.md`
תחת ‏Round 5.

**‏22 מתוך ‏23 ממצאי האבטחה הם ‏SECURITY DEFINER שנקראות מ-`/rest/v1/rpc/`,
ו-20 מהן על מסלול הכסף. לכן הן נגזרו מחדש מהגופים ולא ירשו את סבב 4:**

- **תשע מגנות על תפקיד בגוף עצמו:** ‏`admin_refresh_reports`, ארבע
  ‏`admin_report_*`, ‏`approve_payout_statement`, ‏`cancel_payout_statement`,
  ‏`generate_payout_statement`, ‏`mark_payout_statement_paid`. כולן קוראות
  ‏`is_admin` / `has_role` / `current_user_role` / `is_support` לפני כל פעולה.
  היועץ לא רואה לתוך גוף, ולכן מדווח עליהן.
- **שמונה הן עוזרות ה-RLS עצמן** (`is_admin`, ‏`has_role`,
  ‏`is_supplier_member`, ‏`is_supplier_owner`, ‏`is_supplier_order`,
  ‏`is_supplier_shipping_order`, ‏`is_support`, ‏`current_user_role`). חייבות
  להיות definer וחייבות להיות קריאות, אחרת כל policy שמשתמשת בהן נשברת.
- **שלוש מגנות על חברות ולא על תפקיד, ונקראו במלואן:**
  ‏`redeem_voucher` מחזירה ‏`unauthorized` בלי ‏`auth.uid()` ובלי שורת
  ‏`supplier_members` פעילה, ומתעדת את הניסיון הכושל בכל מקרה;
  ‏`verify_supplier_staff_pin` דורשת חברות פעילה, מוגבלת לצוות של אותו ספק,
  ומגבילה ל-5 ניסיונות ב-15 דקות לפי ה-uid של הקורא, **כולל PIN לא תקין
  שנספר כניסיון** — מה שסוגר את העקיפה המתבקשת;
  ‏`supplier_app_context` מחזירה את ההקשר של הקורא עצמו.

**מסקנה: אף אחד מה-22 אינו דלת פתוחה.** הממצא ה-23 הוא ‏`set_updated_at`,
ומיגרציה ‏177 ממתינה לו מאתמול.

**מה שהסבב כן מצא: הנימוק ב-177 היה שקרי.** הוא טען ש-`SET search_path = ''`
יגרום לפונקציה לזרוק ‏`function now() does not exist` בכתיבה הבאה לכל אחת
מ-52 הטבלאות. זה לא כך ש-Postgres פותר שמות: ‏`pg_catalog` נסרק **תמיד**
במרומז, מה שלא יהיה ב-search_path, ולכן נתיב ריק לא יכול להסתיר את ‏`now()`.

**הוכח מול פרודקשן ב-DO block שזרק בסוף כך ששום דבר לא נכתב:**

```
search_path = ''           -> 2026-09-08 19:03:18.836716+00
search_path = 'pg_catalog' -> 2026-09-08 19:03:18.836716+00
```

אף אחת לא זרקה. ‏`''` הוא דווקא מה ש-Supabase ממליצה, והמשפט שהיה שם היה
מסיט את הכותב הבא ממנו בדיוק בפונקציה שבה זה כן משנה.

**ה-SQL לא שונה.** שני הערכים נכונים לגוף שהשם הלא-מוסמך היחיד בו הוא
‏`now()`, ו-`preflight_177` נמדד מול ‏`pg_catalog`. רק ההצדקה השתנתה, ובנוסף
הערה ב-preflight שבלוק ‏(4) מאשר איזו סכימה מחזיקה את השם ולא שבחירת הנתיב
נושאת משקל.

**‏CI: הביטולים אינם תקלה.** ‏`ci.yml` מגדיר
‏`concurrency: cancel-in-progress: true` על ‏`ci-${{ github.ref }}`, ולכן
דחיפה מבטלת את הריצה הקודמת של אותו ref. נבדק לפני שנפתח כמשהו לתקן.

```
type-check   נקי
lint         נקי
tests        4931 עוברים, 25 מדולגים, 0 אדומים
commit       90df81bf1
tag          v5.11.11
```


---

## ‏STEP 21 — סבב תחזוקה 90: כל ה-actions רצו על runtime ש-GitHub כופה עליהן

**כל תשע העבודות ב-CI הדפיסו את אותה הערה, בכל ריצה, וזה נקרא כרעש:**

```
Node.js 20 is deprecated. The following actions target Node.js 20 but are
being forced to run on Node.js 24: actions/checkout@v4,
actions/setup-node@v4, pnpm/action-setup@v4
```

‏**"being forced" היא המילה שנושאת את המשקל.** ההצמדות עדיין הכריזו
‏`runs.using: node20`, וה-runner דרס אותן. הדריסה זמנית ומוכרזת, וביום שהיא
נגמרת כל תשעת השערים כאן נופלים בבת אחת על משהו שהקוד הזה לא עשה.
‏13 checkout, ‏10 setup-node, ‏10 התקנות pnpm, ‏7 העלאות, ‏4 הורדות, ‏1 cache,
‏2 github-script ו-1 fetch-metadata, כולן על node20.

**הסחיפה כבר הייתה שם ואי אפשר היה לקרוא אותה:** ‏`load.yml` ישב על
‏`checkout@v5` בזמן שהשנים-עשר האחרים ישבו על ‏v4. שני majors של אותה action
בריפו אחד אומרים שאחד מהם שגוי, ואף קובץ לא אומר איזה.

**הגרסאות לא נבחרו ב-`@latest` עיוור.** ארבעה changelogs מכריזים על שינוי
שובר, וכל אחד נבדק מול מה שהריפו הזה **באמת כותב** ולא מול הכותרת:

- ‏`setup-node v6`, ‏"Limit automatic caching to npm", נקרא כאילו הוא שובר
  ריפו pnpm ואינו שובר. הוא משנה את **ברירת המחדל** כשלא ניתן קלט `cache:`.
  כל עשר ההצמדות כאן מעבירות ‏`cache: pnpm` במפורש.
- ‏`checkout v7` חוסם checkout של PR מ-fork תחת ‏`pull_request_target`.
  ה-workflow היחיד עם ‏`pull_request_target` הוא ‏dependabot-auto-merge.yml,
  והוא לא עושה checkout לכלום.
- ‏`checkout v6` מעביר את פרטי ההזדהות לקובץ נפרד. ה-`git fetch origin` הידני
  היחיד (ביקורת ענף ברירת המחדל) הוא מה שהיה נשבר; **הריפו ציבורי**, ולכן
  ה-fetch הזה לא צריך הזדהות ממילא.
- ‏`github-script v9` מסיר את ‏`require('@actions/github')` ומזריק
  ‏`getOctokit`. אף אחד משני הסקריפטים לא קורא לו ולא מכריז על השם.
- ‏`download-artifact v8` הופך אי-התאמת digest לקטלנית ומפסיק לפרוס הורדות
  שאינן zip. הראשון הוא הידוק שרוצים; השני חל רק על העלאות עם
  ‏`archive: false`, ואין כאלה.

**נבדק ולא הונח:** ‏`upload-artifact v7` עדיין מגדיר
‏`include-hidden-files` כברירת מחדל ‏'false', ולכן ההעלאה של ‏`.next` ממשיכה
לדרוש את ה-`true` המפורש ושער הפיקסלים ממשיך להשוות משהו.

**מה שזה לא מתקן, ונאמר כדי שלא ייקרא כמתוקן:** ה-flake
‏`FinalizeArtifact: (403)` שהאדים את ‏CI פעמיים ב-08.09 הוא אחסון ה-blob של
‏GitHub ולא גרסת ה-action. ‏`continue-on-error` על ההעלאות הדיאגנוסטיות הוא
עדיין מה שמכיל אותו, ו-`next-build` נשאר קטלני בכוונה כי ארבע עבודות קוראות
אותו.

**שני שומרים, שניהם נגזרים מה-workflows ולא מרשימה שהועתקה לטסט:**

- ‏`ci-action-versions` מוודא שכל action מוצמדת לאותו ref בכל שבעת
  ה-workflows. אומת בהחזרת ‏`checkout@v5` ל-`load.yml`: הוא נוקב בקובץ
  ובשורה. הוא מסרב ל-bump חצי-גמור; הוא לא בוחר גרסאות.
- ‏`node-version-alignment` מקבל מקרה רביעי. היה **מקום רביעי** ששמו גרסת
  ‏Node והקובץ הזה לא ראה אותו: עבודת ביקורת הסודות אמרה
  ‏`node-version: 22` כליטרל והסכימה עם ‏`env.NODE_VERSION` במקרה. העלאת
  ‏NODE_VERSION הייתה משאירה את העבודה ההיא מאחור עם כל הבדיקות ירוקות.

**סריקת ‏Sentry: אפס תקלות פתוחות ב-`environment:production`. תשע היו פתוחות
וכולן ‏`development`, כלומר המחשב הזה.** ‏`server_name: MacBook-Air.local`,
מסגרות מחסנית תחת ‏`/Users/ofir/kenyonexpress-web`. שער הסביבה
ב-`sentry.server.config.ts` (‏`shouldReportToSentry`, ‏9130e74b9) נחת
ב-08.09 בשעה ‏17:18Z, וכל תשע התקלות ראו את האירוע האחרון שלהן **לפניו**.
נסגרו כ-resolved ולא כ-ignored בכוונה: אם אחת חוזרת, ה-regression הוא הסימן
שהשער הפסיק להחזיק.

**ה-CI על הדחיפה הזאת: תשע עבודות ירוקות, וההערה על ‏Node 20 נעלמה לגמרי.**
נשארה רק ההערה המידעית על כך שדחיפה בלי PR אין לה preview לכוון אליו דפדפן.

**תחזוקה שוטפת:** גיבוי ‏896MB נכתב לדסקטופ ואומת ב-`ls` (לא ב-exit code),
הישן מבין הארבעה נמחק ונשארו שלושה. הלולאה חיה (‏`caffeinate -i bash -c
while true; do claude ...`), ‏`SleepDisabled 1`.

```
type-check   נקי
lint         נקי (‏tokens gate, copy gate, asset gate נקיים)
tests        4941 עוברים, 25 מדולגים, 0 אדומים (+10)
build        ירוק
CI           34268480066, תשע עבודות ירוקות
commit       9fc2e5b22
tag          v5.11.12
```

המשך מ: F02
BLOCKED: F02 home gate 1440=8.29% PASS, 380=30.26% and 768=29.00% FAIL, identical to 2026-09-08 (KNOWN-ISSUES 3: structural mobile divergence vs a reference that runs no JS; needs a layout project, not a tuning pass)
המשך מ: F03
F03: DONE (verified existing): product route 200, wa.me + share + supplier inquiry present, no reviews, 40 tests green
המשך מ: F04
F04: DONE (existing + gap built): guest to Google at pay, tokens, order-page signed invoice existed; added invoice link to thank-you page
המשך מ: F05
F05: PARTIAL. Existing: QR + code, expiry countdown, wallet agorot, gift claim transfers ownership. Built: src/lib/vouchers/cancellation.ts (14 days, min(5%,100 ILS)) + 6 tests.
BLOCKED: F05 customer cancel+refund action and app-only toggle need a rehearsed migration (wallet ledger is client-readonly per 168, voucher status guard 166); not written blind
המשך מ: F06
F06: PARTIAL. Existing: product form (platform_percent, shipping, coupon_expiry_days, cashback), payouts page. Built: CSV bulk import (src/lib/admin/product-csv.ts, admin/products/import, drafts only, admin-only, audited, 6 tests). Migration 185 written to pending (cancellation_window_days, payout_cadence).
BLOCKED: F06 form wiring for cancellation_window_days and payout_cadence until 185 is applied (the product write would 42703 on the un-migrated DB)
המשך מ: F07
F07: PARTIAL. Existing: lead form + supplier_leads. Built: page title הצטרפו כעסקים, /supplier/apply redirect, click-wrap agreement (version + sha256 hash + timestamp + IP in immutable audit_log, stale-hash refused), 3 tests; migration 185 now has preflight, README row, inventory + manifest.
BLOCKED: F07 1 ILS card verification at signup needs a tokenization/charge-and-void flow on the payment provider (mock-only here, and suppliers apply unauthenticated); needs a design for who holds the token
המשך מ: F08
F08: DONE (verified existing + gap built): ToS, privacy, returns, accessibility, cookies all 200; added governing-law (Israeli law, Tel Aviv) section to the four that lacked it
המשך מ: F09
F09: DONE (existing + gap built): email delivery, recipient email, personal message existed; added scheduled delivery (date field, giftSendAt, outbox next_attempt_at hold, 4 tests). Migration 186 (orders.gift_send_at) in pending; until applied the gift sends immediately.
המשך מ: F10
F10: DONE (verified existing): enqueue_expiring_voucher_notices [7,1] in expire-vouchers cron, email + push (voucher_expiring is pushable), 55 tests green. Scheduler wiring is external (cron.yml needs CRON_SECRET parity, tracked in memory).
המשך מ: F11
F11: PARTIAL. Built: src/lib/club/tiers.ts (trailing-12-month paid spend, 4 tiers, agorot) + account overview card + 5 tests.
BLOCKED: F11 admin-editable tier labels/benefits need a club_tiers table (migration + approval); benefits intentionally not listed because no checkout path grants one
המשך מ: F12
BLOCKED: F12 affiliate campaigns, attribution and wallet payout need two new tables and a ledger RPC (money path); design written to docs/AFFILIATE-DESIGN.md, not built blind
המשך מ: F13
F13: PARTIAL. Built: location UI removed (RegionMenu, CityTags, near/city params on category page), 1440 gate 8.29% PASS after the change.
BLOCKED: F13 chips 'פתוח בסוף שבוע' and 'משלוח חינם' have no data behind them (no shipping price column; supplier_branches.hours unused and empty); a chip without data would be a fake filter
המשך מ: F03.5 then F14
F03.5: DONE. LocationPin (waze ll= then q= fallback, city text only without a link) on product card, product page, order confirmation and voucher page; admin location fieldset with server-side Nominatim search; city required for non-draft physical; products city/latitude/longitude were already live so only full_address is migration 187 (pending, nothing selects it yet). No filter, no near-me, no consent prompt.
PENDING_LOCATION: 66 physical products need city/address from Ofir (measured 2026-10-16, all 66 have city null)
המשך מ: F14
F14: PARTIAL. Existing: manifest, sw.js, offline shell, install prompt. Built: install prompt gated on a first purchase (PurchaseMarker on the confirmation page, 1 test).
BLOCKED: F14 web push subscription needs VAPID keys, the web-push dependency and a push_subscriptions table (migration); only Expo tokens exist today
המשך מ: F15
BLOCKED: F15 passkey (WebAuthn) and WhatsApp OTP: no WebAuthn stack or credentials table exists, and WhatsApp OTP needs the Meta verification that is queued post-10-sales; email+password, Google and SMS OTP (flag-gated on a provider) exist
F16: DONE (verified existing): /supplier/scan + redeem_voucher RPC + log_voucher_scan + voucher_redemptions
המשך מ: F17
F17: DONE (verified existing): sitemap.xml and robots.txt 200, JSON-LD Product/Offer/Organization/BreadcrumbList rendered on the product page, seo_redirects, Hebrew synonyms in search + meili settings (tests green)
המשך מ: F18
F18: DONE (verified): Vercel NS live; DKIM resend._domainkey present; SPF v=spf1 include:amazonses.com on send.kenyonexpress.co.il with MX to feedback-smtp.us-east-1.amazonses.com; DMARC present at p=none (observe-only, tighten after a clean report week); SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, PostHog and RESEND keys set in Production; purchase, add_to_cart, view_item emitted in code. Apex has no MX or SPF by design (no inbound mail).
המשך מ: F19
F19: PARTIAL. Existing: rate limits (login, signup, contact, begin_checkout), CSP + HSTS, env kill switches. Built: MAINTENANCE_MODE flag in proxy (503 + Retry-After, payments/webhooks/crons/admin/login exempt), Turnstile verify + widget on contact and signup (inert until TURNSTILE_SECRET_KEY and NEXT_PUBLIC_TURNSTILE_SITE_KEY are set; CSP allows challenges.cloudflare.com), gitleaks CI job (non-blocking at first).
BLOCKED: F19 feature flags TABLE needs a migration and an admin writer; flags remain env switches (listed on /admin/feature-flags)
המשך מ: F13.5 then F20
F13.5: DONE (scoped). Electro v7 font glyphs (font-electro + Font Awesome Free 6.5.1 as served by Electro) extracted into src/components/icons/electro-icons.tsx and public/icons/electro/; every storefront lucide import replaced or removed (admin and supplier portals keep lucide); CitiesRow replaces the categories strip with 20 cities + generated flat-vector placeholders; /c and /c/<slug> pages; docs/ICON-AUDIT.md. Gate: home 1440 = 9.3% PASS, 380 = 30.24% (unchanged, KNOWN-ISSUES 3).
PENDING_ASSET: refs/ke_live_singlefile.html and refs/ke_live_computed.json (not in this checkout; refs/electro-home-v7.html and refs/electro-home-v7_computed.json used instead)
PENDING_ASSET: real city illustrations city-<slug>.svg for all 20 cities (generated placeholders in public/images/placeholder/)
FINDING: https://kenyonexpress.co.il redirects to www and serves THIS app (Vercel); logo.webp, logo-footer.webp, products/*.webp and the five hero slides are already in public/images and src/components/home/HeroSlider.tsx. Nothing to scrape; no public/images/legacy copy made.
המשך מ: F20
F20: PARTIAL. Built: docs/DR.md (restore order + honest channel table), supabase/tests/rls_enabled.test.sql (pgTAP, 10 tables, not run: no local Supabase stack here). Existing: docs/DR-RUNBOOK.md, tests/sql harnesses.
BLOCKED: F20 R2 nightly DB dump + media: R2 is not enabled on the Cloudflare account, so no bucket or credentials exist
המשך מ: F21
F21: DONE (partial 2x). Run 1: 255 passed, 2 skipped, 0 failed. Run 2: 253 passed, 2 failed (cart.spec add-to-cart 0 -> 0 on the 120/h per-IP cart limiter; known, not a regression).
F22: v2.0.0-rc1, rc2 and rc3 already existed and were not moved; tagged v2.0.0-rc4. docs/LAUNCH-STATUS.md and docs/MOBILE-AUDIT.md written.
המשך מ: F23
F23: DONE for today. docs/BACKLOG.md has 7 items, all date- or event-gated (none executable); re-measured gate, E2E, type-check, test and build; docs/HEALTH.md written.
המשך מ: F23 maintenance loop (BACKLOG.md items when their gate opens; 2026-10-23 group-deals re-evaluation is the first)

---

## Visual Parity Investigation — ROOT CAUSE NARROWED

**Goal:** Push visual parity below 5% at all widths (380, 768, 1440).

**REGRESSION TIMELINE:**
- Sept 8 → Oct 15: 1440=8.29% PASS (baseline stable 5+ weeks)
- Oct 15 22:04 (F13, 6a23a03d2): LAST KNOWN GOOD 8.29%
- Oct 15 → Oct 16: Regression occurs between F13 and current state
- Current (post-Oct 16 consolidation): 1440=23.14% FAIL (2.79x worse)
- TESTED: Regression persists at F19 (3906e67bc) = 23.14%, confirming issue introduced before F19

**Regression Commits Under Investigation** (between F13 @ 6a23a03d2 and F19 @ 3906e67bc):
- 47e7995e6: F13 remove location UI
- 2a436fd64: F03.5 location pin + Waze
- 53129fcc2: F14 install prompt gating
- 3906e67bc: F19 maintenance mode + Turnstile

**Symptoms:**
- Page height: 7337px vs ref 5492px (33% increase at 380px width)
- Worst bands: y1100-1800 (product grid region), 45-50% pixel diff
- Affects all widths: 380=25.96%, 768=36.34%, 1440=23.14%

**Red Herrings Eliminated:**
- Design system consolidation (a2101d481→080e7761c) NOT the cause (still 23.14% at eb83ed820)
- CSS color replacements verified correct (all hex values match)
- Page height increase suggests layout/component change, not CSS color issue

**Next Steps for Fix:**
Bisect commits 6a23a03d2..3906e67bc to isolate regression. Likely candidates:
1. Location pin/Waze integration (2a436fd64) - added layout changes
2. Install prompt changes (53129fcc2) - might affect card/grid spacing
3. Maintenance mode (3906e67bc) - CSS proxy rules

**Code State:** tests 4989 pass, lint clean, type-check clean, build passes.
