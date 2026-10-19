# Production Secret Rotation Checklist — Q4 2026

**Purpose**: Complete the rotation of CRON_SECRET and VOUCHER_QR_SECRET to production after local testing.

**Date Rotated Locally**: 2026-10-18  
**Rotation Status**: Local ✅ | Production ⏳

---

## New Secret Values (Q4 2026)

```
CRON_SECRET (32-byte hex)
Location: .env.local (gitignored)
First deployed: [pending Vercel update]

VOUCHER_QR_SECRET (32-byte hex)  
Location: .env.local (gitignored)
First deployed: [pending Vercel update]
```

Note: Actual values stored only in `.env.local` (gitignored) and Vercel. Never committed to repository.

---

## Production Deployment Checklist

### Phase 1: Vercel Environment Variables

- [ ] **CRON_SECRET**: Update Vercel environment variables with new value
  - Dashboard: Settings → Environment Variables
  - Or CLI: `vercel env add CRON_SECRET`
  - Scope: Production environment
  
- [ ] **VOUCHER_QR_SECRET**: Update Vercel environment variables with new value
  - Dashboard: Settings → Environment Variables
  - Or CLI: `vercel env add VOUCHER_QR_SECRET`
  - Scope: Production environment

### Phase 2: Deployment & Verification

- [ ] Deploy to production (git push to deploy branch)
  - Trigger production build with new secrets
  - Monitor deployment for errors
  
- [ ] Verify cron routes authenticate correctly
  ```bash
  # Test health endpoint (public, unauthenticated read)
  curl -s https://<production-url>/api/health | jq
  
  # Test cron health endpoint (requires new CRON_SECRET)
  curl -s -H "Authorization: Bearer $NEW_CRON_SECRET" \
    https://<production-url>/api/cron/health | jq
  ```

- [ ] Verify QR code generation and redemption work
  - Generate new QR voucher on staging/production
  - Scan and redeem it to verify signature validation works
  
- [ ] Verify previous secret still works (grace period)
  - If using grace period for VOUCHER_QR_SECRET_PREVIOUS:
    - Old tokens should still verify
    - New tokens should use new secret

### Phase 3: Old Secret Retention (Optional)

- [ ] **Keep old CRON_SECRET** in Vercel for 24-48 hours (rollback window)
  - Document the old value location
  - Set reminder to remove after window closes
  
- [ ] **Keep old VOUCHER_QR_SECRET** via VOUCHER_QR_SECRET_PREVIOUS if grace period needed
  - Example: `VOUCHER_QR_SECRET_PREVIOUS=<old-value>`
  - Remove after 24-48 hours once in-flight tokens redeemed
  - Document removal date/time

### Phase 4: Cleanup & Documentation

- [ ] Remove old CRON_SECRET from Vercel (after rollback window)
  
- [ ] Remove old VOUCHER_QR_SECRET_PREVIOUS from Vercel (after grace period)
  
- [ ] Update `docs/QUARTERLY-ACCESS-REVIEW-2026Q4.md` with deployment date/time
  
- [ ] Update `docs/SECRET-ROTATION-2026Q4.md` with production completion status
  
- [ ] Close this checklist ticket once complete

---

## Rollback Procedure

If production authentication fails after rotation:

1. **Immediate**: Revert Vercel environment variables to old secret values
   - Dashboard: Settings → Environment Variables → Edit
   - Or CLI: `vercel env rm CRON_SECRET && vercel env add CRON_SECRET <old-value>`

2. **Deploy**: Push a new build with reverted secrets
   - Verify deployment succeeds

3. **Verify**: Test health endpoint again
   ```bash
   curl -s -H "Authorization: Bearer $OLD_CRON_SECRET" \
     https://<production-url>/api/cron/health | jq
   ```

4. **Document**: Record rollback decision in this file with timestamp

---

## Monitoring & Alerts

After production deployment, monitor:

- [ ] Error rate in Sentry (check for 401/authentication errors)
- [ ] Cron job execution logs in Vercel Deployments
- [ ] QR redemption success rate in database
- [ ] Rate limit metrics (unchanged by rotation)

---

## Notes

- **CRON_SECRET** affects: Vercel cron routes, health endpoint, cache purge, search indexing
- **VOUCHER_QR_SECRET** affects: QR code signing, voucher verification, redemption
- Both secrets use timing-safe comparison (constant-time) to prevent timing attacks
- Rotation does not require code changes; secrets are read from environment at runtime

---

## Sign-Off

**Rotated by**: Claude Autopilot  
**Rotated on**: 2026-10-18 (local only)  
**Production deployment**: [TBD]  
**Completed**: [ ] Not yet
