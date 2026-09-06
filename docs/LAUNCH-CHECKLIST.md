# Launch checklist

Ordered, checkbox runbook for cutting `kenyonexpress.co.il` to the Next.js production on Vercel. One commit ritual per completed gate is not part of this file; this is the operator sequence.

Status: binding day-of list for this worktree. Docs only. **DNS is owner-approved and is not executed by agents.** Command-level DNS and the two-zone trap: `docs/DNS-CUTOVER-PLAN.md`, snapshot `docs/DNS-SNAPSHOT-PRE-CUTOVER.md`. Longer command runbook: `docs/LAUNCH-RUNBOOK.md` (steps 1 to 6 already done there as of 2026-09-01; domain still pending). Owner leftovers: `docs/OWNER-CHECKLIST.md`. Env encyclopedia: `docs/ENV-REFERENCE.md`. Cron truth: `docs/CRON-EXTERNAL.md`.

Money: integer agorot. `CHECKOUT_ENABLED` is the kill switch. `CARDCOM_SANDBOX` must not be `true` in Production. `ESCROW_FLOW_ENABLED` must not be `true`. Never `supabase db push`. Never `ALLOW_INCOMPLETE_ENV=true` on Vercel.

Companion authority for money: `BUSINESS-MODEL-RULES.md` then `docs/PRODUCT-TYPES.md`.

---

## 0. Do not start until these are true

- [ ] Vercel project that will receive the domain is identified (not a guessed sibling project).
- [ ] Domain is **attached** in Vercel (`kenyonexpress.co.il` + `www`) and shows configured-but-not-pointed. Pointing DNS first yields a Vercel 404.
- [ ] Product images live on Cloudflare R2 (or another URL that will still 200 after WordPress disappears). Live WP hosts images today; cutover without this is a storefront of broken thumbs (`docs/LAUNCH-RUNBOOK.md`).
- [ ] Production Cardcom terminal (not sandbox) credentials in Vercel Production.
- [ ] Resend domain/DKIM ready (see DNS snapshot: do not activate a staged Cloudflare zone that still has a broken `send` SPF `include[...].nses.com`).
- [ ] `CHECKOUT_ENABLED=true` already in Vercel Production **before** DNS, after a real payment on `*.vercel.app`.
- [ ] External scheduler exists for **all ten** cron routes (Vercel Hobby will not run ten). Unset `CRON_SECRET` fail-closes (401), it does not open the routes.

If any box is empty, stop. Do not lower TTL yet.

---

## 1. Registrar Box (DNS cutover)

Registrar: **Box**. Public nameservers today delegate to Cloudflare `derek`/`elma` (see snapshot). A second Cloudflare zone on `ignat`/`tess` is staged and **does not serve the internet**. Editing the staged zone is a no-op.

- [ ] Snapshot live records from the **serving** zone to Desktop (JSON). Rollback depends on this file existing.
- [ ] Lower TTL on apex + www to 300 (or already 300). Wait the old TTL.
- [ ] Confirm Vercel shows the domain attached and TLS will issue once records point.
- [ ] Apex `kenyonexpress.co.il`: A `76.76.21.21`, **DNS only, not proxied**.
- [ ] `www`: CNAME `cname.vercel-dns.com`, **DNS only, not proxied**.
- [ ] Leave MX / existing mail records untouched unless Resend is already verified on the serving zone.
- [ ] `dig` apex and www from an off-VPN resolver. Expect Vercel, not WordPress anycast.

### Rollback for step 1

Restore the snapshot A records (WordPress / previous anycast) on the **serving** nameservers, DNS only or as they were. Do not flip nameservers to `ignat`/`tess` as a "fix". Wait TTL. Kill switch `CHECKOUT_ENABLED=false` if traffic already hit the new app with bad money config.

---

## 2. Migration apply order

Pending files live in `migrations/pending`. Applied ledger: `migrations/applied/` + `schema_migrations`. **MCP / owner-approved apply only.** This agent does not apply.

