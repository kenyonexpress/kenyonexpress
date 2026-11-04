-- 259_push_subscription_topics.sql (idempotent)
--
-- S21, 2026-11-04. Web push TOPICS: which kinds of push one browser wants.
--
-- Two topics, and only two, because those are the two things a customer asks
-- a browser to be woken up for:
--
--   order_updates  shipped, redeemed, cashback, invoice, referral credit
--   expiry         the T-7 / T-1 coupon reminder (S20) and the credit that
--                  follows an expired coupon
--
-- The kind -> topic map lives in src/lib/push/topics.ts, not here: a kind is
-- an application word, and a CHECK that knew every kind would need a migration
-- each time a template is added.
--
-- PER SUBSCRIPTION, NOT PER ACCOUNT. The customer's per-kind switches
-- (notification_preferences, channel 'push') already answer "this account";
-- a topic answers "this browser". The phone gets the expiry reminder, the
-- work laptop does not.
--
-- REQUIRED KINDS IGNORE TOPICS. order_paid, voucher_issued, voucher_gifted and
-- refund_completed reach every subscribed browser regardless, the same rule
-- src/lib/notifications/preferences.ts applies to every channel. That is
-- enforced in the sender, not here.
--
-- DEFAULT BOTH. Every existing row (1 on 04.11) and every row a browser that
-- predates S21 posts gets both topics, which is the behaviour it had before
-- this column existed. An empty array is allowed: it means "required pushes
-- only".
--
-- No new policy. 179's grants stand: writes are service-role only, through
-- src/server/actions/push.ts and src/app/api/push/subscription/route.ts.
--
-- ROLLBACK:
--   alter table public.push_subscriptions drop constraint if exists push_subscriptions_topics_known;
--   alter table public.push_subscriptions drop column if exists topics;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT ARRAY['order_updates', 'expiry']::text[];

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_topics_known;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_topics_known
  CHECK (topics <@ ARRAY['order_updates', 'expiry']::text[]);

COMMENT ON COLUMN public.push_subscriptions.topics IS
  'S21: push topics this browser opted into (order_updates, expiry). Required kinds ignore it. Map in src/lib/push/topics.ts.';
