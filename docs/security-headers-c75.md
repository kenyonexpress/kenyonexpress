# C75: Security Headers Implementation

## Overview
Implemented strict nonce-based Content Security Policy (CSP) and comprehensive security headers to achieve A+ rating on securityheaders.com.

## Implementation Date
2026-10-25

## Security Headers Implemented

### 1. Content-Security-Policy (CSP)
- **Nonce-based**: Per-request unique nonce generated in `src/proxy.ts`
- **No 'unsafe-inline'**: Replaced with `'nonce-{value}'` for scripts and styles
- **Strict-dynamic**: Added to script-src for enhanced security
- **Frame-ancestors**: Path-dependent (DENY for most routes, 'self' for payment frames)

Example:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-/AlMxA2raiXBTJGWLD2zjw==' 'strict-dynamic' https://challenges.cloudflare.com; style-src 'self' 'nonce-/AlMxA2raiXBTJGWLD2zjw=='; ...
```

### 2. X-Frame-Options
- **Value**: DENY (default) or SAMEORIGIN (payment frame paths)
- **Path-dependent**: Set dynamically in proxy middleware

### 3. X-Content-Type-Options
- **Value**: nosniff
- **Purpose**: Prevents MIME type sniffing

### 4. Referrer-Policy
- **Value**: strict-origin-when-cross-origin
- **Purpose**: Controls referrer information sharing

### 5. Permissions-Policy
- **Path-dependent**: camera=(self) for scanner routes, camera=() elsewhere
- **Directives**: camera, microphone, geolocation, payment
- **Purpose**: Controls browser feature access

### 6. Strict-Transport-Security (HSTS)
- **Value**: max-age=63072000; includeSubDomains
- **Duration**: 2 years
- **Note**: preload removed temporarily pending TLS verification (see next.config.ts)

## Files Modified

### New Files
- `src/lib/security/csp-nonce.ts`: Nonce generation and access utilities
- `scripts/verify-security-headers.mjs`: Verification script

### Modified Files
- `src/proxy.ts`: Nonce generation and dynamic header setting
- `src/lib/security/frame-policy.ts`: Nonce-aware CSP builder
- `next.config.ts`: Updated documentation and CSP approach

## Architecture

### Nonce Generation Flow
1. `proxy()` function generates unique nonce per request using `crypto.getRandomValues()`
2. Nonce injected into request headers (for components to read via `getNonce()`)
3. Nonce injected into response CSP header via `contentSecurityPolicyFor()`
4. Components can access nonce using async `getNonce()` function

### Path-Dependent Headers
Headers vary based on request path:
- **Payment frame paths** (`/checkout/frame-return`): `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`
- **Camera paths** (`/scan`, `/supplier/scan`): `camera=(self)` in Permissions-Policy
- **All other paths**: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `camera=()` in Permissions-Policy

## Verification

Run the verification script:
```bash
node scripts/verify-security-headers.mjs
```

Expected output:
```
✅ All security headers verified!
✅ Configuration should achieve A+ on securityheaders.com
```

## securityheaders.com Rating

### Expected Grade: A+

Based on the implemented headers, the site should achieve:
- **Content-Security-Policy**: ✅ Strict CSP with nonces
- **X-Frame-Options**: ✅ DENY
- **X-Content-Type-Options**: ✅ nosniff
- **Referrer-Policy**: ✅ strict-origin-when-cross-origin
- **Permissions-Policy**: ✅ Restrictive policy
- **Strict-Transport-Security**: ✅ HSTS with long max-age

All criteria for A+ rating are met.

## Testing

### Local Testing
```bash
# Start server
PORT=3311 pnpm start

# Test headers
curl -I http://localhost:3311/

# Verify all headers
node scripts/verify-security-headers.mjs
```

### Production Testing
Once deployed, test at: https://securityheaders.com/?q=https://kenyonexpress.co.il

## Compatibility Notes

### Cloudflare Challenges
- `challenges.cloudflare.com` added to script-src and frame-src for Turnstile support

### Cardcom Payment Integration
- Payment frame path (`/checkout/frame-return`) allows framing by same origin
- Maintains security while allowing payment flow to complete

### QR Scanner
- Scanner routes (`/scan`, `/supplier/scan`) allow camera access
- All other routes deny camera by default

## Inline Scripts and Styles

For any inline scripts or styles to work with the new CSP, they must use the nonce:

```tsx
import { getNonce } from '@/lib/security/csp-nonce'

export default async function Component() {
  const nonce = await getNonce()
  
  return (
    <script nonce={nonce}>
      // inline script
    </script>
  )
}
```

## Security Benefits

1. **XSS Prevention**: Nonce-based CSP prevents unauthorized script execution
2. **Clickjacking Prevention**: X-Frame-Options prevents embedding in iframes
3. **MIME Sniffing Prevention**: X-Content-Type-Options prevents MIME confusion attacks
4. **HTTPS Enforcement**: HSTS ensures all connections use HTTPS
5. **Privacy Protection**: Referrer-Policy limits information leakage
6. **Feature Control**: Permissions-Policy restricts potentially dangerous APIs

## Related Documentation

- [CLAUDE.md](../CLAUDE.md): Project security rules
- [frame-policy.ts](../src/lib/security/frame-policy.ts): CSP implementation
- [proxy.ts](../src/proxy.ts): Middleware security headers
- [next.config.ts](../next.config.ts): Static security headers configuration
