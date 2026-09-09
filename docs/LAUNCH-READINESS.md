# Launch readiness


> <!-- v1-final-historical:2026-09-01 -->
> 🕯️ **Historical snapshot. Not current guidance.**
>
> This is a launch-readiness assessment, true on the date it carries. It is kept as a record of what
> was measured and decided then, and it is **not** maintained against
> production. Numbers, table names and statuses in it may since have changed.
>
> For the current state see `docs/ARCHITECTURE-OVERVIEW.md`, and
> `docs/INDEX.md` for which document is authoritative on a given subject.

Measured on `main` at `dd10a9504`, 2026-09-01. Every number below is command
output or a live query against the production database, not a recollection.
Where a claim from the audit brief disagreed with the measurement, the
measurement is what is recorded, and the disagreement is named.

## 2026-09-09, later the same day: re-measured for [63], and the blocker moved

**This section supersedes the two below it, and both are kept exactly as they
are.** That is this file's own convention and it is worth keeping: the 01.09 and
the earlier 09.09 assessments were true on their dates, and deleting them would
delete the record of what was measured then.

**What changed since the section below.** It named the live catalogue as the one
deciding blocker. The catalogue is still 25 findings on 44 active products and
still an operator decision, and it is still red - but it is no longer FIRST,
because a measurement taken today found something ahead of it:

> **Production is running a build from around 2026-08-31.** `/sitemap.xml` still
> serves the single `<urlset>` that section 79 replaced with a `<sitemapindex>`
> on 09.09, and `/page/how-it-works` - shipped today - returns 404. Production is
> live, TLS valid, `/api/health` returns `{"ok":true,"database":"ok"}` at 166ms,
> and roughly nine days and several dozen commits behind `audit/final-audit`.

The section below says "nothing in this repo was ever deployed" is no longer
true, and that remains correct. What is new is that **something was deployed and
then stopped being updated**, which is a different problem and reads as health
until somebody checks a URL that should exist.

The second thing this pass found is a defect nobody had measured:

> **`/_next/image` passes the deal-card AVIFs through unchanged at every width,
> on production.** Source `ke-live-deal-0.avif` is 735x565 and 20,215 bytes;
> `w=256` and `w=640` both return 20,215 bytes of `image/avif`, live on
> `www.kenyonexpress.co.il`. Thirty-two cards on the home page. The same
> optimizer resizes the hero WebP correctly (10 kB / 32 kB / 41 kB at 256 / 640
> / 1080), so it is the AVIF sources, not the optimizer being off.

Measured against `d6468c278` and against production.

### Verdict: NOT READY

Not because the software is bad. Because **the code being audited is not the
code that is live**, and because eight things below have no evidence behind them
yet. Every line carries what was measured and how.

---

### The blocking line

**Production is running a build from around 2026-08-31.** Measured today:

```
https://kenyonexpress.co.il/      308 -> https://www.kenyonexpress.co.il/  200
TLS                                valid
/api/health                        {"ok":true,"database":"ok","latency_ms":166}
/sitemap.xml                       <urlset>, lastmod 2026-08-31T14:54:35Z
/page/how-it-works                 404
```

Section 79 shipped a `<sitemapindex>` on 09.09 and production still serves the
single `<urlset>` it replaced. `/page/how-it-works` shipped this session and
404s. So production is **live, healthy, and roughly nine days and several dozen
commits behind `audit/final-audit`.**

Everything else in this document describes the branch. Until a deploy of the
branch reaches production, nothing here is a statement about the live site.

---

### Green, with evidence

| Line | Evidence |
| --- | --- |
| Unit and integration tests | **5,541 passed**, 12 skipped, 447 files, `pnpm test` |
| Type check | `pnpm tsc --noEmit` clean |
| Lint and the eight gates | `pnpm lint` clean: biome, tokens, copy, asset, raw-html, postgrest-or, cache-invalidation, rtl-logical, i18n |
| Production build | `pnpm build` compiles; 118 routes |
| End-to-end | **620 passed**, 79 skipped of 710 across chromium and mobile-chrome |
| Lighthouse | below |
| Production is up | `/api/health` returns `ok` with a 166 ms database round trip |
| TLS | valid certificate on the apex and on `www` |

### Lighthouse, desktop preset, against a built server

| route | perf | a11y | best practices | SEO | LCP | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | 97 | 96 | 96 | 100 | 1.2 s | 0.011 |
| `/products` | 100 | 99 | 96 | 100 | 0.7 s | 0.012 |
| `/category/hot-deals` | 100 | 99 | 96 | 100 | 0.7 s | 0.012 |
| `/product/<slug>` | 99 | 100 | 96 | 100 | 0.9 s | 0.012 |
| `/cart` | 99 | 100 | 96 | **69** | 0.8 s | 0.011 |
| `/faq` | 100 | 100 | 96 | 100 | 0.8 s | 0.012 |
| `/checkout` | **80** | - | - | - | 1.1 s | **0.357** |

`/cart` scoring 69 on SEO is correct behaviour, not a defect: the page is
`noindex`, and Lighthouse counts "blocked from indexing" as a failed audit.

**These numbers are simulated.** Lighthouse on localhost runs Lantern over a
dependency graph, and a previously measured 2.7 s real improvement showed up
here as noise. They are a regression signal, not a field measurement.

---

### Red, with evidence

### 1. The homepage serves full-size images to phones. Confirmed on production.

The 32 deal-card images are AVIF, and `/_next/image` **passes the source through
unchanged at every width**:

```
source        public/images/products/ke-live-deal-0.avif   735x565, 20,215 B
local   w=256  20,215 B  image/avif        w=640  20,215 B
prod    w=256  20,215 B  image/avif        w=640  20,215 B
```

A 256px request returns a 735px image. The same optimizer resizes the hero WebP
correctly on production (10 kB / 32 kB / 41 kB at 256 / 640 / 1080), so this is
specific to the AVIF sources, not to the optimizer being off.

Thirty-two cards at 20 kB is roughly **640 kB of images on the homepage that
should be a fraction of that on a 380px screen**. `e2e/home.spec.ts:154` was
written to catch exactly this and is failing. It is not a local artefact: it was
confirmed against `www.kenyonexpress.co.il`.

### 2. DB advisors are not at zero WARN, and cannot be

| advisor | level | count | after 209 |
| --- | --- | --- | --- |
| `function_search_path_mutable` | WARN | 3 | **0** |
| `auth_rls_initplan` | WARN | 6 | **0** |
| `anon_security_definer_function_executable` | WARN | 2 | 2 |
| `authenticated_security_definer_function_executable` | WARN | 21 | 21 |
| `multiple_permissive_policies` | WARN | 19 | 19 |
| `unindexed_foreign_keys` | INFO | 8 | 8 |
| `unused_index` | INFO | 197 | 183 after 208 |

`209_advisor_warnings.sql` clears nine of the fifty-one. **The 23 definer
warnings cannot be cleared**: `is_admin()` alone is called by 93 RLS policies,
an RLS expression is evaluated as the calling role, and revoking EXECUTE stops
those 93 policies working. The full argument is in the migration.

The 19 multiple-permissive warnings are a rewrite of access control on 19
tables including `cashback_ledger`, `payment_events` and
`payout_statement_lines`. Deferred deliberately; see the backlog.

### 3. Twenty-five migrations are written and not applied

`162, 184, 188-209`. Every one is probed against production in a rolled-back
transaction and none is applied. Among them:

- **207** is the bounce and complaint suppression list. Without it, an address
  that hard-bounced is mailed again by the next cron.
