-- RLS policy tests for orders table
-- Run with: supabase test db

BEGIN;

SELECT plan(8);

-- Setup test data
SET ROLE postgres;
TRUNCATE orders, auth.users CASCADE;

-- Create test users
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
VALUES
  ('550e8400-e29b-41d4-a716-446655440020'::uuid, 'user1@test.com', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated'),
  ('550e8400-e29b-41d4-a716-446655440021'::uuid, 'user2@test.com', crypt('password', gen_salt('bf')), now(), now(), now(), 'authenticated', 'authenticated');

-- Create test orders
INSERT INTO orders (
  id, user_id, status, total_ils_agorot,
  shipping_full_name, shipping_phone, shipping_address_line1, shipping_city
)
VALUES
  ('550e8400-e29b-41d4-a716-446655440030'::uuid,
   '550e8400-e29b-41d4-a716-446655440020'::uuid,
   'pending_payment', 15000,
   'יוסי כהן', '0501234567', 'רחוב הרצל 1', 'תל אביב'),
  ('550e8400-e29b-41d4-a716-446655440031'::uuid,
   '550e8400-e29b-41d4-a716-446655440021'::uuid,
   'paid', 25000,
   'שרה לוי', '0507654321', 'רחוב בן יהודה 10', 'ירושלים');

-- Test 1: anon cannot read any orders
SET ROLE anon;
SELECT is_empty(
  $$SELECT id FROM orders$$,
  'anon cannot read any orders'
);

-- Test 2: anon cannot insert orders
PREPARE insert_order AS
  INSERT INTO orders (id, user_id, status, total_ils_agorot, shipping_full_name, shipping_phone, shipping_address_line1, shipping_city)
  VALUES (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440020'::uuid, 'pending_payment', 10000, 'טסט', '0501111111', 'כתובת', 'עיר');

SELECT throws_ok(
  'insert_order',
  '42501',
  NULL,
  'anon cannot insert orders'
);

-- Test 3: authenticated user can only see their own orders
SET ROLE authenticated;
SET request.jwt.claims.sub TO '550e8400-e29b-41d4-a716-446655440020';

SELECT results_eq(
  $$SELECT id::text FROM orders ORDER BY id$$,
  ARRAY['550e8400-e29b-41d4-a716-446655440030'],
  'authenticated user can only see their own orders'
);

-- Test 4: user cannot see other users' orders
SELECT is_empty(
  $$SELECT id FROM orders WHERE user_id = '550e8400-e29b-41d4-a716-446655440021'::uuid$$,
  'user cannot see orders belonging to other users'
);

-- Test 5: user can insert their own orders
SET ROLE postgres;
DELETE FROM orders WHERE id = '550e8400-e29b-41d4-a716-446655440030'::uuid;

SET ROLE authenticated;
SET request.jwt.claims.sub TO '550e8400-e29b-41d4-a716-446655440020';

INSERT INTO orders (id, user_id, status, total_ils_agorot, shipping_full_name, shipping_phone, shipping_address_line1, shipping_city)
VALUES ('550e8400-e29b-41d4-a716-446655440030'::uuid, '550e8400-e29b-41d4-a716-446655440020'::uuid, 'pending_payment', 12000, 'חדש', '0509999999', 'חדש', 'חדש');

SELECT ok(
  (SELECT COUNT(*) = 1 FROM orders WHERE id = '550e8400-e29b-41d4-a716-446655440030'::uuid),
  'authenticated user can insert their own orders'
);

-- Test 6: user cannot insert orders for other users
PREPARE insert_other_order AS
  INSERT INTO orders (id, user_id, status, total_ils_agorot, shipping_full_name, shipping_phone, shipping_address_line1, shipping_city)
  VALUES (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440021'::uuid, 'pending_payment', 5000, 'אחר', '0508888888', 'אחר', 'אחר');

SELECT throws_ok(
  'insert_other_order',
  NULL,
  NULL,
  'user cannot insert orders for other users'
);

-- Test 7: RLS is enabled on orders table
SET ROLE postgres;
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'orders'),
  'RLS is enabled on orders table'
);

-- Test 8: orders table has at least one policy
SELECT ok(
  (SELECT COUNT(*) > 0 FROM pg_policies WHERE tablename = 'orders'),
  'orders table has RLS policies defined'
);

SELECT * FROM finish();
ROLLBACK;
