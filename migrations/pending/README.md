# `migrations/pending/`

Unapplied migrations, written here by instruction. **Nothing in this directory
has been run against any database**, and nothing here may be applied with
`db push` — the project forbids it. The route to production is
`apply_migration` through MCP, after a human approves the file.

## There is a second pending location, and it is older

Four unapplied files live in `supabase/migrations/` under a `PENDING-` prefix
instead:

| File | What it does |
| --- | --- |
| `PENDING-109-recurring-subscriptions.sql` | the `recurring` enum member, `subscriptions`, the billing columns |
| `PENDING-110-supplier-coordinates.sql` | `suppliers.latitude` / `.longitude`, GiST, the pair CHECK |
| `PENDING-money-integer-fix.sql` | 41 money columns from numeric ILS to integer agorot |

They are not moved here. The `PENDING-` prefix deliberately breaks the `NNN_`
convention so no tooling picks them up as part of the ordered chain, and moving
a file that four documents cite by path buys a tidier tree at the cost of every
one of those references. **Read both locations before concluding the schema is
settled.**

## Order

`003-products-whatsapp-enabled.sql` is independent of everything in
`supabase/migrations/`. It does not depend on PENDING-109 or PENDING-110.

## Two corrections, measured against production on 19.08.2026

Both were stale claims in this file, found by checking every object named here
against `ixvwfbuvfxxsjiywhbbb` rather than by reading.

**`002-products-geo.sql` no longer exists**, anywhere in the tree or on any
branch head. It was added in `f4fc79140` and has since been removed. It is not
"pending": `products.city`, `products.latitude` and `products.longitude` are
all **present in production today**, so its content was applied and the file
was dropped afterwards. The sentence above used to name it as an unapplied file
sitting in this directory, which would have led the next reader to go looking
for it, or worse, to rewrite and re-apply it.

**`PENDING-revoke_anon_writes.sql` does not exist either.** The table above
listed four files in `supabase/migrations/`; there are three. That mattered
more than a missing row, because the file it named is a security migration and
its absence read as "already written, waiting for approval". What is actually
true in production, measured:

| role | INSERT / UPDATE / DELETE | TRUNCATE | gate |
| --- | --- | --- | --- |
| `anon` | **`carts` only** | none | RLS on, policy `carts: owner all` |
| `authenticated` | 55 tables | **55 tables** | RLS, except TRUNCATE |

The `anon` grant is not a hole: an open guest cart is a product requirement,
the grant is confined to that one table, and RLS is on with an owner policy.

The `authenticated` grants are broad by Supabase default and RLS is the real
gate, with one exception worth writing down: **RLS does not apply to TRUNCATE.**
It is not reachable through PostgREST, so this is defence in depth rather than a
live exploit, and it is what `126_revoke_authenticated_dml.sql` addresses. That
file is **not in this directory** either: it is on the unmerged `feat/auth-model`
branch.

## All ten files here are genuinely unapplied

Checked object by object against production, not assumed from this file: none of
`payment_events`, `refunds`, `search_index_outbox`, `supplier_branches`,
`banners`, `homepage_sections` exists; neither does `order_items.shipped_at`,
`order_items.delivered_at` or `products.whatsapp_enabled`; and none of the six
guard functions in `007` is defined. `expire_vouchers` does exist, which is
expected: `004` replaces it rather than creating it.

`src/__tests__/pending-migrations-inventory.test.ts` now keeps this section
honest. It lives under `src/` because that is the only tree vitest is
configured to collect from; widening `vitest.config.ts` to reach `migrations/`
would change what every other suite in the repo picks up, for one file.
