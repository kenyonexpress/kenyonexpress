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
| `PENDING-revoke_anon_writes.sql` | takes TRUNCATE/INSERT/UPDATE/DELETE off `anon` |

They are not moved here. The `PENDING-` prefix deliberately breaks the `NNN_`
convention so no tooling picks them up as part of the ordered chain, and moving
a file that four documents cite by path buys a tidier tree at the cost of every
one of those references. **Read both locations before concluding the schema is
settled.**

## Order

`002-products-geo.sql` and `003-products-whatsapp-enabled.sql` are independent
of each other and of everything in `supabase/migrations/`. Neither depends on
PENDING-109 or PENDING-110.
