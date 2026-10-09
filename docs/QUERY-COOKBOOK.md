# Query Cookbook

Twenty SQL queries an operator actually needs, ready to paste.

**Every query on this page was executed against the live project
`ixvwfbuvfxxsjiywhbbb` on 2026-09-01.** They run. Column names are the live
ones, which matters here more than usual: this database has both an `ils`
generation and an `agorot` generation of several money columns, and a query
written from `supabase/migrations/` or from `src/types/database.ts` will name
columns that do not exist.

---

## 0. Before you run anything

### Read-only unless you mean it

Everything in §1 through §7 is a `SELECT`. §8 contains the two write-shaped
recipes, and both are fenced.

### You are querying production

There is no staging database. There is no local database, and a from-zero reset
is not runnable here. **Every query below touches live data.**

### Proving a write works without leaving rows

When you need to know whether an `INSERT` would succeed — the constraint, the
trigger, the grant — run it inside a block that always rolls back:

```sql
do $$
begin
  insert into public.some_table (...) values (...);
  raise exception 'rollback: this was a probe';
end $$;
```

The `raise` aborts the block, so nothing is committed. You learn whether the
statement was legal without becoming the reason a row exists.

### Money is agorot

Every `*_agorot` column is an integer in the minor unit. Divide by 100 for
shekels **only in the presentation layer of a query**, never in a comparison:

```sql
round(total_ils_agorot / 100.0, 2) as total_ils
```

---

## 1. Is anything wrong right now

### Q1. The one-screen health check

The four numbers that say whether the invariants still hold.

```sql
select 'migrations applied'          as what, count(*)::text as value
  from supabase_migrations.schema_migrations
union all
select 'transition guards live', count(*)::text
  from pg_trigger
  where tgname in ('tg_orders_status_guard',
                   'tg_order_items_settlement_status_guard',
                   'tg_payments_status_guard')
union all
select 'payment_events append-only', count(*)::text
  from pg_trigger where tgname = 'payment_events_no_mutation'
union all
select 'audit_log triggers', count(*)::text
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relname = 'audit_log' and not t.tgisinternal;
```

**Expected on 2026-09-01:** `99`, `3`, `1`, **`0`**.

The last one is expected *and wrong*: `audit_log` accepts `UPDATE` and `DELETE`.
If it ever reads `1`, someone closed that hole and this line should be updated.

### Q2. The baseline counts

What "empty" looks like, so you can tell real traffic from fixtures.

```sql
select
  (select count(*) from public.orders)                          as orders,
  (select count(*) from public.orders where status = 'paid')    as orders_paid,
  (select count(*) from public.payments)                        as payments,
  (select count(*) from public.vouchers)                        as vouchers,
  (select count(*) from public.payment_events)                  as payment_events,
  (select count(*) from public.refunds)                         as refunds,
  (select count(*) from public.voucher_redemptions)             as scan_attempts,
  (select count(*) from public.products where deleted_at is null) as products,
  (select count(*) from public.suppliers)                       as suppliers,
  (select count(*) from public.profiles)                        as profiles;
```

**Measured 2026-09-01:** 4 orders (2 `paid`), 2 payments, **0 vouchers**,
**0 payment_events**, 0 refunds, 3 scan attempts, 80 products, 12 suppliers,
10 profiles.

Read those carefully, because they are not what they look like. The four orders
are **E2E fixtures from 2026-07-21**, not customers. Zero vouchers against two
paid orders means **no voucher was ever issued**, which is §2.2 of
`docs/FAILURE-MODES.md` showing up in the data. And three scan attempts against
zero vouchers are three failed lookups.

### Q3. Money that was taken and never turned into an order

The single most important query on this page.

```sql
select p.id            as payment_id,
       p.order_id,
       p.status        as payment_status,
       p.amount_ils_agorot,
       p.succeeded_at,
       o.status        as order_status,
       o.paid_at,
       now() - p.succeeded_at as stranded_for
from public.payments p
join public.orders o on o.id = p.order_id
where p.status = 'succeeded'
  and p.kind <> 'refund'
  and o.status = 'pending'
order by p.succeeded_at desc
limit 50;
```

**Any row here is a customer who was charged and has no order.** Expected:
empty. If it is not empty, go to `docs/RUNBOOK.md` §3 and replay
`finalizeOrder`, which is idempotent.

---

## 2. Finding one order

### Q4. Find an order by email, phone, or invoice number

```sql
select o.id,
       o.status,
       o.invoice_number,
       round(o.total_ils_agorot / 100.0, 2) as total_ils,
       o.created_at,
       o.paid_at,
       pr.email,
       pr.phone,
       pr.full_name
from public.orders o
left join public.profiles pr on pr.id = o.user_id
where o.deleted_at is null
  and ( pr.email          ilike '%' || :term || '%'
     or pr.phone          ilike '%' || :term || '%'
     or o.invoice_number  ilike '%' || :term || '%'
     or o.id::text        =         :term )
order by o.created_at desc
limit 25;
```

