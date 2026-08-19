# ARCHITECTURE-SECURITY-HARDENING.md

The attack surface, what closes each part of it, and the three gaps that are
still open.

Status: BINDING. Branch `docs/architecture-night`, 2026-08-19.
Scope: **docs only.** No `src/`, no existing migration, no SQL executed.
Supersedes, where they disagree: `docs/ARCHITECTURE-SECURITY.md`,
`docs/ARCHITECTURE-SECURITY-AUDIT.md`, `docs/ARCHITECTURE-FRAUD-RATE-LIMITS.md`.
Code this describes: `next.config.ts`, `src/lib/security/frame-policy.ts`,
`src/lib/security/constant-time.ts`, `src/proxy.ts`, `src/lib/utils/rate-limit.ts`,
`src/lib/supabase/admin-key.ts`, `src/lib/observability/scrub.ts`,
`src/app/api/payments/cardcom/webhook/route.ts`,
`src/app/api/webhooks/products/route.ts`, `src/lib/search/qstash.ts`.
Migrations: `103_lock_definer_views_and_rpcs`, `104`, `105`, `111_revoke_anon_writes`.

---

## 0. The threat model, in one table

| Asset | Worst case | Primary control |
|---|---|---|
| A card | a charge nobody authorised | **we never hold one.** §6 |
| A Cardcom token | a charge on a saved card | terminal-scoped, service-key only, redacted everywhere |
| A voucher QR | free goods at a till | signed payload, single-use, terminal state |
| The service key | total database access | never in a browser, shape-checked at construction |
| `CARDCOM_WEBHOOK_SECRET` | forged "you were paid" callbacks | §2, and it does not matter, because §2.1 |
| `VOUCHER_QR_SECRET` | forged vouchers | key id in the payload, so it is rotatable |
| A customer's order history | privacy breach | RLS by `auth.uid()`. §4 |
| Search terms | privacy breach (health, gifts, relationships) | `search_events` has **no user column at all** |
| Admin routes | catalogue and money control | role check server-side, on every action |

---

## 1. Rate limiting

### 1.1 What actually exists

**Postgres, not Redis.** Measured: `UPSTASH`, `redis` and `Redis` appear nowhere
in `src` outside the QStash publisher, and there is a test that pins that fact
(`src/lib/health/checks.test.ts`).

```
check_rate_limit(p_key, p_max_attempts, p_window_seconds)        -> rate_limits
check_user_rate_limit(p_user_id, p_action, p_limit, p_window)    -> user_rate_limits
```

Two tables, two RPCs, called through `checkRateLimit` and `checkUserRateLimit`.

### 1.2 It fails **open**, deliberately

```ts
if (error) {
  log.error('rate_limit.check_failed', { reason: error.message })
  return true          // allow
}
```

An unavailable limiter must not block legitimate users. This is the correct
trade for a limiter protecting **cost and abuse**, and it is the **wrong** trade
for a limiter protecting **money or credentials**.

Consequence, stated plainly: **if the database is degraded, the voucher scan
endpoint and the checkout action are unthrottled.** For those two, failing
closed is the safer default, and §1.5 says so.

### 1.3 Where limits are applied today

| Surface | Keyed by | Note |
|---|---|---|
| `/api/search` | IP | |
| `/api/search/suggest` | IP | **separately from `/api/search`.** A type-ahead's rate is an order of magnitude higher, so one limit for both is either uselessly high or breaks the type-ahead |
| `beginCheckout` | user | the most expensive action in the system: it writes rows and calls a third party |
| voucher lookup / redeem | supplier member | `voucher_scan_outcome` has a `rate_limited` value, so a throttle is a **counted** event and not a silent 429 |
| auth actions | IP | |

### 1.4 The IP is taken from a header

```ts
x-forwarded-for (first entry) ?? x-real-ip ?? 'unknown'
```

