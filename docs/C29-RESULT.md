# C29 Result: Supplier Click-Wrap Agreement Tracking

**Date:** 2026-10-24  
**Goal:** Implement supplier click-wrap agreement tracking with version hash, timestamp, IP address, and 1 ILS verification charge  
**Commit:** 73dbcbcc895b6af5d841d185c5282d8fd9a34880

## Implementation Summary

### 1. Database Schema (Migration 292)

Created `supplier_agreements` table to track click-wrap terms acceptance:

- **version_hash** (text, 64 chars): SHA-256 hash of agreement text
- **version_date** (text, YYYY-MM-DD): Version from `SUPPLIER_AGREEMENT_VERSION`
- **ip_address** (inet): IP address at time of acceptance
- **user_agent** (text, max 512): Browser user agent string
- **Links:**
  - `supplier_lead_id` → supplier_leads
  - `verification_id` → supplier_card_verifications  
  - `supplier_id` → suppliers

**Security:** Service-role only, RLS enabled, no public policies

### 2. Code Changes

#### src/server/supplier/lead-create.ts
- Updated `createSupplierLead` to accept optional `{ verificationId, userAgent }`
- Records agreement in `supplier_agreements` table
- Maintains existing `audit_log` entry for backwards compatibility
- Logs errors but does not fail if agreement recording fails

#### src/server/supplier/card-verification.ts
- Added `user_agent` to `Row` type
- Updated SELECT query to fetch `user_agent`
- Passes `verificationId` and `userAgent` to `createSupplierLead`

### 3. Test Coverage

#### supplier-agreements.test.ts (NEW)
- ✅ Records agreement with version hash, IP and user agent
- ✅ Records agreement without verification_id when not provided
- ✅ Records agreement with null IP when IP is invalid
- ✅ Truncates user agent to 512 characters
- ✅ Still creates lead even if agreement recording fails

#### card-verification.test.ts (UPDATED)
- ✅ Verifies `createSupplierLead` called with verification context
- All 5 existing tests still passing

**Total:** 10 supplier tests green

### 4. Verification Charge

✅ **1 ILS (100 agorot) verification already implemented:**
- `VERIFICATION_AMOUNT_AGOROT = agorot(100)` in card-verification.ts (line 26)
- Charged via Cardcom `ChargeAndCreateToken` 
- Voided after successful verification
- No code changes needed for this requirement

### 5. Quality Gates

✅ **Type-check:** Clean  
✅ **Lint:** Clean (biome + 3 custom gates)  
✅ **Tests:** 10/10 supplier tests passing  
✅ **Build:** Success (317 pages prerendered)

### 6. Files Modified

```
migrations/pending/292_supplier_agreements.sql       +49 lines (NEW)
migrations/pending/README.md                         +1 line
src/lib/admin/migration-manifest.ts                  +6 lines
src/server/supplier/card-verification.test.ts        +6 lines
src/server/supplier/card-verification.ts             +8 -2 lines
src/server/supplier/lead-create.ts                   +14 lines
src/server/supplier/supplier-agreements.test.ts      +121 lines (NEW)
```

**Total:** 7 files changed, 204 insertions(+), 2 deletions(-)

## How It Works

1. **Supplier visits /supplier/apply** and fills out the form
2. **Agreement hash validation:** Form includes hidden field with `supplierAgreementHash()`
3. **Submit triggers card verification:**
   - IP address and user agent captured
   - `supplier_card_verifications` row created
   - Redirects to Cardcom for 1 ILS charge
4. **After card verification succeeds:**
   - `completeSupplierCardVerification` fetches verification row with user_agent
   - Calls `createSupplierLead` with verification_id and userAgent
   - Creates `supplier_leads` row
   - **Records agreement in `supplier_agreements` table** with:
     - version_hash from form
     - version_date from `SUPPLIER_AGREEMENT_VERSION`
     - IP address from verification row
     - user_agent from verification row
     - Links to both lead and verification

## Migration Status

- **Created:** migrations/pending/292_supplier_agreements.sql
- **Applied:** ✅ Yes (2026-10-24, version 20261023202611)
- **Verified:** Table exists with all columns (id, supplier_lead_id, verification_id, supplier_id, version_hash, version_date, ip_address, user_agent, created_at)
- **RLS:** Confirmed - anon has no SELECT/INSERT (service-role only)
- **Preflight:** None needed (no destructive operations)
- **Rollback:** `drop table if exists public.supplier_agreements;`

## Database Verification

Migration 292 has been successfully applied to production:

```bash
# Applied via Supabase MCP
✓ Migration applied
✓ Verified in schema_migrations: version 20261023202611

# Table schema confirmed
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'supplier_agreements'
# Returns: id, supplier_lead_id, verification_id, supplier_id,
#          version_hash, version_date, ip_address, user_agent, created_at

# RLS verified
SELECT has_table_privilege('anon', 'supplier_agreements', 'SELECT')
# Returns: false (✓ service-role only)
```

The table is now live and ready to record supplier agreement acceptances.

## Related Files

- Agreement text: `src/lib/legal/supplier-agreement.ts`
- Agreement tests: `src/lib/legal/supplier-agreement.test.ts`
- Card verification: `src/server/supplier/card-verification.ts`
- Lead creation: `src/server/supplier/lead-create.ts`
- Form submission: `src/server/actions/supplier-lead.ts`

## Verification

To verify the implementation works:

```typescript
// After applying migration 292, submit a supplier application and check:
const { data } = await admin
  .from('supplier_agreements')
  .select('*, supplier_leads(business_name)')
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

console.log(data)
// Should show:
// - version_hash: 64-char hex SHA-256
// - version_date: "2026-10-21"
// - ip_address: <IP from request>
// - user_agent: <Browser UA string>
// - supplier_lead_id: <UUID>
// - verification_id: <UUID>
```

## Result

✅ **COMPLETE:** All C29 requirements implemented and tested
- ✅ Click-wrap version hash tracking
- ✅ Timestamp (created_at auto-populated)
- ✅ IP address recording
- ✅ User agent recording
- ✅ 1 ILS verification charge (already existed)
- ✅ Links to supplier_lead and verification
- ✅ Comprehensive test coverage
- ✅ All quality gates passing
