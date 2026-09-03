-- preflight_165.sql -- run each block through MCP execute_sql BEFORE 165.

-- (1) Both functions exist with the signatures 165 names. EXPECT: two rows.
select p.oid::regprocedure as signature
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('is_admin', 'is_supplier_member');

-- (2) Current grants -- the before picture. EXPECT: anon present today
--     (that is the defect), authenticated present or absent.
select grantee, routine_name, privilege_type
  from information_schema.routine_privileges
 where routine_schema = 'public'
   and routine_name in ('is_admin', 'is_supplier_member')
 order by routine_name, grantee;

-- (3) No RLS policy depends on anon being able to call them: policies that
--     reference the helpers must belong to tables anon cannot touch anyway,
--     or the revoke would silently flip their USING to an error for anon.
--     EXPECT: review each row; any policy on a table with anon SELECT is a
--     stop-and-think, not an auto-apply.
select schemaname, tablename, policyname, roles, qual
  from pg_policies
 where qual like '%is_admin%' or qual like '%is_supplier_member%'
    or with_check like '%is_admin%' or with_check like '%is_supplier_member%'
 order by tablename;
