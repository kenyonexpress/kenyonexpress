# KenyonExpress system map (cursor pack)

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only. It does not replace
`docs/ARCHITECTURE-OVERVIEW.md`.
Where this file and an older brief disagree, the live tree on this branch is right.

Measured companions (same worktree, read 2026-09-07):

```
docs/ARCHITECTURE-OVERVIEW.md
docs/DATA-MODEL.md
docs/MONEY-MODEL.md
docs/PAYMENT-FLOW.md
docs/API-REFERENCE.md
docs/DB-SECURITY-MODEL.md
docs/SEARCH-PIPELINE-SPEC.md
docs/ENV-REFERENCE.md
docs/DEAD-CODE.md
docs/adr/0010-no-search-ui-then-header.md
```

Production project:
`ixvwfbuvfxxsjiywhbbb`.
Hosted preview:
`https://kenyonexpress.vercel.app`.
Apex domain
`kenyonexpress.co.il`
still points at WordPress until the owner cuts DNS.

---

## 0. What this product is

KenyonExpress is a Hebrew RTL marketplace. One catalogue, one cart, two money paths.

| Kind | `product_type` | Customer pays on this site | What happens after pay |
|---|---|---|---|
| Coupon | `coupon` | Absolute `coupon_price_ils` (no default, no percent of face) | Platform keeps 100% of the prepayment. Supplier collects `face − coupon_price` in cash at scan. No escrow. No payout. |
| Physical | `physical` | 100% of the charge | Platform keeps snapshotted `platform_percent`. Residual is supplier due. No escrow. |
| Service | `service` | Same settlement as physical | Schema exists. No distinct money path. |
| Recurring | `recurring` | Token charge per period | `subscriptions` / `subscription_charges` (migration 135). `/account/subscriptions`. |

The fact that is written down wrong most often: coupon prepayment is an **absolute shekel amount**, never a percentage. A product without
`coupon_price_ils`
cannot be sold. There is no global platform rate anywhere.

---

## 1. Runtime stack

The brief for this pack said Next.js 15. The tree on this branch is **Next.js 16.2.12**, App Router, React 19.2.4. Anything that still says "middleware.ts" means
`src/proxy.ts`
and the exported function must be named
`proxy`.

| Layer | Choice on this branch |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict |
| Package manager | pnpm 11.1.2 only. `npm install` cannot work here. See `AGENTS.md`. |
| Database | Supabase Postgres, project `ixvwfbuvfxxsjiywhbbb` |
| Auth | Supabase Auth. Role lives in `profiles.role`, not `app_metadata`. |
| Client data | `supabase-js` with anon key + session. Admin writes use `src/lib/supabase/admin.ts` (service role, server only). |
| ORM | **Not used at runtime.** See §4. |
| Money | `src/lib/money.ts` re-exports branded types from `src/lib/commerce/money.ts`. There is **no** `packages/money.ts`. There is **no** `packages/` directory. |
| Payments | Cardcom legacy `/Interface/*.aspx`. Low Profile iframe. No HMAC on callbacks. |
| Search engine | Meilisearch when `MEILISEARCH_HOST` + `MEILISEARCH_API_KEY` are set, else Postgres `ILIKE`. Same `ProductCard` shape. |
| Search UI | `/search` exists. Header field was restored 2026-09-02 (ADR 0010) because the pixel refs contain it. There is no marketplace search product: no facet chrome, no typeahead-as-a-destination, no Meilisearch dashboard in the storefront. |
| Queue | Upstash QStash when configured, else inline. |
| Rate limit | Upstash Redis when configured, else Postgres `check_rate_limit` (service_role only after migration 127). |
| Media | Cloudflare R2. Signed PUT from admin. Public read via `R2_PUBLIC_BASE_URL`. |
| Errors | Sentry EU (`@sentry/nextjs`). |
| Hosting | Vercel, region `fra1`. |
| Mobile till | `apps/mobile` is a second RPC caller. Grants audits that grep only `src/` under-count. |

There is no Turborepo. There is no
`apps/web`.
There is no
`apps/api`.
The web app is
`src/app/`.
Older documents that sketch that layout are an unexecuted plan.

---

## 2. App Router map

Edge first:
`src/proxy.ts`.
Order is load-bearing.

1. `/monitoring` (Sentry tunnel) forwards first. No session. A broken page must still report.
2. Legacy WordPress redirects on GET/HEAD only, before session refresh. POST is not redirected (a redirected payment callback is a payment nobody hears about).
3. `supabase.auth.getUser()` for cookie rotation.
4. Auth gates: `/account/*`, `/coupon/*`, `/supplier/*` except login and access-denied, `/checkout/*` **sub-routes only**.
5. `/admin/*` optimistic check: `profiles.role` in `{admin, super_admin, content_uploader, support}`. Every page re-gates. Every server action re-checks.

Deliberate exclusions:

- `/checkout` itself is not gated. Guests shop. Sign-in happens on Pay. `/auth/callback` merges the guest cart.
- `/checkout/frame-return` must not be gated. Cardcom navigates the iframe there cross-site. Browsers withhold `SameSite=Lax` cookies. Gating it shows a login form inside a just-paid frame.

### 2.1 Storefront `(store)` / `(main)` / `(legal)`

