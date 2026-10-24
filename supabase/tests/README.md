# Supabase pgTAP Tests

**⚠️ NOTE:** Test files have been moved to `tests/sql/` to comply with `migration-location-gate.test.ts`.

The repository's migration gate only allows new .sql files in specific directories (see `ALLOWED_NEW` in `src/__tests__/migration-location-gate.test.ts`). `supabase/tests/` is not in that list, but `tests/sql/` is.

**Current test file locations:**
- `tests/sql/rls_orders.test.sql`
- `tests/sql/rls_products.test.sql`
- `tests/sql/rls_vouchers.test.sql`

This README remains here for documentation purposes.

---

This directory originally contained pgTAP test files for testing Row Level Security (RLS) policies and other database constraints.

## Prerequisites

1. **Install pgTAP extension** (already installed on Supabase projects)
2. **Supabase CLI** installed locally (`npm install -g supabase`)
3. **Linked project** or **local development setup**

## Running Tests

### Against Local Development Database

```bash
# Start local Supabase stack
supabase start

# Run all tests
supabase test db

# Run specific test file
supabase test db --file tests/sql/rls_products.test.sql
```

### Against Supabase Branch (Recommended for Pre-Production)

```bash
# Create a new branch for testing
supabase branches create rls-testing

# Link to the branch
supabase link --project-ref your-project-ref --branch rls-testing

# Run tests against the branch
supabase test db
```

**Why use a branch?**
- Tests run in isolation without affecting production data
- Safe to run destructive operations (TRUNCATE, DELETE)
- Can test migrations before applying to production
- Free on Pro plan (persistent staging branches)

### Test Files

| File | Purpose |
|------|---------|
| `rls_products.test.sql` | Tests RLS policies for products table (anon, authenticated, supplier roles) |
| `rls_orders.test.sql` | Tests RLS policies for orders table (user can only see their own orders) |
| `rls_vouchers.test.sql` | Tests RLS policies for vouchers table (user can only see their own vouchers) |

## Test Structure

Each test file follows this pattern:

```sql
BEGIN;
SELECT plan(N);  -- Number of tests

-- Setup test data
SET ROLE postgres;
-- Insert test data...

-- Test 1: Description
SET ROLE anon;
SELECT is_empty(...);

-- Test 2: Description
SELECT throws_ok(...);

SELECT * FROM finish();
ROLLBACK;  -- Clean up test data
```

## Adding New Tests

1. Create a new `*.test.sql` file in `tests/sql/`
2. Follow the pgTAP test pattern (BEGIN, plan, tests, finish, ROLLBACK)
3. Test RLS policies for different roles:
   - `anon` - Unauthenticated users
   - `authenticated` - Logged-in users
   - `service_role` - Admin/backend operations
4. Use descriptive test messages
5. Clean up with `ROLLBACK` to avoid polluting the database

## Common pgTAP Functions

```sql
-- Plan
SELECT plan(10);  -- Declare how many tests will run

-- Assertions
SELECT ok(boolean, 'description');
SELECT is(actual, expected, 'description');
SELECT isnt(actual, expected, 'description');
SELECT is_empty('SELECT...', 'description');
SELECT results_eq('SELECT...', ARRAY[...], 'description');
SELECT throws_ok('prepared_statement', 'error_code', NULL, 'description');

-- Finish
SELECT * FROM finish();
```

## Continuous Integration

Tests should be run:
1. **Before each migration** to ensure RLS policies are not broken
2. **On PR creation** via GitHub Actions
3. **On Supabase branches** before merging to production

## Troubleshooting

### Test fails with "permission denied"
- Ensure you're testing against a development/branch database, not production
- Check that RLS is properly enabled: `SELECT relrowsecurity FROM pg_class WHERE relname = 'table_name';`

### Test fails with "relation does not exist"
- Ensure migrations are applied to the test database
- Run `supabase db reset` to apply all migrations

### Tests pass locally but fail in CI
- Check that CI has the correct Supabase project credentials
- Ensure the test database has the same schema as production

## References

- [pgTAP Documentation](https://pgtap.org/)
- [Supabase CLI Testing](https://supabase.com/docs/guides/cli/testing)
- [RLS Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
