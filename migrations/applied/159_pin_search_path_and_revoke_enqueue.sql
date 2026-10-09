alter function public.set_updated_at() set search_path = pg_catalog, public;
alter function public.add_business_days(timestamptz, integer) set search_path = pg_catalog, public;
alter function public.payout_available_at(timestamptz) set search_path = pg_catalog, public;
alter function public.enforce_payout_availability() set search_path = pg_catalog, public;
revoke execute on function public.enqueue_search_index() from public, anon, authenticated;
