# C65: Phone Verification Milestones

**Status:** Implemented  
**Date:** 2026-10-24  
**Migration:** 297 (pending)

## Overview

Implements phone verification via WhatsApp OTP after users complete 5 physical orders. Uses a milestone tracking system to record when users reach this threshold and when they complete verification.

## Implementation

### 1. Database Schema

**Migration:** `migrations/pending/297_user_verification_milestones.sql`

#### Tables

**user_verification_milestones**
- `id` - UUID primary key
- `user_id` - FK to auth.users (CASCADE on delete)
- `milestone_type` - ENUM ('phone_verification_after_5_orders', 'address_verification_after_5_orders')
- `achieved_at` - When milestone was triggered (user reached 5 orders)
- `verified_at` - When user completed verification (NULL until verified)
- `metadata` - JSONB for additional context
- Unique constraint on (user_id, milestone_type)

#### Functions

**fn_count_user_physical_orders(p_user_id uuid) → integer**
- Counts completed physical orders for a user
- Only counts paid/fulfilled/partially_fulfilled orders
- Distinct order_id count (not item count)

**fn_user_needs_phone_verification(p_user_id uuid) → boolean**
- Returns true if user has 5+ physical orders AND
- Milestone doesn't exist OR exists but not verified

**fn_check_and_create_verification_milestone() → trigger**
- Auto-creates milestone when order status changes to paid/fulfilled
- Only for orders containing physical items
- Only creates if user has 5+ total physical orders
- Idempotent (ON CONFLICT DO NOTHING)

#### RLS Policies

- Users can SELECT their own milestones
- System-managed (users cannot INSERT/UPDATE/DELETE)
- Service role has full access

### 2. Server Functions

**File:** `src/server/verification/user-milestones.ts`

#### Exports

```typescript
// Check if current authenticated user needs verification
async function currentUserNeedsPhoneVerification(): Promise<boolean>

// Check if specific user needs verification
async function userNeedsPhoneVerification(userId: string): Promise<boolean>

// Get user's physical order count
async function getUserPhysicalOrderCount(userId: string): Promise<number>

// Get user's verification milestone
async function getUserVerificationMilestone(
  userId: string,
  milestoneType?: MilestoneType
): Promise<UserVerificationMilestone | null>

// Mark milestone as verified (after successful OTP)
async function markMilestoneVerified(
  userId: string,
  milestoneType?: MilestoneType,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }>

// Manually create milestone (admin/testing)
async function createVerificationMilestone(
  userId: string,
  milestoneType: MilestoneType,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; milestone?: UserVerificationMilestone; error?: string }>
```

### 3. API Routes

#### POST /api/checkout/phone-otp/verify

**Updated:** Marks milestone as verified after successful OTP verification

```typescript
// Request
{ phone: string, code: string }

// Success Response
{ ok: true, phone: string }

// Side Effect (C65)
markMilestoneVerified(userId, 'phone_verification_after_5_orders', {
  phone: '+972501234567',
  method: 'checkout_whatsapp_otp',
  verified_via: 'checkout',
})
```

#### POST /api/auth/wa-otp/verify

**Updated:** Marks milestone as verified after successful sign-in via WhatsApp OTP

```typescript
// Side Effect (C65)
markMilestoneVerified(userId, 'phone_verification_after_5_orders', {
  phone: '+972501234567',
  method: 'auth_whatsapp_otp',
  verified_via: 'sign_in',
})
```

#### POST /api/verification/phone/complete

**New:** Alternative endpoint to mark milestone as verified

```typescript
// Request
{ phone?: string, method?: string }

// Success Response
{ ok: true, message: 'phone_verified' }

// No Milestone Response
{ ok: true, message: 'no_milestone_needed' }
```

### 4. Integration Points

#### Existing Verification System

The milestone system integrates with the existing F42 verified shipping gate:

1. **Threshold Check** - Both use 5 physical orders (`PHYSICAL_ORDERS_BEFORE_VERIFICATION`)
2. **Phone Verification** - Existing `isPhoneVerifiedForUser` checks `auth_wa_otps.consumed_at`
3. **Checkout Form** - Already has `ShippingPhoneVerification` component
4. **Address Validation** - Already enforces complete address with phone

#### Milestone Enhancement

The milestone system adds:
1. **Persistent Record** - Tracks when threshold was reached
2. **Verification Status** - Separate `verified_at` timestamp
3. **Metadata** - Context about verification (phone, method, order that triggered)
4. **Audit Trail** - Complete history of verification events

### 5. User Flow

1. **User places orders** - System counts physical orders via trigger
2. **5th order completion** - Trigger creates milestone record
   - `achieved_at` = now
   - `verified_at` = NULL
   - `metadata` = { order_id, order_count }
3. **User attempts checkout** - `fn_user_needs_phone_verification` returns true
4. **User verifies phone** - WhatsApp OTP sent and verified
5. **Milestone marked** - `verified_at` set, metadata updated
6. **Future checkouts** - Verification not required (milestone verified)