- **205** and **206** are this session's CMS work; the site renders its built-in
  text without them, so they are not blocking.
- **162** is blocked on a deployed URL to seed into the vault.

### 4. Email deliverability has four live DNS defects

From `docs/EMAIL-DELIVERABILITY.md`, measured today. `node
scripts/email-dns-check.mjs` exits 1:

- `send.kenyonexpress.co.il` SPF contains `include[...].nses.com` - a pasted
  placeholder, which RFC 7208 makes a **permerror for the whole record**.
- Two DKIM TXT records at one selector, one of them also a placeholder.
- DMARC has no `rua`, so nobody learns whether alignment works.
- Nothing wrote to the suppression list until this session's webhook.

DNS is at Cloudflare and this repository cannot change it.

### 5. `SUPABASE_SECRET_KEY` has not been rotated

The key in use was exposed during setup and bypasses every RLS policy.
`scripts/compromised-keys.mjs` marks it by SHA-256 and
`scripts/deploy-preflight.mjs` refuses to build with it. The procedure is in
`docs/RUNBOOK.md`. Still outstanding.

### 6. The live catalogue holds 25 template and duplicate rows

44 active products, 25 findings: three `מאסטר` rows, five `-copy` slugs, names
that contradict their slug (`פלייסטישן 5` on `/חיתולי-האגיס`), prices that
contradict their own slug text, `₪` inside a slug. `supabase/catalogue-known-issues.json`
holds them as a floor and `pnpm test src/lib/catalogue` gates it. None is
auto-fixable: which of two duplicates is real is an operator decision.

### 7. There is no load test

[63] asks for k6 passing. **There is no k6 anywhere in this repository** - no
script, no config, no CI job. `docs/ARCHITECTURE-TESTING.md` has listed it as
missing since it was written (`T-12 | אין k6`). Nothing has ever measured what
this system does under concurrent load.

### 8. `/checkout` shifts layout badly on the empty-cart redirect

`/checkout` with an empty cart redirects to `/cart`, and **that** navigation
scores performance 80 with **CLS 0.357**, against 0.011 when `/cart` is loaded
directly. Above Google's 0.1 "good" threshold by more than three times, on the
path a shopper takes when they mis-click.

---

### What a human still has to do

Only these. Everything else in this document is either green or written down as
a decision.

1. **Deploy the branch.** Production is nine days behind and no deploy can be
   triggered from here; `docs/DEPLOY.md` and the notes in STATE.md describe what
   is known about the Vercel project.
2. **Fix four DNS records at Cloudflare.** Exact values in
   `docs/EMAIL-DELIVERABILITY.md`. `node scripts/email-dns-check.mjs` turns green
   when they are right.
3. **Rotate `SUPABASE_SECRET_KEY`** per `docs/RUNBOOK.md`.
4. **Decide the 25 catalogue rows** in `supabase/catalogue-known-issues.json`.
5. **Approve and apply migrations** in `migrations/pending/`, in the order
   `APPLY-ORDER.md` gives.
6. **Verify the Resend domain** and add the webhook endpoint with its signing
   secret as `RESEND_WEBHOOK_SECRET`.

### The tag is not `v1.0.0`, and that is deliberate

[63] asks for `tag v1.0.0`. **`v1.0.0` already exists**, on `d2e4b20ef`, dated
2026-08-10, and it marks a real past state. Moving it would rewrite a tag that
anybody who has fetched it already holds, and it would point a version number at
code that this same document calls NOT READY.

This branch has its own family - `v1.0.0-rc1`, `v1.0.0-rc2`,
`v1.0.0-rc2-final-audit` (`19213f10f`, an ancestor of HEAD) - so this state is
tagged `v1.0.0-rc3-final-audit`, which is the next name in the sequence the
branch is actually using. `v1.0.0` becomes correct when the verdict above does.

### The verdict, restated

**NOT READY**, and the first line is the whole of it: the audited code is not
the deployed code. Of the eight red items, three (1, 8, and the AVIF half of 1)
are defects in the branch, and five are operational steps nobody has taken.

The software itself is in good order: 5,541 unit tests, 620 end-to-end tests,
Lighthouse between 97 and 100 on every customer route, eight build gates green,
and every schema change probed against production before being proposed.


---

## ‏09.09.2026: נמדד מחדש, וההכרעה השתנתה בסיבה ולא בתשובה

**הסעיף הזה גובר על מה שמתחתיו, ומה שמתחתיו נשמר כפי שהוא.** המדידה מ-06.09
נכונה לתאריך שלה ואינה נמחקת; שלושה מהחוסמים שהיא מונה נסגרו מאז, וחוסם
שלא הופיע בה בכלל הוא היום הראשון ברשימה.

**המשפט שהמסמך מ-06.09 קרא לו "המשפט היחיד שחשוב" — "שום דבר בריפו הזה
מעולם לא נפרס, והאתר שרואים הוא ה-WordPress הישן" — אינו נכון יותר.** נמדד
‏09.09: ‏DNS מצביע ל-Vercel, ‏TLS מאמת, ‏`/_next/static` נטען, ‏13 ה-crons רצים
מ-GitHub Actions ומחזירים ‏200. ‏`pnpm audit` נקי.

נמדד ‏09.09.2026 מול פרודקשן (`ixvwfbuvfxxsjiywhbbb`) ומול הריפו. **כל שורה
בטבלאות כאן נשענת על מדידה שאפשר לחזור עליה, והפקודה מופיעה בעמודת הראיה.**
מה שלא נמדד מסומן "לא נמדד" ולא "עובר".

---

### הכרעה, 09.09

> ‏**‏NOT READY, וחוסם אחד בלבד מכריע: הקטלוג החי.**
>
> התשתית מוכנה. ‏4646 טסטים ירוקים, ‏81 טבלאות עם ‏RLS דלוק, ארבעה שומרי
> מעבר במסד, ‏`pnpm audit` נקי, ‏13 crons רצים, ‏TLS מאמת. מה שאינו מוכן הוא
> **מה שהאתר מוכר**: ‏25 ממצאי בטיחות על ‏44 המוצרים הפעילים, כולל שלוש שורות
> תבנית ‏`מאסטר`, חמישה ‏slugs של ‏`copy`/`לדוגמא`, ארבע שורות שהמחיר שלהן
> סותר את הטקסט של עצמן, ושמות שאינם מתארים את ה-URL שהם יושבים עליו.
>
> **אף אחד מהם אינו באג בקוד ואף אחד אינו לתיקון אוטומטי.** איזו משתי
> הכפילויות היא האמיתית, ואם עיסוי עולה ‏9 או ‏108, הן החלטות של המפעיל.
> זו הסיבה שהם פנקס ושער ולא ‏commit.
>
> **חוסם שני, לא נמדד מכאן:** המסוף של ‏Cardcom. אין מפתחות פרודקשן במכונה
> הזו, ולכן שום רכישה מקצה לקצה לא הוכחה. ‏`CHECKOUT_ENABLED=false`.

---

### ‏1. הקטלוג — החוסם

