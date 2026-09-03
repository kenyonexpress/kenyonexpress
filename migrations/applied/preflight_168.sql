-- preflight_168.sql -- run each block through MCP execute_sql BEFORE 168.

-- (1) The before picture: the six write policies exist under exactly these
--     names, plus the two SELECT policies 168 must NOT touch.
--     EXPECT: eight rows (4 per table).
select tablename, policyname, cmd, roles::text
  from pg_policies
 where tablename in ('wallet_balances', 'wallet_transactions')
 order by tablename, cmd;

-- (2) RLS is enabled and enforced on both tables -- without it, dropping
--     policies opens the table instead of closing it. EXPECT: two rows,
--     both true.
select c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('wallet_balances', 'wallet_transactions');

-- (3) The audited server writers are SECURITY DEFINER or run as
--     service_role, so they survive the drop. EXPECT: any wallet fn listed
--     is prosecdef = true.
select p.proname, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like '%wallet%'
 order by p.proname;

-- (4) No view or rule writes through these tables as a client role.
--     EXPECT: zero rows.
select viewname from pg_views
 where schemaname = 'public'
   and (definition like '%wallet_balances%' or definition like '%wallet_transactions%');
