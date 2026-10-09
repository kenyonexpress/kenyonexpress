-- 160_fk_indexes.sql (idempotent)
create index if not exists payment_events_actor_id_idx on public.payment_events (actor_id);
create index if not exists payout_statements_approved_by_idx on public.payout_statements (approved_by);
create index if not exists refunds_decided_by_idx on public.refunds (decided_by);
create index if not exists refunds_payment_id_idx on public.refunds (payment_id);
create index if not exists refunds_requested_by_idx on public.refunds (requested_by);
create index if not exists reviews_reviewed_by_idx on public.reviews (reviewed_by);
create index if not exists reviews_user_id_idx on public.reviews (user_id);
create index if not exists subscriptions_origin_order_id_idx on public.subscriptions (origin_order_id);
create index if not exists subscriptions_payment_token_id_idx on public.subscriptions (payment_token_id);
create index if not exists wishlists_product_id_idx on public.wishlists (product_id);
