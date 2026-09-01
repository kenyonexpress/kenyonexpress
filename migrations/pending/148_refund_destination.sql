-- 148: where a refund actually goes.
--
-- THE GAP. `refunds` records the cancellation notice, the ground, the fee and
-- the statutory 14-day deadline, and says nothing about WHERE the money went.
-- `refundOrder` has exactly one path -- `provider.refundByTransactionId`, back
-- to the card -- so a wallet credit is not a second option, it is a thing the
-- code cannot express. The only mention of it in the whole money path is a
-- comment calling it "a commercial decision" and returning MANUAL_RESOLUTION.
--
-- That matters for redeemed and expired vouchers. The value left the platform
-- at the counter, so pulling the card money back would return value that was
-- consumed; a goodwill wallet credit is the correct instrument and there was
-- nowhere to record that one had been given.
--
-- WHY AN ENUM AND NOT A BOOLEAN. `is_wallet_refund` would be a boolean today
-- and a lie the first time a third instrument appears (a bank transfer for a
-- chargeback, a supplier-funded credit). The two members below are the two that
-- exist; adding a third is `ALTER TYPE ... ADD VALUE`, which is cheap, whereas
-- widening a boolean is a data migration.
--
-- DEFAULT `original_method`, AND NOT NULL. Every refund written before this
-- column existed went back to the card, because that was the only path. The
-- default therefore states a fact about the existing rows rather than guessing
-- at one. It is also the safe direction: a row that silently claimed to be a
-- wallet credit would suggest the customer had been paid when they had not.
--
-- ROLLBACK
--
--   alter table public.refunds drop column if exists destination;
--   drop type if exists public.refund_destination;
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition. The route to
-- production is MCP `apply_migration` after a human approves this file.


do $$
begin
  if not exists (select 1 from pg_type where typname = 'refund_destination') then
    create type public.refund_destination as enum (
      'original_method',  -- back to the card, through the terminal that charged it
      'wallet'            -- credited to the customer's wallet instead
    );
  end if;
end
$$;


do $$
begin
  if to_regclass('public.refunds') is null then
    raise notice 'skipping refunds, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'refunds'
                and column_name  = 'destination') then
    raise notice 'skipping refunds.destination, column already present'; return;
  end if;

  alter table public.refunds
    add column destination public.refund_destination not null default 'original_method';
end
$$;

comment on column public.refunds.destination is
  'Where the money went. original_method is back to the card through the terminal that charged it; wallet is a credit to the customer''s wallet, which is the instrument for a voucher that was already redeemed or has expired. Rows written before 2026-09 are all original_method, which was the only path the code had.';


-- A wallet refund has no card leg, so it can carry no cancellation fee: the fee
-- is a deduction from money being returned to a payment instrument, and a
-- goodwill credit that quietly withheld 5% would be a worse product than
-- refusing the refund.
do $$
begin
  if to_regclass('public.refunds') is null then return; end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.refunds'::regclass
                   and conname = 'refunds_wallet_has_no_fee') then
    alter table public.refunds
      add constraint refunds_wallet_has_no_fee
      check (destination <> 'wallet' or cancellation_fee_agorot = 0);
  end if;
end
$$;