Behind Vercel this is trustworthy because Vercel overwrites it. **It would not
be trustworthy behind a proxy that appends rather than replaces**, and `unknown`
is a shared bucket that a distributed client can occupy on purpose. Anything
security-critical must be keyed by **user or supplier**, never by IP alone,
which is why the two money surfaces above are.

### 1.5 Recommended changes, in priority order

1. **Fail closed on the two money surfaces.** Voucher redemption and checkout
   should refuse rather than allow when the limiter is unreachable. A customer
   retrying in ten seconds is a worse outcome than an unthrottled scan endpoint
   during a database incident.
2. **Add a Redis limiter only if measurement demands it.** Upstash Redis would be
   faster and would survive a Postgres incident, but it is a **new dependency,
   a new secret and a new failure mode**, and the current limiter has not been
   measured as a bottleneck. Adding it "for correctness" would trade a known
   trade-off for an unknown one.
3. **Key the scan endpoint by supplier member and by voucher code**, so probing
   many codes from one device is caught even at a normal per-request rate.

---

## 2. Webhook authentication

Three inbound webhooks, three different trust models, and the differences are
forced by the senders.

| Endpoint | Auth | Strength |
|---|---|---|
| `/api/payments/cardcom/webhook` | unguessable `?s=` secret, constant-time, **plus mandatory server-to-server re-verification** | the re-verification is the real control |
| `/api/webhooks/products` | `x-search-signature` (HMAC-SHA256 of the raw body) **or** `x-webhook-secret` (constant-time) | signature when the sender can sign |
| `/api/search/index-job`, `/index-dlq` | `Upstash-Signature` JWS, two rotating HMAC keys | proper signature |

### 2.1 Cardcom does not sign anything

There is no HMAC and no signature header. **Authenticity therefore never rests
on the POST body.** It rests on:

1. the unguessable `?s=` we set when creating the Low Profile page, and
2. `GetLpResult`, the **only** trusted source of amount, status and token.

This is the single most important security fact in the system, and it is why
`ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md` §4 exists. A forged callback with a
correct secret still cannot make us finalize an order, because the amount and
the status are re-fetched from Cardcom over a server-to-server call the attacker
does not control.

### 2.2 Constant-time comparison, with no short circuit

```ts
function anySecretMatches(provided, accepted) {
  let matched = false
  for (const secret of accepted) if (secretEquals(provided, secret)) matched = true
  return matched
}
```

**Both secrets are always checked.** Bailing early on the first match would make
the response time say *which* secret was presented, and the whole point of the
constant-time compare is that the comparison leaks nothing.

### 2.3 Rotation is a two-value window

`acceptedWebhookSecrets` returns the current **and** the retiring secret. A
single-value rotation means Cardcom calls with a secret this deployment does not
accept, the endpoint answers 200, Cardcom is satisfied, and **every paid order
silently stays open**. That case alarms loudly (`capturePaymentAlarm`) precisely
because it is otherwise invisible.

The same two-key pattern is what QStash does with its JWS keys, and the same
reasoning applies to `SEARCH_WEBHOOK_SECRET`.

### 2.4 The payload is never data

Every one of the three re-reads the authoritative row from Postgres. The
webhook body is a **notification**. This is what makes a forged body with a
leaked secret an annoyance rather than an incident.

---

## 3. CSRF

### 3.1 What Next.js gives us

Server Actions carry a built-in origin check: the `Origin` header must match the
deployment host. That is the primary CSRF control for every mutation on this
site, because **every mutation is a Server Action or a signed webhook**.

Recorded because it has cost real time here:

> **Browsing `127.0.0.1` against a `localhost` dev server silently blocks Server
> Actions.** The two are different origins. A probe must use `localhost`.

### 3.2 What is not a Server Action

| Surface | CSRF control |
|---|---|
| `/api/cart` (guest cart) | `SameSite=Lax` cookie + a same-origin check. **A guest cart is not a money surface**, so a forged add-to-cart is graffiti, not theft |
| `/api/supplier/redeem` | bearer token / PIN, not a cookie, so it is not CSRF-reachable |
| `/api/cron/*` | `CRON_SECRET`, not a session |
| webhooks | §2 |

