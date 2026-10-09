# Migration review

Five migrations sit in `migrations/pending/` and none is applied. This reviews
each against **the live production schema**, queried on 2026-09-06, rather than
against what the files claim.

**Nothing here has been applied.** Applying to production needs Ofir's explicit
approval; the apply order and its preconditions are in `docs/RUNBOOK.md`.

## Verdicts

| # | What it changes | Applied out of order? | Reversible | Verdict |
|---|---|---|---|---|
| 162 | Schedules 12 pg_cron jobs | independent | yes, `cron.unschedule` | **BLOCKED** — needs vault secrets, which need a deployment URL that does not exist |
| 169 | Widens the analytics event whitelist | independent | yes, `CREATE OR REPLACE` back | **APPLY FIRST** — four funnel events are being silently discarded right now |
| 170 | Ten indexes | independent | yes, `DROP INDEX` | **SAFE** — verified column by column, tables are tiny |
| 171 | One category name's shekel order | independent | yes, one `UPDATE` | **SAFE, optional** — the app already repairs this on read |
| 172 | Takes a ₪1 test row off sale | independent | yes, one `UPDATE` | **STILL REQUIRED** — no longer purchasable since 2026-09-06 (application guard), but the row is still active in the catalogue |

None of the five depends on another. There is no ordering hazard between them;
the order below is by urgency, not by dependency.

---

## 172 — a purchasable ₪1 test row, live in production

**The goal brief had this backwards.** It described 172 as *seeding* a Master
Product test row on sale for one shekel. It does the opposite: the row is
already in production, put there by the WordPress import, and 172 is the fix.

Queried live on 2026-09-06:

```
id     9bb347f8-03ec-48ce-8ff2-2503fb74c895
slug   restaurants-meat-3
name   מוצר ראשי מאסטר Master Product
price  kenyon_price 1, full_price 400, stock_quantity 10, type physical
```

Ten in stock, ₪1, against a ₪400 compare-at price — a 99.75% discount badge on a
row whose own name says it is a template. It renders on the homepage grid. If
anyone buys one, the order is real, the payment is real, and there is nothing to
fulfil.

**What 172 does:** sets `stock_quantity = 0`, matched on both the id and the
exact name so a second run changes nothing.

**Why zero stock and not a delete:** an `order_items` row may reference the
product, and deleting it would orphan a historical order line. Zero stock takes
it out of every listing query the app makes and leaves history intact.

**2026-09-06: the money consequence is closed, the migration is not.** The row
can no longer be bought — `src/lib/commerce/implausible-discount.ts` refuses to
sell any line priced at an implausible fraction of its own compare-at, the cart
marks it `price_error`, and `validateCartView` stops `beginCheckout` before any
payment branch. The threshold is 95% off, measured against production: on `full_price`, the
only compare-at column the guard reads, the deepest real discount is 50% and
this row is at 99.75%. It
keys on the ratio, never on the name or the id, so the same row sells the
moment its price is corrected.

That downgrades 172 from URGENT to STILL REQUIRED. It does not close it. The
row remains `status = 'active'` with ten in stock, it still answers a direct
query, and it still renders in listings that do not go through the cart. Apply
order and preconditions are unchanged; 172 stays first in batch A1.

**On the brief's instruction to gate it behind a non-production guard or remove
it entirely:** neither applies. There is no fixture to gate — this is a row in
the production database, not a seed script. `scripts/seed/demo-data.mjs` emits
SQL and is never executed against production, and it does not contain this row.
The migration is the removal, and it is written. What it needs is approval, not
a rewrite.

**Reversible:** yes, restore `stock_quantity = 10`. Written at the foot of the
file.

---

## 169 — four funnel events are being thrown away

This one is not cosmetic, and it is measurable from outside the database.

`fn_ingest_analytics_events` filters incoming events against a name whitelist and
**silently drops anything not on it** — no error, no log, HTTP 200. Probed
against production on 2026-09-06, one event at a time, counting rows inserted:

| event | rows inserted | meaning |
|---|---|---|
| `page_view` | reached a NOT NULL constraint | passed the whitelist |
| `begin_checkout` | **0** | discarded |
| `purchase` | **0** | discarded |
| `voucher_redeemed` | **0** | discarded |
| `order_refunded` | **0** | discarded |

`page_view` is the control: it failed on `event_id` being null in my probe
payload, which proves it got *past* the name filter. The other four returned a
clean `0`.

So every server-side money event the funnel emits has been going nowhere. The
code that emits them is live — `trackServerEvent` was wired up in `29f74812e` —
and the database has been discarding them at the door since migration 151
narrowed the list.

