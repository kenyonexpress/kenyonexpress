# Supabase Branch Setup for RLS Testing

**Purpose:** Create isolated Supabase branches for testing RLS policies with pgTAP before applying migrations to production.

**Status:** Ready for deployment (requires Supabase Pro plan with branching enabled)

---

## Prerequisites

1. **Supabase Pro plan** - Branching is a Pro feature
2. **Supabase CLI** installed: `npm install -g supabase`
3. **Linked project**: `supabase link --project-ref <your-project-ref>`

---

## Creating a Branch for RLS Testing

### 1. Create a New Branch

```bash
# Create a persistent staging branch
supabase branches create rls-testing

# Or create a preview branch (auto-deleted after inactivity)
supabase branches create rls-testing --preview
```

### 2. Switch to the Branch

```bash
# Link to the branch
supabase link --project-ref <your-project-ref> --branch rls-testing

# Verify you're on the branch
supabase branches list
```

### 3. Apply Pending Migrations (If Any)

```bash
# Apply migrations from supabase/migrations/ to the branch
supabase db push
```

---

## Running pgTAP Tests Against the Branch

### Run All RLS Tests

```bash
# Run all pgTAP tests
supabase test db

# Expected output:
# rls_products.test.sql ... ok
# rls_orders.test.sql ... ok
# rls_vouchers.test.sql ... ok
# All tests successful.
```

### Run Specific Test File

```bash
supabase test db --file supabase/tests/rls_products.test.sql
```

### View Detailed Test Output

```bash
# Run tests with verbose output
supabase test db --verbose
```

---

## Branch Management

### List All Branches

```bash
supabase branches list
```

### Switch Between Branches

```bash
# Switch to production
supabase link --project-ref <your-project-ref>

# Switch to rls-testing branch
supabase link --project-ref <your-project-ref> --branch rls-testing
```

### Delete a Branch

```bash
supabase branches delete rls-testing
```

**Warning:** Deleting a branch is permanent and cannot be undone.

---

## Workflow: Testing RLS Changes

### Step 1: Create Migration

```bash
# Create a new migration
supabase migration new add_supplier_rls_policy
```

### Step 2: Write Migration

Edit the generated migration file in `supabase/migrations/`:

```sql
-- Add RLS policy for suppliers
CREATE POLICY "Suppliers can view their own products"
  ON products
  FOR SELECT
  TO authenticated
  USING (
    supplier_id = (SELECT id FROM suppliers WHERE user_id = auth.uid())
  );
```

### Step 3: Write pgTAP Test

Create `supabase/tests/rls_suppliers.test.sql`:

```sql
BEGIN;
SELECT plan(5);

-- Test supplier can see their own products
-- Test supplier cannot see other suppliers' products
-- etc.

SELECT * FROM finish();
ROLLBACK;
```

### Step 4: Test on Branch

```bash
# Create and switch to branch
supabase branches create rls-supplier-test
supabase link --project-ref <ref> --branch rls-supplier-test

# Apply migration
supabase db push

# Run tests
supabase test db --file supabase/tests/rls_suppliers.test.sql
```

### Step 5: If Tests Pass, Apply to Production

```bash
# Switch back to production
supabase link --project-ref <ref>

# Apply migration via Supabase MCP or dashboard
# (Do NOT use `supabase db push` on production)
```

### Step 6: Clean Up Branch

```bash
supabase branches delete rls-supplier-test
```

---

## Branch Database Connection String

Each branch gets its own isolated database. Get the connection string:

```bash
# Get branch connection details
supabase branches get rls-testing

# Connection string format:
# postgresql://postgres:[PASSWORD]@db.[PROJECT-REF]-[BRANCH-ID].supabase.co:5432/postgres
```

---

## Cost Considerations

| Branch Type | Cost | Retention |
|------------|------|-----------|
| Persistent staging | ~$10/month per branch | Permanent until deleted |
| Preview branches | Included in Pro | Auto-deleted after 7 days inactive |

**Recommendation:** Use one persistent `staging` branch for ongoing RLS testing, plus temporary preview branches for specific features.

---

## Continuous Integration with Branches

### GitHub Actions Integration

```yaml
name: Test RLS Policies

on:
  pull_request:
    paths:
      - 'supabase/migrations/**'
      - 'supabase/tests/**'

jobs:
  test-rls:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Supabase CLI
        run: npm install -g supabase
      
      - name: Create preview branch
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        run: |
          BRANCH_NAME="ci-${GITHUB_RUN_ID}"
          supabase branches create "$BRANCH_NAME" --preview
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }} --branch "$BRANCH_NAME"
      
      - name: Apply migrations
        run: supabase db push
      
      - name: Run pgTAP tests
        run: supabase test db
      
      - name: Cleanup branch
        if: always()
        run: supabase branches delete "ci-${GITHUB_RUN_ID}"
```

---

## Troubleshooting

### Error: "Branching is not enabled"

**Solution:** Upgrade to Supabase Pro plan or enable branching in project settings.

### Error: "Branch not found"

**Solution:** Verify branch exists with `supabase branches list`. Branch may have been auto-deleted if it was a preview branch.

### Tests fail with "permission denied"

**Solution:** 
1. Ensure you're testing against a branch, not production
2. Check that migrations are applied: `supabase db push`
3. Verify RLS is enabled: `supabase db diff`

### Branch is slow or times out

**Solution:**
1. Branches use the same compute as your main project
2. Consider upgrading compute tier if running intensive tests
3. Use preview branches (lighter weight) for quick tests

---

## References

- [Supabase Branching Documentation](https://supabase.com/docs/guides/platform/branching)
- [pgTAP Test Suite](https://pgtap.org/)
- [Supabase CLI Testing](https://supabase.com/docs/guides/cli/testing)
- Project pgTAP tests: `supabase/tests/README.md`
