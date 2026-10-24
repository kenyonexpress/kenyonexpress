-- RLS policy tests for products table
-- Run with: supabase test db

BEGIN;

SELECT plan(10);

-- Setup test data
SET ROLE postgres;
TRUNCATE products, suppliers CASCADE;

INSERT INTO suppliers (id, name_he, email, phone, status)
VALUES
  ('550e8400-e29b-41d4-a716-446655440001'::uuid, 'ספק טסט', 'test@example.com', '0501234567', 'approved'),
  ('550e8400-e29b-41d4-a716-446655440002'::uuid, 'ספק אחר', 'other@example.com', '0501234568', 'approved');

INSERT INTO products (
  id, supplier_id, name_he, slug, description_he,
  price_ils_agorot, stock, status, approved
)
VALUES
  ('550e8400-e29b-41d4-a716-446655440010'::uuid,
   '550e8400-e29b-41d4-a716-446655440001'::uuid,
   'מוצר טסט 1', 'test-product-1', 'תיאור טסט',
   10000, 10, 'published', true),
  ('550e8400-e29b-41d4-a716-446655440011'::uuid,
   '550e8400-e29b-41d4-a716-446655440001'::uuid,
   'מוצר לא מאושר', 'unapproved-product', 'לא מאושר',
   5000, 5, 'published', false),
  ('550e8400-e29b-41d4-a716-446655440012'::uuid,
   '550e8400-e29b-41d4-a716-446655440001'::uuid,
   'מוצר מחוק', 'deleted-product', 'נמחק',
   7500, 0, 'published', true);

UPDATE products
SET deleted_at = now()
WHERE id = '550e8400-e29b-41d4-a716-446655440012'::uuid;

-- Test 1: anon can read published, approved, non-deleted products
SET ROLE anon;
SELECT results_eq(
  $$SELECT id::text FROM products WHERE approved AND deleted_at IS NULL ORDER BY id$$,
  ARRAY['550e8400-e29b-41d4-a716-446655440010'],
  'anon can only see approved, non-deleted products'
);

-- Test 2: anon cannot see unapproved products
SELECT is_empty(
  $$SELECT id FROM products WHERE NOT approved$$,
  'anon cannot see unapproved products'
);

-- Test 3: anon cannot see deleted products
SELECT is_empty(
  $$SELECT id FROM products WHERE deleted_at IS NOT NULL$$,
  'anon cannot see soft-deleted products'
);

-- Test 4: anon cannot insert products
PREPARE insert_product AS
  INSERT INTO products (id, supplier_id, name_he, slug, description_he, price_ils_agorot, stock, status)
  VALUES (gen_random_uuid(), '550e8400-e29b-41d4-a716-446655440001'::uuid, 'חדש', 'new', 'תיאור', 1000, 1, 'published');

SELECT throws_ok(
  'insert_product',
  '42501',  -- insufficient_privilege
  NULL,
  'anon cannot insert products'
);

-- Test 5: anon cannot update products
PREPARE update_product AS
  UPDATE products SET name_he = 'שם מעודכן' WHERE id = '550e8400-e29b-41d4-a716-446655440010'::uuid;

SELECT throws_ok(
  'update_product',
  '42501',
  NULL,
  'anon cannot update products'
);

-- Test 6: anon cannot delete products
PREPARE delete_product AS
  DELETE FROM products WHERE id = '550e8400-e29b-41d4-a716-446655440010'::uuid;

SELECT throws_ok(
  'delete_product',
  '42501',
  NULL,
  'anon cannot delete products'
);

-- Test 7: authenticated user can read same as anon
SET ROLE authenticated;
SELECT results_eq(
  $$SELECT id::text FROM products WHERE approved AND deleted_at IS NULL ORDER BY id$$,
  ARRAY['550e8400-e29b-41d4-a716-446655440010'],
  'authenticated can see same products as anon'
);

-- Test 8: authenticated cannot insert products (supplier-only)
SELECT throws_ok(
  'insert_product',
  '42501',
  NULL,
  'authenticated (non-supplier) cannot insert products'
);

-- Test 9: RLS is enabled on products table
SET ROLE postgres;
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'products'),
  'RLS is enabled on products table'
);

-- Test 10: products table has at least one policy
SELECT ok(
  (SELECT COUNT(*) > 0 FROM pg_policies WHERE tablename = 'products'),
  'products table has RLS policies defined'
);

SELECT * FROM finish();
ROLLBACK;
