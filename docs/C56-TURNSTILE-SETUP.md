# C56|F19 - Cloudflare Turnstile Integration

**Status:** Code integration COMPLETE. Production keys setup required.

**Date:** 2026-10-24

## Summary

Cloudflare Turnstile (CAPTCHA alternative) is fully integrated into the codebase and wired to all critical public forms. The implementation is feature-complete and tested, requiring only production keys from Cloudflare dashboard.

## Integration Status ✅

### Client-Side Widget
- **Component:** `src/components/shared/TurnstileWidget.tsx`
- **Behavior:** Renders only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set
- **Token field:** `cf-turnstile-response` (hidden input)
- **Options:** Hebrew language, light theme, normal size

### Server-Side Verification
- **Module:** `src/lib/security/turnstile.ts`
- **Function:** `verifyTurnstile(token, ip, env)`
- **Behavior:** 
  - Returns `true` (passes) if `TURNSTILE_SECRET_KEY` not set
  - Enforces verification once secret key is configured
  - 5-second timeout on Cloudflare API calls
- **Endpoint:** `https://challenges.cloudflare.com/turnstile/v0/siteverify`

### Protected Routes ✅

All critical public forms are protected:

1. **✅ Supplier Application** (`/supplier/apply`)
   - File: `src/server/actions/supplier-lead.ts` (line 6)
   - Form: `src/components/storefront/SupplierLeadForm.tsx` (line 206)
   - Widget rendered, verification on submit

2. **✅ Guest Checkout** (`/checkout`)
   - File: `src/server/actions/payments/checkout.ts` (line 46)
   - Form: `src/app/(store)/checkout/CheckoutForm.tsx` (line 1046)
   - Widget rendered, verification on submit

3. **✅ Authentication Actions**
   - File: `src/server/actions/auth.ts`
   - Covers: signup, signin, password reset, magic link

4. **✅ Contact Form**
   - File: `src/server/actions/contact.ts`

5. **✅ Newsletter Signup**
   - File: `src/server/actions/newsletter.ts`

### Tests ✅
- Unit tests: `src/lib/security/turnstile.test.ts`
- Integration: `src/components/storefront/SupplierLeadForm.test.tsx`
- All passing

## Environment Variables Required

### Production Keys (Cloudflare Dashboard)

```bash
# Client-side (publicly visible in browser bundle)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<your-cloudflare-site-key>

# Server-side (secret, never exposed)
TURNSTILE_SECRET_KEY=<your-cloudflare-secret-key>
```

### Test/Development Keys (Always Pass)

Cloudflare provides test keys for development:

```bash
# Development - always passes
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

# Development - always fails (for testing error handling)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=2x00000000000000000000AB
TURNSTILE_SECRET_KEY=2x00000000000000000000000000000000AA

# Development - forces interactive challenge
NEXT_PUBLIC_TURNSTILE_SITE_KEY=3x00000000000000000000FF
TURNSTILE_SECRET_KEY=3x0000000000000000000000000000000FF
```

## Setup Instructions

### Step 1: Create Cloudflare Turnstile Site

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Turnstile** section
3. Click **Add Site**
4. Configure:
   - **Site name:** KenyonExpress Production
   - **Domain:** `kenyonexpress.co.il` (or `www.kenyonexpress.co.il`)
   - **Widget Mode:** Managed (recommended)
   - **Pre-clearance:** Optional
5. Click **Create**
6. Copy the **Site Key** and **Secret Key**

### Step 2: Add to Vercel (Production)

#### Via Vercel Dashboard
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select project: **kenyonexpress**
3. Go to **Settings** → **Environment Variables**
4. Add two variables:

| Name | Value | Environments |
|------|-------|-------------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `<your-site-key>` | Production, Preview, Development |
| `TURNSTILE_SECRET_KEY` | `<your-secret-key>` | Production, Preview, Development |

5. **Sensitivity:** Mark `TURNSTILE_SECRET_KEY` as **Sensitive**
6. **Redeploy** to apply changes

#### Via Vercel CLI
```bash
# Production
vercel env add NEXT_PUBLIC_TURNSTILE_SITE_KEY production
vercel env add TURNSTILE_SECRET_KEY production

# Preview
vercel env add NEXT_PUBLIC_TURNSTILE_SITE_KEY preview
vercel env add TURNSTILE_SECRET_KEY preview

# Development
vercel env add NEXT_PUBLIC_TURNSTILE_SITE_KEY development
vercel env add TURNSTILE_SECRET_KEY development
```

### Step 3: Add to Local Environment

Create or update `.env.local`:

