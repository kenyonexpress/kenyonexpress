-- 190: maintenance switch (rc5 F19, queue item G16).
-- The feature_flags table and its maintenance_mode row already exist
-- (286_feature_flags.sql). This migration is idempotent: it guarantees both
-- exist so /admin/settings can flip the switch on any environment, and it
-- never overwrites an existing value.
-- Rollback: delete from public.feature_flags where key = 'maintenance_mode';

create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,63}$'),
  bool_value boolean,
  json_value jsonb,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, bool_value)
values ('maintenance_mode', false)
on conflict (key) do nothing;
