-- Preflight for 295: verify user_consents table exists from migration 280.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_consents'
  ) then
    raise exception 'Migration 295 requires user_consents table from migration 280';
  end if;
end
$$;
