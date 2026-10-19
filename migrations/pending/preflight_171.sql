-- preflight_171.sql -- run each block through MCP execute_sql BEFORE 171.
--
-- 171 rewrites one text column of one row. The `where` clause is its own
-- guard, so these blocks exist to answer a different question: is the row the
-- one the migration was written against, and is anything else reading it.

-- (1) The target row exists and still holds the exact broken string.
--     EXPECT: one row, name_hex = d7a2d79320e282aa3939
--     (ע ד SPACE ₪ 9 9). Any other hex means the datum moved since the
--     migration was drafted -- stop and re-read it, because the migration
--     matches on the literal and would silently update nothing.
select slug,
       name_he,
       encode(convert_to(name_he, 'UTF8'), 'hex') as name_hex,
       length(name_he) as chars
  from public.categories
 where slug = 'under-99';

-- (2) The migration has not already run.
--     EXPECT: false. True means the isolate is already in place and 171 is
--     a no-op -- confirm against block (1) rather than re-applying.
select name_he like ('%' || chr(8294) || '%') as already_isolated
  from public.categories
 where slug = 'under-99';

-- (3) Nothing else in `categories` carries the same broken shape.
--     EXPECT: zero rows. A second row here means 171 is too narrow and the
--     fix wants a slug list, not one slug.
select slug, name_he
  from public.categories
 where name_he like '%₪%'
   and name_he not like ('%' || chr(8294) || '%')
   and slug <> 'under-99';

-- (4) `under-99` is a real, live department and not an orphan.
--     EXPECT: one row; is_active true. If it is inactive, the string is not
--     rendered anywhere and 171 is cosmetic on dead data.
select slug, is_active, parent_id, sort_order
  from public.categories
 where slug = 'under-99';

-- (5) Nothing keys off the literal name. `categories.slug` is the join key
--     everywhere in the app, so a name rewrite cannot break a foreign key --
--     this block proves it rather than asserting it.
--     EXPECT: zero rows referencing categories by anything but id.
select tc.table_name, kcu.column_name, ccu.column_name as references_column
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
 where tc.constraint_type = 'FOREIGN KEY'
   and ccu.table_name = 'categories'
   and ccu.column_name <> 'id';