| Route | Job |
|---|---|
| `/` | Home. Electro home-v7 rhythm. |
| `/products` | Catalogue archive. |
| `/product/[slug]` | PDP. |
| `/category/[slug]` | Category. |
| `/s/[id]` | Short supplier / deal alias. |
| `/city/[slug]` | City landing (seventeen regions). |
| `/search` | Search results. Engine named in the JSON (`meilisearch` or `database`). |
| `/cart` | Cart. Guest allowed. |
| `/checkout` | Checkout. Guest allowed until Pay. |
| `/checkout/return` | Browser return from Low Profile. |
| `/checkout/frame-return` | Iframe return. Ungated on purpose. |
| `/checkout/app-return` | Mobile return. |
| `/checkout/failed` | Declined / abandoned. |
| `/checkout/confirmation` | Paid confirmation. |
| `/gift/[token]` | Gift claim. |
| `/redeem/[token]` | Signed redeem URL. |
| `/coupon/[id]` | Signed-in voucher surface (gated). |
| `/coupons`, `/coupons/[id]` | Public coupon listing / deal. |
| `/suppliers` | Supplier directory. |
| `/about`, `/faq`, `/contact`, `/blog` | Content. |
| `/accessibility`, `/privacy-policy`, `/terms-and-conditions`, `/refund_returns` | Store aliases of legal. |
| `/legal/privacy`, `/legal/terms`, `/legal/returns`, `/legal/accessibility` | Canonical legal. |
| `/offline` | PWA offline tile. `noindex`. |
| `/newsletter/confirm`, `/newsletter/unsubscribe` | Double opt-in / one-click. |

### 2.2 Account `(account)`

All require a session.

`/account`, `/account/details`, `/account/security`, `/account/addresses`, `/account/orders`, `/account/orders/[id]`, `/account/orders/[id]/invoice`, `/account/coupons`, `/account/vouchers`, `/account/my-vouchers`, `/account/wallet`, `/account/tokens`, `/account/referrals`, `/account/subscriptions`, `/account/wishlist`.

### 2.3 Admin `(admin)`

Optimistic gate in the proxy. Per-section
`requireSection`.
content_uploader reaches catalogue sections only. Money sections are admin / super_admin.

Sections present as pages: dashboard, products (list / new / edit), categories, coupons (list / new / lookup / codes), suppliers, vendors, orders, payments, payouts, approvals, reviews, discounts, affiliates, referrals, users, analytics, reports, search, queues, audit-log, status, growth, feature-flags.

Payout **actions** are dead at runtime: production has no `payout_statements` table. Coupon model owes suppliers nothing. See
`docs/API-REFERENCE.md`
§5.

### 2.4 Supplier `(supplier)` / `(supplier-public)`

Membership in
`supplier_members`
(`owner` | `manager` | `scanner`).
This is the coupon-partner layer. It is orthogonal to
`profiles.role`.

`/supplier/login`, `/supplier/access-denied` (public). `/supplier`, `/supplier/orders`, `/supplier/products`, `/supplier/payouts`, `/supplier/redemptions`, `/supplier/scan`, `/scan`.

### 2.5 Auth `(auth)`

`/login`, `/signup`, `/signup/confirm`, `/forgot-password`, `/reset-password`, `/mfa`, `/auth/callback`.

### 2.6 HTTP surfaces outside pages

Route handlers are listed in
`docs/cursor/API-SURFACE.md`.
Cron lives under
`/api/cron/*`
(Bearer
`CRON_SECRET`,
no default). Cardcom webhook:
`/api/payments/cardcom/webhook`.
Search worker:
`/api/search/index-job`
and DLQ.
Feeds:
`/feed.xml`,
`/merchant.xml`.

---

## 3. Supabase schema domains

61 base tables in
`public`,
RLS on every table, 0 disabled, 133 policies (measured 2026-09-01). 12 views, all
`security_invoker`.
72 functions, 61
`SECURITY DEFINER`,
all 61 pin
`search_path`.

### 3.1 Identity and roles

```
auth.users 1:1 profiles
  profiles.role: customer | content_uploader | vendor | admin | super_admin | support
```

Cursor-pack four roles (how this pack talks) mapped onto the live enum:

| Pack name | Live value | Meaning |
|---|---|---|
| customer | `customer` | Default buyer. |
| content-uploader | `content_uploader` | Catalogue write. No money. |
| coupon-partner | `vendor` plus `supplier_members` | The business that accepts the voucher. Scanner is a membership, not a
`profiles.role`. |
| admin | `admin` and `super_admin` | Operations. `support` is a fifth live value: read-expanded, no money write. |

`enforce_profile_privilege_columns` stops a user changing their own
`role`
or
`supplier_id`.
service_role bypasses that trigger because
`auth.uid()`
is NULL. Server code that assigns a role carries the whole responsibility.

### 3.2 Catalogue

`categories`, `products`, `product_variants`, `product_images`, `media_assets`, `suppliers`, `supplier_branches`, `coupon_deals`, `coupons` (empty fossil), `homepage_sections`, `banners`.

Public read predicate for the catalogue, shared with the search indexer:

```
status = 'active' AND deleted_at IS NULL
```

### 3.3 Commerce and money

```
profiles ── orders ── order_items ── vouchers ── voucher_redemptions
                 │           └── settlement_events (server-only)
                 ├── payments ── payment_events (append-only)
                 │            └── payment_webhook_events (server-only)
                 ├── refunds
                 ├── invoices
                 └── stock_reservations (server-only)

wallet_accounts ── wallet_entries     [live]
wallet_balances ── wallet_transactions [fossil, 0 rows]
```

`order_items` is the money row. Settlement never joins back to a live product. Snapshotted: `platform_percent`, `face_value_agorot`, `paid_on_site_agorot`, `balance_due_agorot`, `commission_agorot`, `supplier_immediate_agorot`, `cashback_amount_agorot`, supplier identity by value.

