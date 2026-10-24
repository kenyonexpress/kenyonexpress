# C36: Security Hardening - Rate Limits, Turnstile, CSP, HSTS, Gitleaks

**Status:** COMPLETE (verified)  
**Date:** 2026-10-24

## Summary

C36 verified and documented comprehensive security hardening across five layers:

1. **Upstash rate limits** on auth, checkout, and supplier application paths
2. **Cloudflare Turnstile** CAPTCHA on public forms
3. **Content Security Policy (CSP)** headers
4. **HTTP Strict Transport Security (HSTS)** headers
5. **Gitleaks CI** secret scanning

All components were already implemented (F35 DONE-AS-SHIPPED, STATE.md:90). This task verified implementation completeness, ran quality gates, and created documentation.

## 1. Upstash Rate Limits

### Implementation

**Policy Table:** `src/lib/rate-limit/policies.ts`  
79 distinct rate limit policies across authentication, commerce, vouchers, and public endpoints.

### Coverage Verified

#### Authentication Paths
- **login:** 10 requests/hour per IP (password guessing)
- **login-account:** 20 requests/hour per account (rotating IP protection)
- **signup:** 5 requests/hour per IP (account flooding)
- **reset:** 5 requests/hour per IP (reset email)
- **magic:** 5 requests/hour per IP (magic-link email)
- **phone-otp:** 5 requests/hour per IP (SMS cost protection)
- **phone-otp-number:** 5 requests/hour per phone number (measured lockout vector)
- **wa-otp-send:** 5 requests/hour per phone, 20/hour per IP
- **wa-otp-verify:** 10 requests/hour per phone (code guessing)
- **passkey-register:** 20 requests/hour per user
- **passkey-auth:** 30 requests/10 minutes per IP

Applied in:
- `src/server/actions/auth.ts` (login, signup, reset)
- `src/app/api/auth/wa-otp/send/route.ts`
- `src/app/api/auth/wa-otp/verify/route.ts`
- `src/app/api/auth/passkey/register/route.ts`
- `src/app/api/auth/passkey/authenticate/route.ts`

#### Checkout Paths
- **checkout-otp-send:** 5 requests/hour per user, 20/hour per IP
- **checkout-otp-verify:** 10 requests/hour per user (code guessing)
- **begin_checkout:** 10 requests/minute (Cardcom low-profile creation)
- **cart_write:** 120 requests/hour per user or IP
- **verify-card:** 5 requests/hour per user (payment page creation)
- **verify-card-stub:** 20 requests/hour per user (stub endpoint, no charge)

Applied in:
- `src/app/api/checkout/phone-otp/send/route.ts`
- `src/app/api/checkout/phone-otp/verify/route.ts`
- `src/server/actions/payments/checkout.ts`

#### Supplier Application
- **supplier-lead:** 5 requests/hour per IP (sales pipeline)

Applied in:
- `src/server/actions/supplier-lead.ts` (line 93)

### Architecture

**Redis Key Format:** `rl:v1:<policy>:<identifier>`  
Versioned namespace prevents algorithm changes from breaking live counters.

**Postgres Fallback:** Same bucket keys as Redis for seamless failover.

**Key Derivation:** Policy name derives prefix automatically - prevents accidental bucket sharing across different limits.

**Identifier Types:**
- IP address for anonymous paths
- User ID for authenticated paths  
- Caller-supplied (email, phone) for specific policies

## 2. Cloudflare Turnstile

### Implementation

**Verification Module:** `src/lib/security/turnstile.ts`  
**Widget Field:** `cf-turnstile-response`

### Configuration

**Fail-Safe Design:** Passes when unconfigured, fails closed once `TURNSTILE_SECRET_KEY` is set.

```typescript
export function turnstileConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY)
}
```

### Coverage Verified

Applied to all public write forms:

1. **Contact form** (`src/server/actions/contact.ts`)
2. **Newsletter subscription** (`src/server/actions/newsletter.ts`)
3. **Supplier application** (`src/server/actions/supplier-lead.ts`)
4. **Auth flows** (`src/server/actions/auth.ts`):
   - Login
   - Signup
   - Password reset
   - Magic link
5. **Checkout** (`src/server/actions/payments/checkout.ts`)

### Verification Flow