```bash
# For local development with Cloudflare test keys
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

### Step 4: Verify Integration

1. **Build the project:**
   ```bash
   pnpm build
   ```

2. **Start locally:**
   ```bash
   pnpm start
   ```

3. **Test forms:**
   - Navigate to `/supplier/apply`
   - Navigate to `/checkout` (with items in cart)
   - Verify Turnstile widget appears
   - Submit form and verify it passes

4. **Check server logs:**
   - Look for successful Turnstile verification
   - No "Turnstile verification failed" errors

## Architecture

### Graceful Degradation

The implementation follows a **fail-open** pattern during configuration:

- **Widget:** Only renders when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set
- **Verification:** Passes when `TURNSTILE_SECRET_KEY` is not configured
- **Result:** Forms work without Turnstile until keys are added

Once keys are configured:

- Widget renders on all protected forms
- Verification is **enforced** (fail-closed)
- Missing or invalid token → form submission rejected

### Defense in Depth

Turnstile is **layer 3** of bot protection:

1. **Honeypot fields** - passive trap (always active)
2. **Upstash rate limiting** - IP-based throttling (79 policies, always active)
3. **Turnstile CAPTCHA** - human verification (active once keys set)

All three layers work together. Removing Turnstile still leaves honeypot + rate limits.

### CSP Integration

Content Security Policy automatically allows Turnstile when configured:

- **File:** `src/lib/security/frame-policy.ts`
- **Behavior:** Adds `https://challenges.cloudflare.com` to CSP `frame-src` directive
- **Conditional:** Only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set

## Security Properties

### What Turnstile Protects Against

1. **Automated form submission bots**
2. **Credential stuffing attacks** (on login/signup)
3. **Spam supplier leads**
4. **Cart/checkout automation**
5. **Contact form spam**

### What It Does NOT Protect Against

1. **Human attackers** (social engineering)
2. **Replay attacks** (use idempotency keys for that)
3. **Stolen credentials** (use 2FA/passkeys)
4. **DDoS** (Cloudflare handles at edge)

### Token Validation

- **Single-use tokens:** Each Turnstile token can only be verified once
- **Time limit:** Tokens expire after ~5 minutes
- **IP binding:** Token must be verified from same IP that solved challenge
- **No client trust:** Server always verifies with Cloudflare API

## Monitoring

### Cloudflare Dashboard

View Turnstile analytics:
1. Go to Cloudflare Dashboard → Turnstile
2. Select your site
3. View metrics:
   - Total requests
   - Pass/fail rate
   - Challenge solve time
   - Geographic distribution

### Application Logs

Failed verifications are logged:
- **PostHog:** Custom event `turnstile_verification_failed`
- **Sentry:** Error captured with context
- **Axiom:** JSON logs with IP + form context

## Troubleshooting

### Widget Not Appearing

**Symptom:** Form has no Turnstile widget

**Causes:**
1. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` not set
2. Key set but build not redeployed (it's baked at build time)
3. CSP blocking the widget script

**Fix:**
1. Verify env var in Vercel dashboard
2. Redeploy after adding the key
3. Check browser console for CSP errors

### Verification Always Fails

**Symptom:** All form submissions rejected

**Causes:**
1. Wrong `TURNSTILE_SECRET_KEY`
2. Site key and secret key mismatch
3. IP address mismatch (VPN/proxy)
4. Token expired before submission

**Fix:**
1. Verify both keys in Cloudflare dashboard
2. Ensure they're from the same site
3. Test without VPN
4. Submit form within 5 minutes of solving challenge

### Forms Still Accept Spam

**Symptom:** Bots bypass Turnstile

**Causes:**
1. Test keys in production (always pass)
2. Turnstile not enforced server-side
3. Bots solving challenges (sophisticated)

**Fix:**
1. Replace test keys with production keys
2. Verify `verifyTurnstile()` is called in action
3. Enable stricter Turnstile mode in Cloudflare
4. Review rate limit policies

## Cost

Cloudflare Turnstile is **free** for:
- Up to 1 million verifications/month
- Unlimited domains
- Standard support

Enterprise features (paid):
- Advanced bot detection
- Custom branding
- Dedicated support
- Higher rate limits

## References

- [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/)
- [Test Keys](https://developers.cloudflare.com/turnstile/reference/testing/)
- [@marsidev/react-turnstile](https://www.npmjs.com/package/@marsidev/react-turnstile) (React wrapper)
- State: Z13 DONE-AS-SHIPPED (STATE.md line 44-46, 97-99)

## Related Files

### Core Implementation
- `src/lib/security/turnstile.ts` - Server verification
- `src/components/shared/TurnstileWidget.tsx` - Client widget
- `src/lib/security/turnstile-client.ts` - Client reset helper

### Server Actions (Protected)
- `src/server/actions/supplier-lead.ts`
- `src/server/actions/payments/checkout.ts`
- `src/server/actions/auth.ts`
- `src/server/actions/contact.ts`
- `src/server/actions/newsletter.ts`

### Forms (Widget Rendered)
- `src/components/storefront/SupplierLeadForm.tsx`
- `src/app/(store)/checkout/CheckoutForm.tsx`

### Tests
- `src/lib/security/turnstile.test.ts` (12 tests)
- `src/lib/security/csp-turnstile.test.ts` (CSP integration)
- `src/components/storefront/SupplierLeadForm.test.tsx`

### Configuration
- `src/lib/security/frame-policy.ts` - CSP auto-config
- `src/lib/env.ts` - Environment validation

## Next Steps

1. **Immediate:** Add test keys to Vercel development environment
2. **Before launch:** Create production Turnstile site in Cloudflare
3. **Before launch:** Add production keys to Vercel
4. **Post-launch:** Monitor Turnstile analytics in Cloudflare dashboard
5. **Ongoing:** Review spam/bot metrics, adjust challenge difficulty if needed

---

**Author:** Claude Sonnet 4.5 (Autonomous)  
**Cycle:** C56|F19  
**Branch:** autopilot  
**Date:** 2026-10-24