### 3.3 Cookies

Session cookies are `httpOnly`, `Secure`, `SameSite=Lax`. `Lax` rather than
`Strict` because a `Strict` session cookie breaks the return from the Cardcom
hosted page and from the Google OAuth callback, both of which are top-level
cross-site navigations into an authenticated context.

---

## 4. RLS audit

### 4.1 The two standing rules

1. **No `tenant_id` anywhere in this schema.** Ownership is `auth.uid()`; staff
   access is `current_user_role()`; supplier access is membership in
   `supplier_members`.
2. **`anon` reads, `anon` never writes.** Migration `111_revoke_anon_writes`,
   applied 2026-08-10.

### 4.2 What 111 actually achieved, measured

```
anon grants after applying:
  SELECT on 46 tables
  INSERT/UPDATE/DELETE on exactly 1 (carts)
  no TRUNCATE, REFERENCES or TRIGGER row at all
```

Guest cart insert, update and delete as `anon` were all verified inside a
**rolled-back `DO` block**, with `request.cookies` set the way PostgREST sets it.
The policies were untouched; that migration changed grants only.

### 4.3 The residual gap 111 could not close

```
pg_default_acl for schema public, after applying:
  for postgres        -> anon=rm/postgres              (writes revoked, good)
  for supabase_admin  -> anon=arwdDxtm/supabase_admin  (UNCHANGED)
```

A role may alter only its **own** default privileges. MCP connects as
`postgres`, so the `supabase_admin` branch failed with `42501`. On the first
attempt that error rolled the **entire** migration back, which is why each branch
is now wrapped in its own exception handler.

**So a table created through the Supabase dashboard or the CLI, rather than
through a migration run as `postgres`, still hands `anon` the full stock grant,
and nothing reports it.**

Two consequences, and both are operational rules rather than code:

- **After creating any table from the dashboard, re-run the revokes in §2 of
  111.**
- **Prefer creating tables through migrations**, which is already the rule for
  other reasons.

Closing it properly needs a connection with more privilege than MCP has.

### 4.4 Policy shape by table class

Roughly 85 tables carry `ENABLE ROW LEVEL SECURITY`. They fall into six classes,
and the class determines the correct policy.

| Class | Tables (examples) | Read | Write |
|---|---|---|---|
| **Public catalogue** | `products`, `categories`, `product_images`, `suppliers`, `hero_slides`, `popular_searches` | `anon` + `authenticated`, filtered by `status='active' AND deleted_at IS NULL` | admin only |
| **Customer-owned** | `orders`, `order_items`, `vouchers`, `carts`, `cart_items`, `user_addresses`, `profiles`, `wallet_*`, `user_recent_searches`, `push_tokens` | owner via `auth.uid()` | owner, narrowly; most writes are server-side |
| **Supplier-scoped** | `supplier_members`, `supplier_bank_accounts`, `supplier_payout_items`, `voucher_redemptions`, `supplier_staff` | members of that supplier | `owner`/`manager`; `scanner` redeems only |
| **Money journal** | `payments`, `payment_webhook_events`, `settlement_events`, `commission_ledger`, `ledger_*`, `split_executions`, `invoices` | staff only | **service key only** |
| **Operational** | `audit_log`, `security_events`, `rate_limits`, `notification_outbox`, `search_index_dlq`, `reconciliation_*`, `idempotency_keys` | staff, some admin-only | service key only |
| **Anonymous aggregate** | `search_events` | staff | service key. **No user column exists** |

### 4.5 The per-table checklist

Every table must satisfy all six, and this is the audit to run before launch:

1. `ENABLE ROW LEVEL SECURITY` is on.
2. There is **at least one policy**, or the table is service-key-only **by
   intent** (RLS with zero policies denies every client role, which is a valid
   and deliberate configuration; it is a bug only when unintended).