### 3.4 Partner / till

`supplier_members`, `supplier_staff` (bcrypt PIN, not a login), `supplier_leads`, `vendors` (legacy, still referenced by `coupon_deals`).

### 3.5 Growth

`referrals`, `referral_signals` (server), `referral_program_settings`, `affiliates`, `discount_campaigns`, `discount_redemptions`, `abandoned_cart_nudges`, `newsletter_subscribers`, `email_suppressions`, `push_tokens`.

### 3.6 Search plumbing

`search_index_outbox` (no FK on `product_id` on purpose), `search_index_dlq` (server), `search_events`, `popular_searches`, `user_recent_searches`, `seo_redirects`.

### 3.7 Platform

`audit_log` (trigger insert, client DML denied), `notification_outbox`, `rate_limits`, `user_rate_limits`, `legacy_percent_archive_112`, `carts` (the **only** table `anon` may write; lines are `items` jsonb, there is no `cart_items` table).

### 3.8 Other schema

`wp_import` holds WordPress migration tables that **shadow** `public` names (`orders`, `products`, `vouchers`). Always schema-qualify near import.

---

## 4. Drizzle layer

`drizzle-orm` and
`drizzle-kit`
are in
`package.json`.
`drizzle.config.ts`
and
`src/db/schema/`
exist.

**Runtime does not use them.** Measured in
`docs/DEAD-CODE.md`
(2026-09-02): zero imports outside
`src/db`
itself. Application reads and writes go through
`supabase-js`.
The schema-as-code that production actually matches is
`src/types/database.ts`
(generated from the live project) plus the SQL files that were applied through MCP.

Treat Drizzle as a frozen sketch. Do not add new query paths through it. Do not delete it from this pack's work: file deletion is a hard stop. A later human commit can
`git rm`
after approval.

`DATABASE_URL` /
`SUPABASE_DB_URL`
are tooling only. Never set them on Vercel.

---

## 5. R2 storage

Admin image pipeline:

```
requestUploadUrl (server action, staff)
  → signed PUT to Cloudflare R2
  → processAndUploadImage
  → media_assets row (path, width, height, alt_he)
  → product_images when attached
```

Required env (all five, Cloudflare dashboard):
`R2_ACCOUNT_ID`,
`R2_BUCKET`,
`R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`,
`R2_PUBLIC_BASE_URL`.

Without them, upload is unavailable. Wrong public base means the object exists and the storefront 404s.

Launch trap: 32 product images still resolve against
`kenyonexpress.co.il/wp-content/uploads/...`
on the WordPress install. DNS cutover without pulling those objects into R2 ships 19 real products with broken images. See
`docs/cursor/LAUNCH-BLOCKERS.md`.

Rules: no binary in git; Hebrew alt before publish; MIME allowlist jpeg/png/webp/avif; public read; write via signed PUT / service role only.

---

## 6. Upstash Redis and QStash

Two products, two jobs.

| Product | Env | Job | If missing |
|---|---|---|---|
| Redis | `UPSTASH_REDIS_REST_URL` + `_TOKEN` | Rate limits (search, analytics beacon, voucher scan 30/min/user, staff PIN 15/hour/staff) | Postgres `check_rate_limit`, **service_role only** |
| QStash | `QSTASH_TOKEN` plus two rotating HMAC keys | Search index jobs. `Upstash-Signature` JWS verified by `verifyQstashSignature` | `enqueue` runs the worker inline |

`check_rate_limit` used to be callable as anon with a caller-chosen key and threshold. Migration 127 revoked that. A public
`POST /rest/v1/rpc/check_rate_limit`
now returns 401 / 42501.

QStash retries 5 times, then POSTs
`/api/search/index-dlq`
and parks a copy in Upstash's own DLQ. Deletes are idempotent: Meilisearch 404 on DELETE is success.

---

## 7. Meilisearch backend (not a search product)

Two engines, one interface
(`src/lib/search-server.ts`):

```
{ results, total, engine: 'meilisearch' | 'database' }
```

Stage 1 (today if host unset): Postgres `ILIKE`, terms sanitised by
`sanitizeOrTerm`.

Stage 3: Meilisearch. `type` is a filterable attribute so coupon / physical faceting happens in the engine and
`estimatedTotalHits`
stays truthful.

Indexing:

```
products row change
  ├─ fast: Supabase DB webhook → /api/webhooks/products → QStash → /api/search/index-job
  └─ floor: AFTER trigger enqueue_search_index() → search_index_outbox (same transaction)
            → claim_search_index_jobs()  (FOR UPDATE SKIP LOCKED)
```

Webhook payload is a **notification, never data**. The worker re-reads Postgres. Same philosophy as Cardcom `GetLpResult`. A spoofed payload can at worst schedule a no-op.

When Meilisearch is unconfigured every index job is a successful no-op. The pipeline stays wired and silent until
`MEILISEARCH_HOST`
appears.

**No search UI as a product.** There is a header field and a
`/search`
route because the Electro refs contain them (ADR 0010, 2026-09-02). There is no Meilisearch-branded chrome, no admin search-as-a-service screen for customers, no saved-search product. `/admin/search` is an operator index debugger, gated.

Hebrew synonyms live in
`src/lib/search/hebrew-synonyms.ts`.
`fn_record_recent_search`
is granted to anon so a guest's recent searches work.

---

## 8. Cardcom payment boundary

The platform is the merchant. Suppliers are not Cardcom sub-merchants in v1.

