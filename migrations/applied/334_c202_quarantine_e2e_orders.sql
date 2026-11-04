-- 334_c202_quarantine_e2e_orders.sql (C202)
--
-- Quarantines every E2E fixture order in production. NO DELETES.
--   1. orders.is_e2e_fixture = true
--   2. status = 'cancelled', notes = 'e2e-fixture'
--   3. vouchers still 'issued' on those orders -> 'cancelled' (cannot be redeemed)
--   4. report_* tables and revenue_daily recomputed without them
--
-- paid/refunded -> cancelled is not a transition fn_orders_status_guard allows,
-- and tg_orders_whatsapp_status would queue an "order cancelled" message per
-- order. Both triggers are disabled for this transaction only and re-enabled
-- before commit. The audit and updated_at triggers stay on.
--
-- Fixture order = user is a fixture account (fn_is_e2e_fixture_user), OR an
-- anonymous guest whose order has lines and every line is an e2e-test-* product.
-- Requires 333. Idempotent.
-- Apply: supabase db query --linked -f migrations/applied/334_c202_quarantine_e2e_orders.sql

begin;

create temp table c202_fx on commit drop as
select o.id
from public.orders o
where public.fn_is_e2e_fixture_user(o.user_id)
   or (o.user_id in (select id from auth.users where is_anonymous)
       and exists (select 1 from public.order_items oi where oi.order_id = o.id)
       and not exists (select 1 from public.order_items oi
                       join public.products p on p.id = oi.product_id
                       where oi.order_id = o.id and p.slug not like 'e2e-test-%'));

create temp table c202_real_before on commit drop as
select id, status, notes, is_e2e_fixture, updated_at
from public.orders where id not in (select id from c202_fx);

update public.orders set is_e2e_fixture = true
 where id in (select id from c202_fx) and not is_e2e_fixture;

alter table public.orders disable trigger tg_orders_status_guard;
alter table public.orders disable trigger tg_orders_whatsapp_status;

update public.orders
   set status = 'cancelled',
       notes  = case when notes is null or btrim(notes) = '' then 'e2e-fixture'
                     else notes || E'\n' || 'e2e-fixture' end
 where id in (select id from c202_fx)
   and (status <> 'cancelled' or notes is null or notes not like '%e2e-fixture%');

alter table public.orders enable trigger tg_orders_status_guard;
alter table public.orders enable trigger tg_orders_whatsapp_status;

update public.vouchers
   set status = 'cancelled', cancelled_at = now(), status_reason = 'e2e-fixture'
 where order_id in (select id from c202_fx) and status = 'issued';

-- Real shopper orders must be byte-identical.
do $$
declare v_changed integer;
begin
  select count(*) into v_changed
  from c202_real_before b join public.orders o on o.id = b.id
  where (o.status, o.notes, o.is_e2e_fixture, o.updated_at)
        is distinct from (b.status, b.notes, b.is_e2e_fixture, b.updated_at);
  if v_changed > 0 then
    raise exception 'C202: % non-fixture orders changed, rolling back', v_changed;
  end if;
end $$;

select public.refresh_report_tables();
select public.aggregate_daily_revenue(d.day) from public.revenue_daily d;

commit;
