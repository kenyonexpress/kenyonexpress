# Hebrew copy audit

Every Latin-script string a visitor can read on the funnel, with a verdict.

**Method.** Two passes, because either alone has a hole.

1. **Source** — `scripts/latin-copy-scan.mjs`, run by `pnpm lint` and by
   `pnpm test`. Two or more consecutive Latin words in a JSX text node or a
   copy-bearing field. Catches what is written in the repo.
2. **Rendered** — a Playwright walk of ten funnel pages at 1440, reading every
   visible text node plus `aria-label`, `placeholder`, `title` and `alt`.
   Catches what arrives from the database, which the source pass cannot see.

Measured 2026-09-04 against the production build at `HEAD`. Ten pages, all
HTTP 200: `/`, `/products`, `/category/hot-deals`, `/cart`, `/checkout`,
`/login`, `/signup`, `/coupons`, `/suppliers`, `/account`.

## The rule

A **single Latin word inside Hebrew is not a defect.** "לקניון Express", "הזן
כתובת Email" and "סמסונג גלקסי Samsung Galaxy S22" are how Israeli commerce
writes. A Latin **sentence** is the defect, and so is a Latin string that is not
a name at all.

## Findings

| Page(s) | String | Where | Verdict |
|---|---|---|---|
| `/` | `Reverse Withdrawal Payment` | deals rail card, `H2` + its add-to-cart `aria-label` | **FIXED** — see below |
| `/` | `מוצר ראשי מאסטר Master Product` | product grid card, `H2` + `aria-label` | **OPEN** — see below |
| `/` | `סמסונג גלקסי Samsung Galaxy S22 128GB- 5G` | product grid card | **OK** — live's own product, brand name in Latin |
| all | `Google Analytics`, `Meta` | consent banner paragraph | **OK** — brand names, and the banner names who receives the data |
| all | `Kenyon Express` | footer, `STRONG` | **OK** — the company's own name |
| all | `American Express` | footer payment list | **OK** — payment scheme name |
| all | `Air Port City` | footer address | **OK** — a real Israeli place name |
| all | `Notifications alt+T` | a `section` in a shadow root, absent from the served HTML | **OK, not ours** — Next.js dev-overlay artifact injected client-side. Not in any source file, not in the response body. |

Nothing else. `/login`, `/signup`, `/suppliers` and `/account` carry no Latin
string at all beyond the consent banner.

## `Reverse Withdrawal Payment` — fixed

A WooCommerce internal ledger entry: the record of a reversed payout. The
WordPress import carried it across as if it were a product, and it rendered in
the deals rail with an English name, `kenyon_price: 0`, no image and no category.

It came from live, and the sourcing rule says content comes from live. This is
the same exception `docs/SOURCING-RULES.md` records for the Electro demo copy:
an artifact of the platform the old site runs on is not this business's content,
and "live has it" is not a reason to sell it.

**The repo had already decided this, in the importer.**
`scripts/wp-import/config.mjs` carries `excludeProductSlugs:
['reverse-withdrawal-payment']` and `scripts/wp-dry-run.mjs` explains it in
prose: "Dokan bookkeeping and not merchandise". The import pipeline has been
excluding it all along. What disagreed were the two lists that mirror the live
DOM verbatim -- `KE_LIVE_DEALS` and `GRID_SLUGS` in `scripts/seed/launch-bar.mjs`
-- which copied the rendered grid card for card, artifact included.

Removed from both. The launch-bar count moved from 32 to 31 with a comment
saying why: live really does render 32 cards, and one of them is a ledger entry.
`scripts/seed/launch-bar.test.ts` was what caught the drift, because it asserts
the two lists slug for slug.

`src/lib/ke-live-deals.test.ts` now fails on any entry with no price and no
category, which is the shape every import artifact of this kind has, and on any
entry with no Hebrew in its name at all.

## `מוצר ראשי מאסטר Master Product` — OPEN, needs approval

```
id     9bb347f8-03ec-48ce-8ff2-2503fb74c895
slug   restaurants-meat-3
name   מוצר ראשי מאסטר Master Product
price  kenyon_price 1, full_price 400, stock_quantity 10
```

A template row, on sale for **one shekel** against a ₪400 compare-at price, with
a 99.75% discount badge, ten in stock, on the homepage. If anyone buys one the
order is real, the payment is real, and there is nothing to fulfil.

**Why it is not fixed at the render edge.** The shekel-sign repair
(migration 171) has a counterpart in `getAllCategories` because glyph order is a
*formatting* defect and formatting can be corrected on read. This is not
formatting: it is a row that should not be in the catalogue. Hiding one product
by name in the render path is a rule nobody can maintain, and it would hide a
real product the day one is legitimately called "master".

`migrations/pending/172_hide_master_product_test_row.sql` sets its stock to zero
— not a delete, because an `order_items` row may reference it and deleting would
orphan a historical order line. **Not applied.** Applying a migration to
production needs Ofir's approval.

## Standing gates

| Gate | Runs in | Catches |
|---|---|---|
| `scripts/latin-copy-scan.mjs` | `pnpm lint`, `pnpm test` | Latin sentences written in the repo |
| `src/lib/ke-live-deals.test.ts` | `pnpm test` | import artifacts in the deals fixture |
| this audit | by hand, re-run per release | strings arriving from the database |

The third has no automated gate on purpose: it needs a running server and a
seeded catalogue, and a check that cannot run in CI is a check that goes stale
pretending to be live. Re-run `scripts/_copyaudit.mjs`-style walk before a
release and update the table above.