```
beginCheckout
  validates cart SERVER-SIDE (client sends ids and consent, never prices)
  reserve_order_stock(order, ttl=15min)  (shorter than ORDER_EXPIRY_MINUTES)
  snapshots money + supplier identity onto order_items
  opens Cardcom Low Profile, returns { frame } for the iframe
     OR submitCheckout: saved-card token, server-to-server, no redirect

Cardcom → POST /api/payments/cardcom/webhook?s=<secret>
  Cardcom DOES NOT SIGN callbacks. No HMAC header.
  ?s= compared in constant time against CURRENT and RETIRING secrets, no short-circuit
  POST body is NEVER trusted for money
  GetLpResult re-fetched server-to-server: only trusted amount, status, token
  journal payment_events first
  dedup (provider, external_event_id); replay = 200 no-op

finalizeOrder  (src/server/payments/finalize.ts)
  THE ONLY writer of orders.status → paid
  coupon line: split 100/0, settlement_status split_executed
  one voucher per purchased unit, keyed on order_item_id, capped at quantity
```

Token charge never passes through
`payments.status = redirected`.
It goes
`initiated → succeeded | failed`.

Kill switch:
`CHECKOUT_ENABLED`
must equal the exact string
`true`
in production or the till is closed.
`CARDCOM_USE_MOCK`
must never be set in production (charges succeed without a card).
`CARDCOM_SANDBOX=true`
in production is a boot-fail.

Required Cardcom env:
`CARDCOM_TERMINAL_NUMBER`,
`CARDCOM_API_NAME`,
`CARDCOM_API_PASSWORD`,
`CARDCOM_WEBHOOK_SECRET`
(generated by us,
`openssl rand -hex 32`,
not issued by Cardcom).

---

## 9. Vercel deployment topology

```
Browser (he-IL, RTL, dir=rtl)
        │
Vercel fra1 · Next.js 16
  src/proxy.ts (edge)
  RSC + server actions
  /api/* route handlers
        │
        ├─ Supabase Postgres + Auth   ixvwfbuvfxxsjiywhbbb
        ├─ Cardcom legacy Interface
        ├─ Sentry EU
        ├─ Cloudflare R2
        ├─ optional Meilisearch
        ├─ optional Upstash Redis / QStash
        └─ GitHub Actions cron.yml → GET /api/cron/*  (Bearer CRON_SECRET)
```

`vercel.json`: framework nextjs, install
`pnpm install --no-frozen-lockfile`,
build
`pnpm build`,
output
`.next`,
region
`fra1`.
**No `crons` key.** Hobby would silently run two of ten. The ten jobs moved to
`.github/workflows/cron.yml`.
Status 2026-09-02: Actions scheduler is live when
`CRON_SCHEDULER_ENABLED=true`
and
`CRON_SECRET`
are set on the repo. cron-job.org is optional. Two schedulers at once double-fire every job.

Boot validation:
`src/instrumentation.ts`
→
`src/lib/env.ts`
before the server accepts a request. A missing Cardcom secret must fail the deploy, not the first paying customer.

`NEXT_PUBLIC_*`
is inlined at **build** time. Changing one in the Vercel dashboard requires a redeploy, not a restart. Names matching
`NEXT_PUBLIC_.*(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY)`
refuse boot: that is already a leak.

DNS is **not** switched. Apex still serves WordPress through Cloudflare (proxied). Cutover is a human step. See
`docs/cursor/LAUNCH-BLOCKERS.md`.

---

## 10. Scheduled jobs (ten GET routes)

All require
`Authorization: Bearer <CRON_SECRET>`.
Missing secret → 401 on every job (safe direction).

| Route | Cadence (intended) | On the money path |
|---|---|---|
| `/api/cron/notifications` | every 5 min | Indirect, critical: **only sender of voucher email** |
| `/api/cron/health` | every 5 min | Pages a human. Seven dependency checks. |
| `/api/cron/invoices` | every 10 min | Yes |
| `/api/cron/stock` | every 10 min | Releases expired reservations |
| `/api/cron/stranded-payments` | every 10 min | Yes: charged but not finalized |
| `/api/cron/abandoned-cart` | hourly | Nudges (post-launch depth in the roadmap) |
| `/api/cron/subscriptions` | 02:30 UTC | Yes |
| `/api/cron/reap-carts` | 03:40 UTC | `fn_reap_expired_carts()` |
| `/api/cron/reconcile` | 04:00 UTC | Yes |
| `/api/cron/expire-vouchers` | 23:15 UTC | Expiry + goodwill credit path |
| `/api/cron/retention` | (added later) | Data retention |
| `/api/cron/weekly-digest` | (added later) | Operator mail |

GitHub Actions
`cron.yml`
is the live scheduler of record as of 2026-09-02. Confirm
`CRON_SCHEDULER_ENABLED`
before adding a second caller.

---

## 11. What this pack will not do

- Open
`/Users/ofir/kenyonexpress-web/kenyonexpress`
or
`ke-arch`.
- Checkout
`closeout/v1-final`
or
`docs/ui-design-system`.
- Run pnpm, builds, or apply migrations.
- Edit
`.ts`,
`.tsx`,
`.sql`,
`.json`.

Money, RLS, APIs, risks, human launch steps, and post-launch work have their own files in this directory.

---

## 12. Pack index (this directory)