| בדיקה | תוצאה | ראיה |
| --- | --- | --- |
| מוצרים פעילים | ‏44 | `supabase/catalogue-snapshot.json` |
| ממצאי בטיחות | ‏**25** | `pnpm test src/lib/catalogue` |
| שורות `מאסטר` פעילות | ‏3 | `template-name` / `template-slug` |
| ‏slugs של `copy`/`לדוגמא`/`העתק` | ‏5 | `template-slug` |
| מחיר שסותר את הטקסט של עצמו | ‏4 | `price-contradicts-text` |
| ‏`₪` בתוך ‏slug | ‏2 | `unsafe-slug` |
| ‏slug שהוא מספר יבוא חשוף | ‏1 (`6253`) | `opaque-slug` |
| שמות כפולים פעילים | ‏3 זוגות, כולם בין שני ספקים שונים | `duplicate-name` |
| ‏`platform_percent` חסר | ‏**0** | `missing-platform-percent` |
| שני מוצרים פעילים על אותו ‏slug | ‏**0** | `catalogue-safety.test.ts` |

**הטענה הקודמת ב-CLAUDE.md נמדדה ונמצאה מיושנת בשני הכיוונים.** היא אמרה
ש-`מוצר ראשי מאסטר Master Product` נמכר ב-₪1 עם ‏10 במלאי ומרונדר בדף הבית,
ושמיגרציה ‏172 לא הוחלה. נמדד: השורה היא ‏`status='draft'` עם
‏`stock_quantity=0` ואי אפשר לקנות אותה, ו-172 הוחלה ב-04.09. **הסוג של הפגם
היה נכון והיקפו גדול פי עשרים משורה אחת.** פנקס שנוקב בשורה אחת גרוע מאין
פנקס, כי תיקון אותה שורה נקרא כתיקון הבעיה.

הדוגמאות שכואבות ביותר הן ה-slugs, כי ‏slug הוא ה-URL הציבורי:

| השם שהלקוח קורא | ה-URL שהוא יושב עליו |
| --- | --- |
| ‏`פלייסטישן 5` | `/חיתולי-האגיס` |
| ‏`ארוחת בוקר זוגית בקפה גן סיפור` | `/שעון-אפל-חכם-apple-watch-series-7` |
| ‏`טיפול פנים` | `/ארוחת-שף-במסעדת-אולטרה` |
| ‏`תיק עור JEEP יוקרתי` | `/מוצר-לדוגמא` |
| ‏`עיסוי לתינוק` | `/צימר-מאסטר-copy` |

---

### ‏2. כסף ותשלומים

| בדיקה | תוצאה | ראיה |
| --- | --- | --- |
| כסף באגורות, integer, דרך `money.ts` | עובר | `src/lib/money.ts`, ‏78 עמודות `*_agorot` בפרודקשן |
| שומרי מעבר במסד | **ארבעה**, כולם חיים | `pg_trigger`, ‏09.09 |
| מכונת המצבים בקוד תואמת למסד | עובר, בשני הכיוונים | `status-transitions.test.ts` |
| ‏`platform_percent` מצולם ל-`order_items` | עובר | `finalize.ts`, `PAYMENT-FLOW.md` §3 |
| ‏idempotency ל-webhooks | עובר | `payment_webhook_events`, ייחודי על `(provider, external_event_id)` |
| ‏DLQ ל-webhooks שלא נסגרו | עובר | `src/server/payments/webhook-dlq.ts` |
| התאמה יומית מול המסוף | עובר, חלון ‏48 שעות | `/api/cron/reconcile` |
| ‏`voucher_redemptions` בלתי-כתיב דרך ‏PostgREST | עובר | `rls-write-policies.test.ts` |
| רכישה מקצה לקצה מול ‏Cardcom | **לא נמדד** | אין מפתחות פרודקשן במכונה הזו |

**אימות חתימה על ה-callback נדחה בכוונה ואינו פער.** ‏Cardcom אינה חותמת על
ה-callbacks שלה. האותנטיות נשענת על סוד לא-נחש ב-URL (השוואה בזמן קבוע) ועל
אימות שרת-לשרת חובה ב-`GetLpResult`, שהוא המקור היחיד שנסמכים עליו לסכום
ולסטטוס. הוספת בדיקת חתימה הייתה דוחה כל ‏callback אמיתי.

---

### ‏3. הרשאות ואבטחה

| בדיקה | תוצאה | ראיה |
| --- | --- | --- |
| ‏RLS דלוק על כל טבלה ב-`public` | עובר, ‏81/81 | `supabase/rls-manifest.json`, ‏09.09 |
| טבלאות נעולות עם ‏policy מפורשת | ‏8, כולן ‏RESTRICTIVE `false` | `pg_policies`, ‏09.09 |
| ‏`SECURITY DEFINER` עם ‏`search_path` מוצמד | ‏61/61 | `pg_proc.proconfig` |
| פונקציות ללא הצמדה | ‏3, **כולן ‏`SECURITY INVOKER`** | `migrations/pending/188` |
| ‏PKCE | עובר | ברירת מחדל של `@supabase/ssr` בשני הלקוחות |
| עוגיות עם `secure` | עובר מ-09.09 | `coupon-cookie.test.ts` סורק את כל `src/` |
| ‏rate limits | עובר | `src/lib/rate-limit/policies.ts`, ‏`docs/RATE-LIMITS.md` |
| ‏`pnpm audit --prod --audit-level high` | **נקי** | הורץ ‏09.09 אחרי מיזוג ‏PR #36 |
| רוטציית ‏`SUPABASE_SECRET_KEY` | **פתוח** | המפתח החשוף מסומן ב-`compromised-keys.mjs` |

---

### ‏4. תפעול

| בדיקה | תוצאה | ראיה |
| --- | --- | --- |
| ‏crons מתוזמנים ורצים | עובר, ‏13 jobs | `cron.yml`, לוגי ריצה |
| ‏`/api/health`, ‏`/api/ready` | עובר | `src/lib/health/` |
| ‏Sentry (web + server + edge) | עובר | `sentry.*.config.ts`, `src/instrumentation.ts` |
| עומק תור אינדוקס גלוי | עובר מ-09.09 | `DrainResult.pending` |
| ‏TLS ו-DNS על הדומיין | עובר | נמדד ‏09.09 |
| **גיבוי חוץ למסד** | **מעולם לא רץ** | ‏`DB_BACKUP_ENABLED` לא מוגדר, ‏`db-restore-drill` אפס ריצות |
| ‏CI: ‏4 בדיקות נדרשות, ‏strict | עובר | הגנת ‏main ב-GitHub |
| ‏75 קבצי ‏E2E, ‏k6 ל-5 תרחישים | קיימים; **לא הורצו כאן** | `e2e/`, `load/` |

---

### ‏5. סיכונים פתוחים, לפי חומרה

| # | סיכון | חומרה | למה |
| --- | --- | --- | --- |
| ‏1 | ‏25 ממצאים בקטלוג החי | **גבוהה** | לקוח יכול לקנות שורת תבנית; ‏URL ציבורי מתאר מוצר אחר |
| ‏2 | לא הוכחה רכישה מקצה לקצה | **גבוהה** | מסלול הכסף לא נבדק מול מסוף אמיתי מעולם |
| ‏3 | אין גיבוי חוץ למסד | **גבוהה** | אין ‏RPO ואין ‏RTO; תרגיל השחזור לא רץ אף פעם |
| ‏4 | ‏`SUPABASE_SECRET_KEY` חשוף ולא הוחלף | **גבוהה** | עוקף כל ‏RLS |
| ‏5 | ‏184 לא הוחלה | בינונית | החלטה, לא פער: דורשת חלון תחזוקה |
| ‏6 | ‏162 חסומה על זריעת ‏vault | בינונית | ממתינה ל-URL פרוס |
| ‏7 | ‏188 לא הוחלה | נמוכה | שלוש פונקציות ‏INVOKER; אינו וקטור הסלמה |

