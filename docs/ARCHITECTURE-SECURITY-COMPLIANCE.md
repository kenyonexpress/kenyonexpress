# ARCHITECTURE-SECURITY-COMPLIANCE.md


> <!-- v1-final-banner:2026-09-01 -->
> ⚠️ **This document names tables that do not exist in production.**
>
> | Named here | In production |
> |---|---|
> | `admin_audit_log` | `audit_log` |
> | `notifications_outbox` | `notification_outbox` |
> | `payout_statements` | nothing; never built |
> | `supplier_bank_accounts` | nothing; never built |
>
> The design below may still be sound; the schema it assumes was not built, or
> was built under another name. Verify against `docs/DATA-MODEL.md` before
> writing a query, and see `docs/SCHEMA-REALITY-CHECK.md` for the full mapping.

KenyonExpress security and compliance architecture.

Status: BINDING for `arch/admin-supplier` (2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.** No application code, migrations, or installs in this change.
Companions: `docs/ARCHITECTURE-ADMIN-DASHBOARD.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`.
Grounding: migrations `003` (RBAC), `007` (orders), `011`/`025` (`audit_log`), `019` (`check_user_rate_limit`), `029` (deletion + `payment_tokens` hardening), `046` (checkout/wallet/tokens), `053` (support), `059`/`070` (money + split), `072`–`078` (members, vouchers, supplier read), `074`/`085` (`redeem_voucher`), `075` (`cardcom_account_id`), `081` (payouts no escrow).

Disclaimer: engineering translation of controls and Israeli privacy/consumer expectations. Not legal advice. Final privacy policy, cookie banner, and supplier agreements need Israeli counsel sign-off (**Q-SEC-1**).

Platform money model (fixed for this doc): platform never a supplier; `platform_percent` admin-only, dynamic, snapshotted; no Escrow; coupon online charge stays with platform; till balance at merchant on scan; physical residual after T+3; money in integer agorot.

---

## 0. Security principles

1. **RLS is the data boundary.** App checks are necessary but not sufficient.
2. **Money tables have no authenticated write policies.** Writes go through `SECURITY DEFINER` RPCs or service-role after server gates.
3. **PAN never touches KenyonExpress.** Cardcom Low Profile / token charge → PCI SAQ-A posture.
4. **`platform_percent` is not client-writable.** Admin product page only; snapshot on `order_items` is immutable for settlement.
5. **Single-use vouchers are decided only by conditional SQL UPDATE**, not by app flags.
6. **Secrets never in the browser bundle.** Service role, Cardcom API, HMAC keys, cron secrets: server/Edge only.
7. **Privileged actions are audited** into `public.audit_log` (011).

---

## 1. Threat model by surface

### 1.1 Guest cart

| Threat | Impact | Control |
|---|---|---|
| Forge another user's cart | Price / stock abuse | Guest cart keyed by opaque session cookie; server-only writes; merge on login (`mergeGuestCart`) |
| Inflate quantity / negative price | Underpay | Server re-prices from `products` at checkout; ignore client unit prices |
| Session fixation | Cart takeover | Rotate session id on login; HttpOnly Secure SameSite cookies |

### 1.2 Google OAuth / login

| Threat | Impact | Control |
|---|---|---|
| Account takeover via OAuth misconfig | Full account | Supabase Auth; allowed redirect origins allowlist; no implicit role from Google claims |
| Privilege via `profiles.role` self-edit | Admin escalation | Pin `role` updates: clients cannot set admin/support; DB trigger / policy (035-era) + `updateUserRole` server path only |
| Session theft | Impersonation | Short-lived access token + refresh; Secure cookies; re-auth for sensitive admin ops |

### 1.3 Checkout / Cardcom

| Threat | Impact | Control |
|---|---|---|
| PAN on our origin | PCI scope explosion | Low Profile hosted page only for new cards (SAQ-A). No Direct API with card fields |
| Webhook forgery | Fake `paid` | Verify Cardcom signature; idempotent finalize; never trust client "I paid" |
| Replay webhook | Double issue vouchers | Idempotency on payment/order finalize keys |
| Token charge without ownership | Steal saved card | `payment_tokens.profile_id = auth.uid()`; charge only from server after session check |
| Amount tampering | Undercharge | Amounts from settlement engine using product snapshots, not client totals |

### 1.4 Coupon scan (supplier)

| Threat | Impact | Control |
|---|---|---|
| Double redeem | Double till / fraud | Conditional `UPDATE vouchers SET status='redeemed' WHERE status='issued' ...`; unique success index on `voucher_redemptions` |
| Cross-shop redeem | Steal other merchants' sales | `supplier_id IN (active memberships)`; API collapses `wrong_supplier` → `not_found` |
| Forge QR | Fake codes | HMAC-signed `KEV1` payload (keyed secret). Unkeyed digest is **SEC-QR** critical if still present in any issuer path |
| Brute force codes | Enumerate | `check_user_rate_limit(uid,'voucher_scan',30,60)` in `redeem_voucher` (019/074/085) |
| Offline double-drain | Duplicate success UX | Client `idempotency_key`; server returns prior outcome |

### 1.5 Supplier portal

| Threat | Impact | Control |
|---|---|---|
| Read other suppliers' orders | PII / commercial leak | `is_supplier_member` / `is_supplier_order` (072/077/078) |
| Edit `platform_percent` | Steal platform take | No write path; money fields admin-only |
| Escalate scanner → owner | Team takeover | Only owner manages `supplier_members` (RLS ALL with `is_supplier_owner`) |
| Exfiltrate bank details | Fraud | `supplier_bank_accounts` SELECT `is_supplier_owner` only |

### 1.6 Admin panel

| Threat | Impact | Control |
|---|---|---|
| Stolen admin JWT writes money via PostgREST | Ledger fraud | No money UPDATE policies for authenticated; service role only after `requireAdminSession` / `requireSection` |
| Support sees revenue / exports PII | Over-disclosure | `canSeeMoney`; section matrix in `permissions.ts` |
| Self-elevate to `super_admin` | Full takeover | `canAssignRole` + recent auth + audit `permission_change` |
| Silent `platform_percent` change | Undetected fee theft | Require audit before/after; optional planned DB trigger rejecting non-service money column updates |

---

## 2. RLS policy design (predicates)

Helpers (SECURITY DEFINER, `search_path = public`): `is_admin()`, `has_role()`, `is_support()` (053), `is_supplier_member(uuid)`, `is_supplier_owner(uuid)`, `current_supplier_id()`, `is_supplier_order(uuid)`, `is_supplier_shipping_order(uuid)`.

**Binding rule:** money and redemption mutation tables: ENABLE + prefer FORCE RLS; **zero** authenticated INSERT/UPDATE/DELETE policies.

### 2.1 Identity and RBAC

| Table | SELECT | WRITE |
|---|---|---|
| `profiles` | own (`id = auth.uid()`); admin/support broader read | own profile fields excluding `role`; role via service/definer only |
| `supplier_members` | `user_id = auth.uid() OR is_supplier_owner(supplier_id)` (072) | ALL: `is_supplier_owner(supplier_id)` |
| `suppliers` | `deleted_at IS NULL AND is_supplier_member(id)` (plus public PDP fields via controlled query) | admin service; owner limited profile fields via action |
| `supplier_applications` | own or `is_admin()` | INSERT own pending; approve/reject service |
| `supplier_bank_accounts` | `is_supplier_owner(supplier_id)` | owner insert/update (clears verified_*); admin verify via service |

### 2.2 Catalog

| Table | SELECT | WRITE |
|---|---|---|
| `products` | published for anon/auth storefront; `is_supplier_member(supplier_id)` for supplier (072); admin service | staff/admin via service; **strip** `platform_percent`, `supplier_split_percent`, `discount_percent`, `coupon_price_ils` for non-admin |
| `categories`, variants, images | public read published | staff via service |

### 2.3 Commerce and money

| Table | SELECT | WRITE |
|---|---|---|
| `orders` | own `user_id`; supplier via `is_supplier_order` + paid+ statuses (078); admin service | none for authenticated; checkout/finalize definer/service |
| `order_items` | own via order; `is_supplier_member(supplier_id)` (078); admin | none for authenticated |
| `payments` | own; admin | webhook/definer only |
| `payment_tokens` | owner select **without** granting raw token to browser where revoked (029); admin select metadata | INSERT/UPDATE service only; owner DELETE own |
| `wallet_accounts` / `wallet_entries` | own / ledger views; admin | `fn_wallet_transfer` definer; **REVOKE EXECUTE FROM PUBLIC** (SEC-WALLET) |
| `payout_statements` / lines | member read `status <> 'draft'`; admin | generate/approve/mark-paid definer + super_admin gate |

### 2.4 Vouchers

| Table | SELECT | WRITE |
|---|---|---|
| `vouchers` | owner `user_id = auth.uid()`; supplier redeemed-only `is_supplier_member(redeemed_by_supplier_id)`; `is_admin()` (073) | none; `redeem_voucher` / issue/expire definers |
| `voucher_redemptions` | `is_supplier_member(supplier_id)`; admin | none; redeem/log RPCs only |

### 2.5 Audit and notifications

| Table | SELECT | WRITE |
|---|---|---|
| `audit_log` | `is_admin()` (011) | INSERT denied to clients (`WITH CHECK false`); definer only; no UPDATE/DELETE |
| `notifications_outbox` | owner; `is_admin()` (029) | service/fanout; owner may UPDATE `read_at` only |
| `account_deletion_requests` | owner; admin (029) | owner create pending; admin process |

### 2.6 Migrations still required (describe only; do not author SQL files here)

1. `FORCE ROW LEVEL SECURITY` audit pass on every money table if any host missed it.
2. Trigger: reject `UPDATE` of money knobs unless `current_user` is service_role / definer context.
3. Confirm `REVOKE EXECUTE ON fn_wallet_transfer FROM PUBLIC` on all environments.
4. Column privilege: ensure `cardcom_token` not selectable by `authenticated` (029 intent).

---

## 3. Tamper-proof `platform_percent` (end to end)

| Stage | Control |
|---|---|
| Admin UI | Only admin/super_admin edit; `docs/ADMIN-PRODUCT-PAGE-SPEC.md` |
| Server Action | Allow-list; non-admin payloads strip money columns |
| DB | `products_split_pair_sums_to_100`; range CHECKs (070); no DEFAULT inventing rates |
| Checkout | Read product; `buildOrderItemSnapshot`; refuse sale if split missing |
| `order_items` | Snapshot columns; settlement uses snapshot / billed bps, never live product after pay |
| Supplier | Read-only visibility; cannot UPDATE |
| Payouts | Physical residual from snapshot amounts (081); coupon lines not paid out |
| Audit | Every money-knob change → `audit_log` with before/after in `changes` |

Attack "supplier posts platform_percent=0 via PostgREST" fails: no UPDATE policy + strip + optional trigger.

---

## 4. Card tokens and PCI scope

### 4.1 Scope minimization

- New card: Cardcom Low Profile / iframe on Cardcom domain → PAN never on our origin → **SAQ-A** target (`CHECKOUT-ARCHITECTURE.md`).
- Returning charge: server uses `payment_tokens.cardcom_token` + `cardcom_account_id` (075) with service role.
- Store: last4, brand, expiry, token reference. **Never** store PAN/CVV.

### 4.2 `payment_tokens` controls (029 + 075)

- RLS: owner select/delete; admin select; revoke broad grants from `anon`/`authenticated` write.
- Column-level: revoke SELECT on `cardcom_token` from browser roles where implemented; charges only server-side.
- Observability: redact `cardcom_token` in Sentry scrubbers.
- Webhook finalize may insert token once; idempotent.

**Open Q-SEC-2:** annual SAQ-A attestation owner and calendar.

---

## 5. Coupon single-use and anti-fraud

### 5.1 Enforcement (074/085)

```
UPDATE vouchers
SET status = 'redeemed', redeemed_*, ...
WHERE code = $normalized
  AND status = 'issued'
  AND expires_at > now()
  AND supplier_id IN (active memberships of auth.uid())
```

Concurrent scans: one winner (`ROW_COUNT=1`); loser → `already_redeemed`.
Belt: unique partial index one success per `voucher_id` on `voucher_redemptions`.

### 5.2 Anti-fraud signals

| Signal | Source | Response |
|---|---|---|
| Rate >30/60s/user | `check_user_rate_limit` | `rate_limited` |
| Wrong supplier probes | outcome stored honestly, API `not_found` | ntfy admin alert on burst |
| Invalid HMAC | app reject + `log_voucher_scan` | no redeem call |
| Multi-IP same code | `ip_address` on redemptions (085) | investigate |
| Success after cancelled/refunded | status predicates | typed 409 |

Admin dashboard: redemption audit trail (`docs/ARCHITECTURE-ADMIN-DASHBOARD.md` §4).

---

## 6. Rate limiting and abuse prevention

| Layer | Mechanism | Paths |
|---|---|---|
| Postgres | `user_rate_limits` + `check_user_rate_limit` (019) | `voucher_scan` inside RPC (fail closed for redeem) |
| Edge / app | Planned Upstash Redis (existing SECURITY.md SEC-RL) | checkout start, login, webhook auxiliary |
| Cron | `CRON_SECRET` bearer | expire vouchers, notifications worker, payouts |
| Resend | worker max send/min | notifications doc |
| Fail posture | Money/redeem: **fail closed**. Marketing/search: fail open acceptable | |

Per-endpoint sketch (document, not code):

| Endpoint | Limit | Fail |
|---|---|---|
| `POST /api/supplier/vouchers/redeem` | 30/min/user (RPC) + IP soft | closed |
| Cardcom webhook | signature + idempotency | closed |
| Login / OTP | Supabase + app throttle | closed |
| Search API | existing short cache; add IP limit | open |
| Admin actions | session + recent auth on sensitive | closed |

---

## 7. Secrets management

| Secret | Where | Rotation |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel server env; Edge Functions secrets | on staff offboarding; never `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | rotate if RLS regression found |
| Cardcom terminal / API | Vercel server only | on PSP ticket |
| QR HMAC / signing key | server only; version via `qr_key_id` on vouchers | dual-key window |
| `CRON_SECRET` | Vercel + scheduler | quarterly |
| Resend API | server/worker | on leak |
| `NTFY_TOKEN` | server | on leak |
| OAuth client secrets | Supabase dashboard | provider rotation |

Rules: no secrets in git; no secrets in client bundles; Edge Functions get least privilege; local `.env.local` gitignored.

---

## 8. Audit logging

Canonical: `public.audit_log` (011; `admin_audit_log` removed in 025).

| Column | Purpose |
|---|---|
| `actor_id`, `actor_role` | who |
| `action` (`audit_action`) | created/updated/deleted/permission_change/status_change/manual_override/... |
| `entity_type`, `entity_id` | what |
| `changes`, `metadata` | before/after jsonb |
| `ip_address`, `user_agent` | context |
| `created_at` | when |

Must audit: role changes, money knob changes, refunds, payout approve/paid, supplier suspend/approve, wallet adjust, template activates, forced order cancels.

RLS: admin SELECT only; no client INSERT/UPDATE/DELETE.

---

## 9. Israeli privacy and retention

Grounding: `029_accounts.sql` comments (Israeli privacy/tax retention), `account_deletion_requests`, legal architecture (counsel required).

### 9.1 Data classes

| Class | Examples | Retention sketch |
|---|---|---|
| Account | `profiles`, auth email/phone | until deletion + cooling period |
| Commerce | `orders`, `order_items`, snapshots | tax/bookkeeping: **Open Q-SEC-3** (commonly 7 years IL bookkeeping; confirm counsel) |
| Payments | `payments`, token metadata | as required by PSP + dispute window |
| Vouchers | `vouchers`, `voucher_redemptions` | fraud + consumer claims window |
| Wallet | `wallet_entries` | aligned with ledger/tax |
| Logs | `audit_log`, outbox | operational 1–2y; security longer if needed |
| Marketing prefs | `user_notification_preferences` | until withdraw |

### 9.2 Deletion workflow (029)

`account_deletion_requests`: user requests → cooling `cancel_deadline_at` → admin/job erases or anonymizes what law allows; **preserve** invoices/tax rows with personal data minimized (hash/replace identifiers) per counsel.

### 9.3 Consumer disclosures

PDP supplier identity; distance-selling disclosures; coupon expiry and till balance clarity (legal doc). Security requirement: accurate money display (no quote≠charge bugs).

---

## 10. GDPR-style data subject rights (even for IL-only users)

Implement as product capabilities regardless of formal GDPR applicability (**Q-SEC-4** residency mix):

| Right | Mechanism |
|---|---|
| Access | Account pages + admin export for subject |
| Rectification | `/account/details`, addresses |
| Erasure | `account_deletion_requests` pipeline |
| Restriction | suspend marketing via prefs; freeze account flag (planned) |
| Portability | JSON export of orders/vouchers/wallet ledger (planned admin/self) |
| Objection to marketing | prefs + outbox `skipped` |

Do not promise erasure of immutable fiscal snapshots without counsel-approved anonymization scheme.

---

## 11. Incident response and breach notification

### 11.1 Severity

| Sev | Example | Notify |
|---|---|---|
| S1 | PAN leak, mass voucher forge, service-role leak | immediate exec + counsel; regulator if required |
| S2 | Limited account takeover, RLS hole on orders | 24h internal; customers if PII exposed |
| S3 | Rate-limit bypass without loss | patch + postmortem |

### 11.2 Runbook (binding outline)

1. Contain: rotate secrets, revoke sessions, disable redeem/checkout flags if needed.
2. Preserve evidence: `audit_log`, `voucher_redemptions`, payment ids, Vercel/Supabase logs.
3. Assess: tables touched, row counts, whether tokens/PAN involved (should be none).
4. Notify: counsel decides IL Privacy Protection Authority path; email affected users via transactional templates.
5. Eradicate + recover; postmortem in `audit_log` metadata / ops doc.
6. **Open Q-SEC-5:** contractual breach SLA hours to publish.

Admin alerts: ntfy topics (`docs/ARCHITECTURE-NOTIFICATIONS.md`).

---

## 12. Dependency and supply-chain security

| Control | Practice |
|---|---|
| Lockfiles | commit lockfile on app branches; `pnpm audit` / Dependabot on CI |
| Minimal installs in docs worktrees | do not run package managers in `ke-arch` docs sessions |
| GitHub | branch protection; no force-push main; CODEOWNERS for payments/redeem |
| Actions | pin action SHAs; least privilege tokens |
| Next/Supabase upgrades | staged; regression tests on RLS SQL suites (`tests/sql/*`) |
| Secrets in PRs | gitleaks / secret scan |
| Browser XSS | CSP in `next.config.ts`; harden nonce plan from INFRA notes |

Known tracked issues from prior SECURITY.md: SEC-QR (keyed HMAC), SEC-WALLET (REVOKE EXECUTE), SEC-RL (fail-closed Redis on money).

---

## 13. Prioritized remediation roadmap

| P | Item | Grounding |
|---|---|---|
| P0 | Keyed HMAC/Ed25519 for voucher QR; kill unkeyed sha256 issuer paths | SEC-QR |
| P0 | `REVOKE EXECUTE` on wallet transfer from PUBLIC/authenticated everywhere | SEC-WALLET / 046 |
| P0 | Confirm `cardcom_token` not exposed to browser roles on hosted | 029 |
| P0 | Redeem path only via RPC; no client UPDATE policies on `vouchers` | 073/074/085 |
| P1 | Fail-closed edge rate limit on checkout + webhook auxiliary | SEC-RL |
| P1 | Audit every admin money-knob / role / refund / payout mutation | 011 |
| P1 | DB trigger blocking non-service updates to `platform_percent` et al. | 070 |
| P1 | FORCE RLS audit on money tables | host drift |
| P2 | Account export + deletion job completeness | 029 |
| P2 | Fraud dashboard on `voucher_redemptions` | admin doc |
| P2 | Dependency CI gates | supply chain |
| P3 | Formal IR tabletop + counsel SAQ calendar | Q-SEC-2/5 |

---

## 14. Open questions

| ID | Question |
|---|---|
| Q-SEC-1 | Counsel sign-off owner for privacy policy and supplier DPA |
| Q-SEC-2 | SAQ-A annual owner |
| Q-SEC-3 | Exact fiscal retention years for orders/payments |
| Q-SEC-4 | Any EU residents in practice (GDPR hard apply)? |
| Q-SEC-5 | Public breach notification SLA |
| Q-SEC-6 | Upstash vs in-Postgres rate limits long-term |
| Q-SEC-7 | Mandatory admin 2FA timeline (Supabase AAL2 / TOTP) |

---

## 15. Related artifacts (read-only references)

| Artifact | Role |
|---|---|
| `003_rbac.sql` | roles, `is_admin` |
| `011_audit_log_schema.sql` / `025` | canonical audit |
| `019_user_rate_limits.sql` | `check_user_rate_limit` |
| `029_accounts.sql` | deletion, outbox, token hardening |
| `046_checkout_runtime.sql` | payments, wallet, tokens |
| `070_product_dynamic_split.sql` | split pair, snapshots |
| `072`–`078` | members + supplier order RLS |
| `073`/`074`/`085` | vouchers + redeem |
| `075_cardcom_account_id.sql` | token account binding |
| `081_payout_no_escrow.sql` | payout admin gate |
| Main-repo `docs/ARCHITECTURE-SECURITY.md` | prior security ADR (superseded where this file conflicts on escrow/coupon payout) |
| Main-repo `docs/ARCHITECTURE-LEGAL-COMPLIANCE.md` | consumer law engineering map |
