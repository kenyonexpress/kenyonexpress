-- preflight_187.sql -- read-only. Run before 187.

-- (1) full_address is absent.   EXPECT: 0 rows.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'products' and column_name = 'full_address';

-- (2) the geo columns it complements are present.   EXPECT: 3 rows.
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'products'
   and column_name in ('city', 'latitude', 'longitude');

-- (3) how many physical products still lack a location.
select count(*) as physical_without_city
  from public.products
 where type = 'physical' and deleted_at is null and (city is null or city = '');