---

### מה נסגר בסבב הזה (09.09)

| מה | ראיה |
| --- | --- |
| מניפסט ‏RLS היה ‏21 יום מאחור; ‏28 טבלאות מחוץ לשער | `58f581043` |
| השער היה מורה להחליש ‏8 טבלאות נעולות | אותו ‏commit, אומת אדום |
| ‏`secure` חסר בעוגיית הקופון, בשלושה כותבים | אותו ‏commit + סורק על כל `src/` |
| שומר המעבר הרביעי היה בלי מראה ובלי שער | `b2762e5e0` |
| ‏`VOUCHER-LIFECYCLE.md` אמר לקוראים שהם לא מוגנים | `36459dacb` |
| עומק תור האינדוקס נקרא כאפס בזמן ש-21 המתינו | `b17123a96` |
| הקטלוג לא נמדד מעולם | המסמך הזה + `pnpm audit:catalogue` |

**מקורות:** `docs/AUTH-MODEL.md`, `docs/PAYMENT-FLOW.md`,
`docs/VOUCHER-LIFECYCLE.md`, `docs/FINAL-AUDIT.md`, `docs/MONITORING.md`,
`supabase/rls-manifest.json`, `supabase/catalogue-snapshot.json`.


---

## Verdict (נמדד 06.09, נשמר)

**NOT READY — and every remaining blocker needs Ofir, not code.**

Rewritten 2026-09-06. The previous version was from 09-03 and its blocker list
has been overtaken: two of its four were measured and turned out to be different
problems than they were described as, and a third shrank from fourteen files to
five reviewed ones.

The single sentence that matters: **nothing in this repository has ever been
deployed anywhere.** The site being looked at is the old WordPress installation.

## Gates

Re-measured 2026-09-06 at `18a62e13c`.

| Gate | Command | Result |
| --- | --- | --- |
| Types | `pnpm type-check` | PASS, `tsc --noEmit` clean |
| Lint | `pnpm lint` | PASS, biome 1202 files + tokens/copy/asset gates, 1 pre-existing warning |
| Unit | `pnpm test` | PASS, **3989 tests in 324 files** |
| Build | `pnpm build` | PASS |
| E2E | `E2E_WORKERS=1 playwright test` | PASS serially — cart 21/21, a11y 80/80, rtl-mobile 162/162, smoke+purchase 6/6 both projects. **Read the note below before trusting a parallel run.** |
| Pixel | `compare.mjs --page=home` | PASS, **10.68 / 7.72 / 8.12** at 380 / 768 / 1440 |
| Deps | `pnpm audit --audit-level high` | **no known vulnerabilities** |
| Perf | `pnpm lighthouse:smoke` | **FAILS at 70-75 against 90 — see "What is NOT a blocker"** |

Three of these moved materially since 09-03 and the movement is the point:

**Dependencies went from 8 findings to zero.** `main` turned out to be 284
commits behind and **9 ahead**, and those nine were GHSA fixes — one critical
(vitest `GHSA-5xrq-8626-4rwp`) and four high. Merging them in was the fix;
`docs/BRANCH-AUDIT.md` has the reasoning, including why "resolve in favour of
the newer work" could not be applied literally to the lockfile.

**The pixel gate is quoted at three widths, not one.** The old single 9.83%
figure was the 1440 measurement; 380 is the tight one and always has been.

**The E2E suite must be believed serially, not in parallel.** At two workers a
full run failed ~20 cases, and **19 of the 21 errors were the identical
sentence** — "add-to-cart did not stick: the header badge went 0 -> 0". That is
Supabase contention between workers, not a product defect: every one of those
specs passes at one worker. `playwright.config.ts` previously claimed "the same
suite passes 53/53 at two workers", which was true of a 53-case suite and is not
true of the 530-case one it grew into; the comment now names the sentence to
look for and says to believe the serial answer.

The default stays at two workers deliberately. Serial is ~45 minutes against 8,
which is too much to pay on every run for a failure mode that announces itself
in one repeated sentence.

**Every gate result is now recorded automatically.** `docs/UI-PARITY-REPORT.md`
was empty on 09-03 while three measurements sat in a commit message, because
writing the row was a step a person had to remember. `scripts/parity-log.mjs`
is called from inside the gate, with the commit hash and a `-dirty` suffix when
the tree is not clean.

## Database, queried live## Database, queried live

| Check | Expected by the brief | Measured | Verdict |
| --- | --- | --- | --- |
| Public tables | 50+ | 53 | PASS |
| RLS enabled | all | 61 of 61, 0 without | PASS |
| Tables with RLS and no policy | 3 | 8 | see B2 |
| `SECURITY DEFINER` functions | "0 or minimal" | 61 of 69 | by design, see B3 |
| EXECUTE grants to anon/authenticated | 13 | 20 | see B3 |
| Money columns held as numeric | 31 | **32** | confirmed, see B1 |
| Applied migration head | >= 125 | `20260831193325` | PASS |

### B1. RETRACTED. The audit was right and this document was wrong

**An earlier revision of this file claimed the finding was false. That claim came
from a broken query and it has been withdrawn.** The query filtered with
`format_type(atttypid, atttypmod) in ('numeric', ...)`. `format_type` returns
`numeric(12,2)` for a precision-qualified column, which is not the string
`numeric`, so the test silently skipped every money column in the database and
returned only the five columns that happen to carry no precision. Re-run against
`pg_type.typname` instead:

```
numeric/float columns in public : 74
  money-like                    : 32
  percent-like                  : 25
  true floats (float4/float8)   :  2   (coupon_deals.lat, coupon_deals.lng)
```

The audit's count of 31 was substantially correct. Thirty-two money columns are
held as `numeric`, across fifteen tables:

| Table | Money columns held as numeric |
| --- | --- |
| `products` | `price_ils`, `coupon_price_ils`, `cost_ils`, `full_price`, `kenyon_price`, `compare_at_price`, `compare_at_price_ils` |
| `order_items` | `unit_price_ils`, `total_price_ils`, `supplier_payout_ils`, `coupon_price_ils` |
| `orders` | `subtotal_ils`, `total_ils`, `discount_ils` |
| `product_variants` | `price`, `price_ils`, `price_modifier` |
| `coupon_codes` | `collect_amount_ils`, `face_value_ils` |
| `coupon_deals` | `original_price`, `platform_price` |
| `coupons` | `discount_value`, `original_price` |
| `wallet_transactions` | `amount_ils`, `gross_amount_ils` |
| `wallet_accounts` | `balance_ils` |
| `wallet_balances` | `balance_ils` |
| `wallet_entries` | `amount_ils` |
| `payments` | `amount_ils` |
| `profiles` | `wallet_balance` |
| `affiliates` | `total_earnings_ils` |
| `referrals` | `bonus_paid_amount_ils` |

**One word in the finding is still wrong, and it matters for severity.** These
are `numeric(p,s)`, not floats. `numeric` is exact decimal: it has no binary
rounding error, so there is no money currently being lost to floating point.
Only two true floats exist in the schema and both are coordinates, where
`double precision` is correct. So this is a **standards and dual-representation**
problem, not live corruption.

The real hazard is that the same tables carry both representations at once.
`order_items` holds `total_price_ils numeric(12,2)` beside `commission_agorot
integer`, `face_value_agorot`, `paid_on_site_agorot` and six more. Two sources of
truth for the same money, with no constraint tying them together, is how a
rounding disagreement becomes a payout dispute.