| File | Question it answers |
|---|---|
| `ARCHITECTURE-OVERVIEW.md` | What runs where |
| `DATA-FLOW.md` | Which table each money step writes, which policy |
| `MONEY-INVARIANTS.md` | Agorot contract. There is no `packages/money.ts` |
| `RLS-CATALOG.md` | Four pack roles × every public table |
| `API-SURFACE.md` | Handlers, actions, auth, failures |
| `TEST-MAP.md` | Every test file, the invariant it pins, what deleting it would allow |
| `RISK-REGISTER.md` | Ranked launch breakage |
| `LAUNCH-BLOCKERS.md` | Human-only ordered steps. DNS last |
| `POST-LAUNCH-ROADMAP.md` | Reviews, wishlist, abandoned cart, Twilio WhatsApp, i18n, self-serve partners |
| `GLOSSARY.md` | Hebrew and English domain terms as this tree uses them |

---

## 13. Facts learned while writing the rest of this pack

**Two Cloudflare zones.** Registrar NS are `derek` / `elma`. Account `13a3f166…` also holds a staged zone (`ignat` / `tess`, never activated). Editing the staged zone is a silent no-op. Launch H0 is "open the live zone".

**Test catalogue row.** Id `9bb347f8-03ec-48ce-8ff2-2503fb74c895` is a ₪1 / ₪400 "Master Product". Application refuses the sale (95% discount ceiling). Migration 172 (stock 0, not delete) is unapplied. Homepage can still render it.

**Cron count.** Ten jobs in the original money set; this tree also has `/api/cron/retention` and `/api/cron/weekly-digest`. Scheduler of record is GitHub Actions, not `vercel.json`.

**Payout.** Admin actions exist. Production has no payout tables. Coupon partners are owed nothing on the coupon path. Physical residual is accounting, not a live ledger.

**Search UI vs engine.** Meilisearch is the backend. `/search` + header field exist for Electro pixel refs (ADR 0010). That is not a search product.

**Next.js 15 vs 16.** Brief said 15. This branch is 16.2.12. `src/proxy.ts` replaces `middleware.ts`.

---

## 14. `apps/mobile` (till), not a second web

The till app is an RPC client of the same Postgres. It calls
`redeem_voucher`,
`verify_supplier_staff_pin`,
`supplier_app_context`.
It is not a Cardcom merchant. It must not embed the service role. Grants audits that only grep
`src/`
miss this caller.

---

## 15. Boot and leak guards

`src/instrumentation.ts`
runs
`src/lib/env.ts`
before the first request.
`ALLOW_INCOMPLETE_ENV`
exists because
`next start`
on a laptop is
`NODE_ENV=production`
(Lighthouse, Playwright). Production Vercel must not set that escape hatch.

Any name matching
`NEXT_PUBLIC_.*(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY)`
refuses boot: the leak already shipped in the bundle.

Legal URLs: canonical
`/legal/*`
plus storefront aliases
`/privacy-policy`,
`/terms-and-conditions`,
`/refund_returns`,
`/accessibility`.
`/offline`
is the PWA tile,
`noindex`.
Neither legal nor offline is in the pixel compare set. Returns copy must not mention escrow.

---

## 16. Layout groups (the parentheses are not URLs)

App Router route groups do not appear in the path. They only choose a layout.

| Group | Layout file | Who it wraps |
|---|---|---|
| `(store)` | storefront chrome (header, footer, WhatsApp float) | Home, catalogue, cart, checkout, legal aliases, city, search, gift |
| `(main)` | lighter storefront | `/coupons`, newsletter confirm/unsubscribe |
| `(legal)` | legal chrome | Canonical `/legal/*` |
| `(account)` | signed-in account shell | Every `/account/*` page |
| `(admin)` | admin shell + optimistic proxy gate | Every `/admin/*` page |
| `(supplier)` | partner portal chrome | Dashboard, scan, orders, products, payouts, redemptions |
| `(supplier-public)` | no portal chrome | `/supplier/login`, `/supplier/access-denied` |
| `(auth)` | auth chrome | login, signup, MFA, password reset |

Root
`src/app/layout.tsx`
sets
`dir="rtl"`,
`lang="he"`,
Heebo, and the canonical host. There is no
`(marketing)`
group.

Pages that sit **outside** those groups on purpose:

| Path | Why it is ungrouped |
|---|---|
| `/coupon/[id]` | Signed voucher surface. Gated by proxy (`/coupon/*`). Not the public `/coupons` listing. |
| `/redeem/[token]` | Signed URL, not a session. Token is the credential. |
| `/offline` | PWA tile. `noindex`. |
| `/debug/sentry`, `/debug/sentry/render` | Must stay dark unless `SENTRY_DEBUG_ROUTES` equals the expected phrase. |

---

## 17. Proxy details the brief skips

File:
`src/proxy.ts`.
Exported name must be
`proxy`
(Next.js 16). Matcher skips `_next/static`, `_next/image`, favicon, and image extensions.

Load-bearing extras beyond §2:

1. **Request id.** Minted here, attached inbound and outbound. An inbound well-formed `x-request-id` wins so a load-balancer trace stays one trace.
2. **WordPress redirects are GET/HEAD only.** A 301 on a Cardcom POST would drop the body. 410 is used when the path is gone on purpose (Search Console treats 410 as a decision, 404 as an oversight). Query strings are stripped on redirect so `?ref=` and stale Woo `?product=` do not duplicate canonical URLs.
3. **Admin optimistic roles** include `support` and `content_uploader`. The page still calls `requireSection`. If a money page forgets that call, support can see the HTML even though the action should 403.
4. **`?ref=` cookie.** Written on every GET that carries a well-formed eight-character code. Last-click wins. The URL is not rewritten (canonical already collapses `/?ref=` to `/`). Claim happens later at signup/pay, not here.
5. **Guest cart cookie.** UUID, `Secure` from the shared builder. The **only** anon identity for `carts`. Never log it.
6. **`/scan` is not prefixed `/supplier`.** Proxy auth for partners is `pathname.startsWith('/supplier')` plus the two public doors. `/scan` must be gated by the page itself (session + membership). Do not assume the proxy covers it.

