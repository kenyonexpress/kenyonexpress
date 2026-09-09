# OWASP Top 10 (2021), mapped to this codebase

Measured 2026-09-09 against the working tree, the live deployment and the
GitHub repository settings. Nothing here is quoted from an earlier session
without the date it was taken on.

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
| A01 | Broken access control | Covered, and it is the one with a structural gap. See below. |
| A02 | Cryptographic failures | Covered |
| A03 | Injection | Covered, gated as of today |
| A04 | Insecure design | Covered |
| A05 | Security misconfiguration | Covered, one live defect |
| A06 | Vulnerable components | Covered, gated as of today |
| A07 | Authentication failures | Covered |
| A08 | Software and data integrity | Partial |
| A09 | Logging and monitoring | Covered, one live defect |
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

**The structural gap, and it is real:** `docs/SECURITY-POSTURE.md` §4 documents
that `SECURITY DEFINER` functions take the acting user id from their caller.
An authenticated user can therefore read rows belonging to another user through
one, past RLS. This is proven, not theoretical, and `check_rate_limit` is the
anonymous equivalent. It is the highest-value open item in this category and it
is not closed by anything in this file.

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

**Input validation.** Twelve API routes export a mutating method. **Eleven
validate with zod.** The twelfth is `/api/webhooks/whatsapp`, which receives
form-encoded Twilio callbacks behind an HMAC-SHA1 signature check and passes
its fields through `classifyInbound` and `waPhoneDigits`; its XML replies go
through `escapeXml`. That is a defensible shape rather than a gap, and it is
listed by name here so nobody has to re-derive it.

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
of the CSP and it is what Next.js inline bootstrapping requires without a
nonce. Recorded as a known limitation rather than claimed as clean.

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
exactly the shape of the credential this project still has to rotate. Enabling
it is a repository setting, not a code change.

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

**Live defect:** three of the thirteen scheduled cron routes answer 404 in
production (`whatsapp`, `retention`, `weekly-digest`). All three are in the tree
and on `main`, so the deployment is older than the routes: the WhatsApp outbox
is never drained, retention never runs, the weekly digest is never sent.
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