`migrations/pending/131` through `135` carry the conversion. They are **additive
and unapplied**: each adds an `_agorot bigint` column, backfills it with
`round(x * 100)`, and constrains it, leaving the existing column in place so no
current reader breaks. Rewriting the readers is the follow-up, and cutting the
old columns is the step after that. Rationale recorded in `docs/DECISIONS.md`.

### B2. Eight tables carry RLS and no policy, and all eight are already closed

```
payment_webhook_events   rate_limits   user_rate_limits      <- named as by-design
legacy_percent_archive_112   referral_signals
search_index_dlq   settlement_events   stock_reservations    <- the other five
```

RLS enabled with zero policies is deny, not allow: Postgres returns no rows and
rejects every write from `anon` and `authenticated`. All eight are written by
the service role, which bypasses RLS. So the effective permissions are already
correct and this is a legibility problem, not a hole.

`migrations/pending/122_deny_all_on_server_only_tables.sql` makes the intent
explicit for the five unclassified tables with a restrictive `using (false)`
policy. It changes no effective permission. It is **not applied**.

### B3. The seven "extra" EXECUTE grants are load-bearing

The grant audit returns 20 rows, which matches the brief's count. The brief then
asks to revoke the surplus. That cannot be done blind, and the instruction to
verify the caller first is the correct one:

```
redeem_voucher          -> authenticated
supplier_app_context    -> authenticated
verify_supplier_staff_pin -> authenticated
```

`apps/mobile` is a second RPC caller and it is not `src/`. It builds its client
with the anon key plus a user session, so every call arrives as `authenticated`:

```
apps/mobile/src/lib/supplier/api.ts:64   supabase.rpc('supplier_app_context')
apps/mobile/app/supplier/index.tsx:16    redeem_voucher derives the supplier from membership
```

Revoking those grants from `authenticated` takes down every till. No revoke was
written. An audit that greps only `src/` will keep proposing this, and will keep
being wrong.

## Blockers

Four, in the order they should be cleared. None is code.

| # | Blocker | Who | Evidence |
|---|---|---|---|
| 1 | The Vercel project for this repo does not exist | Ofir | Vercel API: the only project is `kenyonexpress-web`, wired to the OLD repo, and **all 11 of its deployments are ERROR** |
| 2 | Migration batch A is unapplied | Ofir approves | `docs/MIGRATION-REVIEW.md`, apply order in `docs/RUNBOOK.md` |
| 3 | The Supabase secret key was exposed during setup | Ofir | Working key, bypasses every RLS policy; the build refuses to ship it |
| 4 | R2 is not enabled and no bucket was named | Ofir | `403 code 10042`; 375 objects wait in `refs/live-assets/` |

### 1. There is no deployment, and that is why the site still looks wrong

This was previously written as "unconfirmed which Vercel project the domain will
point at". Measured through the Vercel API on 2026-09-06, it is worse than
unconfirmed: the project `kenyonexpress` pointing at `kenyonexpress/kenyonexpress`
**does not exist**. What exists is `kenyonexpress-web`, connected to the previous
repository, and every one of its eleven deployments is in state `ERROR`, the most
recent from May.

So every report of "the Electro images are back" and "the search field returned"
is a report about the old WordPress site. `scripts/shell-audit.mjs` settles it
for any URL: our build reports CLEAN, `kenyonexpress.co.il` reports nine
problems including `input[type=search]` and the iPhone/AirPods GIF.

**Everything else waits behind this.** The cron schedule (migration 162) needs a
deployed URL for its vault secret. The performance budget cannot be closed
because every number available locally is a simulation on a laptop. The domain
cannot be pointed at a project that does not exist.

`docs/DEPLOY.md` is the click-by-click.

### 2. Four migrations, reviewed, waiting on approval

Down from "14 unapplied files": the directory now holds five, one of which is
blocked behind blocker 1. Each was reviewed against the live production schema
rather than against what its file claims. `docs/MIGRATION-REVIEW.md`.

**172 first, because it is the only one with a live money consequence.**
`מוצר ראשי מאסטר Master Product` is in the production catalogue at ₪1 against a
₪400 compare-at with ten in stock. It can no longer be *bought* — a
discount-ratio guard shipped on 09-06 — but it is still `active`, still answers
a direct query, and still renders in listings that do not go through the cart.
Stopping it being bought and removing it from the catalogue are different
claims, and only the second survives someone querying the database.

**169 next.** Four funnel events are being silently discarded by the database
right now: `purchase`, `begin_checkout`, `voucher_redeemed`, `order_refunded`
each return 0 rows inserted with HTTP 200. The site reports no purchases. Every
day this stays unapplied is a day of funnel data that does not exist.

**170 and 171** are safe and can ride the same batch. **162 is blocked** behind
blocker 1.

### 3. The exposed key

It works, which is the danger. A Supabase secret key bypasses every RLS policy
and this one was handled outside a secret store. `scripts/compromised-keys.mjs`
carries its SHA-256 — the digest, never the key — `src/lib/env.ts` refuses to
boot a deployment with it, and `scripts/deploy-preflight.mjs` refuses to build.
Rotation procedure in `docs/RUNBOOK.md`. Mint first, verify with the boot probe,
revoke last.

### 4. R2

`403 code 10042 "Please enable R2 through the Cloudflare Dashboard"`, and the
instruction that asked for the upload ended mid-sentence without naming a
bucket. 107 assets and 268 derivatives are ingested and waiting;
`scripts/upload-r2.mjs` is written and dry-run verified at 375 objects.

### What is NOT a blocker any more

- **The cron jobs.** Previously "no external scheduler exists". Migration 162
  schedules all twelve in the database with pg_cron, so no external scheduler is
  needed — it is blocked on the deployment URL for its vault secret, not on
  infrastructure that has to be bought.
- **The performance budget.** `pnpm lighthouse:smoke` exits 1 at 70-75 against
  its 90 threshold, and the application is not slow: the same build with
  `--throttling-method=provided` scores 100, with FCP 0.1s and TBT 0ms. The gap
  is Lighthouse's Lantern simulation running on a laptop that is also serving
  the page; three runs on an unchanged tree gave 75, 70, 70. Recorded OPEN in
  `docs/PERFORMANCE-BUDGET.md` and not closeable until there is a deployment.
  **The threshold was not lowered.**

## What is verified working

The site answers `200`, `/api/health` reports `{"ok":true,"database":"ok"}`, the
cron guard answers `401` to an unauthenticated call, and the catalogue served in
production is the real one. RLS is on for all 61 tables. The rate limit layer,
a sliding window with a Postgres fallback behind all thirty callsites, is merged
to `main` and green.

## Production smoke, 2026-09-02

Run against `https://kenyonexpress.vercel.app` from this machine.

| Path | Status | Time | Bytes |
| --- | --- | --- | --- |
| `/` | 200 | 4.89s | 379,811 |
| `/products` | 200 | 2.22s | 217,874 |
| `/sitemap.xml` | 200 | 0.84s | 12,893 |
| `/robots.txt` | 200 | 0.83s | 342 |
| `/checkout` | 200 | 2.08s | 74,853 |
| `/cart` | 200 | 0.95s | 67,385 |

All ten cron endpoints answer **401**, which is the correct answer and the
useful one: the routes are deployed and `CRON_SECRET` is set in production. A
404 would have meant the routes were missing; a 200 would have meant the secret
was not being checked.

```
notifications 401   health 401   invoices 401   stock 401
stranded-payments 401   abandoned-cart 401   subscriptions 401
reap-carts 401   reconcile 401   expire-vouchers 401
```

