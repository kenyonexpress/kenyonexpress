# ARCHITECTURE

KenyonExpress architecture contract. Markdown only. No code.

Companions:

- `DECISIONS.md`: why each structural choice
- `RISKS.md`: what that choice costs if it fails
- `docs/ARCHITECTURE-OVERVIEW.md`: what is running in production today

Written 2026-09-09. Money is integer agorot. Hebrew RTL throughout the UI.

---

## How to read this file

This document is the **target contract** for nine surfaces: stack, catalogue inheritance, RLS, payments, search, images, rate limits, observability, security.

Live production currently differs on several numbers and on hosting. Those gaps are listed once, here, so the rest of the file can describe the contract without lying.

| Contract (this file) | Live (read from `kenyonexpress` source 2026-09-09; production counts 2026-09-01) |
|---|---|
| Next.js 15 + Cloudflare Workers + Hono | Next.js 16.2.12 App Router on Vercel. No Hono process. Cloudflare holds DNS and R2. |
| `coupon_products` + `physical_products` child tables | `product_type` column on `products`. No child tables. |
| Coupon path: ledger escrow until redemption | No writer for `escrow_held`. Coupon prepayment stays with the platform. Supplier is paid in cash at the counter. |
| Browser PUTs the original to R2; Next never sees the bytes. Original under 50 MB. Renditions AVIF+WebP at 480 / 768 / 1200 / 1440. Signed PUT and private GET last 24 hours. | Original arrives as FormData on Next, `sharp` runs on the server, then renditions are PUT. Cap is 8 MB. Widths 400 / 800 / 1600, AVIF only at 1600. PUT TTL 600 seconds, GET TTL 3600 seconds. Delivery today is `/_next/image` on the largest WebP, not the rendition set. |
| Sign-in 5/min, signup 3/min, refresh 10/min, redemption 1/10 sec | `RATE_LIMIT_POLICIES`: login 10/hour, signup 5/hour, no session-refresh 10/min row (`app-session` is 30 per 10 min for the mobile exchange). Customer redeem 60/hour per IP; till `voucher-redeem` 120/hour per supplier user. |
| Meilisearch is the query engine | Meilisearch env unset in production. Queries fall back to Postgres `ILIKE`. |
| `payment_webhook_events`: no client policy, admin included | Migration 172: admin SELECT so the payments webhooks tab is not an empty table. Writes stay service-role. Raw Cardcom payloads therefore reach the browser for any `is_admin()` session. See `RISKS.md` R-16. |
| One R2 client; browser PUTs the original | Two modules: hand-rolled SigV4 in `src/lib/storage/r2.ts` (admin image path, default PUT 600s) and AWS SDK in `r2-service.ts` (multi-bucket, default PUT 600s / GET 3600s). Live ingest still runs `sharp` on Next, then the server PUTs renditions. |

Where this file and `docs/ARCHITECTURE-OVERVIEW.md` disagree on a **live count**, the overview wins. Where they disagree on **what the system is supposed to be**, this file wins, and `DECISIONS.md` / `RISKS.md` explain why.

---

## 1. System Overview

KenyonExpress is an Israeli marketplace. It sells two kinds of thing from one catalogue and one cart: **coupons** (a voucher redeemed at a named business) and **physical goods** (shipped). The customer-facing UI is Hebrew and RTL.

### 1.1 Layers

| Layer | Role |
|---|---|
| **Next.js 15 (App Router)** | Storefront, account, admin, supplier portal. Server Actions for mutations. Route Handlers for webhooks, cron, health. |
| **Cloudflare Workers** | Edge: session refresh, rate-limit lookup, signed media, webhook intake that must answer Cardcom fast. Hono on the Worker for JSON logs and small authenticated APIs that should not boot the Next server. |
| **Supabase (Postgres)** | Source of truth. RLS on every table. Money, vouchers, identity, outbox. |
| **Meilisearch** | External search index. Hebrew synonyms, typo tolerance, facets. Never the source of truth. |
| **Cloudflare R2** | Originals and renditions. Public CDN read, signed write. |

Cardcom (legacy LowProfile `/Interface/*.aspx`) is the card processor. Upstash is the rate-limit and queue fabric (Redis REST + QStash). Sentry is the error sink. Resend is mail.

### 1.2 What each process is allowed to do

