# F64 Implementation Status

## Goal vs Architecture Mismatch

**Goal Specification:**
Apply rate limiting to API routes: `/api/auth/login`, `/api/auth/signup`, `/api/auth/forgot-password`, `/api/checkout`, `/api/contact`, `/api/supplier/apply`

**Actual Architecture:**
These user-facing flows are implemented as **Next.js Server Actions**, not API routes:
- Login/Signup/Password Reset: `src/server/actions/auth.ts`
- Checkout: `src/server/actions/payments/checkout.ts` 
- Contact: `src/server/actions/contact.ts`
- Supplier Apply: `src/server/actions/supplier-lead.ts`

## What Was Implemented

### 1. Rate Limit Policies Updated ✅
File: `src/lib/rate-limit/policies.ts`

| Function | Policy Key | Old Limit | New Limit | Status |
|----------|-----------|-----------|-----------|--------|
| Login | `login` | 10/hour | **5/15min** (900s) | ✅ |
| Signup | `signup` | 5/hour | **3/hour** | ✅ |
| Password Reset | `reset` | 5/hour | **3/hour** | ✅ |
| Password Reset (email) | `reset-address` | 5/hour | **3/hour** | ✅ |
| Checkout | `begin_checkout` | 10/min | **10/hour** (3600s) | ✅ |
| Contact | `contact` | 5/hour | **5/hour** (unchanged) | ✅ |
| Supplier Apply | `supplier-lead` | 5/hour | **2/24h** (86400s) | ✅ |

### 2. Server Actions Apply Policies ✅
All server actions already call `checkRateLimit()` with these policy names:
- `src/server/actions/auth.ts`: Uses `login`, `signup`, `reset`, `reset-address`
- `src/server/actions/payments/checkout.ts`: Uses `begin_checkout`  
- `src/server/actions/contact.ts`: Uses `contact`
- `src/server/actions/supplier-lead.ts`: Uses `supplier-lead`

### 3. Turnstile Integration ✅
**Server verification** (`src/lib/security/turnstile.ts`):
- Added warning log when `TURNSTILE_SECRET_KEY` missing
- Graceful degradation (returns true when not configured)

**Client widgets** (already present on all forms):
- Login: `src/app/(auth)/login/LoginForm.tsx:183`
- Signup: `src/app/(auth)/signup/SignupForm.tsx:127`
- Forgot Password: `src/app/(auth)/forgot-password/ForgotPasswordForm.tsx:48`
- Contact: `src/components/storefront/ContactForm.tsx`
- Supplier Apply: `src/components/storefront/SupplierLeadForm.tsx`

### 4. Documentation ✅
- `docs/TURNSTILE-SETUP.md` - Complete setup guide
- `.env.example` lines 568-578 - Environment variables

### 5. New Export Files ✅
- `src/lib/turnstile.ts` - Re-exports from security/turnstile.ts
- `src/components/Turnstile.tsx` - Re-exports TurnstileWidget

## What Was NOT Implemented

### API Routes Not Created
The following API routes **do not exist** and were **not created**:
- `/api/auth/login` ❌
- `/api/auth/signup` ❌  
- `/api/auth/forgot-password` ❌
- `/api/checkout` ❌ (only `/api/checkout/phone-otp/*` exists)
- `/api/contact` ❌
- `/api/supplier/apply` ❌ (only `/api/supplier-apply/card-verify` exists)

**Why:** The application architecture uses Server Actions for form submissions, not API routes. Creating API routes would duplicate existing functionality without adding value.

### Upstash Wrapper Not Created
The goal mentions "Upstash rate limiter wrapper src/lib/rate-limit.ts" but this file already existed as a re-export module. The actual Upstash implementation is in `src/lib/rate-limit/limiter.ts` (pre-existing).

## Verification

```bash
✓ pnpm type-check  # Pass
✓ pnpm lint        # Pass  
✓ pnpm test        # 7/7 tests pass
✓ pnpm build       # Success
```

## Commit

```
commit a21d4f52e
F64 rate limiting + Turnstile
[Missing [autopilot] prefix]
```

## Conclusion

**Rate limiting** is fully functional at the specified limits via the updated policies.
**Turnstile** is fully integrated with logging when ENV missing.
**API routes** at the specified paths do not exist because the app uses Server Actions architecture.

To apply rate limiting at the API route layer would require either:
1. Creating new API routes that duplicate Server Action functionality
2. Or refactoring the entire auth/checkout/contact flow to use API routes

Neither approach is architecturally sound given the existing Server Actions implementation.