Replace `:term` with a quoted string. This is the same search the admin Cmd+K
palette runs.

### Q5. Everything about one order, in four result sets

Paste all four with the same `:order_id`.

```sql
-- the order
select id, status, subtotal_ils_agorot, total_ils_agorot, cashback_applied_ils,
       currency, invoice_number, created_at, paid_at, expires_at, deleted_at
from public.orders where id = :order_id;

-- the lines, with the snapshot that decides the money
select id, product_id, product_type, quantity, settlement_status, item_status,
       platform_percent, face_value_agorot, paid_on_site_agorot,
       balance_due_agorot, commission_agorot, supplier_immediate_agorot,
       supplier_id, supplier_name, delivered_at
from public.order_items where order_id = :order_id order by created_at;

-- the charges. A partial refund is a NEW row, not an edit.
select id, kind, status, amount_ils_agorot, cardcom_low_profile_id,
       cardcom_transaction_id, refund_of_payment_id, failure_code,
       failure_message, succeeded_at, failed_at, created_at
from public.payments where order_id = :order_id order by created_at;

-- the vouchers
select id, code, status, face_value_agorot, coupon_price_agorot,
       remaining_amount_due_agorot, platform_percent, issued_at, expires_at,
       offer_valid_until, redeemed_at, redeemed_by_supplier_id, status_reason
from public.vouchers where order_id = :order_id order by issued_at;
```

**`platform_percent` on the `order_items` row is the snapshot** taken at
purchase. If it disagrees with the product today, the order line is right and
the product was repriced afterwards. That is the design, not a bug.

### Q6. The forensic trail for one order

```sql
select occurred_at, event_type, stage, provider, transaction_id,
       amount_agorot, actor_role, environment, detail
from public.payment_events
where order_id = :order_id
order by occurred_at;
```

`payment_events` is append-only, enforced by trigger. **It is the record to
believe** when it disagrees with `audit_log`, which is editable.

### Q7. The four event types that mean two sources disagreed

Search these first whenever a payment is disputed.

```sql
select pe.occurred_at, pe.event_type, pe.order_id, pe.payment_id,
       pe.amount_agorot, pe.transaction_id, pe.detail
from public.payment_events pe
where pe.event_type in ('amount_mismatch',
                        'verify_contradicted_callback',
                        'reconciliation_amount_differs',
                        'reconciliation_missing_remotely')
order by pe.occurred_at desc
limit 100;
```

These exist for exactly one purpose: to record that the callback body and the
`GetLpResult` re-fetch, or our ledger and Cardcom's, did not agree. The re-fetch
is always the authority.

---

## 3. Vouchers

### Q8. A voucher by its code, and whether it can be redeemed

```sql
select v.code, v.status, v.issued_at, v.expires_at, v.offer_valid_until,
       v.redeemed_at, v.status_reason,
       round(v.face_value_agorot / 100.0, 2)            as face_ils,
       round(v.coupon_price_agorot / 100.0, 2)          as paid_online_ils,
       round(v.remaining_amount_due_agorot / 100.0, 2)  as due_at_counter_ils,
       s.name                                           as supplier,
       v.expires_at > now()                             as still_in_date,
       v.status = 'issued'                              as still_unused
from public.vouchers v
left join public.suppliers s on s.id = v.supplier_id
where v.code = :code;
```

`still_in_date` and `still_unused` are the two conditions inside the redemption
`UPDATE`'s `WHERE` clause; a voucher is redeemable only when both are true **and**
the scanner belongs to `supplier`.

Note the two deadlines are different things. `offer_valid_until` is when the
deal stopped being sold; `expires_at` is when this voucher stops being
redeemable.

### Q9. Every scan attempt, including the failures

```sql
select vr.created_at, vr.outcome, vr.code_entered, vr.scan_method,
       s.name as supplier, vr.scanned_by, vr.staff_id,
       vr.ip_address, vr.user_agent,
       round(vr.amount_collected_agorot / 100.0, 2) as collected_ils
from public.voucher_redemptions vr
left join public.suppliers s on s.id = vr.supplier_id
order by vr.created_at desc
limit 100;
```

**This table records failures too** — `not_found`, `wrong_supplier`,
`already_redeemed`, `rate_limited` — with IP and user agent. A log that records
only successes cannot answer who tried.

`wrong_supplier` is recorded internally but returned to the scanner as
`not_found`, so that a supplier cannot enumerate a competitor's code space.

### Q10. Vouchers expiring soon

