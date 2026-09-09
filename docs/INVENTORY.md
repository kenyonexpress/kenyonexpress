# Inventory: the stock is held properly, and the discount cap was decoration

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`).

The headline is a correction in both directions. **The stock reservation is
real, complete and provably correct** — it was built in 117 and it does what it
claims. **The discount cap next to it was not enforced at all**, and the
codebase already said so in a comment nobody had acted on.

## The stock chain, proved end to end

One `DO` block against production, rolled back, over a real product forced to
one unit:

```
avail_before=1  first_shortfalls=0  row_locks_held=1  second_shortfalls=1
avail_after_first_hold=0  consumed_rows=1  stock_after_sale=0
```

Read left to right, that is the whole feature:

- one unit available;
- the first order reserves it and reports no shortfall;
- `reserve_order_stock` is holding a `RowExclusiveLock` on `products` — the lock
  that serialises two shoppers reaching for the same unit;
- a second order for that unit is **refused**, one shortfall row;
- availability reads 0 while the hold is live, so the page stops offering it;
- `consume_order_stock` turns the hold into a sale, one row applied;
- `stock_quantity` ends at 0. The sale actually decremented.

**Where the correctness comes from, and it is not the check.** The `FOR UPDATE`
in `reserve_order_stock` is taken over every product in the order, ordered by
id, **before** any availability is read. Ordering is what keeps two orders with
overlapping baskets from deadlocking each other; taking the lock first is what
makes the availability read meaningful, because a number read outside a lock is
a number that was true a moment ago.

**All-or-nothing.** The function returns its shortfall rows before inserting
anything, so a three-line order with one short line reserves nothing. Checkout
relies on that: the shortfall branch cancels the order and does not release,
because there is nothing to release.

**`finalize.ts` no longer touches stock, and that is the fix rather than an
omission.** It used to `SELECT stock_quantity` and `UPDATE` to
`max(0, stock - qty)`. Two concurrent finalizes read the same number and wrote
the same result, so the second sale never decremented — and the `max(0, …)`
floor then hid it, leaving an oversell with no trace. The whole order's stock is
consumed once, in one statement, from the reservations the checkout already
holds.

**The reservation outlives nothing.** 15 minutes, shorter than the 30-minute
order expiry on purpose: a hold that outlives the sale it was taken for is stock
nobody can buy. An expired reservation stops counting the moment it lapses
because `available_stock` filters on `expires_at > now()`; the cron that marks
it released is bookkeeping, so a cron that fails to run for a day cannot keep a
product sold out.

### What is NOT covered, named

**Variants are not checked at reservation time.** `reserve_order_stock` groups
by `product_id` and always calls `available_stock(pid, NULL, …)`. A product
whose stock is tracked per variant — `products.stock_quantity IS NULL`, variant
rows carrying the real numbers — gets `NULL` back, no shortfall, and sells
without any check. The cart checks `variant.stock_quantity ?? product.stock_quantity`
at add time, so the gap is between add and pay, which is exactly the gap the
reservation exists to close.

**It is latent, not live: production has 0 product variants**, active or
otherwise. The hole opens with the first one. It is recorded here rather than
fixed because fixing it means changing the RPC's grouping key and its conflict
target, which is a migration to a function on the charging path, and there is no
variant to test it against.

**19 of 44 active products carry `stock_quantity IS NULL`.** Those are untracked
by construction: `available_stock` returns NULL, nothing is ever reserved, and
`consume_order_stock` skips them. For a massage or a cabin night that is the
right answer. All 44 are `type = 'physical'` with `requires_shipping = true`,
which is a catalogue-quality problem recorded in CLAUDE.md blocker #1, not an
inventory one — but it means the type cannot be used to tell which of the 19 are
untracked on purpose.

## The discount cap, which was decoration

`checkout.ts` carried this next to the charge:

> nothing increments `coupons.used_count`, so `max_uses` is enforced as a read
> of a counter no part of this flow advances

Exact, and what it means is that a code marked single-use was **unlimited-use,
for everybody, forever**. The check reads a counter, the counter stays at zero,
the check passes. Nothing errors and nothing logs, because from the code's point
of view the coupon simply has uses left.

`max_uses_per_user` was worse on the `coupons` side: **the column did not
exist**. `discount_campaigns` has both columns and a `discount_redemptions`
table to count against, and `growth/discount.ts:147` reads
`used_count >= max_uses` there too — against a counter that also had no writer.
Two coupon systems, the same defect in both, and one of them looked complete
enough that nobody re-checked.

```
coupons               0 rows
discount_campaigns    0 rows
discount_redemptions  0 rows
```

Nothing has been lost yet. The hole opens the moment the first code is created,
and a marketing code is created by somebody in a hurry.

**The fix is shaped after the stock reservation, deliberately.** A `max_uses`
cap is the same kind of scarce thing as the last unit in stock, and 117 already
solved that: check and claim in one statement under `FOR UPDATE`, before the
card is charged, all-or-nothing, released when the order is cancelled.
`claim_order_discount` is `reserve_order_stock`; `release_order_discount` is
`release_order_stock`; they are called from the same two places. One shape for
"hold a limited thing while the shopper pays" beats two that differ in ways
nobody chose.

**A read-then-write in TypeScript would have been the bug already fixed here
once.** `SELECT used_count; UPDATE used_count + 1` is the finalize oversell with
a different column name.

Proved against production, rolled back:

```
first=OK  replay=OK  used_after_replay=1  rows=1
second_order=per_user_exhausted  released=1  used_after_release=0  retry=OK
```

A replayed claim for the same order leaves the counter at 1 and writes exactly
one row — the unique index is what makes it idempotent, rather than a guard
somebody has to remember. A second order by the same customer under a cap of 1
is refused. Release hands the use back and the next attempt succeeds. The match
is case-insensitive: the first call passed `probe194` against a stored
`PROBE194`.

**Claimed after the stock hold, not before.** The reverse order would spend a
customer's one-per-user allowance on a checkout that is about to fail on stock,
and the release only runs on paths that reach a cancel.

**A claim error is fatal; a missing function is not.** A cap system that fails
open does nothing on the day it matters, so a real error cancels the order and
refuses the charge. `42883` / `PGRST202` is 194 not being applied yet, and there
the flow continues with the pre-194 behaviour rather than taking the shop down
over a migration nobody has approved.

## Sold out, and the waitlist

The sold-out state exists in three components and does nothing: it prints
"אזל מהמלאי", disables the button, and the visit ends. Somebody came for a
specific thing, it was not there, and the shop learned nothing from it.

`WaitlistButton` is one collapsed link that opens one email field. Guests
included — demanding an account at the moment a shopper finds an empty shelf
trades the only signal of interest for a signup form.

**One answer for every outcome.** "Added", "already on the list" and "we could
not write it" return the same sentence. Telling them apart would let anyone use
the box to ask whether a given address is watching a given product.

**Rate limited at 5/hour per IP**, the same policy and the same number as the
newsletter box, because it is the same hazard: a form that ends in mail to an
address the submitter typed.

**Measured, and it is why this is small: no active product is at zero stock.**
44 active, 0 sold out, 19 untracked and therefore never sold out. The branch
exists and production does not currently reach it.

## The 200-parallel-buys test, and why it is not here

It is not runnable from this session, and saying so is better than shipping
something that looks like it.

**Against production it would be 200 real orders**, 200 real reservations and up
to 200 real charges against a live Cardcom terminal. That is not a test, it is
an incident.

**Against the database directly it needs two connections at once.** This session
reaches Postgres through a single MCP connection that runs statements
sequentially, and the extension that would open a second session from inside SQL
(`dblink`) is not installed — measured: `cube`, `earthdistance`, `pg_cron`,
`pg_net`, `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`,
`unaccent`, `uuid-ossp`. `pg_net` is asynchronous HTTP and cannot hold a
transaction open.

**What was proved instead is the mechanism rather than the race:** that the
lock is actually taken (`row_locks_held=1`, read from `pg_locks` while the
transaction was still open), and that the second claim on a single unit is
refused. A race between two sessions can only produce an oversell if the lock is
absent or the check happens outside it, and neither is the case.

The remaining unknown is throughput, not correctness — how long 200 concurrent
reservers queue behind one product row. That is a load question and belongs with
`load/browse.js`, on a machine with a connection pool.

## Files

| | |
| --- | --- |
| `reserve_order_stock` (117, applied) | takes the hold under `FOR UPDATE`, all-or-nothing |
| `consume_order_stock` (117, applied) | turns holds into a sale, one statement |
| `release_order_stock` (117, applied) | gives a cancelled order's hold back |
| `available_stock` (117, applied) | level minus live holds; NULL means untracked |
| `src/server/actions/payments/checkout.ts` | steps 4b and 4c: stock, then discount |
| `src/app/api/cron/stock/route.ts` | releases lapsed holds, alerts on low stock |
| `migrations/pending/194_discount_claim_caps.sql` | the cap that was decoration. Not applied. |
| `migrations/pending/195_stock_waitlist.sql` | back-in-stock requests. Not applied. |
| `src/server/actions/waitlist.ts` | the join, rate limited, one answer for every outcome |
| `src/components/storefront/WaitlistButton.tsx` | the sold-out page's only remaining offer |
