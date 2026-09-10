# OWASP Top 10 (2021), mapped to this codebase

Measured 2026-09-09 against the working tree, the live deployment and the
GitHub repository settings, and **re-measured in four places on 2026-09-10**
(A01's grant gap, the CSRF subsection under it, A08's repository setting, and
A09's cron count). Nothing here is quoted from an earlier session without the
date it was taken on.

`docs/SECURITY-POSTURE.md` is the threat model and is the better document to
read first: it works from what an attacker here would actually want (a voucher
they did not buy, a supplier's liability figure, another customer's orders) and
names thirteen concrete threats, T-1 to T-13. This file is the compliance-shaped
view of the same system, one row per OWASP category, and it exists because the
threat model deliberately does not enumerate categories nobody has attacked yet.

**Every row names a file, a header measured on the live site, or a gate. A row
that could only say "we are careful about this" says instead that it is not
covered.**

---

## Summary

| | Category | State |
| --- | --- | --- |
| A01 | Broken access control | Covered. The structural gap grew and now has an unapplied fix; CSRF is a subsection of it. |
| A02 | Cryptographic failures | Covered |
| A03 | Injection | Covered, gated as of today |
| A04 | Insecure design | Covered |
| A05 | Security misconfiguration | Covered, one live defect |
| A06 | Vulnerable components | Covered, gated as of today |
| A07 | Authentication failures | Covered |
| A08 | Software and data integrity | Partial |
| A09 | Logging and monitoring | Covered, one live defect, worse on 09-10 |
| A10 | Server-side request forgery | Not applicable, and why |

Three gates were added on 2026-09-09 by the work that produced this document,
because three of these rows were true and nothing was holding them true:
`scripts/raw-html-gate.mjs` (A03), `scripts/postgrest-or-gate.mjs` (A03) and
`scripts/audit-gate.mjs` plus `.github/workflows/security.yml` (A06).

---

## A01. Broken access control

**Row-level security is the boundary, not the application.** Every tenant table
carries policies, and `supabase/rls-manifest.json` is the manifest CI checks
production against. It was 21 days stale until 2026-09-08, when production
turned out to be **81** tables rather than the 53 the manifest listed, so 28
were outside the gate entirely. That is fixed and the finding is written up in
`STATE.md`.

Server actions are guarded through `withActionContext` wrappers rather than by
a check at the top of each function. **A flat grep for a guard reports 0 of 84
actions guarded and is wrong**; the guard is two hops in. Anyone auditing this
by pattern needs to know that before drawing a conclusion.

Eight tables that should be unreachable by client roles carry a single
`deny_all_client_roles` policy: **RESTRICTIVE**, `ALL`, `false` on both sides
(migration 172). RESTRICTIVE intersects rather than unions, so this is a
tightening and not a rewording. An older manifest rule read "it has policies,
remove its exemption" and would have told us to weaken the schema.

**The structural gap, re-measured 2026-09-10, and it grew.**
`docs/SECURITY-POSTURE.md` §4 records that `authenticated` still holds INSERT,
UPDATE and DELETE on relations it cannot use, and puts the figure at 56. Read
against production today:

```
authenticated  INSERT  74 relations
authenticated  UPDATE  72
authenticated  DELETE  72
anon           INSERT / UPDATE / DELETE  1  (carts, which is deliberate)
```

It grows on its own, and that is the finding rather than the number: Supabase's
default privileges hand the client roles everything on every new table, so each
migration that creates one widens this unless it says otherwise, and nothing was
counting.

**114 of those privileges are unusable, which is what makes them fixable
today.** Three each on 38 relations - 33 tables including `payments`, `vouchers`,
`refunds` and every wallet table, plus 5 reporting views - where no PERMISSIVE
policy grants any client role a write. Postgres refuses the write before it
consults a grant, so revoking them cannot break a working path.
`migrations/pending/230_revoke_surplus_client_dml.sql` does it and is
**unapplied**; it was proven on production inside a DO block that revoked all
114, asserted none survived, and raised to roll itself back
(`privileges before=114, remaining after revoke=none`).

**What the revoke buys, stated exactly:** today one permissive policy written by
accident on a money table is a live vulnerability, because the grant underneath
it is already there. After the revoke the same mistake is inert until somebody
also writes a GRANT. `supabase/rls-manifest.json`'s `client_dml_grants` block is
the measured ledger and `src/lib/auth/rls-manifest.test.ts` fails when the
ledger and the migration stop agreeing.

**The other half of §4 is a different claim and is still open:** `SECURITY
DEFINER` functions that take the acting user id from their caller. Re-read today,
the money and admin definer functions that `authenticated` may execute -
`fn_cashback_admin_adjust`, `approve_payout_statement`,
`mark_payout_statement_paid`, `generate_payout_statement`,
`cancel_payout_statement` - every one of them opens with
`IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'`, and `redeem_voucher`
derives the supplier from `auth.uid()` rather than an argument. So the shape
exists in the schema and the five that would matter most are guarded.

### Cross-site request forgery, and what "CSRF tokens" turned into here

**Server actions need nothing added:** Next validates `Origin` against the
forwarded host on every action call and refuses a mismatch, and that is where
almost every mutation in this application lives.

**Route handlers get no such treatment**, and eight mutating ones authenticate
from a cookie, because `authenticateRequest` prefers the cookie over the bearer
header by design (`src/lib/supabase/bearer.ts`, and the reason is written there:
a browser cannot be made to send a bearer header it did not choose).

Measured on the live site 2026-09-10: `ke_session_id=...; Secure; HttpOnly;
SameSite=lax`, and the Supabase auth cookies carry `sameSite: 'lax'` too. So the
textbook attack - `evil.example` posts a form at the redeem endpoint - already
arrives with no session at all and answers 401. **The case Lax does not cover is
a sibling subdomain**, because Lax is a site rule and not an origin rule, and
this project ran WordPress on a sibling host until the cutover.

`src/lib/security/same-origin.ts` closes that axis for
`/api/a`, `/api/app/session`, `/api/app/push-tokens`, `/api/supplier/app/pin`
and the three `/api/supplier/vouchers/*` routes;
`src/__tests__/security/mutating-route-guards.test.ts` fails when a new
cookie-authenticated mutation forgets it, and lists the eight signature-verified
webhooks that have no cookie to steal.

> The section that commissioned this asked for **CSRF tokens**. A synchronizer
> token needs a store to compare against and every caller taught to send it,
> including an Expo app whose requests are not browser requests at all. `Origin`
> is sent by every browser on every POST, cannot be forged by page JavaScript,
> and needs no state. The requirement is met on a different mechanism, and this
> paragraph is here so that is a recorded decision rather than a quiet
> reinterpretation.
>
> A detail that makes the guard necessary rather than decorative: `Request.json()`
> ignores the content type, so a cross-site POST sent as `text/plain` is a SIMPLE
> request - no preflight - and its JSON body parses normally. A route cannot be
> assumed safe because it reads JSON.

Related threats: T-1, T-7, T-8, T-11, T-12.

## A02. Cryptographic failures

**Transport.** Measured on the live site 2026-09-09:

```
strict-transport-security: max-age=63072000; includeSubDomains; preload
```

TLS verifies on both `kenyonexpress.co.il` and `www.kenyonexpress.co.il`
(`ssl_verify_result=0`). It did not on 09-08; that is fixed.

**Voucher codes** are crypto-random and single-use, and a QR carries an HMAC
rather than a guessable id. See T-3 and T-4.

**Payment callbacks are not signed, and pretending otherwise would be worse
than the gap.** Cardcom publishes no HMAC and no signature header. Authenticity
rests on the unguessable `?s=` secret in the IndicatorUrl plus mandatory
server-to-server re-verification through `GetLpResult`, which is the only
trusted source of amount, status and token. A signature check here would reject
every genuine callback and take the money path down with it. See T-5, T-6.

**Money is integer agorot end to end** (`src/lib/money.ts`). That is not a
cryptographic control, but a float in a settlement figure is a correctness
failure with the same shape: silent, and discovered by the party who lost.

## A03. Injection

**SQL.** No raw SQL is built anywhere in `src/`. Data access is Supabase
PostgREST and `.rpc()` (62 call sites), both parameterized.

**PostgREST filter injection, which is the one that actually applies here.**
`.or()` takes a filter *expression*, not a value, and `, ( ) " \ % _ *` are
structural inside it. So

```ts
.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
```

is not a search for `q`: a comma in `q` appends a condition of the caller's
choosing. RLS still holds and no SQL is reached, so this is not privilege
escalation; what it changes is which rows match, on queries whose entire job is
deciding what a caller may see.

Measured 2026-09-09: **nine `.or()` call sites, all nine safe.** Six sanitize
through `sanitizeOrTerm` (`src/lib/utils/search-escape.ts`), two interpolate one
of two hardcoded literals, one interpolates `user.id` from the session. Three of
the nine carry a comment naming this defect, so it has been paid for once
already. **`scripts/postgrest-or-gate.mjs` now runs in `pnpm lint` and is what
stops the tenth.**

**XSS.** Ten files in `src/` name `dangerouslySetInnerHTML`. Eight pass
`jsonLdScript(...)`, which is `JSON.stringify(node).replace(/</g, '\\u003c')`
and is the escape that prevents a `</script>` breakout out of a JSON-LD block.
One passes a module constant. Two of the ten hits are comments in the legal
renderer saying it deliberately renders blocks as React children instead.

Hebrew catalogue copy is authored in the admin panel, so the dangerous version
of this is one future line that would look native among the eight:

```tsx
<div dangerouslySetInnerHTML={{ __html: `<p>${product.description_he}</p>` }} />
```

That is stored XSS reachable from a form, and biome has no rule against it.
**`scripts/raw-html-gate.mjs` now runs in `pnpm lint`**; it accepts
`jsonLdScript(...)` and an allowlisted constant, and refuses template literals,
concatenation, other serializers however safe their names sound, and bare
identifiers.

**Input validation, re-measured 2026-09-10.** Fourteen API routes export a
mutating method. **Twelve validate with zod.** The two that do not are both
Twilio callbacks - `/api/webhooks/whatsapp` and `/api/webhooks/twilio-sms` -
which receive form-encoded bodies behind an HMAC-SHA1 signature check, read
named fields through typed helpers rather than a schema, and escape their XML
replies with `escapeXml`. That is a defensible shape rather than a gap, and both
are named here so nobody has to re-derive it.

**Query parameters were audited on the same day**, because "zod on every route"
is a claim about GET routes too. Seven routes read `searchParams`, and none feeds
a raw value into a query: `parseFacetedParams` and `resolveReportRange` are typed
parsers, `isMonthKey` and the two `format` reads narrow to a literal, and the
search paths pass `q` through `sanitizeOrTerm` before it reaches a PostgREST
filter.

> The section that commissioned this audit asked for "Drizzle parameterized
> only". **There is no Drizzle in the data path.** The requirement is met by a
> different stack, and the sentence is recorded rather than quietly reinterpreted.

## A04. Insecure design

The threat model in `docs/SECURITY-POSTURE.md` is design-stage work: it starts
from what is worth stealing, draws the trust boundaries, and derives the
controls. Two design decisions worth naming here because they read as gaps
until you know the reason:

- **A cron route that finds its provider unconfigured changes nothing, counts
  no attempt and applies no backoff.** So the invoice queue does not eat itself
  while waiting for a Cardcom key.
- **`/api/health` is deliberately coarse.** It is unauthenticated by necessity,
  an uptime monitor cannot hold a session, and a detailed health endpoint is a
  free inventory of what you run and what is currently broken. The detailed one
  is `/api/cron/health`, behind `CRON_SECRET`.

## A05. Security misconfiguration

Six headers, measured on the live site 2026-09-09 and not read from the config:

```
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(), geolocation=(), payment=(self)
```

CSP and `X-Frame-Options` are path-dependent and move together
(`src/lib/security/frame-policy.ts`): the two Cardcom payment-frame routes get
`frame-ancestors 'self'` and `SAMEORIGIN`, everything else gets `'none'` and
`DENY`. `src/proxy.ts` *overwrites* rather than adds, because two
`Content-Security-Policy` headers are both enforced and the strictest wins,
which would undo the exception without saying so. `Permissions-Policy` is
path-dependent for the same reason: `camera=()` on the supplier scanner route
is a scanner that silently cannot see.

`script-src` and `style-src` carry `'unsafe-inline'`. That is a real weakening
of the CSP and it is what Next.js inline bootstrapping requires without a nonce.
Recorded as a known limitation rather than claimed as clean.

**Considered on 2026-09-10 and deliberately not changed, with the cost stated.**
A nonce has to be minted per request in `src/proxy.ts` and read back at render
time, and reading a request header at render is what makes a route dynamic. This
application is built on `cacheComponents` with prerendered product and category
pages, so nonce-based CSP buys the removal of `'unsafe-inline'` at the price of
turning the whole cached shop into per-request rendering. `style-src` cannot be
tightened at all this way: React writes inline styles. So the trade is a partial
hardening of `script-src` against a whole-site caching regression, on a site
whose deployment cannot currently be rolled forward to test it - the change is
not made, and this is the reason rather than an omission.

**Live defect:** the site publishes `https://kenyonexpress.co.il` as its
canonical, its `og:url` and every sitemap `<loc>`, and that host answers 308 to
`https://www.kenyonexpress.co.il/`. Vercel serves `www`; `src/app/layout.tsx`
defaults `NEXT_PUBLIC_APP_URL` to the apex. `scripts/canonical-host-probe.mjs`
measures it on every `production-smoke.yml` run. Fix is one environment
variable or one Vercel domain setting.

## A06. Vulnerable and outdated components

**This category had a measured failure eight days before this document, and the
gate below is the response to it.** On 2026-09-08 two CRITICAL unauthenticated
Next.js RCEs, one in the Image Optimizer and therefore reachable on a live
site, sat with their patches **written and unmergeable** while every gate in the
repository was green. `ci.yml` did not run `pnpm audit` at all, and
`nightly-health.sh` ran it as `pnpm audit ... || true`, so its result could
never reach the failed list. Detection rested on a person reading Dependabot.

`scripts/audit-gate.mjs` now fails on a high or critical advisory **that has a
published patch** and reports the unfixable ones by name without blocking. That
line is drawn deliberately: an advisory nobody can fix produces a permanent red
that teaches people to skip the check, which costs more than it saves. It runs
in `.github/workflows/security.yml` on every pull request.

Current state, measured 2026-09-09: `pnpm audit --prod` returns **no known
vulnerabilities**, across 653 dependencies. Zero open Dependabot alerts.

## A07. Identification and authentication failures

PKCE, secure cookies and session rotation are in place; roles are enforced at
the RLS layer rather than only in `requireRole()`, so a missed check in a route
does not become data access. Staff PIN brute force is T-13; the voucher code
space is T-4.

Rate limiting is Upstash sliding-window, and **the rate limiter's own key
derivation is a threat in the model** (T-9, key poisoning) rather than an
afterthought.

Not re-measured here: the Supabase Auth redirect allowlist and the Google OAuth
production client. Both need dashboard access this machine does not have, and
both are open rows in `docs/LAUNCH-CHECKLIST.md` (DN8, DN9). They are called
unmeasured rather than assumed fine.

## A08. Software and data integrity failures

**Covered:** GitHub secret scanning and push protection are both enabled
(`gh api repos/:owner/:repo --jq .security_and_analysis`, 2026-09-09).
`gitleaks` now runs over the full history on every pull request
(`fetch-depth: 0`, because a shallow clone would miss a key that was committed
and later deleted, which is the normal shape of a leak). The nineteen findings
in history are triaged one by one in `.gitleaks.toml`; one of them was a real
`service_role` JWT, for a **different project ref** and **expired 569 days
ago**.

Branch protection on `main` requires four named checks, `strict: true`.
Migrations are files in `migrations/pending/` and `db push` is forbidden.

**Partial, and the gap is named:** `secret_scanning_non_provider_patterns` is
**disabled** on this repository. That is the setting that catches generic
high-entropy strings rather than recognised vendor formats, and generic is
exactly the shape of the credential this project still has to rotate.

**Attempted 2026-09-10 and it did not take.** `gh api -X PATCH repos/:owner/:repo`
with `security_and_analysis[secret_scanning_non_provider_patterns][status]=enabled`
answered 200 and returned the setting still `disabled`; a fresh read confirms it.
The repository is public and provider secret scanning plus push protection are
both on, so the two that answer are already the free ones. Recorded as measured
rather than as pending work: an API call that succeeds and changes nothing is the
kind of thing that gets ticked off and believed.

**Also open:** the live `SUPABASE_SECRET_KEY` was exposed during setup and
bypasses all RLS. It is fingerprinted by SHA-256 in
`scripts/compromised-keys.mjs` and `scripts/deploy-preflight.mjs` refuses to
build with it. It is untracked, so **it appears in no git scan at all, and a
green gitleaks run says nothing about it.** Rotation procedure is in
`docs/RUNBOOK.md`.

## A09. Security logging and monitoring failures

Sentry (EU region), ntfy for operator pages, `payment_events` as append-only
payment forensics with 38 event types, `payment_webhook_events` as the Cardcom
callback log and dead-letter queue, and `notification_outbox` for outbound
messaging. `docs/MONITORING.md` is the current write-up.

**Live defect, re-measured 2026-09-10 and worse: seven of seventeen.**
`node scripts/deployed-cron-probe.mjs` against `https://kenyonexpress.vercel.app`
returns 404 for `price-schedule`, `price-snapshot`, `wishlist-alerts`,
`whatsapp`, `retention`, `weekly-digest` and `settlement-reconcile`; the other
ten answer 401, which is the healthy answer to an unauthenticated probe.

Nothing regressed. The registry grew from 13 jobs to 17 and the deployment did
not move, so every route added since it was built answers 404 - the WhatsApp
outbox is never drained, retention never runs, the weekly digest is never sent,
scheduled price changes never apply, no price snapshot is taken, no wishlist
alert is sent, and settlement reconciliation never runs. `docs/DEPLOYMENT.md`
records the cause: the Vercel project has no Git connection, so a push to `main`
deploys nothing.

`scripts/deployed-cron-probe.mjs` catches it; every other cron gate compares the
repository to itself and stayed green through it.

**The pattern worth carrying out of this row:** three separate gates in this
repository were green while something was broken, and in all three cases the
reason was the same shape. `cron-schedule-inventory.test.ts` compared the repo
to the repo. `production-smoke.yml` probed two routes old enough to exist in any
build. The SEO tests compare rendered metadata to a constant in the same
repository. **A gate whose both sides come from the same source cannot fail.**

## A10. Server-side request forgery

**Not applicable in the usual sense, and the reason is worth stating rather
than leaving the row blank.** No route takes a URL from a caller and fetches it.
The outbound calls this system makes are to a fixed set of providers named in
environment variables: Cardcom, Supabase, Meilisearch, R2, Resend, Twilio,
Upstash. The nearest thing to a caller-influenced fetch is the image optimizer,
whose remote patterns are allowlisted in `next.config.ts`.

If a feature is ever added that fetches a supplier-supplied URL (a logo import,
a webhook the supplier configures), this row stops being not-applicable and the
allowlist has to become explicit.

---

## What this document does not cover

- **Penetration testing.** Nothing here was attacked; it was read and measured.
- **Anything requiring the Vercel, Supabase or Google dashboards.** This machine
  has no access to them. Rows that depend on those settings say so by name
  rather than assuming.
- **The `SECURITY DEFINER` caller-id gap (A01).** It is the largest open item
  and it is documented, not fixed.