- **Browser** talks to Next and to R2 (presigned PUT only). It never holds a service-role key, a Cardcom secret, or a Meilisearch admin key.
- **Next** owns checkout, finalize, voucher issue, admin writes, and the Meilisearch consumer when QStash is not configured (inline drain).
- **Workers** own the hot anonymous path: auth cookie refresh, rate-limit check, health that must stay up if Next is swapping, and the Cardcom IndicatorUrl if the Next cold start is too slow.
- **Postgres** owns the rules: conservation CHECKs, transition guards, RLS, SECURITY DEFINER RPCs. Application code that skips a rule is a bug; a SQL constraint that refuses it is the design.

### 1.3 Trust boundary

The only keys that bypass RLS are `service_role` (server, never in a cookie) and SECURITY DEFINER functions that pin `search_path` and check the caller themselves. PostgREST is exposed as `anon` and `authenticated`. That is why RLS is the product, not a backup.

---

## 2. Class Table Inheritance

The catalogue is **one parent plus typed children**, not a JSON blob with a type field.

### 2.1 Shape

| Table | Holds | Cardinality |
|---|---|---|
| `products` | Identity shared by every sellable row: slug, status, supplier, category, Hebrew/English names, `platform_percent`, images, timestamps, soft-delete. Discriminator column `product_type`. | 1 row per sellable thing |
| `coupon_products` | Coupon-only money and redemption: absolute `coupon_price` (agorot), face value, balance due at the business, `coupon_expiry_days`, redemption instructions. | 1:1 with a coupon `products` row |
| `physical_products` | Physical-only fulfilment: stock, weight, shipping class, compare-at price when it differs from the charge. | 1:1 with a physical `products` row |

`product_type` is a closed enum (`coupon` | `physical`, plus `service` / `recurring` when those children exist). The application treats the loaded row as a **discriminated union**: a coupon row is never asked for a shipping class, a physical row is never asked for a face value.

### 2.2 Invariants

1. A `products` row of type `coupon` **must** have exactly one `coupon_products` row and **must not** have a `physical_products` row. The reverse for `physical`. Enforced by foreign keys plus a type-matching CHECK (or an equivalent trigger). Orphan parents and type-mismatched children are refuse-to-insert, not a warning.
2. Shared money that both types need (`platform_percent`) lives on the parent and is **snapshotted** onto `order_items` at purchase. Child money (coupon price, physical charge) is snapshotted from the child in the same statement.
3. Checkout, cart, search indexing, and admin forms **branch on `product_type`**. They do not `COALESCE` a pile of nullable columns.
4. `service` and `recurring`, if sold, get their own child tables. They do not reuse `physical_products` with nulls.

### 2.3 Why this is not a single wide table

Coupon money and physical money are different shapes. Putting both on `products` produces a row that is half NULL for every product, and Drizzle (and every reader) cannot prove which half is live. Class Table Inheritance makes the illegal combination unrepresentable. See `DECISIONS.md` §1.

---

## 3. RLS Model Map

Postgres roles on the wire are `anon`, `authenticated`, and `service_role`. **Supplier** and **admin** are not Postgres roles. They are `authenticated` plus a helper (`is_supplier_member(uuid)`, `is_admin()`). The map below is the logical matrix the policies must implement: **role × table × action**.

Legend (actions):

- **S** = SELECT, row-filtered
- **I** = INSERT, row-filtered
- **U** = UPDATE, row-filtered
- **D** = DELETE, row-filtered
- **-** = denied for that role (`service_role` or a SECURITY DEFINER RPC only)
- **own** = filtered to `auth.uid()` (or the session cart)
- **member** = filtered through `supplier_members` for that supplier
- **staff** = `is_admin()` or `is_support()` as noted

A cell lists the allowed actions. `S+U own` means SELECT and UPDATE of own rows, no INSERT, no DELETE. Collapsing INSERT/UPDATE/DELETE into a single "write" is how a table that must be append-only grows an UPDATE policy.

`service_role` is omitted from the columns: it bypasses RLS. Using it from a browser is a severity-1 incident, not a configuration option.

This matrix is the **contract** for the tables the nine surfaces touch. The live 133-policy inventory (61 tables) is `docs/DB-SECURITY-MODEL.md`. Where they disagree on a live grant, the security model wins. Where they disagree on what the policy must be, this file wins.

### 3.1 Catalogue and media

