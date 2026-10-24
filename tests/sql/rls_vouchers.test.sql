-- RLS policy tests for vouchers table
-- Run with: supabase test db

BEGIN;

SELECT plan(9);

-- Setup test data
SET ROLE postgres;
TRUNCATE vouchers, orders, order_items, auth.users CASCADE;

-- Create test users
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
VALUES
  ('550e8400-e29b-41d4-a716-446655440040'::uuid, 'owner@test.com', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('550e8400-e29b-41d4-a716-446655440041'::uuid, 'other@test.com', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated');

-- Create test orders
INSERT INTO orders (id, user_id, status, total_ils_agorot, shipping_full_name, shipping_phone, shipping_address_line1, shipping_city)
VALUES
  ('550e8400-e29b-41d4-a716-446655440050'::uuid, '550e8400-e29b-41d4-a716-446655440040'::uuid, 'paid', 10000, 'בעלים', '0501111111', 'כתובת 1', 'עיר 1'),
  ('550e8400-e29b-41d4-a716-446655440051'::uuid, '550e8400-e29b-41d4-a716-446655440041'::uuid, 'paid', 15000, 'אחר', '0502222222', 'כתובת 2', 'עיר 2');

-- Create test vouchers
INSERT INTO vouchers (
  id, user_id, order_id, code, status,
  value_agorot, expires_at
)
VALUES
  ('550e8400-e29b-41d4-a716-446655440060'::uuid,
   '550e8400-e29b-41d4-a716-446655440040'::uuid,
   '550e8400-e29b-41d4-a716-446655440050'::uuid,
   'TEST-VOUCHER-001', 'issued',
   10000, now() + interval '90 days'),
  ('550e8400-e29b-41d4-a716-446655440061'::uuid,
   '550e8400-e29b-41d4-a716-446655440041'::uuid,
   '550e8400-e29b-41d4-a716-446655440051'::uuid,
   'TEST-VOUCHER-002', 'issued',
   15000, now() + interval '90 days'),
  ('550e8400-e29b-41d4-a716-446655440062'::uuid,
   '550e8400-e29b-41d4-a716-446655440040'::uuid,
   '550e8400-e29b-41d4-a716-446655440050'::uuid,
   'TEST-VOUCHER-REDEEMED', 'redeemed',
   10000, now() + interval '90 days');

-- Test 1: anon cannot read any vouchers
SET ROLE anon;
SELECT is_empty(
  $$SELECT id FROM vouchers$$,
  'anon cannot read any vouchers'
);

-- Test 2: anon cannot insert vouchers
PREPARE insert_voucher AS
  INSERT INTO vouchers (id, user_id, order_id, code, status, value_agorot, expires_at)
  VALUES (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440040'::uuid, '550e8400-e29b-41d4-a716-446655440050'::uuid, 'ANON-TEST', 'issued', 5000, now() + interval '90 days');

SELECT throws_ok(
  'insert_voucher',
  '42501',
  NULL,
  'anon cannot insert vouchers'
);

-- Test 3: authenticated user can only see their own vouchers
SET ROLE authenticated;
SET request.jwt.claims.sub TO '550e8400-e29b-41d4-a716-446655440040';

SELECT results_eq(
  $$SELECT id::text FROM vouchers WHERE status = 'issued' ORDER BY id$$,
  ARRAY['550e8400-e29b-41d4-a716-446655440060'],
  'authenticated user can see their own issued vouchers'
);

-- Test 4: user cannot see other users' vouchers
SELECT is_empty(
  $$SELECT id FROM vouchers WHERE user_id = '550e8400-e29b-41d4-a716-446655440041'::uuid$$,
  'user cannot see vouchers belonging to other users'
);

-- Test 5: user can see their redeemed vouchers
SELECT ok(
  (SELECT COUNT(*) >= 1 FROM vouchers WHERE status = 'redeemed' AND user_id = '550e8400-e29b-41d4-a716-446655440040'::uuid),
  'user can see their own redeemed vouchers'
);

-- Test 6: user cannot update voucher status directly (business logic only)
PREPARE update_voucher AS
  UPDATE vouchers SET status = 'expired' WHERE id = '550e8400-e29b-41d4-a716-446655440060'::uuid;

SELECT throws_ok(
  'update_voucher',
  NULL,
  NULL,
  'user cannot directly update voucher status'
);

-- Test 7: user cannot delete vouchers
PREPARE delete_voucher AS
  DELETE FROM vouchers WHERE id = '550e8400-e29b-41d4-a716-446655440060'::uuid;

SELECT throws_ok(
  'delete_voucher',
  '42501',
  NULL,
  'user cannot delete vouchers'
);

-- Test 8: RLS is enabled on vouchers table
SET ROLE postgres;
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'vouchers'),
  'RLS is enabled on vouchers table'
);

-- Test 9: vouchers table has at least one policy
SELECT ok(
  (SELECT COUNT(*) > 0 FROM pg_policies WHERE tablename = 'vouchers'),
  'vouchers table has RLS policies defined'
);

SELECT * FROM finish();
ROLLBACK;
