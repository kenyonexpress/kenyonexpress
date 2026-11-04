# S18: legal pages, required clauses

Queue item S18, 04.11.2026. Scope: content only, no layout change.

## Do the four routes exist

| Requested | Served by | Production (measured 04.11) |
|---|---|---|
| `/terms` | 308 to `/terms-and-conditions` (`next.config.ts:175`) | `308 -> /terms-and-conditions` |
| `/privacy` | 308 to `/privacy-policy` (`next.config.ts:176`) | `308 -> /privacy-policy` |
| `/returns` | 308 to `/refund_returns` (`next.config.ts:187`) | `308 -> /refund_returns` |
| `/accessibility` | page `src/app/(store)/accessibility/page.tsx` | `503`, `retry-after: 300` |

All four render one document each from `src/app/(legal)/_content/*.ts`
through `LegalArticle` and `LegalContactBlock`. The three short paths are
aliases onto the WordPress paths the footer already links. They are not second
pages.

The 503 on the target pages is the production rate-limit answer
(`server: Vercel`, `retry-after: 300`), not a missing route. I stopped probing
after it appeared. The routes are in the build and `legal-pages.test.ts`
holds the route registry.

## Clause audit

| Clause | Where | State before S18 |
|---|---|---|
| Minimum age 18 | `terms.ts:99`: "רשאי לבצע רכישה באתר מי שמלאו לו 18 שנים" (privacy: "אינו מיועד לילדים מתחת לגיל 18") | present |
| חוק הגנת הצרכן 14ג | `returns.ts`: intro names 14ג and the 2010 regulations | present |
| 14 days, unredeemed only | `returns.ts` window table and the redeemed or expired refusal | present |
| 2 non-rest days before a booked service | `returns.ts:77`: "לפחות שני ימים, שאינם ימי מנוחה, לפני המועד" (7 days for a set-date leisure service, 14ג(ד)(2)) | present |
| Fee min(5%, ₪100) | `returns.ts:162`, `terms.ts:241` | present |
| Tel Aviv jurisdiction | `terms.ts:336`: "סמכות השיפוט הייחודית ... במחוז תל אביב" | present |
| **ח.פ 033798513** | none of the five documents, and not the contact block | **missing** |
| Contact: email, no phone | `LegalContactBlock`: email and contact form, "אין מוקד טלפוני" | present |

## What changed

The number was the one gap. It is now in three content strings:

- `messages/he.json` `legal.contact.operator`: "קניון אקספרס, עוסק מורשה, ח.פ 033798513". It renders in the contact block of all five legal pages.
- `terms.ts` definition of "מפעילת האתר".
- `cookies.ts` intro, which names the operator in the same words.

No component, layout or CSS file was touched.

**Decision I made on my own: the label.** The owner rules say "ח.פ 033798513".
The number has an ID format and passes the ID check digit, so it is technically
a dealer number (עוסק מורשה), and the documents already said "עוסק מורשה". The
string keeps both: "עוסק מורשה, ח.פ 033798513". That matches the owner rule
word for word, it keeps the form the purchase email already prints
(`purchaseConfirmation.sellerName`), and it does not drop the legal form that
`legal-pages.test.ts` pins.

**Test change.** The phone guard (`/\b0[2-9]\d?-?\d{3}-?\d{4}\b/`) reads
033798513 as the Tel Aviv landline 03-379-8513 and failed on terms and cookies.
The guard now removes only the exact string "ח.פ 033798513" before it
matches, so a real phone number placed next to it still fails. A new
`describe('the clauses the launch rules require')` pins all four required
clauses to their documents.

## Proof

```
$ pnpm vitest run "src/app/(legal)"
 Test Files  1 passed (1)
      Tests  67 passed (67)

$ pnpm vitest run "src/app/(legal)" src/app/content-pages.test.ts src/app/hebrew-copy.test.ts src/lib/i18n src/lib/email
 Test Files  14 passed | 1 skipped (15)
      Tests  245 passed | 1 skipped (246)

$ pnpm type-check
tsc exit 0

$ pnpm lint
biome check .: Found 100 errors, every one in the untracked .lighthouseci/
  (another session's Lighthouse output, file size and formatting).
  Errors in any other file: 0.
tokens-gate, copy-gate, asset-gate, raw-html-gate, postgrest-or-gate,
cache-invalidation-gate, rtl-logical-gate, i18n-gate, locale-format-gate,
input-dir-gate, docs-index-gate, docs-path-audit: exit 0 each
```

Freeze gate:

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../supplier-apply/SupplierCardCheck.tsx           | 53 ++++++++++++++++
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 3 files changed, 173 insertions(+)
```

None of the three existed at the tag (`git cat-file -e` checked each one). All
three come from S17. S18 adds nothing to this list.

## Not done

- No local `pnpm build` and render. The change is three strings that existing
  tests read from the same source the pages render, and parallel builds on
  this machine run out of memory.
- Production still serves the old text until the next deploy. This item does
  not push to production.