`/checkout` itself is ungated. Sub-routes need a session **except**
`/checkout/frame-return`
(Cardcom iframe, cross-site, browsers withhold `SameSite=Lax` cookies).

---

## 18. Tables the 2026-08-19 RLS manifest does not list

`supabase/rls-manifest.json`
was measured 2026-08-19 against
`ixvwfbuvfxxsjiywhbbb`
and holds **53** base tables. Later notes (2026-09-01) say **61**. CI trusts the committed snapshot via
`src/lib/auth/rls-manifest.test.ts`.
It does **not** query production. Drift that nobody re-measured is invisible to CI.

Tables this pack talks about that are **absent from that 53-row snapshot** (they may exist live after later migrations; the snapshot does not prove they do):

| Name | Why the pack still names it |
|---|---|
| `banners` / `homepage_sections` | CMS for the home grid. Live views `v_banners_live`, `v_homepage_sections_live`. |
| `search_index_outbox` | Floor indexer. Sister `search_index_dlq` **is** in the snapshot. |
| `refunds` | Refund row. CHECKs encode Israeli consumer law. |
| `payment_events` | Append-only journal. Sister `payment_webhook_events` **is** in the snapshot. |
| `subscriptions` / `subscription_charges` | Recurring (migration 135). |
| `supplier_branches` | Multi-location partners. |
| `wishlists` / `wishlist_items` | Account wishlist. Guest list is `localStorage` only (`ke_wishlist`). |

When a human re-runs
`node scripts/check-rls.mjs`
the snapshot must be updated in the same commit as any new table. Adding a table with RLS off fails the manifest test. Adding a table with zero policies is allowed only if it is named in
`service_role_only`.

---

## 19. Wishlist and reviews already have actions

Post-launch P1/P2 are not greenfield. This tree already exports:

| Action | Module | Meaning |
|---|---|---|
| `toggleWishlist` / `getWishlistSaved` | `src/server/actions/reviews.ts` | Heart. Not money. |
| `submitReview` / `getMyReviewableItem` | same | Review create. Paid-buyer join is the remaining honesty check. |
| `moderateReview` | `admin/reviews.ts` | Staff. Not a refund. |
| `deleteAccount` | `account.ts` | Account erasure. Must not silently refund. |

`/account/wishlist`
is a live route. Architecture
`docs/ARCHITECTURE-WISHLIST.md`
is the binding. Do not invent a second wishlist table in a later brief.

---

## 20. Invoice is a route, not a page

`/account/orders/[id]/invoice`
is
`src/app/(account)/account/orders/[id]/invoice/route.ts`
(GET). It is not
`page.tsx`.
Owner session required. Other people's ids must 404, not 403.

Apple Wallet:
`/api/wallet/apple/[id]`
is RLS-gated on the voucher UUID. Missing Apple credentials return **404 not 500** so a misconfigured env does not look like an outage to the shopper.

---

## 21. What "Meilisearch with no search UI" actually means

Three facts that look contradictory and are not:

1. Engine:
   `src/lib/search-server.ts`
   returns
   `{ engine: 'meilisearch' | 'database' }`.
2. Storefront:
   `/search`
   plus a header field (ADR 0010, restored because Electro pixel refs contain it). Test
   `src/components/layout/no-search-ui.test.ts`
   pins the **product** decision (no facet chrome, no typeahead destination, no Meili branding).
3. Operator:
   `/admin/search`
   is an index debugger behind `requireSection`.

Unconfigured Meili: every index job is a successful no-op. ILIKE is the engine. Catalogue of ~80 SKUs can launch that way.

---

## 22. Env topology (build-time vs runtime)

| Kind | When it binds | Trap |
|---|---|---|
| `NEXT_PUBLIC_*` | **Build**. Inlined into the client bundle | Dashboard change without Redeploy is a no-op. WhatsApp number, site URL, anon key. |
| Server secrets | Process start (`src/lib/env.ts` via `instrumentation.ts`) | Missing Cardcom must fail boot, not the first charge. |
| `ALLOW_INCOMPLETE_ENV` | Laptop `next start` is `NODE_ENV=production` | Must not be set on Vercel Production. |
| Leaky-name regex | Boot | `NEXT_PUBLIC_.*(SECRET\|PASSWORD\|SERVICE_ROLE\|PRIVATE_KEY\|API_KEY)` refuses to start |

Cardcom sandbox in Production is a boot-fail.
`CHECKOUT_ENABLED`
must equal the exact string
`true`
or the till is closed.

---

## 23. `wp_import` vs `public`

Import tables in schema
`wp_import`
reuse names
`orders`,
`products`,
`vouchers`.
A query that omits the schema near an import script will hit the wrong table. Production application code must stay on
`public`.
This pack does not treat
`wp_import`
as a money path.

---

## 24. Second pass (facts from the rest of this pack)

**Cashback** credits inside
`finalizeOrder`,
not at scan. Idempotency
`order:<id>:cashback`.
See
`DATA-FLOW.md`
§11 and
`MONEY-INVARIANTS.md`
§6.

**Admin redeem** is a second consume path. See
`DATA-FLOW.md`
§12,
`API-SURFACE.md`
§10,
risk R20.

