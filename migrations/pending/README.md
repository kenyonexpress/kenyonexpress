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

## 114, 115, 116: three subsystems production never received

These three were written on 2026-08-12 against measurements of the live
project, not against the migration chain. Each closes a gap where application
code calls something that is not there, and in all three cases the failure is
silent by design, so nothing in the UI ever reported it.

| File | The gap it closes | How the failure shows today |
| --- | --- | --- |
| `114_cart_items.sql` | `cart_items` (declared in `026`, absent in production) plus the guest RLS clause `026` forgot | Nothing yet: the cart still uses `carts.items` jsonb. `114` makes the cutover a reviewable code change |
| `115_analytics_pipeline.sql` | the entire analytics stack: `analytics_events` and its partitions, `analytics_daily`, `analytics_event_definitions`, `analytics_identity_links`, `fn_ingest_analytics_events`, `fn_rollup_analytics_daily`, `v_funnel_daily`, `orders.attribution` | `/api/a` logs `analytics.ingest_failed` and returns 204 on every batch. Every event ever sent was dropped |
| `116_payout_engine.sql` | `payout_statements`, `payout_statement_lines`, `supplier_bank_accounts`, the four payout RPCs, the T+3 hold and the minimum | The admin payouts screen already says so in Hebrew: `src/server/actions/admin/payouts.ts:58` |

**`115` and `116` are distillations, not replays.** Replaying the chain does not
work here: `033` would fail on an index over `coupon_scan_events`, a table that
does not exist, and `081` refuses by its own guard because this database is the
pre-059 lineage and has no `total_price_agorot`. Each file states in its header
exactly which source migration each object came from and where it deviates.

None of the three depends on the others. `116` is the only one that touches the
money path, and it writes numeric ILS deliberately, to agree with the columns it
reads; its header explains why splitting units across two migrations is how a
x100 bug is born.

## 086: the checkout event journal, hardened rather than duplicated

`086_checkout_events.sql` was asked for as "a `payment_events` table,
append-only". It does not create that table, because it is already in production
as `payment_webhook_events` and already dedups on
`(provider, external_event_id)`. A second table would give one question - "have
we handled this Cardcom callback?" - two answers, and a replay that consulted
the wrong one would finalize an order twice and issue a second set of vouchers
for one payment. `115_payment_events.sql` in this directory reached the same
conclusion and was deliberately left inert.

What `086` adds is the part that really is missing: the recorded facts
(`provider`, `external_event_id`, `payload`, `signature_valid`, `created_at`)
become immutable and rows become undeletable, while the two columns the webhook
must still stamp stay writable; plus `attempts` / `next_attempt_at` /
`last_error` and a partial index, so the dead-letter queue that
`src/server/payments/webhook-dlq.ts` infers today can be recorded instead.

Dry-run status is in the file header: every statement ran against production
inside `BEGIN ... ROLLBACK` on 2026-08-20, the self-check passed, all four
blocked operations were blocked, and the rollback left nothing behind.

## Order

`002-products-geo.sql` and `003-products-whatsapp-enabled.sql` are independent
of each other and of everything in `supabase/migrations/`. Neither depends on
PENDING-109 or PENDING-110.