- [ ] Diff pending vs production `schema_migrations`. Do not re-apply 166-168 (already in production; see STATE incident 2026-09-04).
- [ ] Order: dependencies first (enums complete in CREATE TYPE; no `ADD VALUE` in a regular file). Idempotent files only.
- [ ] Forbidden: `db push`, destructive down-migrations, seed-demo on production.
- [ ] 162 (cron vault secrets): blocked until vault has secrets and Vercel project is confirmed. Skip rather than apply half.
- [ ] After each apply: anon-catalog and wallet RLS tests still pass (CI / documented 14/14).

### Rollback for step 2

Do **not** run a reverse migration on money tables without a written expand-contract. Roll forward a fix file. App rollback is Vercel Instant Rollback + `CHECKOUT_ENABLED=false`. Schema stays forward-only unless owner orders otherwise.

---

## 3. Secret rotation

Rotate **before** the domain carries real shoppers if any secret ever lived in git, chat, or a preview URL.

- [ ] `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` (never `NEXT_PUBLIC_*`)
- [ ] `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`, `CARDCOM_WEBHOOK_SECRET` (+ `CARDCOM_WEBHOOK_SECRET_PREVIOUS` during overlap)
- [ ] `VOUCHER_QR_SECRET` (+ `VOUCHER_QR_SECRET_PREVIOUS` so existing QR still verify)
- [ ] `CRON_SECRET` (must match the external scheduler header)
- [ ] `RESEND_API_KEY`, `UPSTASH_REDIS_REST_TOKEN`, R2 keys, Sentry/Axiom as used
- [ ] Confirm boot guard: a name matching `NEXT_PUBLIC_.*(SECRET|PASSWORD|SERVICE_ROLE|…)` refuses boot. Do not "fix" a missing client secret by prefixing `NEXT_PUBLIC_`.

### Rollback for step 3

Put `*_PREVIOUS` back as primary only for QR/webhook overlap windows. Old Cardcom webhook path must accept previous until Cardcom UI is updated. Do not leave two terminals charging.

---

## 4. Env verification across Vercel environments

Check **Development / Preview / Production** separately. `NEXT_PUBLIC_*` needs a **redeploy** to change.

| Variable | Production | Preview | Dev |
|---|---|---|---|
| Nine boot secrets (ENV-REFERENCE §1) | set, real | set, sandbox or dummy that cannot charge people | local `.env.local` |
| `CARDCOM_SANDBOX` | **unset / false** | may be true | true |
| `CHECKOUT_ENABLED` | true only after vercel.app smoke pay | false or true on a private preview | local choice |
| `ALLOW_INCOMPLETE_ENV` | **unset** | unset | allowed for `next start` on a laptop |
| `CRON_SECRET` | matches scheduler | unused or same | unused |
| `NEXT_PUBLIC_SITE_URL` | `https://kenyonexpress.co.il` (or www canonical you chose) | preview URL | localhost |
| `NEXT_PUBLIC_WHATSAPP_PHONE` | live number or rely on published default | optional | optional |

- [ ] Production boot: deployment logs show instrumentation env OK, not `env.checks_skipped`.
- [ ] Preview cannot use Production Cardcom.
- [ ] No `service_role` in client bundle.

### Rollback for step 4

Revert env to last known good and **redeploy**. Instant Rollback of the deployment if the bad value was compiled into `NEXT_PUBLIC_*`.

---

## 5. Cron secret wiring

Ten jobs (expire-vouchers, notifications drain, reconcile, stock, etc.). External clock (pg_cron + pg_net, or a worker), not a silent subset of Vercel Hobby.

- [ ] Scheduler sends `Authorization: Bearer $CRON_SECRET` to each `/api/cron/...` on the **production** host.
- [ ] Unauthenticated GET returns **401** (guard live). A 200 without the header is an incident.
- [ ] `expire-vouchers` actually credits wallet (`credit_expired_vouchers`); expiry is not forfeiture.
- [ ] Reconcile job exists so lost webhooks (§ EDGE-CASES) do not strand `pending` paid charges.
- [ ] Vault empty (migration 162) is documented; do not pretend cron is done if job count is 0.