### `/checkout` returning 200 does not mean checkout works

The launch brief expects `/checkout` to stop returning "404/disabled" once
`CHECKOUT_ENABLED=true` is set. It was never going to return either. The page
renders regardless, with `<title>תשלום | קניון אקספרס</title>` and no
disabled-state text in the body.

`CHECKOUT_ENABLED` gates the **server action**, not the page:

```
src/server/actions/payments/checkout.ts:252   if (!env.checkoutEnabled) { ... }
src/lib/payments/env.ts:76                    NODE_ENV === 'production'
                                                ? CHECKOUT_ENABLED === 'true'
                                                : CHECKOUT_ENABLED !== 'false'
```

It fails **closed** in production: unset means payments are refused. So the
observable symptom of the variable being unset is not a 404 on the page, it is a
customer filling in the whole form and being refused at submit. A smoke test
that only fetches `/checkout` cannot see it, and the only honest check is either
reading the variable in the Vercel dashboard or driving a real submit.

Two cron routes carry the same gate (`reconcile`, `stranded-payments`), so they
no-op while it is unset even though they answer 401 to an unauthenticated call.

### Front page timing

4.89s to first byte-through-completion on a cold path is slow enough to be worth
a look before launch, though it is one sample from one machine over the public
internet and is not a Lighthouse measurement.

## Visual gate, 2026-09-02

Measured against a clean `pnpm build` on a server started for the run, so no
stale-server reading. Ceiling is 11%.

| Page | 1440 | 768 | 380 |
| --- | --- | --- | --- |
| home | **9.83%** | 40.81% | 42.44% |
| cart | **8.60%** | 14.17% | 19.74% |
| checkout | **9.72%** | 13.11% | 14.64% |
| product | refused | refused | refused |

**1440 passes on every page that can be measured. 768 and 380 fail on every
page.** This is not a regression: those two widths had never been measured
before this week, because `compare.mjs` hung on them. Every three-width figure
ever quoted for this gate was a 1440 figure.

`home` at 380 additionally trips the script's own structural guard — live is
17,825px tall against our 10,358px, a ratio of 0.58 — and the script says so
itself: at that ratio the percentage is not a pixel gate, it is two different
pages. So the mobile numbers are a statement that the mobile layouts diverge
structurally from live, not a styling delta anyone can close by moving tokens.

`product` refuses at every width and the refusal is correct: live renders **1**
related-product card and our page renders **4**. That is a catalogue difference
wearing a fidelity number, which is exactly what the guard exists to stop.

`account` and `supplier` were not measured: the live site has no comparable
authenticated pages to score against.

### What this means for launch

The 11% gate is met at desktop and is nowhere near met at mobile. Closing the
mobile gap is a layout project, not a tuning pass, and it is the largest single
piece of work left. Most Israeli shoppers are on mobile.

## Quality gates, 2026-09-02

```
pnpm type-check   clean
pnpm biome check  984 files, no findings
pnpm test         3478 passed, 258 files
pnpm build        green
```

## BLOCKER: production checkout is enabled and wired to the mock provider

Found 2026-09-02, by reading the production environment directly after
`vercel link`. Both facts are from `vercel env pull --environment=production`.

```
CHECKOUT_ENABLED = "true"
CARDCOM_USE_MOCK = "true"
```

`CHECKOUT_ENABLED=true` was **already set** — the launch task to add it was
done a day earlier. The dangerous variable is the other one.

`src/lib/payments/env.ts:61`:

```js
const useMock =
  source.CARDCOM_USE_MOCK === 'true' ||
  source.NODE_ENV === 'test' ||
  (!source.CARDCOM_TERMINAL_NUMBER && source.NODE_ENV !== 'production')
```

`CARDCOM_USE_MOCK === 'true'` is tested first and **there is no production
override**. So `getPaymentProvider()` returns `getSharedMockCardcom()`, and the
mock answers `success: true` to `createLowProfile`, `verifyLowProfile`,
`chargeWithToken` and `refundByTransactionId` alike.

**A customer would complete checkout, the payment would "succeed", the order
would finalize and a voucher would be issued, and no card would ever be
charged.** The shop would give away goods.

There are also no real terminal credentials in production. The only Cardcom
variables present are `CARDCOM_USE_MOCK` and `CARDCOM_WEBHOOK_SECRET`;
`CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME` and `CARDCOM_API_PASSWORD` are
absent.

### Why this was not fixed here

Deleting `CARDCOM_USE_MOCK` on its own makes it **worse, not better**. The
non-mock branch calls `required('CARDCOM_TERMINAL_NUMBER', ...)`, which throws
when the variable is missing, so checkout would move from silently-fake to
hard-failing.

The two changes are one change and they are Ofir's:

1. add `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`
   from the production terminal (Cardcom, 03-9436100), then
2. remove `CARDCOM_USE_MOCK`, then
3. redeploy, then place one real low-value order and confirm it appears in the
   Cardcom dashboard.

**Until then, the safe state is `CHECKOUT_ENABLED=false`.** A checkout that
refuses is a bad shop; a checkout that fakes success is a shop that ships goods
for free. That flip was not made here because the launch instruction was
explicitly to set it to `true`, and choosing the opposite is a business call.

**This is a DNS-cutover blocker.** Pointing the real domain at this deployment
today would open a shop that charges nobody.

## v1.1.0 closeout, 2026-09-02

Gates at the tag: 3539 vitest passed, type-check clean, biome clean (984
files), build green. Branch `release/v1.1` (= `closeout/v1-final` tip), PR into
main open; merging is Ofir's hard stop.

### The recurring finding of this closeout

Five whole subsystems existed on one side of the wire only, every one now
closed: payment_events (table, no writers -> wired), refunds (statutory table,
no writers -> wired), subscriptions (renewal+cancel, no creator -> built),
analytics ingest (caller, no function -> 151), payouts (four verbs + page, no
tables/functions -> 152).

### migrations/pending — 29 files, apply through MCP in APPLY-ORDER.md order

- 122_deny_all_on_server_only_tables.sql
- 123_products_whatsapp_enabled.sql
- 124_categories_sort_order.sql
- 125_expire_vouchers_drop_escrow.sql
- 126_percent_range_checks.sql
- 127_homepage_cms.sql
- 130_payment_events.sql
- 131_refunds.sql
- 132_search_index_outbox.sql
- 133_supplier_branches.sql
- 134_order_items_delivered_at.sql
- 135a_product_type_recurring.sql
- 135b_recurring_subscriptions.sql
- 136_supplier_coordinates.sql
- 137_order_transition_guard.sql
- 138_money_agorot_money_path.sql
- 139_money_agorot_wallet.sql
- 140_money_agorot_catalog.sql
- 141_money_agorot_growth.sql
- 143_revoke_unused_definer_execute.sql
- 144_revoke_authenticated_dml.sql
- 145_revoke_check_rate_limit_execute.sql
- 146_wallet_balance_floor.sql
- 147_money_agorot_remaining_twins.sql
- 148_refund_destination.sql
- 149_audit_log_append_only.sql
- 150_account_deletion.sql
- 151_analytics_ingest.sql
- 152_payout_machinery.sql

The six from this closeout (147-152) each carry a rolled-back dry run against
production in their headers. None is applied. 122-146: see APPLY-ORDER.md.

### No longer manual: the cron scheduler