3. `anon` has no `INSERT`/`UPDATE`/`DELETE` grant, except `carts`.
4. Owner policies use **`(SELECT auth.uid())`**, not the bare call. §4.6.
5. No two permissive policies overlap for the same role and command. §4.6.
6. Soft-deleted rows are excluded from public read (`104` fixed exactly this for
   `products`).

### 4.6 Two performance defects that are also correctness risks

Commit `0f8359bc` cleared both across the schema, and new policies must not
reintroduce them:

- **`auth.uid()` written bare** is re-evaluated **once per row**. `(SELECT auth.uid())`
  is an InitPlan, evaluated once. On a large table the difference is the
  difference between a policy and an outage.
- **Overlapping permissive policies** are OR'd, so two policies that each look
  correct can together be more permissive than either. Overlap is a
  correctness question that presents as a performance advisor warning.

### 4.7 Definer views and RPCs

`103_lock_definer_views_and_rpcs` exists because a `SECURITY DEFINER` view or
function **bypasses the RLS of the caller**. Every definer object must:

- be created with `SET search_path = ''` (an empty search path, so a
  schema-shadowing attack cannot redirect a call), and
- have `EXECUTE` revoked from `PUBLIC`, `anon` and `authenticated` unless it is
  deliberately callable, and
- do its own authorisation check when it is deliberately callable.

`redeem_voucher`, `fn_wallet_transfer` and `log_voucher_scan` are the three that
matter most: each moves value, and each is called with elevated rights.

### 4.8 Storage

`105_public_buckets_stop_listing`. A public bucket that permits **listing** is a
directory index of every file ever uploaded. Public buckets serve objects by
key; they do not enumerate. Supplier documents and invoices live in **private**
buckets, reached through signed URLs.

---

## 5. Secrets

### 5.1 The inventory

| Secret | Blast radius if leaked |
|---|---|
| `SUPABASE_SECRET_KEY` (service role) | **total database access** |
| `CARDCOM_API_PASSWORD` | refunds and verification on our terminal |
| `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME` | identifiers, not credentials alone |
| `CARDCOM_WEBHOOK_SECRET` | forged callbacks, mitigated by §2.1 |
| `VOUCHER_QR_SECRET` | **forged vouchers**, mitigated by `qr_key_id` rotation |
| `CRON_SECRET` | trigger scheduled jobs |
| `SEARCH_WEBHOOK_SECRET` | forced reindex jobs |
| `QSTASH_TOKEN` + signing keys | forged index jobs |
| `RESEND_API_KEY` | send mail as us |
| `R2_SECRET_ACCESS_KEY` | write to the media bucket |
| `SENTRY_AUTH_TOKEN` | build-time only |

### 5.2 Rules

1. **No secret in `NEXT_PUBLIC_*`.** That prefix means "shipped to the browser".
2. **No secret in a log, a Sentry context, or an ntfy body.** `scrub.ts` matches
   `token`, `secret`, `password`, `authorization`, `cookie`, `key`, `card`,
   `cvv`, `jwt` **by substring**, so `CARDCOM_API_PASSWORD` and
   `p_idempotency_key` are both caught by the same rule.
3. **No secret in the repo.** Secret scanning is a goal, not somebody else's job.
4. **Rotation is a two-value window** for anything a third party presents. §2.3.
5. **Never in a `.md` file**, including this one.

### 5.3 The service key is shape-checked, not just presence-checked

`src/lib/supabase/admin-key.ts` decodes the JWT payload and refuses:

- `missing`
- `demo-key` (the `{"iss":"supabase-demo","role":"service_role"}` key that ships
  with a local `supabase start`)
- `not-service-role`

This exists because a **perfectly well-formed key that is not this project's**
produced a guest add-to-cart that returned HTTP 200, set a session cookie, wrote
no row and showed no error. The cost of finding that was hours. The cost of the
check is a string comparison, and it is deliberately a **shape** check rather
than a liveness check, because it runs on a hot path and must not make a network
call.

