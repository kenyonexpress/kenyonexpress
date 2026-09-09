-- ============================================================================
-- PENDING: products.whatsapp_enabled -- the per-product WhatsApp toggle
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
--
-- ----------------------------------------------------------------------------
-- WHY THE DEFAULT IS false
-- ----------------------------------------------------------------------------
--
-- The button opens a chat with a real business's phone. Defaulting to true
-- would switch on a support channel for all 80 products at once, on behalf of
-- eleven suppliers, none of whom agreed to answer WhatsApp -- and six of whom
-- have no phone number on file at all, so the button would be dead on those.
--
-- `false` also matches how the column reads. `whatsapp_enabled` is a claim that
-- this supplier answers WhatsApp for this deal. That claim is not true until
-- somebody makes it true, so the admin ticks the box per product.
--
-- NOT NULL with a default, rather than nullable: a three-state boolean where
-- NULL means "nobody decided" would just be `false` with extra branching in
-- every reader.
--
-- ----------------------------------------------------------------------------
-- THE FLAG IS NECESSARY, NOT SUFFICIENT
-- ----------------------------------------------------------------------------
--
-- The button still needs a number to link to, and the flag does not conjure
-- one. `buildSupplierContact` (src/lib/supplier-contact.ts) returns a
-- `whatsappHref` only when the supplier has `whatsapp`, or a `contact_phone`
-- that is a MOBILE -- measured against production, all five filled
-- `contact_phone` values are landlines, which have no WhatsApp account, so an
-- unconditional fallback would have produced five links that open WhatsApp only
-- to say the number is not on it.
--
-- So the rendering condition is `whatsapp_enabled AND whatsappHref`, and this
-- migration supplies only the first half. There is deliberately no CHECK tying
-- the flag to the supplier's phone: the supplier's number lives on another
-- table and can change after the box is ticked, and a constraint that reaches
-- across that join would make editing a phone number fail with a message about
-- a product.
--
-- ============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.whatsapp_enabled IS
  'Whether the product page offers a WhatsApp link to the supplier. Default false: the button opens a chat with a real business, so it is opt-in per product. Necessary but not sufficient -- the link also needs a WhatsApp-capable number from buildSupplierContact(), which excludes the landlines in suppliers.contact_phone.';

-- Partial index on the ticked rows only. It is a small table (80 rows today),
-- so this is not about scan cost: it is the admin list "which products offer
-- WhatsApp", and a partial index on `WHERE whatsapp_enabled` stays proportional
-- to the ticked few rather than the whole catalogue as it grows.
CREATE INDEX IF NOT EXISTS products_whatsapp_enabled_idx
  ON public.products (id)
  WHERE whatsapp_enabled;

-- ============================================================================
-- VERIFICATION (after applying)
-- ============================================================================
--
-- 1. Every existing row is opted out, and none is NULL (expect enabled = 0,
--    nulls = 0, total = 80):
--
--      SELECT count(*) FILTER (WHERE whatsapp_enabled)          AS enabled,
--             count(*) FILTER (WHERE whatsapp_enabled IS NULL)  AS nulls,
--             count(*)                                          AS total
--      FROM public.products;
--
-- 2. Ticking one product does not make a button appear where there is no
--    number. Pick a product whose supplier has neither `whatsapp` nor a mobile
--    `contact_phone`, tick it, and confirm the page renders no WhatsApp link:
--
--      SELECT p.id, p.slug, s.whatsapp, s.contact_phone
--      FROM public.products p
--      LEFT JOIN public.suppliers s ON s.id = p.supplier_id
--      WHERE p.whatsapp_enabled;
--
-- ROLLBACK
--
--   DROP INDEX IF EXISTS public.products_whatsapp_enabled_idx;
--   ALTER TABLE public.products DROP COLUMN IF EXISTS whatsapp_enabled;
-- ============================================================================