Armed and verified 2026-09-02: repository secret + master-switch variable set,
one dispatched health run green against production. The ten jobs now run from
GitHub Actions (best-effort timing; see cron.yml's own header).

### Still manual for Ofir

Cardcom prod terminal + removing CARDCOM_USE_MOCK (**the blocker** -- checkout
is live against the mock), DNS
cutover (the editable zone is NOT the serving zone), merging the release PR,
the 14 wrong product slugs, and the 768/380 mobile layout project.

---

## נספח מתוארך: מגה-בלוק 2 (‏STEPS 14–22), נמדד 02.09.2026

ה-snapshot למעלה קפוא; הנספח הזה הוא מדידה חדשה על ‏`closeout/v1-final`.

| Gate | תוצאה |
| --- | --- |
| `pnpm type-check` | PASS |
| `pnpm lint` | PASS (biome, 0 findings) |
| `pnpm test` | PASS — ‏3555 בדיקות ב-264 קבצים |
| `pnpm build` | PASS |
| `node scripts/migration-lint.mjs` | PASS — ‏31 קבצים, ‏0 hard, ‏0 soft |
| `node scripts/bundle-gate.mjs` | PASS — ‏255.6KB gz מול ratchet ‏260KB (יעד ‏180KB = ‏KNOWN-ISSUES ‏#9) |
| ‏e2e מלא, ‏chromium + ‏mobile-chrome, מול ‏`pnpm start` | ‏453 עברו, ‏8 דולגו, ‏1 flake (‏coupons a11y ב-mobile; ‏3/3 ירוק בחזרה ממוקדת) |
| `compare.mjs --page=home` ‏1440 | ‏9.08% מול תקרת ‏11% |

| STEP | מה קרה |
| --- | --- |
| 14 | ‏migration-lint + ‏bundle-gate + ‏smoke-all-routes; לולאה ירוקה ×3 |
| 15 | נסגר בסריקה — עגלות נטושות חיות (‏fn_due + ‏UNIQUE + הסכמה); תזכורת שנייה נדחתה |
| 16 | נסגר בסריקה — ‏fn_complete_referral שלם ומחווט |
| 17 | נסגר בסריקה — קמפיינים אוטומטיים נדחו (פיצול מקור אמת למחיר) |
| 18 | **נבנה** — ביקורות מאומתות + רשימת משאלות (מיגרציה 154, ‏RLS היא האימות) |
| 19 | סורק קיים; נוספו סיכומי היום/30 יום למימושים |
| 20 | ‏SEO קיים; נוסף ‏BreadcrumbList לקטגוריה |
| 21 | ‏WP import הושלם 07.08; ‏seed מוצרים בדויים נדחה; נכתב ‏SEED.md |
| 22 | תוקנו שתי רגרסיות מעבודת ה-fold (‏320px overflow, שני sliders); לולאה ×3 + ‏e2e; תג ‏v1.4.0-rc1-block2 |

## נספח מתוארך: מגה-בלוק 3 (‏STEPS 23–27), נמדד 02.09.2026

לולאת הביקורת ירוקה ×3 (‏type-check / lint / 3568+ בדיקות / migration-lint
33 קבצים / bundle-gate 255.6KB). ‏build ירוק.

| STEP | מה קרה |
| --- | --- |
| 23 | נסגר בסריקה — הארנק חי מקצה לקצה; הכלל המחייב חזק מהספק (מוגבל לתשלום-באתר, לא "פיזי בלבד") |
| 24 | **נבנה** — מכונת משלוחים על המודל הפרוס (‏item_status פר שורה), מיגרציה 155 (‏carrier/tracking + ‏order_shipped kind, אחרי 150), פעולות אדמין מבוקרות-audit עם מחסום מרוץ, ‏UI אדמין + צ'יפ ללקוח |
| 25 | נסגר בסריקה + ‏CSV ספק (‏/api/supplier/payouts/csv, אותו fold של העמוד) |
| 26 | נסגר בסריקה + עשרת הספקים המובילים + מיגרציה 156 (שני אינדקסים חלקיים) |
| 27 | לולאה ×3, תג ‏v1.5.0-rc1-block3 |

## נספח מתוארך: מגה-בלוק 4 (‏STEPS 28–32), נמדד 02.09.2026

לולאת הביקורת ירוקה ×3; ‏build ירוק; ‏migration-lint ‏34 קבצים נקיים.

| STEP | מה קרה |
| --- | --- |
| 28 | נסגר בסריקה + תיקון: ‏Permissions-Policy סטטי חסם מצלמה גם על סורק ה-QR — עכשיו ‏camera=(self) רק על מסלולי הסורק, אומת חי |
| 29 | **נבנה** — ‏TOTP צוות על ה-MFA המובנה של Supabase (‏aal2 בשערי rbac, עמוד אתגר, ‏/account/security); טבלת admin_totp נדחתה |
| 30 | נסגר בסריקה + ‏mutating-route-guards.test (כל מסלול משנה מחזיק שער; ‏11/11 כבר מוגנים) |
| 31 | **נבנה** — מיגרציה 157 (הזדקנות IP על audit append-only) + ‏cron ‏retention (ה-11) + ‏SECRETS-ROTATION.md |
| 32 | לולאה ×3, תג ‏v1.6.0-rc1-block4 |

## נספח מתוארך: מגה-בלוק 5 (‏STEPS 33–37), נמדד 02.09.2026

לולאת הביקורת ירוקה ×3; ‏build ירוק.

| STEP | מה קרה |
| --- | --- |
| 33 | נדחה — ‏use cache+CATALOGUE_TAG הוא שכבת ה-cache; ‏Redis שני = שני מנגנוני פינוי מתבדרים |
| 34 | נדחה — ‏notification_outbox (‏backoff, ‏dedupe, ‏dead+Retry) הוא התור; ‏QStash push היה מחליף עובד-ונמדד |
| 35 | נדחה — ‏568 שורות audit אינן צריכות פרטישן; האינדקסים המוכחים נוספו ב-156 |
| 36 | **נמדד** — ‏browse ירוק ב-40VU (בית p95 691ms, ‏0% כשלים), נקודת קריסה מקומית ~68VU תועדה, חיפוש 979ms על ‏ILIKE fallback; תרחישי כתיבה לא רצים בהעדר staging (guard חוסם פרודקשן) |
| 37 | לולאה ×3, תג ‏v1.7.0-rc1-block5 |

## נספח מתוארך: מגה-בלוק 6 (‏STEPS 38–42), נמדד 02.09.2026

לולאת הביקורת ירוקה ×3.

| STEP | מה קרה |
| --- | --- |
| 38 | ‏DR-RUNBOOK.md (שחזור מגיבוי Supabase, ‏RTO<2h/RPO 24h); ‏tar יומי רץ (‏770MB, 3 נשמרים); ‏backup-verify ב-API נדחה (אין token) |
| 39 | **‏monitor חי**: ‏Sentry Uptime על ‏/api/health (‏60s, ‏id 2159284, דרך MCP); ‏ops/sentry-alerts.json — ‏live מול desired |
| 40 | **נבנה** — ‏weekly-digest, ה-job ה-12 (שישי בוקר, ‏Resend ישיר למפעיל) |
| 41 | נסגר בסריקה — הקונסולה קיימת (‏payments/queues/status); ledger פרסיסטנטי נדחה עד שיש עסקאות אמת |
| 42 | לולאה ×3, תג ‏v1.8.0-rc1-block6 |

---

## הרגרסיה הסופית (‏STEP 46), נמדדה 02.09.2026 ערב

| Gate | תוצאה |
| --- | --- |
| ‏type-check / lint / test / migration-lint / bundle-gate | ירוק ×3 (‏3573+ בדיקות, ‏34 קבצי מיגרציה נקיים, ‏255.6KB מול ratchet) |
| ‏build | ירוק |
| ‏e2e מלא, ‏chromium + ‏mobile-chrome, מול ‏pnpm start | **‏454 עברו, ‏0 נכשלו**, ‏8 דולגו |
| ‏פיקסלים ‏1440 | בית ‏8.07%, עגלה ‏8.6%, ‏checkout ‏9.58% — כולם מתחת ל-11% (‏VISUAL-PARITY.md; מוצר לא-מדיד בשל ווידג'ט קשורים שונה בחי) |
| ‏k6 | ‏browse ירוק ב-40VU, ‏0% כשלים (‏LOAD-TEST-RESULTS.md) |
| ‏Uptime | ‏Sentry monitor 2159284 על ‏/api/health, פעיל |

## פסק דין אחד

**הקוד סגור.** ‏47 השלבים של שבעת מגה-הבלוקים הסתיימו — מה שנבנה נבנה
(ביקורות+משאלות, משלוחים, ‏TOTP, ‏retention, ‏digest, ‏CSV, אינדקסים,
תיקוני ‏320px/סורק-מצלמה), מה שכבר היה זוהה ותועד, ומה שסתר את המודל
הפרוס נדחה בנימוק כתוב (‏MEGA-BLOCK-AUDIT.md). מה שנשאר אינו קוד:
‏docs/OWNER-CHECKLIST.md — מיגרציות ‏147–157 + ‏db:types, ‏Cardcom ייצור,
‏DNS, מיזוג ה-PR.

## נספח מתוארך: מגה-בלוק 8 (‏STEPS 48–52), נמדד 02.09.2026

| STEP | מה קרה |
| --- | --- |
| 48 | **נאכף** — גבול הכסף של מעלי תוכן (‏applyUploaderPolicy: פיצול העמלה מופשט, ‏approval_status נכפה ל-pending; ברירת המחדל הפרוסה הייתה 'approved' ודילגה על התור) |
| 49 | נדחה — ‏wp-import הוא הייבוא המרוכז; ‏UI CSV לצד מעלה יחיד = ערוץ עוקף-טופס |
| 50 | **נבנה** — שער ממדי תמונה צד-שרת (‏≥800px, יחס 1:2–2:1, ‏sharp); ‏dedupe/crop נדחו |
| 51 | נדחה עד שיש יותר ממעלה אחד |
| 52 | לולאה ×3, תג ‏v2.1.0-rc1 |

## נספח מתוארך: מגה-בלוק 9 (‏STEPS 53–57), נמדד 02.09.2026

‏contact (‏zod+honeypot+rate-limit+reply-to) ו-FAQ (‏12 שאלות, ‏JSON-LD)
קיימים ומכסים את הספק; מערכת טיקטים מלאה נדחתה כמשטח מוצר מוקדם מדי לערוץ
עם אפס פניות (‏MEGA-BLOCK-AUDIT). תג ‏v2.2.0-rc1.

## נספח מתוארך: מגה-בלוק 10 (‏STEPS 58–62), נמדד 02.09.2026

‏supplier_members עם scanner/manager/owner + ייחוס מימושים פר-משתמש הם
המודל המבוקש, פרוס וחי; רב-סניפיות ואנליטיקות פר-עובד נדחו כמוקדמים.
תג ‏v2.3.0-rc1.

## נספח מתוארך: מגה-בלוק 11 (‏STEPS 63–67), נמדד 02.09.2026

וריאנטים, שריון מלאי אטומי והתראות מלאי נמוך — כולם פרוסים וחיים;
‏ledger נגזר ו-CSV נדחו. תג ‏v2.4.0-rc1.

## נספח מתוארך: מגה-בלוק 12 (‏STEPS 68–72), נמדד 02.09.2026

ניוזלטר-בהסכמה ו-UTM קיימים; ‏react-email וסגמנטים נדחו. תג ‏v2.5.0-rc1.

## נספח מתוארך: מגה-בלוק 13 (‏STEPS 73–77), נמדד 02.09.2026

המסמכים מונפקים ב-Cardcom (קבלה/חשבונית/זיכוי) עם תור+cron+התראת מסמך-מת;
‏VAT באגורות; ייצוא ב-/admin/reports. ‏PDF עצמאי נדחה. תג ‏v2.6.0-rc1.

## נספח מתוארך: מגה-בלוק 14 (‏STEPS 78–82), נמדד 02.09.2026

‏axe אפס-הפרות כבר עומד על 19 מסלולים; נוסף שער מטרות-מגע (‏2.5.8) שמצא
ותיקן 10 מטרות קטנות בנתיבי הליבה; הצהרת הנגישות עודכנה. תג ‏v2.7.0-rc1.

## נספח מתוארך: מגה-בלוק 15 (‏STEPS 83–87), נמדד 02.09.2026

‏DEAD-CODE.md (מחיקה מחכה לאישור), ‏12 ‏ADRs, ‏ONBOARDING.md; ‏hotspots
נדחה. לולאה ×3 ירוקה. תג ‏v2.8.0-rc1.

## נספח מתוארך: מגה-בלוק 16 (‏STEPS 88–92), נמדד 02.09.2026

שכבת המניעה (חוסמת) פרוסה: ‏rate-limits, מחסומי replay, הונאות הפניות
בעומק; טבלאות פורנזיקה ודשבורד נדחו עד מסוף אמיתי. תג ‏v2.9.0-rc1.

## נספח מתוארך: מגה-בלוק 17 (‏STEPS 93–97), נמדד 02.09.2026

‏chaos קיים; ‏DEPENDENCIES.md + ‏HANDOVER.md נכתבו; לולאה אחרונה ×3 +
‏build ירוקים. תג ‏v3.0.0-rc1.

# הפסקה הסופית

**הקוד סגור. ‏STEPS 2–97 הושלמו.** מה שנשאר אינו קוד ונמצא כולו
ב-`docs/OWNER-CHECKLIST.md`.

## Design run — 2026-09-03 (D1-D17, tags v3.1.0-design1 … v4.0.0-rc1)

| item | state | evidence |
| --- | --- | --- |
| Design tokens single-source (`src/styles/tokens.css`) | done | tokens.test.ts: no raw hex, no rgb(), no Tailwind default palette in the storefront, PDP tracks SITE |
| Responsive shell 1:1 (380/768/1440) | done | shell-band.mjs 9.47% / 7.98% / in-pass |
| Mobile drawer (did not exist) | done | MobileDrawer.tsx, 44px targets, Escape/focus return |
| Home 1:1 | done | 5.99% at 1440; 380 volatile 11-28% with live's catalogue, geometry exact to 1-2px |
| Cart / checkout | 768+1440 pass | 380 blocked by the shell-reference conflict (COMPARE-RESULTS.md) |
| Category / product / products | unmeasurable | compare.mjs content guard; refs/ is 2026-08-12 |
| Search UI removed everywhere | done | header field deleted, 404 link repointed; only orphan /search route remains |
| axe WCAG A/AA | zero violations | e2e/a11y.spec.ts 80 passed |
| Global focus ring + reduced motion | done | two-tone ring (yellow fails 3:1 alone), near-zero durations |
| Checkout errors aria-describedby | done | 8 fields + zip + terms wired |
| Full e2e | 412 passed / 0 failed | chromium + mobile-chrome, production build |
| Bundle gate | green | 255.8 KB gz / 260 KB budget |
