-- 165_revoke_anon_helpers.sql (idempotent)
--
-- NOT APPLIED, NOT APPROVED. Written under CLOSEOUT §8c; waits for Ofir like
-- every other pending file. 164 stays unused (the same way 162 was reserved),
-- because §8c names this file 165 and a stable number in conversation beats a
-- dense sequence.
--
-- WHAT: the two RLS helper functions are callable by `anon`. Neither has any
-- business answering an anonymous caller: is_admin() reads the caller's role
-- row and is_supplier_member(uuid) reads the caller's membership, and for a
-- caller with no uid both are a constant false that still costs a definer-
-- rights function call surface. Memory of this project also records a proven
-- definer-fn caller-controlled-uid read-past-RLS in this family, which is why
-- the surface shrinks rather than waits.
--
-- SIGNATURE NOTE: §8c wrote `is_supplier_member()`; production's generated
-- types say `is_supplier_member(p_supplier_id uuid)`. The types are the
-- authority on production (supabase/migrations/ is a different lineage), so
-- the uuid signature is what is revoked here.
--
-- ROLLBACK:
--   grant execute on function public.is_admin() to anon;
--   grant execute on function public.is_supplier_member(uuid) to anon;

revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_supplier_member(uuid) from anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_supplier_member(uuid) to authenticated;
