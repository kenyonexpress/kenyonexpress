# Manual Actions - Items Only Ofir Can Complete

**Last Updated:** 2026-10-25  
**Status:** Pre-Launch & Post-Launch Milestones

These actions require account access, credentials, business verification, or legal decisions that only Ofir can make. Everything else is handled autonomously by the autopilot system.

**See also:** LAUNCH-CHECKLIST.md for full launch readiness status

---

## Pre-Launch (Required Before Going Live)

### 1. Cardcom Production Credentials

**When:** Before first real payment  
**Time:** ~30 minutes (includes Cardcom phone call)  
**Priority:** 🔴 CRITICAL - Blocks all real payments

**Steps:**

1. **Contact Cardcom** to obtain production terminal credentials:
   - Terminal Number (`CARDCOM_TERMINAL_NUMBER`)
   - API Username (`CARDCOM_API_NAME`)
   - API Password (`CARDCOM_API_PASSWORD`)  
   - Webhook Secret (`CARDCOM_WEBHOOK_SECRET`)

2. **Set environment variables in Vercel:**
   ```bash
   # Navigate to: Vercel Dashboard > Project > Settings > Environment Variables
   # Add for PRODUCTION environment:
   CARDCOM_TERMINAL_NUMBER=<value>
   CARDCOM_API_NAME=<value>
   CARDCOM_API_PASSWORD=<value>
   CARDCOM_WEBHOOK_SECRET=<value>
   
   # Switch from mock to real payments:
   CARDCOM_USE_MOCK=false
   
   # Enable checkout (ONLY after testing on vercel.app):
   CHECKOUT_ENABLED=true
   ```

3. **Configure webhook endpoint in Cardcom dashboard:**
   - URL: `https://www.kenyonexpress.co.il/api/webhooks/cardcom`
   - Method: POST
   - Events: All payment events
   - See: docs/ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md for full details

4. **Test on vercel.app FIRST:**
   - Make one real test payment on `*.vercel.app` domain
   - Verify order created, payment processed, invoice generated
   - Request full refund to test refund flow
   - Verify voucher + email received
   - ONLY AFTER SUCCESS: proceed to DNS cutover (item 2)

5. **Redeploy:**
   ```bash
   vercel --prod
   ```

**Verification:**
- Test payment succeeds on production domain
- Webhook events logged in Vercel logs
- Order appears in admin panel with "paid" status

---

### 2. Resend API Configuration

**When:** Before sending transactional emails  
**Time:** ~10 minutes  
**Priority:** ⚠️  HIGH - Blocks order confirmations, OTP codes

**Steps:**

1. **Create/verify Resend account:**
   - Visit: https://resend.com
   - Log in or create account

2. **Verify domain ownership:**
   - Add domain: kenyonexpress.co.il
   - Configure DNS records (DKIM, SPF, DMARC)
   - Wait for verification (can take 24-48 hours)
   - Verify records are green/verified in Resend dashboard

3. **Generate production API key:**
   - Navigate to: API Keys section
   - Create new key with name "Production - Kenyon Express"
   - Copy key (shown only once!)

4. **Set in Vercel:**
   ```bash
   # Vercel Dashboard > Settings > Environment Variables
   RESEND_API_KEY=<your-key-here>
   # Environment: Production
   ```

5. **Test email sending:**
   - Trigger a test order confirmation
   - Check Resend logs for delivery
   - Verify email arrives and renders correctly

**Verification:**
- DKIM/SPF/DMARC records all green in Resend dashboard
- Test email delivered successfully
- Check spam score (should be low)

**Note:** Current `RESEND_API_KEY` returns 400 errors (invalid/expired).

---

### 3. DNS Cutover

**When:** ONLY AFTER successful test payment on vercel.app  
**Time:** ~30 minutes + DNS propagation (up to 48 hours)  
**Priority:** ⚠️  HIGH - Makes site live on production domain

