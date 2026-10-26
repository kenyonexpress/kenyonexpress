-- 187: the shekel sign in a category name renders on the wrong side.
--
-- RENUMBERED 171 -> 187 on 2026-09-09. Production had already used
-- 171 for a different migration (see migrations/applied/), so the number
-- is burned and this unapplied file had to move rather than the applied one.
-- The measurement that established it is in migrations/pending/APPLY-ORDER.md.
--
-- APPLIED 2026-09-09 via MCP as `category_name_shekel_order_187`. Rollback is
-- at the foot. Production held the broken string right up to the write
-- (codepoints 1506,1491,32,8362,57,57 -- sign before digits, no isolate) and
-- holds 1506,1491,32,8294,57,57,160,8362,8297 after it, which is exactly what
-- `isolate()` in src/lib/money-format.ts emits. No other categories row still
-- matches the broken shape.
--
-- WHAT IS WRONG. `categories.name_he` for the `under-99` department reads
-- `עד ₪99`. In an RTL document the shekel glyph is bidi class ET, and a run of
-- ETs adjacent to European digits joins them into one left-to-right run -- so
-- the sign paints to the LEFT of the number. Measured with
-- `e2e/price-bidi.spec.ts` on /products at 1440: the glyph at x=1259 against
-- its digit at x=1270.
--
-- The string this writes puts the digits first and wraps the pair in
-- U+2066 LEFT-TO-RIGHT ISOLATE ... U+2069 POP DIRECTIONAL ISOLATE, which is
-- what `src/lib/money-format.ts` emits for every other price on the site. The
-- isolate is load-bearing and not decoration: `99 ₪` with a plain space is ALSO
-- wrong, because the space is a neutral the algorithm resolves against the RTL
-- paragraph and the sign migrates back across the digits. Measured in Chromium;
-- the table is in the header of money-format.ts.
--
-- THE APP DOES NOT DEPEND ON THIS RUNNING. `getAllCategories` repairs the order
-- on read (`repairPriceOrder`), so the page is correct today and stays correct
-- for any name typed into the admin form later. This migration fixes the datum
-- itself, so exports, feeds and any future reader that skips that helper agree
-- with the page.
--
-- Idempotent: matched on the exact broken string, so a second run updates
-- nothing.

update public.categories
   set name_he = 'עד ' || chr(8294) || '99' || chr(160) || '₪' || chr(8297)
 where slug = 'under-99'
   and name_he = 'עד ₪99';

-- Verify:
--   select slug, name_he from public.categories where slug = 'under-99';
--
-- Rollback:
--   update public.categories
--      set name_he = 'עד ₪99'
--    where slug = 'under-99';