| Table | anon | authenticated | supplier | admin |
|---|---|---|---|---|
| `products` (active, not deleted) | S | S | S all; I+U **member** (own supplier, not money columns); no D | S+I+U+D |
| `coupon_products` / `physical_products` | S (via parent visibility) | S | S **member**; I+U **member** except money; no D | S+I+U+D |
| `product_variants` | S (active parent) | S | S+I+U **member**; D **member** of own unpublished | S+I+U+D |
| `product_images` / `media_assets` | S | S | S **member**; I via signed upload; U alt only; no D (orphan job) | S+I+U+D |
| `categories` | S | S | S | S+I+U+D |

A supplier never reads another supplier's draft, paused, or money fields. `platform_percent` and coupon price are admin-set. Content uploaders write catalogue copy, not rates.

### 3.2 Identity, cart, account

| Table | anon | authenticated | supplier | admin |
|---|---|---|---|---|
| `profiles` | - | S+U **own** (non-role columns); no I (trigger on signup); no D | same as authenticated | S+I+U+D |
| `carts` | S+I+U+D **own session** (the only anon write) | S+I+U+D **own** | same | S **staff**; no client I/U/D |
| `user_addresses` | - | S+I+U+D **own** | - | S |
| `orders` | - | S **own**; no I/U/D (checkout RPC / finalize) | S **member** of paid lines; no I/U/D | S; U status via guards; no client D |
| `order_items` | - | S **own**; no I/U/D | S **member**; no I/U/D | S; U via guards; no client D |
| Address snapshot on an order | - | S **own** | - (not a shipping-address dump) | S |

Anon may hold a guest cart. Anon may not create an order. Pay is an authenticated action. `orders` INSERT by `authenticated` is a hole if the policy exists: live grants still allow DML, so RLS is the only gate. See `RISKS.md` R-3.

### 3.3 Money, vouchers, wallet

| Table | anon | authenticated | supplier | admin |
|---|---|---|---|---|
| `payments` | - | S **own**; no I/U/D | - | S; no client I/U/D |
| `payment_events` | - | S **own**; no I/U/D (append-only; trigger refuses U/D) | - | S; no client I/U/D |
| `payment_webhook_events` | - | - | - | - (contract: server I only; unique replay key). Live: admin **S** (172). |
| `split_executions` | - | S **own**; no I/U/D | S **member**; no I/U/D | S; no client I/U/D |
| `escrow_holds` | - | S **own**; no I/U/D | S **member**; no I/U/D | S; no client I/U/D |
| `refunds` | - | S **own**; I request **own**; no U/D | - | S; U workflow; no D |
| `vouchers` | - | S **own**; no I/U/D | S **member** (till lookup via RPC); no I/U/D | S; no client I/U/D |
| `voucher_redemptions` | - | S **own**; no I/U/D | S **member**; no I/U/D (insert is the RPC) | S; no client I/U/D |
| `wallet_accounts` / `wallet_entries` | - | S **own**; no I/U/D | - | S; no client I/U/D |
| `rate_limits` / `user_rate_limits` | - | - | - | - (server) |

Writes to money tables go through SECURITY DEFINER (`finalize` path, `redeem_voucher`, `fn_wallet_transfer`) or `service_role` behind a server action that has already passed RBAC. A missing write policy is not a hole if grants are also absent. A **present** I/U/D policy on `orders` for `authenticated` that is not gated on `is_admin()` **is** a hole.

### 3.4 Supplier membership and till

| Table | anon | authenticated | supplier | admin |
|---|---|---|---|---|
| `suppliers` | S (public profile) | S | S; U **owner** (profile, not commission); no I/D | S+I+U+D |
| `supplier_members` | - | S **own memberships**; no I/U/D | S **member**; I+U+D **owner** | S+I+U+D |
| `supplier_staff` | - | - | S **member**; PIN via RPC (no S of hash); I+U **owner**; D **owner** | S |
| `supplier_branches` | S (public) | S | S **member**; I+U+D **member** | S+I+U+D |

Redemption is not an UPDATE policy on `vouchers`. It is `redeem_voucher()`, which checks membership, expiry, and `issued` in one statement.

### 3.5 Server-only (deny all client roles)

`payment_webhook_events`, `rate_limits`, `user_rate_limits`, `search_index_outbox`, `search_index_dlq`, `settlement_events`, `referral_signals`, `stock_reservations`, `audit_log` writes.

