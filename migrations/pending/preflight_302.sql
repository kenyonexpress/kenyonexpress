-- Preflight for 302_address_book.sql. Read-only.
-- Expect: auth.users exists and address_book does not yet exist.
select
  to_regclass('auth.users') is not null as auth_users_exists,
  to_regclass('public.address_book') is null as address_book_absent;
