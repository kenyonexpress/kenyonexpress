# C178 — Legal pages (/terms /privacy /returns /accessibility)

Date: 2026-11-03. Branch: closeout/v1-final. HEAD at measurement: 00e73b7af.

## Finding
All four pages already ship from C146 (`src/app/(legal)`, content in `_content/*.ts`,
one renderer `LegalArticle` shaped after Electro /terms-and-conditions: breadcrumb,
centred title, numbered `N.` sections and `N.M` clauses, `src/styles/legal-page.css`).
Every C178 requirement was checked against the source and the rendered HTML. None was
missing, so this item changes no `src/` code.

| Requirement | Where | Status |
|---|---|---|
| Legal name קניון אקספרס + 033798513 | `src/lib/legal-entity.ts`, LegalContactBlock on every page, terms intro | ships |
| Minimum age 18, סעיף 2 חוק הכשרות המשפטית | `_content/terms.ts:102` | ships |
| 14-day cancellation, סעיף 14ג + תקנות ביטול עסקה | `_content/returns.ts:37,67-82` | ships |
| Tel Aviv jurisdiction | terms.ts:324, privacy.ts:400, returns.ts:247, accessibility.ts:153 | ships |
| Electro paragraph style | `LegalArticle` + `legal-page.css` (C146) | ships |
| No social or review links | grep on rendered HTML: 0 hits | ships |
| Shipping address only (no billing) | privacy.ts:90,217 mention only כתובת למשלוח | ships |

Label decision kept from C146: `מספר עוסק`, not `ח.פ`. 033798513 is a sole-trader
dealer number (it passes the ID checksum), so printing ח.פ would misstate the entity type.

## Proof: render (next dev :3178, curl -L, 2026-11-03 06:44 +07)
```
/terms 200 redirects=0 h2=18 reg033798513=9 legal-name=24 telaviv=2 legal-page=157 dir-rtl=5
/privacy 200 redirects=0 h2=17 reg033798513=6 legal-name=17 telaviv=2 legal-page=99 dir-rtl=5
/returns 200 redirects=0 h2=14 reg033798513=6 legal-name=15 telaviv=2 legal-page=97 dir-rtl=5
/accessibility 200 redirects=0 h2=11 reg033798513=6 legal-name=17 telaviv=2 legal-page=39 dir-rtl=5
```

## Proof: clause text from rendered HTML
```
האתר מופעל על ידי קניון אקספרס, מספר עוסק 033798513
מלאו לו 18 שנים, שהוא בגיר וכשיר לפעולות משפטיות לפי סעיף 2 לחוק הכשרות המשפטית והאפוטרופסות, התשכ&quot;ב-1962, ובבעלותו כרטיס אשראי תקף או אמצעי תשלום אחר הנתמך באתר. מי שטרם
סמכות השיפוט הייחודית בכל מחלוקת נתונה לבתי המשפט המוסמכים במחוז תל אביב, ואולם צרכן רשאי להגיש תביעה גם לבית המשפט שבאזור מגוריו, ככל שהדין מקנה לו זכות זו.
14 יום מיום קבלת המוצר או מיום קבלת מסמך פרטי העסקה, לפי המאוחר
סעיף 14ג לחוק הגנת הצרכן, התשמ&quot;א-1981, ותקנות הגנ
class="legal-page"
class="legal-page__breadcrumb"
```
Social/review link grep (facebook.com, instagram.com, g.page, search.google.com/local) over all four pages: no output.

## Proof: production (www, same morning)
```
/privacy 200 final=https://www.kenyonexpress.co.il/privacy redirects=1 h2=17 reg033798513=6 legal-name=17 telaviv=2 legal-page=94
/returns 200 final=https://www.kenyonexpress.co.il/returns redirects=1 h2=14 reg033798513=6 legal-name=15 telaviv=2 legal-page=92
/terms 000 (timeout 40 s)
/accessibility 000 (timeout 40 s)
```
Terms and accessibility timed out on production during the Supabase outage. Production was not probed again (it triggers a challenge).

## Proof: tests, type-check, lint
```
 Test Files  6 passed (6)
      Tests  104 passed (104)
   Start at  06:46:40
```
(`src/app/(legal)`, `content-pages.test.ts`, `hebrew-copy.test.ts`)
```
$ tsc --noEmit
Checked 27 files in 28ms. No fixes applied.
```

## Why the render ran on next dev, not next start
`pnpm build` failed on `/coupons/[id]` page data. All Supabase REST reads timed out at
10 s, and the management health API returned
`[{"name":"db","healthy":false,"status":"UNHEALTHY"},{"name":"rest","healthy":false,"status":"UNHEALTHY"}]`
at 23:42 UTC. The legal pages read no DB, so dev compiles and serves them on their own.
No compare.mjs gate applies here: the gate covers home, product, /c and /c/<slug> only.

No forbidden files touched.