Contract: RLS on, zero useful **client** policies (no policy, or RESTRICTIVE `false`). Admin forensics of money events belongs in a redacting SECURITY DEFINER RPC, not a table grant of raw provider payloads.

Live (172, measured in source): admin SELECT on `payment_webhook_events` plus reporting/telemetry tables (`ai_usage`, `analytics_events`, `report_*`). `rate_limits`, `user_rate_limits`, and `search_index_outbox` stay restrictive deny. That admin SELECT on webhook rows is the gap in the header table and `RISKS.md` R-16. `docs/DB-SECURITY-MODEL.md` still describes the pre-172 "zero policy" inventory; the live grant wins over that file.

---

## 4. Payment Flow

Cardcom LowProfile charges **one** amount on **one** account. Cardcom does not atomically split that charge to a supplier. The split is our ledger. See `DECISIONS.md` §3.

### 4.1 Happy path

1. Checkout snapshots every money field onto `order_items`: `platform_percent`, face, paid-on-site, balance-due, commission, supplier residual, cashback. Settlement never re-reads the live product.
2. Server creates a LowProfile deal. Customer pays in Cardcom's iframe. PAN never touches us.
3. Cardcom calls IndicatorUrl (the webhook). The body is **unauthenticated**. Authenticity is an unguessable secret on the URL plus a mandatory server-to-server `GetLpResult` re-fetch. Amount, status, and token come from the re-fetch only.
4. First write: insert into `payment_webhook_events` with unique `(provider, external_event_id)`. A unique violation is a replay: answer 200 and stop. See `DECISIONS.md` §4.
5. `finalizeOrder` is the only writer of `orders.status = paid`. If `paid_at` is already set, it returns success as a replay and issues no second voucher set.
6. Ledger split, in the same financial transaction as paid:

**Physical.** Immediate split. Platform keeps `platform_percent` of the charge. Supplier residual is `charge − fee` (subtraction, not a second percentage). Status moves to `split_executed`. No hold.

**Coupon.** Escrow. The on-site coupon price is recorded. The supplier share that this contract treats as theirs stays in `escrow_held` until the voucher is redeemed (or expires / refunds). Redemption (or expiry credit) is the release. The customer still pays the remaining face in cash at the counter; that cash never enters the platform.

7. Coupon paid: issue vouchers (code + QR) in the same transaction. Physical paid: notify supplier to ship. Stock reservation converts to a sale.

### 4.2 Failure and replay

- Cardcom retries IndicatorUrl. Idempotency table plus `paid_at` short-circuit make retries safe.
- `GetLpResult` disagrees with the callback: do not finalize. Alarm. Daily reconciliation catches the rest (`DECISIONS.md` §8).
- Refund of a coupon is legal only while every voucher is still `issued`. After redemption the value was consumed at the business.

### 4.3 What this flow refuses

- Trusting the webhook body for money.
- Asking Cardcom to split to a supplier account (the API we use cannot do it atomically).
- Computing the supplier residual as a second rounded percentage.
- Writing `paid` from any path other than finalize.

---

## 5. Search Architecture

Postgres is the catalogue. Meilisearch is a derived index. If they disagree, Postgres is right and the index is rebuilt.

### 5.1 Write path

Two transports, both deliberate:

1. **Fast path.** Supabase database webhook on `products` → queue (QStash) → consumer (`/api/search/index-job` or the Worker equivalent). The payload is a change notice (`op`, `product_id`, reason). The consumer **re-reads** the product from Postgres before upserting or deleting. A spoofed payload can at worst schedule a no-op.
2. **Floor.** AFTER trigger `enqueue_search_index` writes `search_index_outbox` in the **same transaction** as the product change. A drain (`claim_search_index_jobs`, `FOR UPDATE SKIP LOCKED`) feeds the same consumer. The webhook can vanish; the outbox cannot, unless the product write rolls back with it.

Deletes and fall-out-of-`active` enqueue `delete`, not `upsert`. `product_id` is not a foreign key: deleting the product must leave the "remove this document" instruction behind.

When QStash is unset, enqueue runs the consumer inline so preview and local work without Upstash.

### 5.2 Hebrew and ranking

Meilisearch has no Hebrew morphology. Synonyms are declared in groups and expanded both directions, including prefixed forms (ה, ו, ב, ל, מ, ש, כ) on known terms only. A general prefix stripper would destroy real words.

