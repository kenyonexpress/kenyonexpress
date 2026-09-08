-- preflight_178.sql -- read-only. Run each block before 178.

-- (1) The gap is still real: no unique index on carts except the primary key.
--     EXPECT (08.09): carts_pkey unique; the other three not unique.
select i.relname as indexname, ix.indisunique as is_unique,
       pg_get_indexdef(ix.indexrelid) as definition
  from pg_index ix
  join pg_class i on i.oid = ix.indexrelid
  join pg_class t on t.oid = ix.indrelid
  join pg_namespace n on n.oid = t.relnamespace
 where n.nspname = 'public' and t.relname = 'carts'
 order by 1;

-- (2) THE BLOCKING CHECK. Both counts must be 0 or the CREATE UNIQUE INDEX in
--     178 will fail and roll back. A non-zero here is not a reason to weaken
--     the migration; it means duplicates exist and a human has to decide which
--     row survives before this can be applied.
--     EXPECT (08.09): 0 and 0.
select 'dup_profile_groups' as kind, count(*) as n from (
  select profile_id from public.carts
   where profile_id is not null group by profile_id having count(*) > 1) d
union all
select 'dup_guest_session_groups', count(*) from (
  select session_id from public.carts
   where profile_id is null and session_id is not null
   group by session_id having count(*) > 1) d;

-- (3) The shape of the table, which is what makes the two partial predicates
--     correct. `neither` must be 0: a cart owned by nobody would be
--     unreachable by either read and is a bug in its own right.
--     EXPECT (08.09): both_set 0, profile_only 0, session_only 2129, neither 0.
select
  count(*) filter (where profile_id is not null and session_id is not null) as both_set,
  count(*) filter (where profile_id is not null and session_id is null)     as profile_only,
  count(*) filter (where profile_id is null and session_id is not null)     as session_only,
  count(*) filter (where profile_id is null and session_id is null)         as neither,
  count(*)                                                                  as total
from public.carts;

-- (4) Size, because it is the whole argument for not using CONCURRENTLY.
--     If this is no longer small, rewrite 178 with CREATE UNIQUE INDEX
--     CONCURRENTLY and drop the BEGIN/COMMIT.
--     EXPECT (08.09): 2129 rows.
select count(*) as cart_rows from public.carts;

-- ============================================================
-- MEASURED 2026-09-08 via MCP execute_sql, read-only:
--   unique indexes on carts   : carts_pkey only
--   dup_profile_groups        : 0
--   dup_guest_session_groups  : 0
--   both_set / profile_only   : 0 / 0
--   session_only / neither    : 2129 / 0
--   total rows                : 2129
-- ============================================================