**What 169 does:** `CREATE OR REPLACE` on the function with the four names added.

**Why it is safe:**
- `CREATE OR REPLACE` preserves existing grants. There is no `DROP FUNCTION`.
- The body writes to `public.analytics_events`, schema-qualified, so
  `SET search_path TO ''` cannot misresolve it. The only other call is
  `jsonb_array_elements`, a `pg_catalog` builtin.
- The batch cap (20) and the array type check are unchanged.
- It is `SECURITY DEFINER`, which is how it was before; this changes the
  whitelist and nothing about the security model.

**Reversible:** yes, `CREATE OR REPLACE` with the old list.

---

## 170 — ten indexes, schema verified

Every column every index names was checked against production by selecting it:

| table | columns verified | rows |
|---|---|---|
| `products` | `category_id, created_at, status, deleted_at, kenyon_price, name_he` | 80 |
| `orders` | `user_id, created_at, deleted_at` | 4 |
| `vouchers` | `order_item_id, issued_at` | 0 |
| `invoices` | `order_id, document_type, status` | 0 |
| `carts` | `session_id, profile_id` | 1813 |
| `user_addresses` | `user_id, is_default, created_at, deleted_at` | 1 |

All present. Every statement is `CREATE INDEX IF NOT EXISTS`, so a partial
previous run is not a hazard.

**The one thing to know before running it:** these are plain `CREATE INDEX`, not
`CREATE INDEX CONCURRENTLY`. A plain create takes a lock that blocks **writes**
to the table for its duration — reads are unaffected. On this database that is
milliseconds: the largest table it touches is `carts` at 1813 rows and the rest
are double digits or empty.

That is fine now and will not be fine forever. If `orders` is ever large when a
new index is added, use `CONCURRENTLY`, which cannot run inside a transaction
block and so has to be applied statement by statement.

**Note on `carts` at 1813 rows** against 10 profiles and 4 orders: that is guest
cart accumulation. `162` schedules `ke-reap-carts` to clear it, which is one more
reason 162 matters, but it is not a blocker.

**Reversible:** yes, `DROP INDEX` per index. Written at the foot of the file.

---

## 171 — the shekel sign in a category name

`categories.name_he` for `under-99` reads `עד ₪99`. In an RTL document the
shekel glyph is bidi class ET and joins an adjacent run of digits into one
left-to-right run, so the sign paints to the **left** of the number. 171 rewrites
it digits-first inside an LTR isolate, which is what every other price on the
site now emits.

**It is optional, and that is deliberate.** `getAllCategories` already repairs
the order on read (`repairPriceOrder`), and `e2e/price-bidi.spec.ts` measures the
rendered geometry at three widths and passes. The page is correct without this.

What the migration buys is the datum itself, so exports, feeds, and any future
reader that skips the helper agree with the page.

**Reversible:** yes, one `UPDATE` back.

---

## 162 — the cron schedule, and why it cannot run

Twelve jobs, from `ke-notifications` every five minutes to `ke-weekly-digest`
weekly. The file opens by refusing to proceed unless two vault secrets exist:

```sql
if not exists (select 1 from vault.decrypted_secrets where name = 'cron_secret')
  then raise exception ...
if not exists (select 1 from vault.decrypted_secrets where name = 'app_url')
  then raise exception ...
```

That guard is correct and it is also the blocker. Neither secret is seeded, and
`app_url` cannot be seeded honestly because **there is no deployed URL to put in
it**: the Vercel project for this repo does not exist (blocker 0 in `STATE.md`).
Seeding a guess would schedule twelve jobs to POST at a hostname that answers
nothing, every five minutes, forever.

`cron_secret` has the same shape of problem: it must match the `CRON_SECRET` the
deployment serves, and there is no deployment.

**This is one of the blockers that needs Ofir's hands.** The chain is: create the
Vercel project → deploy → take its URL and its `CRON_SECRET` → seed the two vault
secrets → run 162's preflight → apply 162.

**Reversible:** yes. The file loops `cron.schedule` by name; `cron.unschedule` on
the same twelve names undoes it.

---

## What this review changes about the launch verdict

Two of the five are worth applying the moment there is approval, and neither
needs anything from Vercel:

- **172**, because a ₪1 purchasable test row in a live catalogue is a money
  defect, not a tidiness one.
- **169**, because the funnel has been reporting nothing and every day it stays
  unapplied is a day of purchase data that does not exist.

**170** and **171** are safe and can ride the same batch. **162** stays blocked
behind the Vercel project and is the only one of the five that does.