Typo tolerance is on, tuned for Hebrew (words are short because vowels are unwritten): **one typo from 4 characters, two from 7**. Meilisearch's default (5 and 9) leaves `מסעדה` with no budget. Identifiers (`sku`, `slug`, `barcode`) are excluded from typo correction. Three-letter words stay exact: at that length one edit matches half the catalogue.

Facets live on the index (`type`, category, city, tags, brand, supplier, price, in_stock, geo). Ranking inserts in-stock above proximity so an out-of-stock product cannot win on wording alone.

### 5.3 Drift checker

Count of `products` that are `active` and not deleted must equal the index document count. The checker cannot prove the documents are *right*; it proves none are missing or stale-extra, which is the failure both transports can be "healthy" through (bulk import that skipped the trigger, index wiped and recreated, filter predicate changed). Drift is an alarm, not a silent fallback to wrong results. A nightly (or cron) run is the floor; a mismatch pages.

Query path: if Meilisearch is configured, it answers. If not, Postgres `ILIKE` answers the same card shape and the response names the engine. Production today is on the fallback. That is a working search with no typos, no synonyms, and no facets.

---

## 6. Image Pipeline

Product, category, and hero bytes do not live in git or on the Next disk.

### 6.1 Ingest

1. Admin (or content uploader) requests a signed PUT. Original must be under **50 MB**, MIME allowlisted (JPEG, PNG, WebP, AVIF; GIF only if the pipeline can still emit still renditions). Hebrew `alt` is required before publish.
2. Browser PUTs **directly to R2**. Bytes do not transit the Next server. A 50 MB cap is only safe on this path. (Live today: the original arrives as FormData, `sharp` runs on Next, then renditions are PUT. That path stays at 8 MB. Raising the live cap without switching ingest is an outage. See `RISKS.md` R-15. Two R2 modules exist: the hand-rolled SigV4 signer used by the admin image action, and the AWS SDK multi-bucket service. They must keep the same account credentials and must not grow a third backend.)
3. Signed URL TTL is **24 hours** for the upload grant and for a private GET. That is long enough for a bad mobile network and short enough that a leaked URL is not a standing write token. (Live today: PUT 600 seconds, GET 3600 seconds.)
4. After PUT, the server records `media_assets` (path, width, height, `alt_he`) and kicks the rendition job. Public product delivery is the hashed rendition URL with immutable cache headers, not an on-the-fly optimizer as the only copy. (Live today: `/_next/image` on the largest WebP; the 400/800/1600 files are an archive.)

### 6.2 Renditions

Every original produces AVIF and WebP at **480 / 768 / 1200 / 1440 px** (never upscaled: a 900 px original does not emit 1200 or 1440). The public URL is content-hashed so a replaced image is a new key.

Serve with long cache headers on the hashed object (`Cache-Control: public, max-age=31536000, immutable`) and a short-lived signed GET when the object is not public (supplier invoices, ID scans: 24 hour GET). Product images are public-read.

### 6.3 Rules

- Width and height stored up front (CLS).
- Orphan delete is delayed after unpublish, not immediate (in case of undo).
- Fallback when R2 env is missing: Supabase Storage, same validation, same rendition contract. Preview must not invent a third pipeline.

---

## 7. Rate Limiting

Limits are enforced in **Upstash Redis** (REST), O(1) per request, not in Postgres on the hot path. See `DECISIONS.md` §6.

| Action | Limit | Key |
|---|---|---|
| Sign-in | **5 per minute** | IP (and a separate per-account bucket so rotating IPs cannot spray one mailbox). Live: 10 per hour. |
| Signup | **3 per minute** | IP. Live: 5 per hour. |
| Session refresh | **10 per minute** | IP / session. Live: no row by this name; `app-session` is 30 per 10 minutes for the mobile exchange only. Cookie rotation on `src/proxy.ts` is not this limiter. |
| Redemption (till or customer-facing redeem) | **1 per 10 seconds** | supplier user (till) or IP (public redeem). Never a shop-floor NAT sharing one IP bucket with every scanner. Live: customer 60 per hour per IP; till 120 per hour per supplier user. |

Fail **closed** on money (checkout, redeem) when both Upstash and the Postgres fallback are unavailable. Fail **open** on read-only search would hide an outage as "no results"; search has its own budget and is not this table.

