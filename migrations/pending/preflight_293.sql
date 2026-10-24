-- Preflight for 293: verify feature_flags table exists from migration 286.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'feature_flags'
  ) then
    raise exception 'Migration 293 requires feature_flags table from migration 286';
  end if;
end
$$;
