# C185 - Hardening

Date: 2026-11-03. Branch: closeout/v1-final. Measured, not assumed. Every block
below is pasted command output.

## Summary

| Control | State | Evidence |
|---|---|---|
| Rate limits on auth | Live in code, 3-tier (Upstash, Postgres, fail-open) | section 1 |
| Rate limits on checkout | `begin_checkout:user:<id>` 10/h | section 1 |
| Rate limits on apply | supplier-apply 5/h per user, supplier-lead 2/day per IP, `/api/supplier/apply` policy | section 1 |
| Upstash backend in production | NOT configured: production has `REDIS_URL` only, the limiter reads `UPSTASH_REDIS_REST_URL`/`_TOKEN`. Production runs on the Postgres tier (`check_rate_limit` exists, anon cannot call it) | sections 1, 2 |
| CSP | Enforced on every route, `frame-ancestors 'none'`, `object-src`, `base-uri`, `form-action` locked, Sentry report-uri | section 3 |
| HSTS | `max-age=63072000; includeSubDomains` | section 3 |
| X-Frame-Options | `DENY` | section 3 |
| gitleaks CI | `.github/workflows/gitleaks.yml`, green on the last 3 pushes | section 4 |
| Turnstile | cf.env present; widget exists, keys already in Vercel production | section 5 |

## Decisions taken alone

1. **CSP stays on `'unsafe-inline'`, not nonce + `'strict-dynamic'`.** Measured
   earlier and recorded in `src/proxy.ts`: with `cacheComponents` the shell is
   prerendered, Next's chunk tags and `__next_f` bootstrap carry no nonce, and a
   nonce policy blocked 23 to 74 scripts per route so nothing hydrated. Shipping
   a "strict" CSP that breaks every page is not hardening. Every other directive
   is already strict.
2. **No HSTS `preload`.** Submitting to the preload list is a hard-to-reverse
   outward commitment, and production TLS has had incidents. 2-year max-age plus
   includeSubDomains stays.
3. **Upstash env not invented.** No Upstash credential exists anywhere
   (`~/ke-goals/secrets` holds only cf.env, `.zshrc` has none), and the value of
   `REDIS_URL` is a Sensitive var that cannot be read back, so its host cannot be
   verified. Deriving a REST endpoint from it would be a guess. The limiter is
   correct on the Postgres tier; adding `UPSTASH_REDIS_REST_URL` +
   `UPSTASH_REDIS_REST_TOKEN` to Vercel switches it to Upstash with no code change.
4. **Turnstile keys not copied locally.** cf.env holds a CF API token, not the
   widget secret; the widget's keys are already set in Vercel production.

## 1. Rate-limit call sites

```
src/app/api/auth/login/route.ts:16:  const decision = await rateLimit('login', ip)
src/app/api/auth/login/route.ts:25:  const burst = await rateLimit('auth-burst', ip)
src/app/api/auth/signup/route.ts:16:  const decision = await rateLimit('signup', ip)
src/app/api/auth/signup/route.ts:25:  const burst = await rateLimit('auth-burst', ip)
src/app/api/auth/forgot-password/route.ts:16:  const ipDecision = await rateLimit('reset', ip)
src/app/api/auth/forgot-password/route.ts:26:    const emailDecision = await rateLimit('reset-address', email.toLowerCase())
src/app/api/auth/forgot-password/route.ts:36:  const burst = await rateLimit('auth-burst', ip)
src/app/api/supplier/apply/route.ts:16:  const decision = await rateLimit('supplier-lead', ip)
src/server/actions/auth.ts:201:    const allowed = await checkRateLimit(`login:${ip}`, 5, 900)
src/server/actions/auth.ts:211:    const accountAllowed = await checkRateLimit(
src/server/actions/auth.ts:245:  const allowed = await checkRateLimit(`signup:${ip}`, 3, 3600)
src/server/actions/auth.ts:303:  const allowed = await checkRateLimit(`magic:${ip}`, 5, 3600)
src/server/actions/auth.ts:405:  const allowed = await checkRateLimit(`phone-otp:${ip}`, 5, 3600)
src/server/actions/auth.ts:418:  const numberAllowed = await checkRateLimit(`phone-otp-number:${e164}`, 5, 3600)
src/server/actions/auth.ts:439:  const allowed = await checkRateLimit(`phone-verify:${ip}`, 20, 3600)
src/server/actions/auth.ts:519:  const allowed = await checkRateLimit(`reset:${ip}`, 3, 3600)
src/server/actions/auth.ts:527:  const addressAllowed = await checkRateLimit(
src/server/actions/auth.ts:557:  const allowed = await checkRateLimit(`update-password:${ip}`, 10, 3600)
src/server/actions/auth.ts:579:  const allowed = await checkRateLimit(`email-verify:${ip}`, 20, 3600)
src/server/actions/auth.ts:590:  const addressAllowed = await checkRateLimit(`email-verify-address:${parsed.data.email}`, 20, 3600)
src/server/actions/auth.ts:633:  const allowed = await checkRateLimit(`change-password:${user.id}`, 10, 3600)
src/server/actions/auth.ts:855:  const allowed = await checkRateLimit(`whatsapp-otp:${ip}`, 5, 3600)
src/server/actions/auth.ts:870:  const numberAllowed = await checkRateLimit(`whatsapp-otp-number:${e164}`, 5, 3600)
src/server/actions/auth.ts:914:  const allowed = await checkRateLimit(`whatsapp-verify:${ip}`, 20, 3600)
src/server/actions/supplier-onboarding.ts:78:  if (!(await checkRateLimit(`supplier-apply:${user.id}`, 5, 3600))) {
src/server/actions/supplier-onboarding.ts:262:  if (!(await checkRateLimit(`supplier-doc-upload:${user.id}`, 30, 3600))) {
src/server/actions/payments/checkout.ts:398:  const allowed = await checkRateLimit(`begin_checkout:user:${user.id}`, 10, 3600)
src/server/actions/supplier-lead.ts:95:  if (!(await checkRateLimit(`supplier-lead:${ip}`, 2, 86400))) {
```

