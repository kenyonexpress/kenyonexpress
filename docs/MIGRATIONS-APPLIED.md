# Migrations applied in the rc5 run

Applied 2026-10-18 between 01:21:22 and 01:21:37 UTC to project
`ixvwfbuvfxxsjiywhbbb`, one at a time, through the Supabase MCP
`apply_migration` tool (official server 0.13.0, driven over stdio with the CLI
access token, because the claude.ai connector needs an OAuth only the owner can
finish). All four were first rehearsed together inside `BEGIN ... ROLLBACK`,
which created the five columns and then left zero of them behind.

| File | Ledger name | Version |
|---|---|---|
| 185_products_cancellation_window_payout_cadence.sql | products_cancellation_window_payout_cadence_185 | 20261018012122 |
| 186_orders_gift_send_at.sql | orders_gift_send_at_186 | 20261018012127 |
| 187_products_full_address.sql | products_full_address_187 | 20261018012132 |
| 278_products_shipping_price_agorot.sql | products_shipping_price_agorot_278 | 20261018012137 |

## Verification

```sql
select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and column_name in ('cancellation_window_days','payout_cadence',
                       'full_address','shipping_price_agorot','gift_send_at');
```

| Table | Column | Type | Nullable | CHECK constraints |
|---|---|---|---|---|
| orders | gift_send_at | timestamptz | yes | 0 |
| products | cancellation_window_days | integer | yes | 1 (0 to 365) |
| products | payout_cadence | text | yes | 1 (weekly, biweekly, monthly) |
| products | full_address | text | yes | 1 (200 chars) |
| products | shipping_price_agorot | integer | yes | 1 (0 to 10000000) |

Row counts right after the apply, every new column still NULL:

| Table | Rows | Non-null in new columns |
|---|---|---|
| products | 82 | 0 |
| orders | 99 | 0 |

## Differences from the goal text

- The goal listed `payout_cadence_days` under 185. The reviewed file ships
  `payout_cadence` as text (weekly, biweekly, monthly). No integer twin was
  added, because two columns for one fact drift.
- The goal listed `shipping_price_agorot` under 185. It went in as its own
  file, 278, instead of an edit to a reviewed migration.
- The goal named 187 "full address + city + lat + lng". `city`, `latitude` and
  `longitude` were already live, so 187 adds `full_address` only.
- The goal numbered later migrations 193 to 200. Those numbers are already
  taken in this repository, so new files take free numbers from 278 upward.
