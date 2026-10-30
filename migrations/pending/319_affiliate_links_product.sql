-- 319: C103 F12. An affiliate link can point at one product, and an affiliate
-- holds at most one link per product (whatever the campaign). Links without a
-- product (home, category, any path) are unchanged.
-- No money column. Commission stays commission_bp on the campaign, snapshotted
-- into affiliate_attributions at order time; payout is integer agorot into the
-- wallet through fn_wallet_transfer (see src/server/affiliate/settle.ts).
-- Needs applied/283_affiliate_campaigns.sql.
-- Rollback: drop index if exists public.affiliate_links_one_per_product;
--           alter table public.affiliate_links drop column if exists product_id;

alter table public.affiliate_links
  add column if not exists product_id uuid references public.products (id) on delete cascade;

create unique index if not exists affiliate_links_one_per_product
  on public.affiliate_links (affiliate_id, product_id)
  where product_id is not null;
