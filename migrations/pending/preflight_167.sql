-- preflight_167.sql -- run each block through MCP execute_sql BEFORE 167.

-- (1) All eight agorot columns exist. EXPECT: eight rows.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'order_items'
   and column_name in (
     'balance_due_agorot', 'cashback_amount_agorot', 'commission_agorot',
     'escrow_held_agorot', 'escrow_release_agorot', 'face_value_agorot',
     'paid_on_site_agorot', 'supplier_immediate_agorot')
 order by column_name;

-- (2) No existing constraint under the names 167 takes (or only 167's own,
--     from a prior run). EXPECT: zero rows on a first apply.
select conname
  from pg_constraint
 where conrelid = 'public.order_items'::regclass
   and (conname like 'order_items_%_nonneg'
     or conname = 'order_items_money_conservation')
 order by conname;

-- (3) NO NEGATIVE VALUE in any of the eight. ADD CONSTRAINT validates the
--     whole table and raises on the first violator; this finds them first.
--     EXPECT: zero rows. Any row here is a STOP: investigate, do not apply.
select id, balance_due_agorot, cashback_amount_agorot, commission_agorot,
       escrow_held_agorot, escrow_release_agorot, face_value_agorot,
       paid_on_site_agorot, supplier_immediate_agorot
  from public.order_items
 where least(
     coalesce(balance_due_agorot, 0), coalesce(cashback_amount_agorot, 0),
     coalesce(commission_agorot, 0), coalesce(escrow_held_agorot, 0),
     coalesce(escrow_release_agorot, 0), coalesce(face_value_agorot, 0),
     coalesce(paid_on_site_agorot, 0), coalesce(supplier_immediate_agorot, 0)
   ) < 0
 limit 50;

-- (4) NO NON-CONSERVING ROW. EXPECT: zero rows. Any row here is a STOP:
--     it is a line whose money never added up, and it must be understood,
--     not constrained around.
select id, order_id, face_value_agorot, paid_on_site_agorot, balance_due_agorot,
       face_value_agorot - (paid_on_site_agorot + balance_due_agorot) as gap
  from public.order_items
 where face_value_agorot is not null
   and paid_on_site_agorot is not null
   and balance_due_agorot is not null
   and face_value_agorot <> paid_on_site_agorot + balance_due_agorot
 limit 50;

-- (5) Scale check: how many rows the validation scan will read.
--     EXPECT: a count; large is fine (ADD CONSTRAINT takes ACCESS EXCLUSIVE
--     briefly -- apply off-peak if this is millions).
select count(*) from public.order_items;
