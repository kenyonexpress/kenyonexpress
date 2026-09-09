# Index Usage Report

Measured against the production Supabase project `ixvwfbuvfxxsjiywhbbb` on
**2026-09-01**, through MCP `execute_sql`. Every number below is a reading, not
an estimate. The queries are in §7 so this report can be regenerated rather than
argued with.

> **Read the caveat in §1 before acting on anything here.** This database is
> pre-launch. Most of what looks like a useless index is an index for traffic
> that has not happened yet.

---

## 1. The headline, and why it is not an action item

| Measure | Value |
|---|---|
| Indexes in `public` | **281** |
| Never scanned (`idx_scan = 0`) | **178** (63%) |
| Unique indexes | 108 |
| Total index bytes | **4096 kB** |
| Total table bytes | **2392 kB** |

Indexes occupy **1.7x the space of the data they index**. On a mature database
that ratio is an alarm. Here it is arithmetic: the largest table has 80 rows.
An empty B-tree still costs 8 kB, so 281 of them cost 4 MB no matter what the
schema does.

**The 178 unused indexes are overwhelmingly not dead code.** They are indexes on
tables that have never had a production row:

| Table | Rows | Indexes | Unused |
|---|---|---|---|
| `vouchers` | 0 | 13 | 8 |
| `payment_events` | 0 | 6 | 6 |
| `subscriptions` | 0 | 5 | 5 |
| `push_tokens` | 0 | 5 | 5 |
| `affiliates` | 0 | 7 | 7 |
| `audit_log` | 0 | 5 | 5 |
| `voucher_redemptions` | 0 | 9 | 7 |

`vouchers` has thirteen indexes and zero rows because **no customer has
completed a coupon purchase yet**. Dropping them because they are unscanned
would drop exactly the indexes the first day of real traffic needs.

**Do not run a "drop unused indexes" pass against this database until the site
has carried production traffic for at least a full week.** `idx_scan` is only
evidence once there has been something to scan. The findings worth acting on now
are the five in §2 and the six in §3, because those are true regardless of
traffic.

---

## 2. Exact duplicate indexes: five pairs, safe to drop now

These are pairs on the same table with an identical key column set and identical
predicate. One member of each pair is redundant: a UNIQUE constraint already
builds a B-tree, so a hand-written non-unique index on the same column is pure
overhead on every INSERT and UPDATE. This is true at any table size, so it is
actionable today.

| Table | Keep (unique) | Drop (redundant) |
|---|---|---|
| `affiliates` | `affiliates_affiliate_code_key` | `idx_affiliates_code` |
| `affiliates` | `affiliates_user_id_key` | `idx_affiliates_user_id` |
| `orders` | `orders_invoice_number_key` | `idx_orders_invoice_number` |
| `rate_limits` | `rate_limits_key_key` | `rate_limits_key_idx` |
| `wallet_balances` | `wallet_balances_user_id_key` | `idx_wallet_balances_user_id` |

The `rate_limits` pair is the one that actually costs something measurable
today. `rate_limits_key_key` has **3,420 scans**; `rate_limits_key_idx` is
unscanned. Every rate-limit write maintains both trees, and the rate limiter is
on the hot path of authentication.

Dropping an index is DDL and therefore a migration file, not a `db push`. It is
also a production schema change, which is one of the four stop-and-ask actions.
Nothing here should be applied without approval.

---

## 3. Foreign keys with no index: six, and two of them matter

An unindexed foreign key means the referenced table's `DELETE` and key `UPDATE`
must sequentially scan the child table to enforce the constraint, and it means
any join over that key has no index to use.

| Table | Constraint | Column | Assessment |
|---|---|---|---|
| `refunds` | `refunds_payment_id_fkey` | `payment_id` | **Fix.** Every refund reads its payment. |
| `subscriptions` | `subscriptions_payment_token_id_fkey` | `payment_token_id` | **Fix.** The recurring charge job joins this on every cycle. |
| `subscriptions` | `subscriptions_origin_order_id_fkey` | `origin_order_id` | Low. Read once at creation. |
| `payment_events` | `payment_events_actor_id_fkey` | `actor_id` | Low. Diagnostic column, filtered on rarely. |
| `refunds` | `refunds_requested_by_fkey` | `requested_by` | Low. Admin queue filter. |
| `refunds` | `refunds_decided_by_fkey` | `decided_by` | Low. Admin queue filter. |

All six are on tables introduced in the 2026-08/09 wave (migrations 130, 131,
135), which is the tell: the older tables went through an index review that
these have not had yet.

---

## 4. Sequential scans on hot paths

`seq_scan` counts here are large because the tables are tiny, and Postgres is
right to choose a sequential scan over a 10-row table. Two rows are still worth
naming, because the shape will not survive growth.

| Table | seq scans | idx scans | Live rows | Reading |
|---|---|---|---|---|
| `profiles` | **212,800** | 10 | 10 | See below |
| `categories` | 203,309 | 102,153 | 12 | Fine at this size |
| `product_variants` | 16,084 | 7,633 | 0 | Empty table |
| `media_assets` | 15,873 | 6,824 | 0 | Empty table |
| `products` | 8,247 | 160,079 | 80 | Healthy: index-dominant |
| `seo_redirects` | 1,130 | 0 | 0 | Empty table |