### 5.4 The eight that block launch

`VOUCHER_QR_SECRET`, `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`,
`CARDCOM_API_PASSWORD`, `CARDCOM_WEBHOOK_SECRET`, `CRON_SECRET`,
`RESEND_API_KEY`, `SENTRY_AUTH_TOKEN`.

**Without them: no payment, no coupons, no emails, and no cron runs at all.**
`CRON_SECRET`'s absence is the quiet one: nothing errors, the jobs simply never
happen.

---

## 6. PCI scope: as close to zero as this design allows

### 6.1 What we never touch

**No card number, no CVV, no expiry beyond what is displayed, ever reaches our
origin.** The card is entered on Cardcom's hosted Low Profile page. We hold:

```
payment_tokens: cardcom_token, card_brand, last_4, expiry_month, expiry_year
```

`last_4` and the brand are display data. The **token** is the only chargeable
artefact, and it is:

- **terminal-scoped.** Cardcom will not charge a token on a terminal other than
  the one that minted it, so a leaked token is useless without our terminal;
- **service-key only.** No client role can read `payment_tokens`;
- **redacted everywhere.** `card` and `token` are both in the scrub list.

### 6.2 What that means for scope

This is the **SAQ A** shape: all cardholder data functions are outsourced to a
validated third party, and our pages neither receive nor transmit card data.

Two things preserve it, and both are load-bearing:

1. **The payment page is an iframe or a redirect to Cardcom's origin.** The
   moment a card field is rendered by our own JavaScript, the scope changes
   completely.
2. **The CSP `frame-ancestors` exception is path-scoped.** §7.2.

Formal validation is a business task, not an engineering one, and it needs
Cardcom's own attestation alongside ours.

---

## 7. Headers and CSP

### 7.1 The header set, every route

```
Content-Security-Policy      per path, §7.2
Strict-Transport-Security    max-age=63072000; includeSubDomains; preload
X-Frame-Options              DENY, or SAMEORIGIN on the two payment return paths
X-Content-Type-Options       nosniff
Referrer-Policy              strict-origin-when-cross-origin
Permissions-Policy           camera=(), microphone=(), geolocation=(), payment=(self)
```

`X-Frame-Options` **moves in step with `frame-ancestors`**. Browsers that honour
both enforce both, so a `DENY` left behind on a framable path blocks the frame
anyway.

### 7.2 The path-dependent directive, and the trap around it

One CSP directive depends on the path: the two routes a Cardcom payment returns
through must be framable by this origin, and everything else must not be. A
static header cannot see the path.

The solution has a sharp edge that is worth stating exactly:

> **Next appends the headers of every entry whose `source` matches.** Two
> entries that both matched `/checkout/frame-return` would emit **two**
> `Content-Security-Policy` headers. Browsers enforce the **intersection**, the
> stricter `frame-ancestors` would win, and the exception would be undone with
> nothing visible in the response.

So the two sources are made **non-overlapping** with a negative lookahead:

```ts
source: `/((?!${framable}).*)`            // everything except the framable paths
source: `${path}/:path*`, source: path    // exactly those paths
```

And **the relaxation is not done in `src/proxy.ts`**, because headers from
`next.config.ts` are applied **after** middleware and overwrite what it set.

### 7.3 The CSP gap

```
script-src and style-src fall back to 'unsafe-inline'
```

A per-request nonce with `strict-dynamic` cannot live in a static config header;
it requires generating a nonce in `src/proxy.ts`. Until that lands,
`unsafe-inline` is the state, and it is **the largest single XSS exposure in the
application**. It is not hidden behind a "hardened" label.

Allowed externals are narrow: Supabase (data, realtime, images), Unsplash
(images), Cardcom (the payment iframe). `next/font` self-hosts Heebo, so **no
Google Fonts origin is needed**.

### 7.4 One more, from `pageExtensions`

