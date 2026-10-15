# Final Closeout: L1 to L16

The closed queue issued on 2026-10-14. One row per item, marked `[x]` only with
the evidence that closed it. Decisions taken along the way are in
`docs/DECISIONS.md` (D-42 onward). The resume pointer is `claude/STATE.md`.

Everything here is measured on `main`. Production is served from
`audit/final-audit`, a different line (D-44). Nothing in this file describes the
live site unless it says so.

| | Item | State |
|---|---|---|
| [x] | L1 Landmines verify | Closed 2026-10-14 |
| [x] | L9 Big-site gap audit | Closed 2026-10-14 |
| [ ] | L10 Build gaps | In progress. Rows 25 (second reminder) and 14 (three wizard steps) ported 2026-10-15/16, both behind pending 244 and 245. Row 16 held for a business-model decision. 17, 19, 20, 22 open |
| [ ] | L11 Growth plumbing | Blocked: scope text for L11 to L16 is not in the repo |
| [ ] | L12 Hardening | |
| [ ] | L13 Phase 2 behind flags | |
| [ ] | L14 Launch gate | |
| [ ] | L15 Regression and tag | |
| | L16 Maintenance | Never closes |

---

## L1. Landmines verify [x]

Branch `l1/landmines-verify`, cut from `fix/pdp-related-heading-overlap`
(`f285de4b0`), which is `main` plus the product-page heading fix of PR #62.

### The four gates

Run with the harness environment stripped (`env -i`), so `CARDCOM_USE_MOCK` and
every other injected variable is unset. Only `.env.local` is read.

| Gate | Result |
|---|---|
| `pnpm type-check` | exit 0 |
| `pnpm lint` | exit 0. Biome, tokens gate, copy gate and asset gate clean |
| `pnpm test` | exit 0. 508 files, 5934 passed, 12 skipped |
| `pnpm build` | exit 0 |

```
$ pnpm test
 ✓ packages/money/tests/invariants.test.ts (21 tests) 432ms

 Test Files  508 passed (508)
      Tests  5934 passed | 12 skipped (5946)
   Duration  59.42s (transform 14.54s, setup 28.19s, import 48.32s, tests 19.51s, environment 206.16s)
```

Before the invariants file was added the same suite was 507 files and 5913
passed, so the 21 new tests are the whole difference.

The build ran before the last two edits of this item (a CSS comment and the
documents). Neither can change build output, and the required `Build` check on
the pull request is the second run.

### One landmine found and fixed

The required check `Diff-scoped lint gates` was red on this line, which blocks
every merge to `main`:

```
src/styles/product-page.css  159 -> 162
```

The fix in PR #62 changed one value (`-20px` to `40px`, a net of zero), but its
comment quoted four pixel values and the hardcoded-value gate scans comments.
The comment now says the same thing without the literals. Reproduced and
re-run locally over the pull request range:

```
$ node scripts/hardcoded-gate.mjs --range=origin/main...HEAD
hardcoded-gate: 159 pre-existing hit(s) within budget, not blocking
hardcoded-gate: no new hardcoded values beyond docs/hardcoded-audit.md
```

### `packages/money/tests/invariants.test.ts`

21 tests in five groups. Each loop runs 500 rounds from a seeded generator, so
a failure reproduces.

| Group | What is pinned |
|---|---|
| Rounding | A fractional or unsafe amount cannot be constructed. Shekel strings convert without float drift. For any basket, subtotal is the sum of quantity times unit price and every output is a non-negative safe integer. Half-up rounding uses integers only |
| VAT | One rate, 1800 bp. `net + vat` is exactly the gross for any amount, and the net is within half an agora of the exact quotient. Order total is subtotal plus shipping with the VAT inside it |
| Physical split | Fee is `amount * platform_percent / 100` rounded once on the line total, and fee plus supplier share is exactly the amount. No default percent exists. Two products split at their own rates. The `order_items` snapshot is a value that survives a later product edit |
| Coupon | Platform fee is the whole prepayment. Supplier share from the platform is zero. No escrow field exists. The counter balance plus the prepayment is the face value. Wallet credit lowers the card charge and nothing else |
| Cashback | Every journal sums to zero, and the wallet balance read off the ledger equals earned minus spent after any sequence. A reversal restores the balance exactly. A one-sided or fractional credit is refused before the database |

### Where the queue and the code disagree

Both are decisions, recorded with reasons, and neither changed any code.

1. **`packages/money.ts` does not exist.** The canonical module is
   `src/lib/money.ts`. The test sits at the requested path and imports the real
   modules (D-42).
2. **VAT is not `floor(subtotal * vat_percent / 100)` added on top.** Prices
   are VAT-inclusive and the VAT is extracted with half-up rounding. Adding it
   on top would raise every customer's total by 18% (D-43).

### Not verified by this item

- The cashback group proves the arithmetic and the balancing rule in
  TypeScript. It does not query a database, so it does not prove that the
  production `wallet_entries` rows sum to the stored balances.
- Shipping is free on both methods today (`costAgorot` is 0), so the shipping
  term of the total is exercised with an injected paid method, not a live one.
- The cashback rates in `src/lib/cashback/engine.ts` are constants (10% on the
  first purchase, 5% on every fifth). The queue forbids hardcoded percentages.
  `platform_percent` has none; these do, and they were left as found.

---

## L9. Big-site gap audit [x]

`docs/BIG-SITE-GAP.md`: thirty features, each with a state, the files that
prove it, what is missing, an effort estimate and how L10 closes it. Read-only,
from code, on two lines because they differ (D-44).

| | main (`c6911b8e1`) | prod (`audit/final-audit`, `1e84df0e5`) |
|---|---|---|
| EXISTS | 6 | 9 |
| PARTIAL | 16 | 16 |
| MISSING | 8 | 5 |

Estimated work to bring every row on main to EXISTS: about 54 working days.

What the audit turned up that the queue did not anticipate:

1. **Nine features are further along in production than on main** (recently
   viewed, wishlist, social proof, offline queue, supplier wizard, admin KPIs,
   referral, loyalty tiers, breadcrumbs). L10 ports those instead of writing
   them a second time.
2. **A header search box and a mega-menu are each forbidden by something
   already in the code**: a test that fails on any search input in the shell,
   and a recorded decision against a mega panel. The queue asks for both.
3. **Public reviews need a grant that was deliberately revoked**, so that row
   can be finished in code and will still show nothing in production until a
   pending migration is approved.

Not checked: the live database, environment variables, whether any cron fires.
No test output applies to this item; it changed no code.