### 6. Testing

**Unit Tests:** `src/server/verification/user-milestones.test.ts`
- 15 test cases covering all functions
- Mock Supabase clients
- Success and error paths

**API Tests:** `src/app/api/checkout/phone-otp/verify/route.test.ts`
- 5 test cases for phone OTP verification
- Milestone marking integration
- Auth, validation, error handling

**Coverage:**
- Milestone creation on order completion (trigger)
- Phone verification requirement check
- Milestone verification after OTP
- Error handling and edge cases

### 7. Quality Gates

All standard gates must pass:
- `pnpm typecheck` - TypeScript compilation
- `pnpm lint` - Biome linting
- `pnpm test` - Vitest unit tests
- `pnpm build` - Production build

## Migration Application

**Migration:** 297 (pending)

**Requires:**
- Supabase MCP OAuth OR
- Manual application via Supabase dashboard OR
- `psql` connection to production

**Verification Query:**
```sql
SELECT 
  count(*) as milestone_count,
  count(verified_at) as verified_count
FROM user_verification_milestones
WHERE milestone_type = 'phone_verification_after_5_orders';
```

**Test User Creation:**
```sql
-- Test that trigger works
-- (Place 5 orders for a test user, last one should create milestone)
SELECT fn_count_user_physical_orders('test-user-id');
SELECT * FROM user_verification_milestones WHERE user_id = 'test-user-id';
```

## Configuration

No configuration required. Uses existing:
- `PHYSICAL_ORDERS_BEFORE_VERIFICATION = 5` (from `verified-shipping.ts`)
- WhatsApp OTP system (F15)
- Checkout phone verification (F42)

## Observability

**Log Events:**
- `milestone.check_verification_failed` - RPC call failed
- `milestone.count_orders_failed` - Order count query failed
- `milestone.get_milestone_failed` - Milestone read failed
- `milestone.mark_verified_failed` - Update failed
- `milestone.marked_verified` - Successful verification (INFO)
- `milestone.create_failed` - Manual create failed
- `milestone.created` - Milestone created (INFO)
- `verification.phone.complete_failed` - API route error
- `verification.phone.completed` - Phone verified via API (INFO)

**Metrics:**
- Track via `user_verification_milestones` table queries
- Count unverified milestones: `verified_at IS NULL`
- Time to verify: `verified_at - achieved_at`

## Future Enhancements

1. **Address Verification Milestone** - Similar system for address verification
2. **Admin Dashboard** - View users with pending verification
3. **Reminder System** - Email/push notification when verification needed
4. **Bulk Import** - Create milestones for existing high-order-count users
5. **Multiple Thresholds** - Different verification requirements at 10, 20 orders

## Related Features

- **F15** - WhatsApp OTP sign-in
- **F42** - Verified shipping gate (existing)
- **C29** - Supplier agreements (similar milestone pattern)

## Files Changed

### New Files
- `migrations/pending/297_user_verification_milestones.sql`
- `src/server/verification/user-milestones.ts`
- `src/server/verification/user-milestones.test.ts`
- `src/app/api/verification/phone/complete/route.ts`
- `src/app/api/checkout/phone-otp/verify/route.test.ts`
- `docs/C65-PHONE-VERIFICATION-MILESTONES.md`

### Modified Files
- `src/app/api/checkout/phone-otp/verify/route.ts` - Added milestone marking
- `src/app/api/auth/wa-otp/verify/route.ts` - Added milestone marking

## Deployment Checklist

- [ ] Migration 297 reviewed
- [ ] Migration 297 applied to production
- [ ] Verify RLS policies work for authenticated users
- [ ] Test trigger creates milestone on 5th order
- [ ] Test phone verification marks milestone
- [ ] Verify existing F42 gate still works
- [ ] Monitor log events for errors
- [ ] Check milestone counts in production

## Security Considerations

1. **RLS Enabled** - Users can only read their own milestones
2. **System-Managed** - Users cannot forge verification status
3. **Service Role Only** - Milestone creation requires admin client
4. **Trigger-Based** - Automatic creation on order completion
5. **Idempotent** - UNIQUE constraint prevents duplicates
6. **Non-Blocking** - Milestone marking failures don't block verification

## Performance

- **Trigger Impact** - Runs on every order status change
  - Fast query (indexed)
  - Conditional insert (only at threshold)
  - Non-blocking (async)
- **RPC Functions** - Indexed queries on orders/order_items
- **Milestone Queries** - Indexed on user_id and milestone_type

## Rollback Plan

If issues arise:

1. **Disable Trigger** - Drop `trg_check_verification_milestone`
2. **Keep Functions** - RPC functions are read-only, safe to keep
3. **Migration Rollback** - `DROP TABLE user_verification_milestones CASCADE`
4. **Code Rollback** - Remove `markMilestoneVerified` calls (non-breaking)

Existing F42 verification system continues to work independently.
