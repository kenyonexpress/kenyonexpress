-- Preflight check for migration 322 (read-only)
select has_column_privilege('anon', 'public.suppliers', 'notes', 'SELECT') as anon_notes;
-- expect true before 322, false after
select has_column_privilege('anon', 'public.suppliers', 'name', 'SELECT') as anon_name;
-- expect true before and after
select version from supabase_migrations.schema_migrations where version = '20261102120026';
-- expect 0 rows