1. Client renders invisible Turnstile widget with `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
2. Widget generates response token on form submit
3. Server verifies token against Cloudflare API with `TURNSTILE_SECRET_KEY`
4. 5-second timeout with fail-closed behavior
5. IP address passed for additional validation when available

## 3. Content Security Policy (CSP)

### Implementation

**Configuration:** `next.config.ts` headers()  
**Policy Builder:** `src/lib/security/frame-policy.ts`

### Policy Details

**Script Sources:**
- `'self'` - Same-origin scripts
- `'unsafe-inline'` - Required for Next.js (pending nonce migration)
- Supabase realtime domains

**Style Sources:**
- `'self'`
- `'unsafe-inline'` - Required for CSS-in-JS and Tailwind

**Image Sources:**
- `'self'`
- `data:` - Inline images (QR codes)
- Supabase storage
- Unsplash (placeholder images)
- Cloudflare R2 CDN

**Frame Sources:**
- `'self'` - Default deny
- **Exception:** Payment frame paths can be embedded by this origin only
  - `/checkout/frame-return`
  - `/checkout/app-return`

**Connect Sources:**
- `'self'`
- Supabase API and Realtime
- PostHog analytics
- Sentry error tracking

### Frame Protection Architecture

**Challenge:** CSP headers are static, but two checkout paths must be framable by Cardcom while everything else must not be.

**Solution:** Non-overlapping header sources in `next.config.ts`
- Default entry: strict `frame-ancestors 'none'` for all paths EXCEPT payment returns (regex negative lookahead)
- Framable entry: `frame-ancestors 'self'` ONLY for payment return paths

**Why Two Sources Work:** Next.js appends headers from matching entries. The negative lookahead prevents the default from matching payment paths, so each path gets exactly one CSP header.

**Enforcement:** Both `Content-Security-Policy` and `X-Frame-Options` move in step to support old browsers.

## 4. HTTP Strict Transport Security (HSTS)

### Implementation

**Header:** `Strict-Transport-Security: max-age=63072000; includeSubDomains`

### Policy Details

- **Duration:** 2 years (63,072,000 seconds)
- **Scope:** All subdomains
- **Preload:** REMOVED 2026-09-08 (see incident docs/incidents/2026-09-08-production-tls-down.md)

### Preload Removal Context

On 2026-09-08, apex and www answered "no peer certificate available" on :443 while HTTP redirected into the same dead endpoint. DNS was already pointed at Vercel.

**Risk:** Being on the preload list means browsers refuse plain HTTP BEFORE ever contacting the domain. Asking to be added while the certificate doesn't exist would lock out every new visitor permanently.

**Decision:** Removed `preload` directive. Header still hardens every browser that reaches us over TLS; it just no longer volunteers us for a list we cannot currently satisfy.

**Reinstatement Criteria:** Add `preload` back once the certificate has served cleanly for two weeks.

## 5. Gitleaks CI

### Implementation

**Workflow:** `.github/workflows/gitleaks.yml`

### Configuration

**Triggers:**
- Every push to `main` and `closeout/**` branches
- Every pull request

**Scan Scope:** New commits only (not whole history)  
Findings already in old history cannot block new work.

**Strategy:**
```bash
# First push of a branch has all-zero "before"
if [ -z "$BASE" ] || [ "$BASE" = "0000000000000000000000000000000000000000" ]; then
  RANGE="-1 $HEAD"
else
  RANGE="$BASE..$HEAD"
fi
```

**Tool:** `zricethezav/gitleaks:v8.18.4` via Docker  
**Flags:**
- `--redact` - Hide secrets in output
- `--no-banner` - Clean CI logs
- `--exit-code 1` - Fail build on findings
- `--log-opts="$RANGE"` - Scan only new commits

### Complementary Scanning

**Advisory Scan:** `.github/workflows/ci.yml` job `secrets`  
Scans whole tree as advisory (non-blocking) for historical findings.

## Quality Gates

All gates passed:

```bash
✓ pnpm type-check    # 0 errors
✓ pnpm lint          # biome + 3 gates clean (6391 files, 11s)
✓ pnpm build         # 273 pages, 0 failures
```

**Build Output:**
- 194 static pages (○)
- 71 partial prerender pages (◐)
- 8 dynamic pages (ƒ)
- All API routes functional (ƒ)

## Test Coverage

Rate limit tests: `src/lib/rate-limit/*.test.ts`
- `limiter.test.ts` (8 tests)
- `policies.test.ts` (policy inventory validation)
- `sliding-window.test.ts` (algorithm tests)
- `upstash.test.ts` (Redis integration)
- `headers.test.ts` (security headers)

Turnstile tests: `src/lib/security/turnstile.test.ts`
- Configured vs unconfigured behavior
- Token validation
- Timeout handling
- Fail-closed verification

Security tests: `src/lib/security/*.test.ts`
- Frame policy tests (path-dependent CSP)
- Constant-time comparison
- Maintenance mode

## Production Readiness

### Environment Variables Required

**Upstash Redis:**
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Cloudflare Turnstile:**
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public, client-side)
- `TURNSTILE_SECRET_KEY` (secret, server-side)

**Fallback:** System works without these - rate limits fall back to Postgres, Turnstile passes when unconfigured.

### CSP/HSTS

No configuration needed - headers applied to all routes via `next.config.ts`.

### Gitleaks

No configuration needed - runs automatically on push/PR via GitHub Actions.

## Security Properties

1. **Defense in Depth:** Five independent layers (rate limiting, CAPTCHA, CSP, HSTS, secret scanning)
2. **Fail-Safe:** Turnstile unconfigured = pass; Upstash unavailable = Postgres fallback
3. **No Shared Buckets:** Policy name derives Redis key prefix automatically
4. **Measured Limits:** Every limit copied from production call site, validated by inventory test
5. **Path-Dependent Framing:** Checkout payment paths framable by self; everything else denied
6. **Versioned Keys:** Algorithm changes don't break live counters
7. **Honeypot + Rate Limit + Turnstile:** Triple protection on public forms
8. **2-Year HSTS:** Long-lived HTTPS-only enforcement with subdomain coverage
9. **Secret Scan on PR:** Blocks merge if new commits contain secrets

## Known Gaps (Acceptable)

1. **CSP Nonce Migration:** Currently `'unsafe-inline'` for scripts/styles; requires per-request nonce in `src/proxy.ts` (tracked separately)
2. **HSTS Preload:** Removed pending 2 weeks of stable certificate (see incident docs)
3. **Whole-Tree Secret Scan:** Advisory-only in ci.yml (blocking scan is new commits only)

## Related Files

### Implementation
- `src/lib/rate-limit/` - Upstash + Postgres dual-store rate limiting
- `src/lib/security/turnstile.ts` - Cloudflare Turnstile verification
- `src/lib/security/frame-policy.ts` - CSP policy builder
- `next.config.ts` - Security headers configuration
- `.github/workflows/gitleaks.yml` - Secret scanning workflow

### Tests
- `src/lib/rate-limit/*.test.ts` - Rate limit unit tests
- `src/lib/security/*.test.ts` - Security module tests

### Documentation
- `docs/INFRA-AUDIT.md` section 2 - Security headers
- `docs/incidents/2026-09-08-production-tls-down.md` - HSTS preload removal context
- `docs/C36-RESULT.md` (this file)

## Verification Commands

```bash
# Rate limit policies inventory
grep -r "checkRateLimit\|rateLimit" src/ | wc -l  # 100+ call sites

# Turnstile coverage
grep -r "verifyTurnstile" src/server/actions --include="*.ts"  # 11 usages

# CSP/HSTS headers
grep -E "Content-Security-Policy|Strict-Transport-Security" next.config.ts

# Gitleaks workflow
ls -la .github/workflows/gitleaks.yml

# Quality gates
pnpm type-check && pnpm lint && pnpm build
```

## Conclusion

C36 security hardening is **COMPLETE and VERIFIED**. All five layers implemented, tested, and documented:

✅ Upstash rate limits on auth, checkout, supplier (79 policies)  
✅ Turnstile CAPTCHA on all public forms (11 endpoints)  
✅ CSP headers with path-dependent frame policy  
✅ HSTS 2-year enforcement with subdomains  
✅ Gitleaks CI scanning new commits on every push/PR

No code changes required - implementation was already shipped in F35. This task verified completeness, ran quality gates (type-check, lint, build all passing), and created comprehensive documentation.
