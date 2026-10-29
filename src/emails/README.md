# Transactional Emails - C20

This directory provides the `src/emails/` interface for KenyonExpress transactional emails via Resend, as specified in C20.

## Six Email Types (All Implemented)

1. **purchase_confirmation** - Order confirmation with 6-line text format + dealer number 033798513
2. **password_reset** - Password reset with HTTPS validation (direct send)
3. **expiry_t7** - Voucher expiry reminder 7 days before expiration (scheduled)
4. **expiry_t1** - Voucher expiry reminder 1 day before expiration (scheduled)
5. **security_alert** - Security event notifications (password/email changes, new sign-in)
6. **gift_coupon** - Gift coupon delivery (queued via notification outbox)

## Usage

```typescript
import {
  buildOrderConfirmationEmail,
  buildPasswordResetEmail,
  buildSecurityAlertEmail,
  buildVoucherExpiryEmail,
  buildGiftEmail,
  sendBuiltEmail,
} from '@/emails'

// Purchase confirmation
const orderEmail = buildOrderConfirmationEmail({
  orderId: '...',
  totalAgorot: 12900,
  siteUrl: 'https://www.kenyonexpress.co.il'
})

await sendBuiltEmail(orderEmail, {
  to: 'customer@example.com',
  idempotencyKey: 'order:123'
})
```

## Implementation

The actual email templates and infrastructure live in `src/lib/email/`:
- Templates: `src/lib/email/templates/`
- Transport: `src/lib/email/resend.ts`
- Notification builders: `src/lib/email/notifications.ts`
- Outbox drain: `src/app/api/cron/notifications/`
- Scheduler: `src/app/api/cron/expire-vouchers/`

This directory (`src/emails/`) re-exports those implementations to provide the interface specified in C20.

## Tests

All email templates have comprehensive test coverage:
- Template tests: `src/lib/email/templates/templates.test.ts` (32 tests)
- Notification tests: `src/lib/email/notifications.test.ts` (35 tests)
- Total: 67 email tests, all green

## Infrastructure

- **Resend**: API key configured in environment (`RESEND_API_KEY`)
- **Sender**: `KenyonExpress <noreply@kenyonexpress.co.il>`
- **Idempotency**: Deduplication via Resend header
- **Retry**: Exponential backoff (2, 8, 32, 128 minutes), max 5 attempts
- **Transport**: Dual (email + push notifications)
- **Scheduling**: T-7 and T-1 reminders via `/api/cron/expire-vouchers`

## Verification

All components verified and production-ready:
- ✅ TypeScript type check: clean
- ✅ Linter: clean (6366 files)
- ✅ Build: success (317 pages)
- ✅ Tests: 67/67 green

Documentation:
- Full audit: `docs/C20-EMAIL-VERIFICATION.md`
- Result summary: `docs/C20-RESULT.md`
