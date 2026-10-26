-- Preflight for 294_group_deals: verify products and set_updated_at() exist, and group_deals is not already there.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'products'
  ) then
    raise exception 'Migration 294_group_deals requires the products table';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    raise exception 'Migration 294_group_deals requires public.set_updated_at()';
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'group_deals'
  ) then
    raise exception 'public.group_deals already exists; 294_group_deals may already be applied';
  end if;
end
$$;