### Rollback for step 5

Disable the scheduler. Routes stay 401. Customers can still redeem (scan uses DB clock). Wallet credits for expiry pause until restored. Turn checkout off if reconcile is the only finalize path and webhooks are also down.

---

## 6. Smoke tests against production (after DNS or on vercel.app first)

Prefer a **real payment on vercel.app before DNS**. After DNS, repeat on the apex.

- [ ] `GET /` 200, RTL, Heebo/token yellow, deals or empty copy
- [ ] `GET /api/health` and `/api/ready` (documented checks)
- [ ] Category + product coupon PDP: split prices, no `platform_percent` in HTML
- [ ] Guest add to cart → `/cart` → login-at-pay → Cardcom **production** charge of a small coupon
- [ ] Webhook / return → voucher issued, email, `/checkout/return` shows `התשלום הצליח!` and codes (not an empty `coupon_codes` read), `/coupon/{id}` QR
- [ ] Supplier scan success + second scan `השובר כבר מומש`
- [ ] Checkout fail path: cart survives
- [ ] 404 Hebrew, 500 not English LTR
- [ ] Images 200 from R2, not WP
- [ ] `robots.txt` + `sitemap.xml` 200, account/checkout absent from sitemap
- [ ] Pixel gate optional post-cutover: `compare.mjs` home under 11% at 380/768/1440 against live (content from live, layout Electro)

### Rollback for step 6

`CHECKOUT_ENABLED=false`. Instant Rollback. DNS rollback (step 1) if the old WP must take traffic. Do not down-migrate.

---

## 7. First 24 hours monitoring

Watch, do not "wait and see".

| Signal | Where | Page if |
|---|---|---|
| Error rate / digest | Sentry (EU project) | spike vs baseline |
| Logs | Axiom / Vercel | `finalize` errors, 42703, RLS 42501 |
| Payments | Cardcom UI vs `payments` / `payment_events` | charge without `paid` (EDGE-CASES §1) |
| Webhooks | `payment_webhook_events` | duplicates OK; gaps not OK |
| Cron | scheduler logs + 401/200 with secret | missed expire/reconcile |
| Uptime | health/ready | non-200 |
| Ntfy | `kenyon-ofir-limit` | already used for agent; keep human alerts high-priority |
| Money alarms | `v_money_alarms` if present | platform percent NULL sales |
| Inbox | Resend bounces | voucher mail not arriving |
| Support | "charged twice" / "no QR" | treat as webhook or issue idempotency |

- [ ] On-call knows Instant Rollback + `CHECKOUT_ENABLED` + DNS snapshot path.
- [ ] No PAN in logs (scrubber).

### Rollback for step 7

Same as step 6. If only mail is down: money and vouchers stay; fix Resend; customers use `/account/coupons`. If Cardcom sandbox leaked into Production: **stop checkout immediately**, accountant, every "paid" order is unpaid in the bank.

---

## 8. Exact rollback map (quick)

| If this step is the one that failed | Do this |
|---|---|
| 1 DNS | Restore snapshot on serving Box/Cloudflare nameservers. Wait TTL |
| 2 Migration | Forward fix, not down. Checkout off |
| 3 Secrets | Previous QR/webhook secrets; redeploy |
| 4 Env | Unset bad keys, redeploy; Instant Rollback for `NEXT_PUBLIC_*` |
| 5 Cron | Stop scheduler; checkout off if finalize depends on it |
| 6 Smoke | Checkout off, Instant Rollback, optional DNS restore |
| 7 24h | Same plus Cardcom pause at the terminal if charges are wrong |

Never: delete the production database, `db push`, force-push `main`, delete R2 in a panic, apply pending 162 with an empty vault.

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-09-07 | Replaced the 2026-08-19 status sheet with an ordered checkbox runbook: Box DNS, migrations, rotation, env, cron, smoke, 24h, rollback per step |
