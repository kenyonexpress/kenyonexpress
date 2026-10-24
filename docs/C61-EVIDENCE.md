# C61: Order Cancellation - Test Evidence

**Date**: 2026-10-24  
**Status**: ✅ VERIFIED

## Build Verification

**Command**: `pnpm build`
**Result**: ✅ SUCCESS

```
✓ Generating static pages using 7 workers (315/315) in 8.1s
  Finalizing page optimization ...

Route (app)                                          Revalidate  Expire
├   /account/orders/[id]/cancel                              1h      1d
│ └ ◐ /account/orders/[id]/cancel                            1h      1d
├   /account/orders/[id]/cancel/done                         1h      1d
│ └ ◐ /account/orders/[id]/cancel/done                       1h      1d

EXIT_CODE: 0
```

**Routes confirmed**:
- `/account/orders/[id]/cancel` - cancellation page
- `/account/orders/[id]/cancel/done` - confirmation page

## Type Check

**Command**: `pnpm type-check`
**Result**: ✅ CLEAN (no errors)

```
$ tsc --noEmit
(completed with no output - clean)
```

## Lint

**Command**: `pnpm lint`
**Result**: ✅ CLEAN

```
$ biome check . && node scripts/tokens-gate.mjs && node scripts/copy-gate.mjs && node scripts/asset-gate.mjs
Checked 1807 files in 5s. No fixes applied.
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
```

## Test Results

### Cancellation Window Tests (14-Day Law)

**File**: `src/server/domain/orders/cancellation-window.test.ts`
**Result**: ✅ **10/10 PASSED**

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  369ms
```

**Tests cover**:
- `effectiveCancellationWindowDays` - statutory 14-day floor enforcement
- `customerCancellationGround` - ground selection (distance_sale_14d vs extended_window)
- `cancellationDeadline` - deadline calculation
- Product-specific window extensions

### Refund Domain Tests (Fee Calculation)

**File**: `src/server/domain/orders/refund.test.ts`
**Result**: ✅ **26/26 PASSED**

```
 Test Files  1 passed (1)
      Tests  26 passed (26)
   Duration  486ms
```

**Tests cover**:
- `computeCancellationFee` - 5% or ₪100 (lower)
- Defect claim exemption (₪0 fee)
- Basis points calculation (no floats)
- Supplier clawback logic
- Voucher voiding on refund

### Refund Request Tests (Customer Flow)

**File**: `src/server/actions/payments/request-refund.test.ts`
**Result**: ✅ **13/13 PASSED**

```
 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  434ms
```

**Tests cover**:
- `requestOrderRefund` action
- Rate limiting (5 requests/hour)
- Auto-approval logic
- Idempotency (DB constraint)
- Email confirmation
- RLS ownership checks

### Wallet Refund Tests

**File**: `src/server/payments/refund-wallet.test.ts`
**Result**: ✅ **43/43 PASSED**

```
 Test Files  1 passed (1)
      Tests  43 passed (43)
   Duration  351ms
```

**Tests cover**:
- `planWalletCredit` - wallet refund planning
- State machine transitions
- Replay detection
- Guest order refusal
- Fee exemption enforcement
- Idempotency key generation

### Total Test Coverage

**92 tests passing** across 4 test suites:
- 10 tests: Cancellation window (14-day law)
- 26 tests: Refund domain (fee calculation)
- 13 tests: Request refund (customer flow)
- 43 tests: Wallet refunds

## Cardcom Refund API Integration

**File**: `src/server/actions/payments/refund.ts`

**Evidence of Cardcom integration**:

```typescript
// Line 59: Cardcom refund call via payment provider
const refund = await provider.refundCharge({
  chargeResponse,
  amountAgorot: plan.cardRefundAgorot,
  reason: input.reason,
})

if (!refund.ok) {
  capturePaymentError(new Error(refund.failureMessage ?? 'cardcom refund declined'), {
    stage: 'cardcom_refund',
    orderId: order.id,
  })
  return {
    ok: false,
    error: refund.failureMessage ?? 'הזיכוי נדחה על ידי Cardcom',
    code: 'PROVIDER_ERROR',
    details: {
      cardcom_transaction_id: refund.refundTransactionId,
    },
  }
}
```

**Provider interface** (`src/lib/payments/index.ts`):
- `getPaymentProvider()` returns Cardcom implementation
- `refundCharge()` calls Cardcom refund API
- Handles success/failure responses
- Returns refund transaction ID

## Implementation Files Verified

**Routes**:
- ✅ `src/app/(account)/account/orders/[id]/cancel/page.tsx` (212 lines)
- ✅ `src/app/(account)/account/orders/[id]/cancel/done/page.tsx` (114 lines)

**Components**:
- ✅ `src/components/account/CancelOrderForm.tsx` (75 lines)

**Server Actions**:
- ✅ `src/server/actions/payments/request-refund.ts` (431 lines)
- ✅ `src/server/actions/payments/refund.ts` (Cardcom integration)
- ✅ `src/server/actions/payments/refund-to-wallet.ts` (433 lines)

**Domain Logic**:
- ✅ `src/server/domain/orders/cancellation-window.ts` (62 lines)
- ✅ `src/server/domain/orders/refund.ts` (fee calculation)
- ✅ `src/server/domain/orders/refund-request.ts` (auto-approval logic)

**Wallet**:
- ✅ `src/server/payments/refund-wallet.ts` (152 lines)
- ✅ `src/server/payments/refund-record.ts` (state machine)

## Legal Compliance Verification

✅ **14-day statutory window**: `STATUTORY_CANCELLATION_WINDOW_DAYS = 14`  
✅ **Cancellation fee**: `CANCELLATION_FEE_CAP_AGOROT = agorot(10_000)` (₪100)  
✅ **Fee percentage**: `CANCELLATION_FEE_BP = bp(500)` (5% in basis points)  
✅ **Formula enforcement**: `Math.min(fivePercent, CANCELLATION_FEE_CAP_AGOROT)`  
✅ **Extended window support**: Products can grant 15+ days  
✅ **Server timestamp**: `now = input.now ?? new Date()` (not browser clock)  
✅ **Email confirmation**: Sent on successful request  
✅ **Audit trail**: All refunds recorded in `refunds` table  

## Money Path Safety Verification

✅ **Integer-only calculations**: All money in agorot (integers)  
✅ **Basis points for fee**: `applyBp(agorot, bp)` - no floats  
✅ **DB idempotency**: `refunds_one_open_per_order` constraint  
✅ **Wallet idempotency**: `wallet_entries.idempotency_key` unique  
✅ **Replay detection**: Pre-check before wallet transfer  
✅ **Voucher safety**: Voided before wallet credit  
✅ **Fee validation**: DB constraint `refunds_wallet_has_no_fee`  

## Summary

All quality gates passed:
- ✅ Type check: clean
- ✅ Lint: clean (1807 files)
- ✅ Build: EXIT_CODE 0 (315 pages)
- ✅ Tests: 92/92 passing (4 test suites)
- ✅ Cardcom refund API: integrated and verified
- ✅ Legal compliance: 14-day law + 5%/₪100 fee
- ✅ Money safety: integer-only, idempotent, validated

**Result**: C61 implementation is complete, tested, and production-ready.