## 2. Production backend

```
$ vercel env ls production | grep -iE "turnstile|redis|upstash"
 NEXT_PUBLIC_TURNSTILE_SITE_KEY 0x4AAAAAAADJwwDXxZ… Config Production, Preview 15d ago 
 TURNSTILE_SECRET_KEY Hidden Secret Production 20d ago 
 REDIS_URL Hidden Secret Production 48d ago 

$ supabase db query --linked "select p.oid::regprocedure, has_function_privilege('anon', p.oid, 'execute') ... where proname='check_rate_limit'"
"anon_exec": false, "fn": "check_rate_limit(text,integer,integer)"
```

## 3. Live headers (www.kenyonexpress.co.il)

```
== /
HTTP/2 200 
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.c ... frame-ancestors 'none'
strict-transport-security: max-age=63072000; includeSubDomains
x-frame-options: DENY
== /login
HTTP/2 200 
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.c ... frame-ancestors 'none'
strict-transport-security: max-age=63072000; includeSubDomains
x-frame-options: DENY
== /checkout
HTTP/2 200 
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.c ... frame-ancestors 'none'
strict-transport-security: max-age=63072000; includeSubDomains
x-frame-options: DENY
== /supplier/apply
HTTP/2 308 
strict-transport-security: max-age=63072000; includeSubDomains
x-frame-options: DENY

$ CSP directives on /
content-security-policy: default-src 'self'
script-src 3 sources
style-src 2 sources
img-src 11 sources
font-src 1 sources
connect-src 3 sources
frame-src 2 sources
base-uri 'self' 
form-action 'self' https://secure.cardcom.solutions
object-src 1 sources
upgrade-insecure-requests  
frame-ancestors 'none' 
report-uri https://o4511944582496256.ingest.de.sentry.io/api/4511946778607696/security/?sentry_key=<redacted>&sentry_environment=production 
report-to csp-endpoint 
```

## 4. gitleaks CI

```
$ gh run list --workflow=gitleaks.yml --branch closeout/v1-final -L 3
completed	success	[autopilot] STATE.md: C184 DONE (state-log)	gitleaks	closeout/v1-final	push	41577151740	25s	2026-11-03T04:16:28Z
completed	success	STATE: C184 DONE	gitleaks	closeout/v1-final	push	41577119619	21s	2026-11-03T04:16:10Z
completed	success	Add Resend bounce webhook, view-add-checkout-paid funnel, live obs sm…	gitleaks	closeout/v1-final	push	41577091196	23s	2026-11-03T04:15:53Z
```

## 5. Turnstile

```
$ ls ~/ke-goals/secrets/cf.env
/Users/ofir/ke-goals/secrets/cf.env
$ CF API GET /accounts/<id>/challenges/widgets
KenyonExpress Production | 0x4AAAAAAF… | ['kenyonexpress.co.il'] | managed
```

## 6. Gates

```
$ vitest run src/lib/rate-limit src/lib/rate-limit.test.ts src/lib/security src/proxy.test.ts src/app/api/auth src/app/api/supplier/apply checkout.test.ts supplier-onboarding.test.ts
 Test Files  28 passed (28)
      Tests  344 passed (344)
$ pnpm type-check
$ tsc --noEmit
type-check exit 0
```

RESULT: DONE
