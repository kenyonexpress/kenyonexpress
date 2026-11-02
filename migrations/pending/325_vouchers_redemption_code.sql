-- 325_vouchers_redemption_code.sql
--
-- 298_voucher_8digit_redemption_codes.sql sits in migrations/applied/, but
-- production never received it: measured 2026-11-02 (C142), vouchers has no
-- redemption_code column and the ledger has no 298 row, so /account/coupons
-- fails with 42703 on `vouchers.redemption_code`. This is 298's body made
-- idempotent; additive nullable columns, no data change. Run preflight_325.sql first.

alter table public.vouchers
  add column if not exists redemption_code text,
  add column if not exists redemption_code_signature text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vouchers_redemption_code_format'
                 and conrelid = 'public.vouchers'::regclass) then
    alter table public.vouchers add constraint vouchers_redemption_code_format
      check (redemption_code is null or redemption_code ~ '^[0-9]{8}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vouchers_redemption_code_signature_format'
                 and conrelid = 'public.vouchers'::regclass) then
    alter table public.vouchers add constraint vouchers_redemption_code_signature_format
      check (redemption_code_signature is null or length(redemption_code_signature) >= 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vouchers_redemption_code_complete'
                 and conrelid = 'public.vouchers'::regclass) then
    alter table public.vouchers add constraint vouchers_redemption_code_complete
      check (
        (redemption_code is null and redemption_code_signature is null) or
        (redemption_code is not null and redemption_code_signature is not null)
      );
  end if;
end $$;

create unique index if not exists vouchers_redemption_code_unique
  on public.vouchers (redemption_code)
  where redemption_code is not null;

comment on column public.vouchers.redemption_code is
  '8-digit numeric code for phone/SMS entry, simpler than 10-char alphanumeric code';
comment on column public.vouchers.redemption_code_signature is
  'HMAC-SHA256(code:voucher_id, VOUCHER_QR_SECRET) as base64url, for verification';