`md` is deliberately **not** a page extension. Adding it makes Next scan for
`.md` files as route candidates, and the only thing standing between
`docs/ARCHITECTURE-OPS.md` and a public URL would be that it happens to sit
outside `src/app`. Dozens of `.md` files sit at the repo root, including this
one.

---

## 8. Admin and supplier route protection

### 8.1 Three layers, because any one alone has been wrong

1. **RLS**, by `current_user_role()` and `supplier_members`. The floor.
2. **The server action**, which re-checks the role and **strips** fields outside
   the caller's visibility layer before writing.
3. **The route segment**, which redirects a non-admin away from `/admin`.

Layer 3 alone is **not** security: it is navigation. A server action reachable by
its id does not care what page linked to it.

### 8.2 Roles

```
user_role            customer | content_uploader | vendor | admin | super_admin | support
supplier_member_role owner | manager | scanner
```

- **`scanner` can redeem and nothing else.** A scanner device is left on a
  counter, and the blast radius of a stolen phone is bounded by the role, not by
  the PIN.
- **`support` reads broadly and writes almost nothing**, and every write it can
  make produces an `audit_log` row naming the actor.
- **`super_admin` differs from `admin`** only in the operations that cannot be
  undone.

### 8.3 The scanner surface

`/api/supplier/app/pin`, `/api/supplier/redeem`, `/api/supplier/vouchers/*`. It
is the most exposed authenticated surface in the system, because the device is
physically in a shop. Controls:

- bearer token rather than a cookie, so it is not CSRF-reachable;
- **the voucher's own `supplier_id` guard**, so a compromised scanner can only
  burn vouchers already sold against **its own** supplier;
- every attempt logged with a `voucher_scan_outcome`, including
  `unauthorized`, `wrong_supplier`, `invalid_signature` and `rate_limited`;
- terminal voucher states, so a burned voucher cannot be burned twice.

---

## 9. Input validation

- **Zod at every boundary.** Server actions, route handlers, webhook payloads.
- **Search queries are escaped** (`src/lib/utils/search-escape.ts`). An
  unescaped `%` in an `ILIKE` is a full table scan a stranger can request.
- **`?near=lat,lng` is validated**, and a bad value degrades to "no origin"
  rather than to a coordinate at `(0, 0)`.
- **Facet values are checked against the known filterable set** before reaching
  the engine.
- **Uploads are MIME-sniffed from the bytes**, never trusted by extension.
- **Money is never parsed from a float.** `ilsToAgorot(value.toFixed(2))`, a
  string, every time.

---

## 10. The open gaps, ranked

| # | Gap | Risk | What closes it |
|---|---|---|---|
| 1 | **CSP allows `unsafe-inline`** | XSS | a nonce generated in `src/proxy.ts` with `strict-dynamic` |
| 2 | **`supabase_admin` default privileges still grant `anon` everything** on dashboard-created tables | a new table is world-writable and nothing reports it | a privileged connection; until then, re-run 111 §2 after any dashboard table |
| 3 | **Rate limiting fails open on money surfaces** | unthrottled scan and checkout during a database incident | fail closed on those two |
| 4 | `audit_log` is append-only by convention only | the record of a decision can be edited | a `BEFORE UPDATE OR DELETE` trigger, per draft 120's pattern |
| 5 | Branch protection does not enforce | every push in the last run printed `Bypassed rule violations for refs/heads/main` | a GitHub settings change |
| 6 | Vercel treats `cursor/add-supabase-3c830` as production, not `main` | a deploy could ship an unreviewed branch | verify before any deploy |
| 7 | No automated secret scanning in CI | a secret can be committed | a scanner in the pipeline |
| 8 | No formal PCI attestation | a business requirement, unmet | Cardcom's attestation plus ours |

Items 1, 2 and 3 are engineering work. Items 5 and 6 are configuration and are
the cheapest risk reduction available: both are a settings change, and both
currently mean the deployed artefact is not guaranteed to be the reviewed one.