**Mobile till**
`apps/mobile`
uses the **anon** key + session in SecureStore (not AsyncStorage). It POSTs to the Next.js site (
`/api/supplier/vouchers/*`
), it does not embed service_role. Offline queue
`apps/mobile/src/lib/supplier/queue.ts`
must not locally mark success; the server verdict is the only settle. Checkout in the app is a WebView of the same
`/checkout`.

**Stock at finalize.**
`consume_order_stock`
runs after pay. Failure is logged and **must not** fail finalize (card already charged). Idempotent via
`stock_reservations.consumed_at`.
A replayed webhook must not decrement twice.

**Server
`reportPurchase`.**
Browser purchase pixels are lost to ad blockers and closed tabs. Finalize reports purchase keyed on order id. Migration 169 silence (R24) is an ingest/schema problem, not "nobody paid".

**Subscriptions are born in finalize.** Cron renews. Tables from 135 with no insert would take money once and never recur.

**`payment_tokens`.** Finalize is the only insert site (pinned by
`saved-cards.test.ts`).

**Cron count:** twelve GET routes. Scheduler: GitHub Actions, not
`vercel.json`.

**RLS snapshot:** 53 tables (2026-08-19). Pack narratives that say 61 are later notes. CI cannot see the delta (R23, H3b).

---

## 25. Third pass (facts from the live tree on this branch)

Measured 2026-09-07 by reading this worktree. No pnpm. No production query.

### 25.1 App Router census

107
`page.tsx`
files, 38
`route.ts`
handlers. Extra storefront pages this pack previously folded into "content":

| Path | Kind |
|---|---|
| `/blog/how-coupons-work` | MDX, not a CMS table. Only blog post on this branch. |
| `/admin/queues` | Operator queue debugger (`v_admin_pending_queues`). |
| `/admin/growth` | Growth dashboard. |
| `/admin/feature-flags` | Staff flags. |
| `/admin/dashboard` vs `/admin` | Two admin landings. |
| `/account/tokens` | Saved cards UI. Inserts still only happen in finalize. |
| `/account/my-vouchers` vs `/account/vouchers` vs `/account/coupons` | Three voucher surfaces. Same RLS owner SELECT. |

Non-handler metadata routes (not in the 38):
`src/app/sitemap.ts`,
`src/app/robots.ts`,
`src/app/manifest.ts`,
`src/app/opengraph-image.tsx`,
`src/app/(store)/product/[slug]/opengraph-image.tsx`.

### 25.2 Guest cookie vs PostgREST cookie

Browser cookie:
`ke_session_id`
(httpOnly, built in
`src/lib/cart/guest-session-cookie.ts`).

RLS on
`carts`
reads:

```
request.cookies->>'session_id'
```

The mapping is
`createGuestCartClient`
in
`src/lib/supabase/anon.ts`.
It sends **exactly one** Cookie header,
`session_id=<uuid>`,
and never forwards the visitor's real Cookie jar (that jar holds auth tokens). A "fix" that points the policy at
`ke_session_id`
without changing the client, or that forwards the browser Cookie header to PostgREST, is a cart-fixation or session-leak bug.

