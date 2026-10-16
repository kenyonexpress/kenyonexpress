# Supplier Voucher Redemption Flow

## Overview
Supplier redemption of customer vouchers uses a single client-facing route (`/redeem/[token]`) that handles the entire QR scanning and confirmation flow. No separate `/supplier/redeem` path exists; all supplier redemption goes through the shared `/redeem/[token]` route.

## Routes

### Frontend Route
- **Path**: `/redeem/[token]`
- **Location**: `src/app/redeem/[token]/page.tsx`
- **Purpose**: Server-side verification of QR token signature, rate limiting, session checks, and rendering the redemption UI
- **Type**: Server component (Suspense boundary with async body)

#### Server-Side Logic (page.tsx)
1. Rate limit check (60 scans/hour per IP)
2. QR token signature verification
3. Session check (redirect to `/login?next=/redeem/[token]` if not authenticated)
4. Voucher lookup via `getVoucherForRedemption(code, memberships)`
5. Pass voucher details to client component `RedeemConfirm`

### Client Component
- **Path**: `src/app/redeem/[token]/RedeemConfirm.tsx`
- **Purpose**: 2-tap confirmation UI with status badge, value display, and success/failure screens
- **Type**: Client component (`'use client'`)

#### UX/XD14 Requirements (XD14: Supplier redemption redesign)
- **Large status badge**: Shows "קופון תקף" (voucher valid) or "קופון לא תקף" (voucher invalid)
- **Large voucher value**: Display amount to collect in 5xl bold text
- **2-tap confirmation**: 
  - First tap: Arms the button (changes to "הקש שוב לאישור")
  - Second tap: Commits the redemption via POST
- **Success screen**: Shows checkmark and "הקופון הבא" button to return to `/scan`
- **Failure/Already-redeemed**: Shows warning and "הקופון הבא" button with timestamp if available
- **Idempotent handling**: On replay (already-redeemed), displays "כבר מומש DD/MM/YY HH:MM"
- **Mobile-optimized**: Full-width layout optimized for on-device scanning

### Backend API Route
- **Path**: `/api/supplier/vouchers/redeem`
- **Location**: `src/app/api/supplier/vouchers/redeem/route.ts`
- **Method**: POST
- **Purpose**: Execute the atomic voucher redemption via `redeem_voucher()` RPC
- **Authentication**: Identity-scoped client (uses `auth.uid()` inside RPC)

#### Request Body
```json
{
  "qr_payload": "KEV1.<body>.<HMAC-SHA256>",  // From QR, decoded
  "method": "camera",                         // camera or manual
  "idempotency_key": "redeem-<uuid>"          // Per-screen unique key
}
```

#### Response
```json
{
  "outcome": "success" | "already_redeemed" | "expired" | "cancelled" | "refunded" | "not_found",
  "message": "Hebrew message",
  "replayed": true,  // True if this was an idempotent replay
  "voucher": { ... },  // Only on success
  "redeemed_at": "ISO timestamp"  // On already_redeemed
}
```

#### Outcomes
- **200 success**: Voucher redeemed. Wallet pass expired, GA4 event tracked, supplier attribution stamped.
- **409 already_redeemed**: Voucher was already burned. Idempotency key replayed the stored response. No side effects.
- **409 expired**: Voucher expiry has passed (checked server-side after redemption)
- **409 cancelled**: Voucher was manually cancelled by admin/supplier
- **409 refunded**: Voucher was refunded to customer's wallet
- **404 not_found**: Voucher code not found or not owned by this supplier
- **429 rate_limited**: Supplier member exceeded 120 redemptions/hour per user
- **401 unauthorized**: No active supplier membership

## Data Model

### Tables Used
- `vouchers`: Core voucher record (code, status, face_value_agorot, coupon_price_agorot, expires_at)
- `voucher_redemptions`: Audit log (code, redeemed_at, staff_id, idempotency_key, scan_method, ip, user_agent)
- `supplier_members`: Membership verification (user_id, supplier_id, is_active)

### Database Functions
- **redeem_voucher()**: SECURITY DEFINER RPC that executes the atomic redemption
  - Verifies supplier membership via `auth.uid()`
  - Burns the voucher (sets status='redeemed', sets redeemed_at)
  - Writes voucher_redemptions audit row
  - Implements idempotency via idempotency_key

## Security Model

### Signature Verification
- QR token contains HMAC-SHA256 signature verified at page load
- Token format: `KEV1.<base64-encoded-payload>.<hex-signature>`
- Signature proves the QR was minted by the platform
- Not a bearer token or authorization credential

### RLS (Row-Level Security)
- Supplier can only see/redeem vouchers they own (via `supplier_vouchers` view)
- Platform can see all rows (via `is_platform_role` check inside RPC)
- Supplier's own redemptions are read-only (RLS blocks UPDATE)
- Staff attribution is stamped server-side via admin client after atomic redemption

## Rate Limits
- **Page load**: 60 scans/hour per IP (fails open if unavailable)
- **API endpoint**: 120 redemptions/hour per supplier member user (fails open)
- Both limits are generous (real till scans ~2-5 per minute in bursts)

## Testing

### Unit Tests
- `src/app/redeem/[token]/page.test.tsx`: Token verification, rate limits, session redirect, not-found handling

### Integration Tests
- `e2e/full-purchase-redeem.spec.ts`: End-to-end redemption flow from QR scan to success screen

### Manual Testing
- QR scanner app (e.g., open `/scan` on any supplier device)
- Print/display a voucher QR code
- Tap to scan and follow the 2-tap confirmation flow
- Verify "הקופון הבא" button returns to `/scan`
- Verify second scan of same QR shows "כבר מומש" with timestamp

## Related Documentation
- `ARCHITECTURE-VOUCHER-REDEMPTION.md`: Full security and design rationale
- `docs/VOUCHER-RLS.md`: RLS policy details
- `src/server/domain/vouchers/qr.ts`: QR payload format and HMAC verification