```sql
select v.code, v.status, v.expires_at,
       v.expires_at - now()                     as time_left,
       round(v.face_value_agorot / 100.0, 2)    as face_ils,
       s.name                                   as supplier,
       pr.email                                 as customer
from public.vouchers v
left join public.suppliers s on s.id = v.supplier_id
left join public.profiles  pr on pr.id = v.user_id
where v.status = 'issued'
  and v.expires_at < now() + interval '14 days'
order by v.expires_at
limit 200;
```

**Nothing is expiring these today** — the `expire-vouchers` cron is not being
called. This query is how you find what *should* have expired.

### Q11. Vouchers that are past their date and still `issued`

```sql
select count(*)                as overdue,
       min(v.expires_at)       as oldest,
       sum(v.face_value_agorot) as face_agorot
from public.vouchers v
where v.status = 'issued' and v.expires_at < now();
```

A non-zero count is the scheduler gap (`docs/FAILURE-MODES.md` §2.1) measured in
money.

---

## 4. Money

### Q12. Conservation drift on order lines

`face = paid_on_site + balance_due` is enforced on `vouchers` by a CHECK
constraint. **On `order_items` it is not** — that is a known gap — so it has to
be checked by query.

```sql
select oi.id, oi.order_id, oi.product_type,
       oi.face_value_agorot,
       oi.paid_on_site_agorot,
       oi.balance_due_agorot,
       oi.face_value_agorot
         - (coalesce(oi.paid_on_site_agorot, 0) + coalesce(oi.balance_due_agorot, 0))
         as drift_agorot
from public.order_items oi
where oi.face_value_agorot is not null
  and oi.face_value_agorot
      <> coalesce(oi.paid_on_site_agorot, 0) + coalesce(oi.balance_due_agorot, 0)
order by abs(oi.face_value_agorot
             - (coalesce(oi.paid_on_site_agorot, 0) + coalesce(oi.balance_due_agorot, 0))) desc
limit 50;
```

**Expected: empty.** Any row is money that does not add up. A drift of exactly
±1 agora usually means a percentage was applied twice to the same base instead
of the residual being taken as `face − fee`.

### Q13. Negative money where none should exist

Eight `order_items` money columns carry no sign constraint. This is how you find
out.

```sql
select id, order_id, product_type,
       face_value_agorot, paid_on_site_agorot, balance_due_agorot,
       commission_agorot, supplier_immediate_agorot, cashback_amount_agorot
from public.order_items
where least(coalesce(face_value_agorot, 0),
            coalesce(paid_on_site_agorot, 0),
            coalesce(balance_due_agorot, 0),
            coalesce(commission_agorot, 0),
            coalesce(supplier_immediate_agorot, 0),
            coalesce(cashback_amount_agorot, 0)) < 0
limit 50;
```

### Q14. What the platform actually kept, by day

```sql
select date_trunc('day', o.paid_at)::date            as day,
       count(distinct o.id)                          as orders,
       round(sum(oi.paid_on_site_agorot) / 100.0, 2) as customer_paid_ils,
       round(sum(oi.commission_agorot)   / 100.0, 2) as platform_kept_ils,
       round(sum(oi.balance_due_agorot)  / 100.0, 2) as collected_in_cash_ils
from public.orders o
join public.order_items oi on oi.order_id = o.id
where o.status in ('paid', 'partially_fulfilled', 'fulfilled', 'platform_settled')
  and o.paid_at is not null
group by 1
order by 1 desc
limit 60;
```

**`collected_in_cash_ils` never reaches us.** It is the supplier's revenue,
collected at the counter, shown here only so the three columns are legible
together.

### Q15. Refunds in flight, and their statutory deadline

```sql
select r.id, r.order_id, r.state, r.ground,
       round(r.requested_agorot        / 100.0, 2) as requested_ils,
       round(r.cancellation_fee_agorot / 100.0, 2) as fee_ils,
       round(r.granted_agorot          / 100.0, 2) as granted_ils,
       r.requested_at,
       r.refund_due_by,
       r.refund_due_by - now()                     as time_remaining,
       r.cancel_only, r.reason_he
from public.refunds r
where r.state in ('requested', 'approved', 'executing')
order by r.refund_due_by
limit 100;
```

**`refund_due_by` cannot be set by a caller.** A trigger overwrites it on every
write with `requested_at + interval '14 days'`, the statutory window. A negative
`time_remaining` is a legal breach, not a backlog item.

### Q16. Wallet ledger drift

```sql
select * from public.v_wallet_balance_drift;
```

**Expected: empty.** The view exists to compare a stored balance against the sum
of its entries. Any row means the two disagree.

---

## 5. Catalogue and operations

### Q17. Products that cannot be priced

A product missing any of these throws at checkout rather than being priced by a
guess, so this query finds the failure before a customer does.