Catalogue reads use
`createPublicClient`
(always
`anon`,
never the visitor's JWT). An admin browsing the storefront must see the same active catalogue as a guest.

### 25.3 Two money modules, not one

The brief's
`packages/money.ts`
still does not exist. Live split:

| File | What it actually holds |
|---|---|
| `src/lib/commerce/money.ts` | `Agorot` brand, `ilsToAgorot`, `percentageOf`, `percentToBasisPoints` |
| `src/lib/money.ts` | Re-exports the brand, **plus** `Bp`, `applyBp`, `divRoundHalfUp`, `VAT_RATE_BP`, `extractVat`, `percentToBp` |

`src/lib/commerce/commission.ts`
imports
`percentageOf`
from
`./money`
(the commerce file), **not**
`applyBp`.
The two rounding implementations must stay equivalent on non-negative integers. Feature code that needs rates should still enter through
`src/lib/money.ts`.
See
`MONEY-INVARIANTS.md`
§17.

### 25.4 Generated types vs the 53-table snapshot vs production

`src/types/database.ts`
on this branch names tables the 2026-08-19 snapshot never saw, including:

`ai_usage`,
`analytics_events`,
`banners`,
`homepage_sections`,
`payment_events`,
`payout_statement_lines`,
`payout_statements`,
`refunds`,
`reviews`,
`search_index_outbox`,
`subscription_charges`,
`subscriptions`,
`supplier_branches`,
`wishlists`.

That file is a generated sketch of **some** database this repo has talked to. It is not a live
`pg_class`
listing. Historically
`admin/payouts.ts`
raised
`42P01`
against production. Until H3b re-measures, treat payout tables as **types-ahead**, not as a live ledger.

Wishlist on this branch is **one** table
`wishlists`
(`user_id`, `product_id`), not
`wishlists` + `wishlist_items`.
Older architecture that invents a second table is describing a draft. Reviews already have
`order_item_id`
UNIQUE: one review per paid line.

### 25.5 Pending SQL number collisions

`migrations/pending/`
on this branch holds **two files per number** for 169, 170, 171, and 172. A human applying "172" without the full filename can run the wrong file.

| Number | File A | File B |
|---|---|---|
| 169 | `169_analytics_server_event_names.sql` (whitelist four server events; still pending) | `169_audit_full_coverage.sql` |
| 170 | `170_reporting_tables.sql` (**header claims applied 2026-09-04**, file still sits in pending/) | `170_composite_indexes_top_queries.sql` (expand-only indexes, pending) |
| 171 | `171_search_fts.sql` (Postgres FTS `search_products`, INVOKER, anon-safe) | `171_category_name_shekel_order.sql` (bidi isolate on `under-99`; page already repairs on read) |
| 172 | `172_hide_master_product_test_row.sql` (stock 0 on the ₪1 master row) | `172_rls_zero_policy_tables.sql` (explicit deny / admin SELECT on zero-policy tables) |

162 remains approved and **blocked on vault** (
`cron_secret`
/
`app_url`
not seeded). GitHub Actions is the live scheduler until 162 can run. Do not enable both.

`172_rls_zero_policy_tables.sql`
is the file that would make the admin payments **webhooks** tab show rows. Today that tab uses the request-scoped client against
`payment_webhook_events`
(zero policies = deny). The tab is an empty table for every admin, not proof that Cardcom is silent.

### 25.6 Mobile session bridge

Till checkout is a WebView of the **same**
`/checkout`.
The app holds tokens in SecureStore (2 KB Android limit; setter warns at 2000 bytes). Before the WebView mounts it POSTs those tokens to
`/api/app/session`.
The handler calls
`setSession`
and writes **website** cookies. It mints nothing. Rate limit 30 / 10 min / IP. Failures return
`unauthorized`
without saying which half of the pair is dead.

WebView must have
`sharedCookiesEnabled`.
DELETE on the same route signs the WebView out. A second money API for the phone was rejected on purpose (one till, one
`beginCheckout`).

Offline scan queue key:
`ke.supplier.scan_queue.v1`
in AsyncStorage (not SecureStore: a day's queue will not fit in 2 KB). FIFO. Drain removes only keys the **server** settled. Sign-out clears the queue.

### 25.7 Admin payments still has an escrow tab

`/admin/payments`
tabs include
`נאמנות (Escrow)`.
The money path does not write
`escrow_holds`.
The tab is a fossil UI. It is not a launch blocker for charges. It is a trust/copy trap if a staff screenshot leaks. Legal copy is R19; this tab is the staff analogue.

### 25.8 Search engines, three not two

Today: Meilisearch if configured, else Postgres
`ILIKE`.
Pending 171 FTS would add
`search_products`
(SECURITY INVOKER, stored tsvector, GIN). It does not replace Meili. It does not add search chrome. Hebrew stemmer does not exist in Postgres; config is
`simple` + `unaccent`.
Clitics (`המקרר` vs `מקרר`) will miss. That is accepted.

### 25.9 Google Wallet vs Apple Wallet

Apple:
`GET /api/wallet/apple/[id]`
(RLS on voucher UUID, missing creds → 404).

Google: library
`src/lib/wallet/google-wallet.ts`
(
`pushGoogleObjectState`
). **No**
`/api/wallet/google`
route on this branch. Do not document a Google pass URL as live.

### 25.10 What "61 tables" counted

The 53-row snapshot is the CI truth. Generated
`database.ts`
plus views plus later notes is how "61" appeared. Do not treat 61 as a live
`pg_class`
count until a human re-runs
`node scripts/check-rls.mjs`.
This pack still does not run it (that script talks to the database; this pack does not).

---

## 26. Deepen after items 11–20 (same worktree)

Index of the rest of the pack:
`docs/cursor/README.md`.

| Fact learned later | Where it lives |
|---|---|
| First-week never-touch list | `ONBOARDING.md` |
| `drizzle-orm` / `postgres` / `@dnd-kit` are not the runtime data path | `DEPENDENCY-AUDIT.md` |
| Twelve cron jobs, GitHub Actions, not Hobby Vercel cron | `scripts/cron-jobs.json`, `PERFORMANCE-NOTES.md` §5 |
| Account deletion exists (`fn_anonymize_user` + fallback) | `DATA-RETENTION.md` (root `docs/DATA-RETENTION.md` is stale) |
| Browser cookie `ke_session_id` ≠ PostgREST cookie `session_id=` | §26.1 below; `SECURITY-REVIEW.md` G1 |
| Wire errors vs scan outcomes vs SQLSTATE | `ERROR-TAXONOMY.md` |
| 03:00 greps | `OBSERVABILITY-MAP.md` |
| ADRs + leftovers | `DECISION-LOG.md` |
| Types-ahead vs 42P01, duplicate pending 169–172 | `OPEN-QUESTIONS.md` |

Meilisearch, Upstash, Cardcom, Resend, ntfy, Axiom, PostHog are **HTTP**, not npm (except Sentry). The Next 16 / `src/proxy.ts` row in §1 stands.

### 26.1 Two cookies named "session"

Do not collapse these in a diagram.

| Name | Where | Job |
|---|---|---|
| `ke_session_id` | Browser, httpOnly, 30d, minted in
`src/proxy.ts`
and
`ensureGuestSessionId`.
Constant
`GUEST_SESSION_COOKIE`. | Identifies the guest to **this Next app**. Analytics parses it into
`anonymous_id`. |
| `Cookie: session_id=<uuid>` | Constructed in
`createGuestCartClient`
only. **Not** the visitor's jar. | PostgREST
`request.cookies->>'session_id'`
for
`carts` RLS. |

Forwarding the browser jar to PostgREST would put refresh tokens on the database. Sending `ke_session_id` as the PostgREST cookie name would miss the policy (empty cart). Renaming either without both sides is G17.

### 26.2 Google Wallet, dnd-kit, English locale

Still no
`/api/wallet/google`
route.
`@dnd-kit/*`
has zero
`src/`
imports.
`next-intl`
declares `en`; copy is Hebrew literals. None of these are launch architecture. They are footguns.
