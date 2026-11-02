-- 322: suppliers column grants (C140 RLS audit).
-- suppliers_select_unified lets anon and every signed-in user read any
-- non-deleted supplier row, and the table-level SELECT grant exposed every
-- column with it: internal admin notes, contact_name/contact_email,
-- business_id, verified_by and payout_hold_business_days.
-- Row policy is unchanged; client roles now see only the storefront columns.
-- Admin pages that need the rest read through the service role.
-- Rollback: grant select on public.suppliers to anon, authenticated;

begin;

revoke select on public.suppliers from anon, authenticated;

grant select (
  id, name, contact_phone, whatsapp, address, city, website, logo_url,
  status, deleted_at, created_at, updated_at, latitude, longitude,
  open_weekends, app_scanning_enabled, verification_status, verified_at
) on public.suppliers to anon, authenticated;

-- /admin/payouts reads min_payout_ils through the session client.
grant select (min_payout_ils) on public.suppliers to authenticated;

insert into supabase_migrations.schema_migrations (version, name)
values ('20261102120026', '322_rls_suppliers_column_grants')
on conflict (version) do nothing;

commit;