```sql
select p.id, p.slug, p.type, p.status,
       p.platform_percent, p.coupon_price_ils, p.coupon_expiry_days, p.supplier_id
from public.products p
where p.deleted_at is null
  and ( p.platform_percent is null
     or (p.type = 'coupon' and (p.coupon_price_ils is null or p.coupon_expiry_days is null))
     or p.supplier_id is null )
order by p.status, p.slug
limit 100;
```

**Expected: empty**, and it was on 2026-09-01. The `enforce_product_approval`
trigger and `assertPublishable` are what keep it that way; this is the check
that they did.

### Q18. Search index backlog

```sql
select op,
       count(*)                          as rows,
       min(enqueued_at)                  as oldest,
       count(*) filter (where done_at is null and claimed_at is not null) as stuck,
       count(*) filter (where attempts > 3)                               as failing,
       max(attempts)                     as worst_attempts
from public.search_index_outbox
group by op;
```

A growing backlog with `done_at is null` is the drain not running — which is one
of the ten cron routes nothing is calling. Search drift and the scheduler gap
compound.

### Q19. Recent admin activity, and who did it

```sql
select a.created_at, a.action, a.entity_type, a.entity_id,
       a.actor_role, a.actor_id, pr.email as actor_email,
       a.ip_address, a.changes
from public.audit_log a
left join public.profiles pr on pr.id = a.actor_id
order by a.created_at desc
limit 100;
```

Two things to know before you rely on this. **`actor_id` is null on refunds**
(`refund.ts:325` writes `actor_id: null, actor_role: 'admin'` even though the
session knows who it is), so a refund shows as "some admin". And **the table
accepts `UPDATE` and `DELETE`** — it has no triggers at all. Where it disagrees
with `payment_events`, believe `payment_events`.

---

## 6. Security posture, on demand

### Q20. Who can write to what, and which functions run as owner

```sql
-- tables authenticated can write to. RLS is the only thing standing behind this.
select c.relname                                       as table_name,
       string_agg(distinct a.privilege_type, ', ')     as granted
from information_schema.role_table_grants a
join pg_class c      on c.relname = a.table_name
join pg_namespace n  on n.oid = c.relnamespace and n.nspname = 'public'
where a.grantee = 'authenticated'
  and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
group by c.relname
order by c.relname;

-- SECURITY DEFINER functions, and whether search_path is pinned
select p.proname,
       p.prosecdef                                                  as is_definer,
       coalesce(array_to_string(p.proconfig, ', '), '(none)')        as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;

-- every table with RLS off. Must be empty.
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
```

**Measured 2026-09-01:** `authenticated` holds DML on **56 relations**; **61 of
72** functions are `SECURITY DEFINER` and **all 61 have a pinned `search_path`**;
**zero** tables have RLS off.

The 56 is the number to sit with. RLS is the only layer behind it, and no test
in this repository attempts a forbidden write as `authenticated`.

---

## 7. Verifying the guards themselves

```sql
-- what the database will actually permit, read from the functions it is running
select proname, prosrc
from pg_proc
where proname in ('fn_orders_status_guard',
                  'fn_order_items_settlement_status_guard',
                  'fn_payments_status_guard');
```

Compare against `docs/PAYMENT-FLOW.md` §2.1 and
`src/server/domain/orders/status-transitions.json`. All three must agree;
`status-transitions.test.ts` fails if the repository's copy drifts, but nothing
watches the database side except this query.

---

## 8. The two write recipes

> **Both of these are writes to production.** Neither is reversible by re-running
> it. Read `docs/RUNBOOK.md` §5 first.

### W1. Re-drive a cron route by hand

Not SQL, but this is where an operator looks for it. Nothing schedules these.

```bash
for job in notifications expire-vouchers invoices reconcile stranded-payments; do
  echo "== $job"
  curl -s -H "Authorization: Bearer $CRON_SECRET" \
       "https://<host>/api/cron/$job" | jq -c
done
```

Run `notifications` first if customers are waiting on vouchers.

### W2. Disable a transition guard while diagnosing

Prefer this to dropping. It is one statement, reversible by one statement, and
it leaves the function body readable.

```sql
alter table public.order_items disable trigger tg_order_items_settlement_status_guard;
-- ... diagnose ...
alter table public.order_items enable  trigger tg_order_items_settlement_status_guard;
```

**Do not leave it disabled.** The full rollback, and the reason the drop order
matters, is `docs/RUNBOOK.md` §5.3.

---

## Where these came from

| You want | Read |
|---|---|
| What the tables are | `docs/DATA-MODEL.md` |
| What the states mean | `docs/PAYMENT-FLOW.md` §2.1 |
| What can go wrong | `docs/FAILURE-MODES.md` |
| What to do about it | `docs/RUNBOOK.md`, `docs/INCIDENT-PLAYBOOKS.md` |
| Which rules are enforced | `docs/BUSINESS-RULES.md` |
| Index coverage for these queries | `docs/INDEX-USAGE-REPORT.md` |
