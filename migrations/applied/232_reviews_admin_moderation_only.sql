-- 232_reviews_admin_moderation_only.sql
--
-- REVIEWS ARE COLLECTED, NOT PUBLISHED. The business model shows no review
-- content to visitors: a verified buyer writes one, the admin reads it in
-- moderation, and that is the whole life of the row. This migration closes the
-- two paths 154 and 199 left open that contradicted that model -- the public
-- read of approved rows and the supplier's reply write.
--
-- WHAT THIS CLOSES, each read off production on 2026-09-10 before writing:
--
--   * UPDATE (supplier_reply, supplier_replied_at, supplier_replied_by)
--     granted to authenticated -- 199's COLUMN grant. It does not appear in
--     information_schema.role_table_grants at all (a column grant lives in
--     role_column_grants), which is how "authenticated has no UPDATE" could be
--     read off a table-level audit while the grant sat there. With it gone,
--     the client roles hold no UPDATE of any shape on reviews.
--
--   * reviews_supplier_reply (UPDATE, authenticated) -- 199's policy. Nothing
--     in src/ or apps/ ever wrote supplier_reply (the reply UI was never
--     built), so today the policy is an open door to a room nobody uses;
--     dropped rather than kept inert, because the next broad GRANT would arm
--     it silently.
--
--   * reviews_public_read_approved (SELECT, public) and the anon table SELECT
--     grant -- the public display path. The product page read approved rows
--     through the anon client for the visible list and the JSON-LD
--     aggregateRating; both readers are removed in the same commit.
--
-- WHAT REMAINS is exactly owner-plus-admin:
--
--   * reviews_owner_insert_verified  (154)  own row, proven purchase, pending
--   * reviews_owner_read             (154)  own rows only
--   * reviews_owner_delete           (154)  own rows only
--   * moderation                     service_role (admin client), the one
--                                    write that moves a row out of pending --
--                                    src/server/actions/admin/reviews.ts
--
-- The reply/report COLUMNS and the review_reports table stay: they are data
-- and audit surface, reachable by the admin client, and dropping columns is
-- not what this change is about.
--
-- ROLLBACK, should the model change back: re-grant the column UPDATE and
-- re-create the two policies; their exact production texts as of today are
-- quoted in 199_review_replies_and_reports.sql (reply) and
-- 154_reviews_wishlist.sql (public read).

-- The write path: no client-role UPDATE of any shape.
DROP POLICY IF EXISTS "reviews_supplier_reply" ON public.reviews;
REVOKE UPDATE (supplier_reply, supplier_replied_at, supplier_replied_by)
  ON public.reviews FROM authenticated, anon, PUBLIC;
REVOKE UPDATE ON TABLE public.reviews FROM authenticated, anon, PUBLIC;

-- The read path: no anonymous read, no approved-rows-for-everyone policy.
-- authenticated keeps table SELECT; reviews_owner_read scopes it to own rows.
DROP POLICY IF EXISTS "reviews_public_read_approved" ON public.reviews;
REVOKE SELECT ON TABLE public.reviews FROM anon;
