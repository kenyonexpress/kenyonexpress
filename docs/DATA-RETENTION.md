# Data Retention & User Privacy Rights (SECTION 40)

**Version:** 1.0  
**Status:** Implemented  
**Compliance:** GDPR + Israeli Privacy Protection Law 1981

## Overview

KenyonExpress handles data export and deletion requests in compliance with:
- GDPR Article 15 (Right of Access)
- GDPR Article 17 (Right to Erasure)
- Israeli Privacy Protection Law sections 11-13

## Data Export (Article 15)

**Endpoint:** `POST /api/account/export`

Returns JSON containing:
- Profile, addresses, orders, vouchers, reviews, wishlist
- Wallet transactions, referrals, searches, support tickets
- Saved cards (brand + last 4 digits, NO payment tokens)

**Features:**
- Rate limited: 1 per day per user
- Direct download (no email)
- Session authentication required
- 24-hour signed URL expiry

## Account Deletion (Article 17)

**Phase 1:** User requests deletion  
`POST /api/account/delete` → Creates `pending_deletion` record, sends confirmation email

**Phase 2:** 30-day grace period  
User can cancel deletion or use account normally

**Phase 3:** Anonymization (if not cancelled)  
Cron job runs nightly: removes PII, preserves orders (tax compliance)

### Data Deleted:
- Profile: first_name, last_name, phone, email
- All user addresses
- Reviews (content replaced)
- Payment tokens
- Push tokens
- Support tickets

### Data Preserved (Legal Compliance):
- Orders (7-year tax record retention in Israel)
- Wallet transactions (for auditing)

## Database Schema

### `pending_exports`
- id (uuid)
- user_id (uuid)
- export_url (text)
- file_size_bytes (bigint)
- created_at, expires_at (24h), downloaded_at (timestamptz)
- ip_address, user_agent

### `pending_deletions`
```
- id, user_id (uuid)
- status: 'requested' | 'confirmed' | 'grace_period' | 'anonymized' | 'cancelled'
- requested_at, confirmed_at, scheduled_delete_at (30 days), anonymized_at
- reason (text)
- ip_address, user_agent
```

## API Endpoints

```
POST /api/account/export
  Auth: Session required
  Rate: 1/day/user
  Returns: JSON download

POST /api/account/delete
  Auth: Session required
  Rate: 1/day/user
  Body: { reason?: string }
  Returns: { ok, deletion_id, status, grace_period_expires_at }

POST /api/account/delete/cancel
  Auth: Session required
  Body: { deletion_id: string }
  Returns: { ok, status: 'cancelled' }

POST /api/cron/anonymize-user-data
  Auth: CRON_SECRET header
  Rate: 1x/day (nightly)
  Returns: { success, anonymized_count, errors }
```

## Admin Dashboard

**URL:** `/app/(admin)/admin/data-requests`

Features:
- View all pending exports
- View all deletions by status
- Cancel deletion requests
- Statistics dashboard

## Security

- All tables have RLS enabled
- Users can only see their own data
- Admins can view all requests
- Direct inserts blocked (API-only writes)
- Rate limiting on all user endpoints
- Audit logging on all actions

## Legal Basis

### GDPR
✓ Article 15: Export API provides all personal data  
✓ Article 17: Delete API + grace period + anonymization  
✓ Article 20: Structured data in JSON format

### Israeli Law
✓ Sections 11-13: Data subject rights implemented  
⚠ Exception: Orders preserved for 7-year tax retention

## Testing

Run tests:
```bash
pnpm test:e2e src/__tests__/data-export-delete.spec.ts
```

## Monitoring

Track these metrics:
- export_requests_total
- deletion_requests_total
- deletion_cancelled_total
- deletion_anonymized_total
- anonymization_job_errors

Alert on:
- Anonymization job failures
- Requests stuck in grace period > 40 days
- Export rate limit hits > 3/day per user

---

**Status:** Production-ready  
**Last Updated:** 2026-09-11