**Prerequisites:**
- ✅ Cardcom credentials configured and tested
- ✅ At least one successful real payment on *.vercel.app
- ✅ All critical environment variables set
- ✅ Resend configured (or accept that emails won't deliver immediately)

**Steps:**

1. **Lower TTL (24-48 hours before cutover):**
   - Current DNS provider: Check registrar
   - Set TTL to 300 seconds (5 minutes) for all records
   - Wait for TTL to expire before proceeding

2. **Get Vercel DNS requirements:**
   ```bash
   vercel domains inspect kenyonexpress.co.il
   ```

3. **Update DNS records at registrar:**
   - A record: kenyonexpress.co.il → 76.76.21.21 (or Vercel's current IP)
   - CNAME record: www.kenyonexpress.co.il → cname.vercel-dns.com
   - Or follow specific instructions from `vercel domains` command

4. **Monitor propagation:**
   ```bash
   # Check DNS resolution
   dig +short www.kenyonexpress.co.il
   dig +short kenyonexpress.co.il
   
   # Should return Vercel IPs (216.150.x.x range currently)
   ```

5. **Verify SSL certificate:**
   - Vercel auto-provisions Let's Encrypt certificate
   - Check: https://www.kenyonexpress.co.il
   - Should show valid certificate, no warnings

6. **Test production:**
   - Browse site on production domain
   - Test checkout flow end-to-end
   - Verify all features working

**Rollback plan:**
- Revert DNS records to old values
- Wait for TTL expiration

**See also:** docs/DNS-CUTOVER-PLAN.md (if exists)

---

### 4. Supabase Access & Migrations

**When:** Before launch (some migrations may be critical for security)  
**Time:** ~20 minutes + review time  
**Priority:** ⚠️  MEDIUM - Some features may not work without migrations

**Current State:**
- Applied: Migrations 298, 299, 305 (RLS + voucher_qr_url)
- Pending: Unknown count in migrations/pending/
- **Migration 297:** RLS on order_items (HIGH PRIORITY - order details exposed to anon without this)

**Steps:**

1. **Authenticate Supabase MCP:**
   - Option A: OAuth in interactive Claude session
   - Option B: Update `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` with valid service role key

2. **Review pending migrations:**
   ```bash
   ls -la migrations/pending/
   ```
   
   Each migration file should have:
   - SQL file: `XXX_description.sql`
   - Preflight check: `preflight_XXX.sql` (verifies safe to apply)

3. **Apply migrations in order:**
   - **CRITICAL:** Migration 297 FIRST (order_items RLS)
   - Then others in sequence per migrations/pending/APPLY-ORDER.md (if exists)
   - Apply ONE AT A TIME
   - Verify each with preflight check first

4. **Verification:**
   ```bash
   # After all migrations applied:
   node scripts/check-rls-coverage.mjs  # Should show 127/127
   ```

**Important:**
- NEVER use `db push` (bypasses migration system)
- Always run preflight checks before applying
- Keep migration files in migrations/pending/ until applied
- Move to migrations/applied/ after successful application

**Service Role Key Rotation (Optional but Recommended):**
- Current key was previously exposed
- Generate new key in Supabase dashboard: Settings > API > Service Role
- Update in Vercel production environment
- Update in GitHub Secrets (if used in CI/CD)

---

### 5. Environment Variables Audit

**When:** Before launch  
**Time:** ~15 minutes  
**Priority:** ⚠️  HIGH - Missing vars cause feature failures

**Required Variables (Production):**

**Supabase:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://ixvwfbuvfxxsjiywhbbb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SECRET_KEY=<service-role-key>
```

**Cardcom (when available):**
```bash
CARDCOM_TERMINAL_NUMBER=<terminal>
CARDCOM_API_NAME=<api-username>
CARDCOM_API_PASSWORD=<api-password>
CARDCOM_WEBHOOK_SECRET=<webhook-secret>
CARDCOM_USE_MOCK=false
```

**Email:**
```bash
RESEND_API_KEY=<resend-key>
```

**Application:**
```bash
NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il
CRON_SECRET=<rotated-value>  # ✅ Already set (C70)
VOUCHER_QR_SECRET=<rotated-value>  # ✅ Already set (C70)
CHECKOUT_ENABLED=true  # Only after Cardcom configured!
MAINTENANCE_MODE=false  # ✅ Already set (F61)
```

**Optional (not blocking):**
```bash
SENTRY_AUTH_TOKEN=<sentry-token>  # For source maps
TURNSTILE_SECRET_KEY=<cloudflare-secret>  # For bot protection
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<cloudflare-site-key>
```

**Verification Command:**
```bash
vercel env ls production

# Check each critical variable is present
# Values are masked in output, but presence confirmed
```

---

### 6. Cloudflare Turnstile (Optional, Recommended)

**When:** Before launch or shortly after  
**Time:** ~10 minutes  
**Priority:** ℹ️  LOW - Adds bot protection to checkout

**Steps:**

1. **Create Turnstile site:**
   - Visit: https://dash.cloudflare.com
   - Navigate to: Turnstile
   - Create new site:
     - Domain: kenyonexpress.co.il
     - Mode: Managed (recommended)

2. **Get credentials:**
   - Site Key (public)
   - Secret Key (private)

3. **Set in Vercel:**
   ```bash
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site-key>
   TURNSTILE_SECRET_KEY=<secret-key>
   ```

4. **Verify:**
   - Visit /checkout
   - Should see Turnstile challenge
   - Complete checkout to verify verification works

**See also:** docs/C56-TURNSTILE-SETUP.md (if exists)

---

## Post-Launch (Milestone-Based)

These actions are triggered by business milestones after launch. No immediate action needed.

### 7. Meta Business Verification

**When:** After first successful sale  
**Time:** 1-2 hours (plus Meta review time: 3-5 business days)  
**Priority:** ℹ️  Enables Facebook/Instagram ads, Pixel, Conversions API

**Prerequisites:**
- At least one completed order in production
- Business bank account
- Business license/registration documents

**Steps:**

1. **Create Meta Business Account:**
   - Visit: https://business.facebook.com
   - Create new business: "Kenyon Express" or legal entity name

2. **Submit for verification:**
   - Upload business documents:
     - Business registration (when available - see item 10)
     - Proof of address
     - Tax ID/VAT number (033798513 - existing)
   - Wait for Meta review (3-5 business days)

3. **After verification approved:**
   - Install Meta Pixel on site
   - Configure Conversions API
   - Set up Facebook/Instagram shop (if desired)

**Reference:** https://www.facebook.com/business/help/159334372093366

---

### 8. Lawyer Review - Terms & Contracts

**When:** After 10 orders  
**Time:** 2-4 hours lawyer time + your review time  
**Priority:** ℹ️  Legal protection, compliance verification

**Scope:**
- Terms of Service (/terms)
- Privacy Policy (/privacy)
- Returns Policy (/returns)
- Supplier Agreement (if not already drafted)
- User Agreement
- Compliance with Israeli consumer protection law

**Current State:**
- Basic terms implemented
- Include 18+ requirement per Israeli law
- Tel Aviv jurisdiction specified
- 14-day cooling-off period per law

**Action:**
- Hire Israeli commercial lawyer with e-commerce experience
- Provide access to all legal pages
- Request review for:
  - Consumer protection compliance
  - Data protection/privacy (Israeli Privacy Law)
  - Liability limitations
  - Dispute resolution procedures
  - Supplier/marketplace provisions

**Budget:** ₪2,000-5,000 for initial review

---

### 9. Native App Evaluation

**When:** After 50 orders  
**Time:** Research: 1 week, Development: 2-3 months if proceeding  
**Priority:** ℹ️  Expansion option, not required

**Evaluation Criteria:**
- Mobile web vs. native app engagement metrics
- Customer requests for app
- Budget available for development
- Maintenance capacity

**Questions to Answer:**
1. What % of traffic is mobile?
2. Are users abandoning due to lack of app?
3. What features would app enable that web can't?
   - Push notifications (already have Web Push!)
   - Offline mode
   - Better camera integration (QR scanning)
   - App Store presence

**Options if proceeding:**
- React Native (shares code with web)
- Flutter
- Native iOS + Android (expensive, harder to maintain)
- Progressive Web App (already have this!)

**Recommendation:** Measure PWA performance first before committing to native app development.

---

### 10. Business Registration (bv'm Incorporation)

**When:** After 50 orders OR ₪100,000 in revenue (whichever comes first)  
**Time:** 2-3 weeks (includes accountant, registration, setup)  
**Priority:** ℹ️  Legal structure, tax optimization

**Current State:**
- Trading as: קניון אקספרס
- Tax ID: 033798513 (מספר עוסק - dealer number, not ח.פ.)
- Legal entity: To be determined

**Why Incorporate:**
- Limited liability protection
- Professional credibility
- Easier to work with suppliers
- Tax benefits (if structured correctly)
- Easier to raise funding later (if needed)

**Steps:**

1. **Choose entity type:**
   - B.V.M. (חברה בע"מ - Private Limited Company) - most common
   - Other options: עוסק פטור, שותפות, עוסק מורשה
   - Consult with accountant on best structure for your situation

2. **Engage accountant + lawyer:**
   - Accountant: for ongoing tax, bookkeeping, payroll
   - Lawyer: for incorporation, articles of association
   - Budget: ₪5,000-10,000 setup + ongoing monthly fees

3. **Register with authorities:**
   - רשם החברות (Companies Registrar)
   - מע"מ (VAT) if revenue exceeds threshold
   - ביטוח לאומי (National Insurance)

4. **Update business details:**
   - Bank account (business account)
   - All legal pages on site
   - Invoices/receipts
   - Supplier contracts
   - Terms of service

**Estimated Cost:** ₪10,000-15,000 (setup) + ₪1,500-3,000/month (ongoing)

**Trigger:** 50 orders OR ₪100,000 revenue (monitor in admin dashboard)

---

## Optional - Performance & Monitoring

### 11. Sentry Source Maps

**When:** After launch (non-blocking)  
**Time:** 5 minutes  
**Priority:** ℹ️  Better error debugging

**Current:** Placeholder token, builds fail source map upload but proceed

**Steps:**
1. Create Sentry account: https://sentry.io
2. Create new project: "Kenyon Express"
3. Generate auth token with `project:releases` scope
4. Set in Vercel:
   ```bash
   SENTRY_AUTH_TOKEN=<token>
   ```
5. Verify next build uploads source maps successfully

---

### 12. R2 Asset Upload (Cloudflare R2)

**When:** After launch (non-blocking)  
**Time:** 10 minutes setup + upload time  
**Priority:** ℹ️  CDN for images, faster load times

**Current:** 375 assets ready for upload, no credentials set

**Steps:**
1. Create R2 bucket in Cloudflare dashboard
2. Generate API credentials (Access Key ID + Secret)
3. Set in GitHub Secrets (for CI/CD automation):
   ```bash
   R2_ACCESS_KEY_ID=<key>
   R2_SECRET_ACCESS_KEY=<secret>
   ```
4. Workflow will automatically upload assets on next commit

---

## Emergency Contacts & Resources

**Vercel Support:**
- Dashboard: https://vercel.com/dashboard
- Docs: https://vercel.com/docs
- Status: https://www.vercel-status.com

**Supabase Support:**
- Dashboard: https://app.supabase.com
- Docs: https://supabase.com/docs
- Status: https://status.supabase.com

**Cardcom Support:**
- Phone: [Contact Cardcom for support number]
- Portal: [Cardcom merchant portal URL]

**Resend Support:**
- Dashboard: https://resend.com/overview
- Docs: https://resend.com/docs
- Status: https://resend.com/status

**Project Documentation:**
- Launch Checklist: docs/LAUNCH-CHECKLIST.md
- E2E Test Status: docs/E2E-STATUS.md
- RLS Coverage: docs/RLS-COVERAGE.md
- Architecture: docs/ARCHITECTURE-*.md

---

## Post-Action Verification

After completing pre-launch items, run these checks:

```bash
# 1. Health check
curl https://www.kenyonexpress.co.il/api/health
# Should return: {"status":"ok"}

# 2. Test checkout end-to-end
# - Add item to cart
# - Complete checkout with real payment
# - Verify order created
# - Verify email received
# - Request refund
# - Verify refund processed

# 3. Check error monitoring
# Visit Sentry dashboard (if configured)
# Verify no critical errors

# 4. Monitor logs
vercel logs --prod --follow
# Watch for any errors during first hours

# 5. Database integrity
node scripts/check-rls-coverage.mjs
# Should exit 0 (all tables protected)
```

---

**Last Updated:** 2026-10-25  
**Maintained By:** Autopilot system + Ofir
**Questions?** Check STATE.md for development log and decisions made autonomously.

---

## Summary Checklist

### Pre-Launch (Required):
- [ ] Cardcom production credentials configured
- [ ] Resend API configured with verified domain
- [ ] Vercel production environment variables complete
- [ ] Supabase migrations applied (especially 297 - RLS on order_items)
- [ ] Test payment on vercel.app succeeds
- [ ] DNS cutover completed
- [ ] Site accessible on www.kenyonexpress.co.il
- [ ] SSL certificate valid
- [ ] Health check passing

### Optional (Recommended):
- [ ] Cloudflare Turnstile configured
- [ ] Sentry source maps uploading
- [ ] R2 assets uploaded

### Post-Launch Milestones:
- [ ] After 1 sale: Meta Business Verification
- [ ] After 10 orders: Lawyer review
- [ ] After 50 orders: Native app evaluation
- [ ] After 50 orders OR ₪100K revenue: Incorporation (bv'm)

**Ready to launch?** Complete all pre-launch items, then proceed with LAUNCH-CHECKLIST.md verification commands.

## G116 launch gate — HOLD (2026-10-30)

No tag v2.1.0, no LAUNCH.flag, no hey LAUNCH.

| Check | Result |
|---|---|
| type-check | clean (0 errors) |
| lint | clean |
| build | passes |
| test | FAIL: 11 failed / 7106 passed (8 files: catalogue-cache-invalidation, migration-manifest, pending-migrations-inventory x3, operational-flags x2, discarded-read-inventory, log-coverage, auth-coverage, tokens) |

Items not DONE:
- G101 home parity: unmeasurable/over 11%
- G102 product parity: 54.22/41.81/26.23% vs 11%
- G103 /c/tel-aviv parity: 19.44/12.90/11.36% vs 11%
- G104 checkout: gate unmeasured; migration 312 pending/unapplied
- G105, G107, G110, G114: no DONE entry in claude/STATE.md
- G115 lighthouse: BLOCKED locked-component (layout.tsx), mobile perf 82-88

Also: migrations 164/312/314 unapplied (Supabase MCP unauthorized this session).