**`profiles` is the one to watch.** 212,800 sequential scans against 10 index
scans, on the table that `is_admin()`, `has_role()`, `current_user_role()` and
`is_support()` all read. Those functions are called from RLS policies, which
means once per query and, where the `(SELECT auth.uid())` InitPlan wrapper is
missing, potentially once per row.

At 10 profiles a seq scan is genuinely cheaper than an index probe and the
planner is making the correct choice. At 10,000 profiles it is not, and the cost
lands on **every RLS-protected query in the system simultaneously**. This is the
single index-related risk most likely to turn into a production incident, and it
will appear as general slowness rather than as one slow query, which makes it
hard to diagnose from the symptom.

Re-measure `profiles` seq_scan against idx_scan once real users exist. The fix,
if the ratio does not invert on its own, is to confirm `profiles_pkey` is being
used by the role helpers rather than a filter on some other column.

`products` is the counter-example and shows the schema is broadly right:
160,079 index scans against 8,247 sequential, dominated by `products_slug_key`
(61,141) and `products_category_id_idx` (29,104).

---

## 5. The indexes that are actually working

| Index | Scans |
|---|---|
| `categories_pkey` | 85,927 |
| `products_slug_key` | 61,141 |
| `products_pkey` | 35,351 |
| `carts_session_id_idx` | 33,095 |
| `products_category_id_idx` | 29,104 |
| `products_status_idx` | 27,723 |
| `categories_slug_key` | 16,225 |
| `suppliers_pkey` | 16,012 |
| `product_variants_product` (`idx_variants_product`) | 7,633 |
| `media_assets_url_key` | 6,824 |
| `idx_products_published` | 6,686 |
| `rate_limits_key_key` | 3,420 |

This is the storefront read path and it is behaving as designed: slug lookups,
category filters, the `status = 'active'` catalogue predicate, and the guest cart
keyed by session. `carts_session_id_idx` at 33,095 scans confirms guest carts are
the common case, which is consistent with `/checkout` deliberately accepting
guests.

---

## 6. Recommendations, in priority order

1. **Do nothing about the 178 unused indexes yet.** Re-run §7 after one week of
   real traffic. Acting now would delete the indexes launch day needs.
2. **Add the two foreign key indexes that matter**: `refunds(payment_id)` and
   `subscriptions(payment_token_id)`. Both are on money-path joins.
3. **Drop the five duplicate pairs in §2**, starting with `rate_limits_key_idx`,
   which is the only one on a currently hot table.
4. **Instrument `profiles`.** Re-check its seq/idx ratio once the user count is
   non-trivial. It is the highest-leverage index question in the schema because
   every RLS policy depends on it.
5. Items 2 and 3 are one additive migration between them. It has not been
   written, and applying it to production is a stop-and-ask action.

Nothing in this report has been applied. This is a measurement, not a change.

---

## 7. Reproducing this report

```sql
-- §1 totals
select
  (select count(*) from pg_stat_user_indexes where schemaname = 'public')                  as total_indexes,
  (select count(*) from pg_stat_user_indexes where schemaname = 'public' and idx_scan = 0) as never_scanned,
  (select pg_size_pretty(sum(pg_relation_size(indexrelid)))
     from pg_stat_user_indexes where schemaname = 'public')                                as index_bytes,
  (select pg_size_pretty(sum(pg_relation_size(relid)))
     from pg_stat_user_tables where schemaname = 'public')                                 as table_bytes;

-- §1 per-table breakdown
select relname, count(*) as idx_count, count(*) filter (where idx_scan = 0) as unused,
       pg_size_pretty(sum(pg_relation_size(indexrelid))) as idx_size
from pg_stat_user_indexes where schemaname = 'public'
group by relname order by count(*) desc;

-- §2 exact duplicate pairs
with idx as (
  select i.indrelid::regclass::text tbl, c.relname idx_name,
         i.indkey::text keycols, i.indisunique, pg_get_expr(i.indpred, i.indrelid) pred
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
)
select a.tbl, a.idx_name, b.idx_name, a.indisunique, b.indisunique
from idx a
join idx b on a.tbl = b.tbl and a.keycols = b.keycols and a.idx_name < b.idx_name
          and coalesce(a.pred,'') = coalesce(b.pred,'')
order by a.tbl;

-- §3 foreign keys with no supporting index
select c.conrelid::regclass::text as tbl, c.conname,
       (select string_agg(a.attname, ',' order by k.ord)
          from unnest(c.conkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as fk_cols
from pg_constraint c
join pg_class rel on rel.oid = c.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where c.contype = 'f' and n.nspname = 'public'
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid
      and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] @> c.conkey
      and c.conkey @> (i.indkey::int2[])[0:array_length(c.conkey,1)-1]
  )
order by 1, 2;

-- §4 sequential scan pressure
select relname, seq_scan, idx_scan, n_live_tup
from pg_stat_user_tables where schemaname = 'public'
order by seq_scan desc;

-- §5 indexes in use
select relname, indexrelname, idx_scan
from pg_stat_user_indexes where schemaname = 'public' and idx_scan > 0
order by idx_scan desc;
```

Statistics reset with `pg_stat_reset()` and on some maintenance operations. If
the numbers here look implausibly low next time, check
`pg_stat_get_db_stat_reset_time()` before concluding traffic dropped.
