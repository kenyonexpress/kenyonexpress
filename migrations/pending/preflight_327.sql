-- preflight_327.sql -- read-only. Run before 327_profiles_email_nullable_for_anonymous.sql.

-- (1) The gap: EXPECT is_nullable = 'NO' before 327, 'YES' after.
select is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'email';

-- (2) Uniqueness stays: EXPECT profiles_email_key (a unique index allows many NULLs).
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'profiles' and indexname = 'profiles_email_key';

-- (3) The trigger that inserts the profile. EXPECT one row, handle_new_user.
select tgname, tgfoid::regproc from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;