Key prefixes are part of the policy. Sign-in and signup must not share a counter. The caller never passes a raw Redis key; the policy name derives it.

Postgres `check_rate_limit` remains the fallback so an Upstash outage does not reset every bucket to empty. It is **not** granted to `anon`. A publishable-key caller who used to pick both the key and the threshold could lock a victim out of login. That hole stays closed.

---

## 8. Observability

### 8.1 Errors

Sentry on **three runtimes**:

- **Web (browser + Next server).** Storefront, Server Actions, Route Handlers, cron.
- **Workers.** Hono and any IndicatorUrl / rate-limit Worker. A Worker that swallows exceptions is an outage with no ticket.
- **Edge.** Session proxy / Next edge entry. Same DSN, EU ingest (`de.sentry.io`). A US host 404 looks like a bad token and is not.

No session replay. Traces sampled low. Money-path failures also push ntfy (`kenyon-ofir-limit`) at SEV1/SEV2.

### 8.2 Logs

JSON logs from Hono (Workers) and from the Next request wrapper. One request id on every line. Redact tokens, cookies, PAN, `cardcom_token`, JWTs. Logs diagnose; they do not prove a charge. Proof is `payment_events` (append-only) and the ledger tables. (Live today: Next request wrapper only. There is no Hono process.)

### 8.3 Probes

| Route | Question it answers | Public shape |
|---|---|---|
| `/api/health` | Am I alive, and can I see Postgres? | `ok`, coarse `database`, latency. No versions, no env names, no error strings. 200 or 503. `Cache-Control: no-store`. |
| `/api/ready` | Can I take traffic? | `ok` plus named checks: database, redis (the rate limiter, including Upstash when configured), Meilisearch, R2, Cardcom config. 503 only when something is `down`. Unconfigured optional deps are not `down`. |

A cached health check is a lie with a timestamp. Both routes are unauthenticated on purpose (monitors have no session), so they are an inventory if they talk too much. They must not.

---

## 9. Security Model

### 9.1 Auth

- **PKCE** for OAuth (Google). The auth code is worthless without the verifier that stays in the cookie. `@supabase/ssr` default.
- Email OTP / magic link as backup. OTP is rate-limited per IP **and** per destination number (the measured lockout vector was number-only or IP-only, not both).
- Session cookies: **httpOnly**, **Secure**, **SameSite=Lax** (Strict breaks the Cardcom return and OAuth bounce). Never readable by JavaScript. Guest cart session is the same cookie flags so `/api/a` can treat the anonymous id as server-set.

### 9.2 Session rotation

Refresh rotates the refresh token. A stolen cookie that has already been rotated is rejected. Concurrent tabs must not invalidate each other (Supabase rotation window). Logout deletes the cookies; it does not trust the client to forget.

### 9.3 Database

- RLS on **every** table. Zero exceptions for "internal" tables: those get RLS on and no client policy.
- Privileged writes go through **SECURITY DEFINER** functions with a pinned `search_path` (`''` or `public` explicitly). An unpinned search_path on a definer is a vulnerability, not a style issue. Count of unpinned definers must stay 0.
- Definer functions that take a `uid` from the caller are forbidden on money. They read `auth.uid()` themselves.
- `service_role` stays on the server. Admin UI uses the user session plus `is_admin()` policies, not the bypass key, except where a trigger or RPC already requires it.

### 9.4 Application gates

Route guards (`requirePanelSession`, `requireSection`, supplier RBAC) stop a URL. They do not stop PostgREST. RLS stops PostgREST. Both are required. A page that forgets its guard is still blocked at SQL if the policy is right; a policy that forgets a role is still blocked at the page if the guard is right. Neither is enough alone.

---

## Document control

| Date | Change |
|---|---|
| 2026-09-09 | Contract written: nine surfaces, live gaps named in the header table. Replaces the May-2026 pointer that lived in this path. |
| 2026-09-09 | Audit against `kenyonexpress` source: RLS map is role × table × action (S/I/U/D); header names Next ingest of originals, exact live rate-limit windows, GET TTL 3600s, Hebrew typo floors 4/7. |
| 2026-09-09 | Second source pass: header names 172 admin SELECT on `payment_webhook_events`; two R2 modules; `vercel.json` still has no `crons` key (R-8). |
