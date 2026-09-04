-- 171: the shekel sign in a category name renders on the wrong side.
--
-- NOT APPLIED. Drafted 2026-09-04, awaiting approval like every other file in
-- this directory. Rollback is at the foot.
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
