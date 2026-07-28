# ARCHITECTURE-NOTIFICATIONS.md

KenyonExpress notification system architecture (complete binding spec).

Status: BINDING for `arch/admin-supplier` (2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.** Do not implement from this file inside this worktree.
Companions: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-ADMIN-DASHBOARD.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`, `docs/ARCHITECTURE-MOBILE-APP.md`.
Grounding: migrations `029` (outbox + prefs), `031` (templates/events/fanout/dead, often DRAFT), `086` (order paid/refunded emit post-059), voucher redeem `074`/`085`, search DLQ pattern `069_search_index_dlq.sql` on `feat/search-core` (ke-search).
Authority on money copy: dynamic per-product model below. Where older drafts hardcode fixed commission or Escrow payout of coupon prepaid, this file + product/supplier specs win.

No Make. No Zapier. Approved delivery: **Resend** (transactional email), **Supabase triggers + Edge Function / Vercel cron worker**, **Ntfy.sh** (admin limit / ops alerts), future **in-app** (outbox `channel=inapp`).

---

## 0. Money model (must appear correctly in payment notifications)

| Product type | Customer pays on site | Platform revenue from that charge | Supplier from platform | Snapshot |
|---|---|---|---|---|
| **Coupon** | Full **online** price = absolute `coupon_price_ils` (admin-set, no default). Not a percent of face. | Split of that prepaid amount by dynamic **`platform_percent`** (admin per product, no default, snapshotted). Setting 100/0 means platform keeps all prepaid (common). Till balance `face - coupon_price` is cash at merchant on QR scan; coupon **expires on scan**. | Residual of prepaid only if `platform_percent < 100`; **never** the till balance | `order_items` + voucher money fields immutable |
| **Physical** | On-site charge (discounted sticker). Split **immediately** at purchase by snapshotted `platform_percent` | `platform_percent` of paid-on-site | Residual; payout after T+3 / min threshold | same |

Invariants for templates:

1. Never invent a fixed 5%/10% commission.
2. Never re-read live `products.platform_percent` for a past order; use snapshot fields (`platform_percent`, `paid_on_site_agorot`, `commission_agorot`, `coupon_price_*`, `balance_due_agorot`).
3. No Escrow language. No promise that coupon till money flows through KenyonExpress.
4. Amounts in templates: ILS with 2 decimals for humans; payloads may carry agorot integers.

**Open Q-NOTIF-MONEY-1:** Whether customer-facing paid email shows the platform/supplier split at all, or only "שולם באתר" + "יתרה בבית העסק" for coupons. Default for v1: **do not show split to customers**; show split only on supplier physical order email and admin digests.

---

## 1. Event sources

Every domain write that must emit a notification fact. Emit via `fn_emit_notification_event(dedupe_key, event_type, entity_type, entity_id, user_id, payload)` (031) or an equivalent call site inside a SECURITY DEFINER RPC after the money mutation commits.

| Canonical `event_type` | When it fires | Primary table / path | Payload facts (ids + money, no extra PII) |
|---|---|---|---|
| `order_created` | `orders` INSERT with `status=pending` (beginCheckout) | `orders` | `order_id`, line summary counts, `product_types[]` (`coupon`/`physical`), `customer_pays_now_agorot` |
| `order_created_coupon` | Same, if any line `product_type=coupon` (optional specialized emit; or fanout branches on payload) | `order_items` | per line: `coupon_price` snapshot, `balance_due_agorot`, `platform_percent` snapshot |
| `order_created_physical` | Same, if any physical line | `order_items` | `paid_on_site` intent, `platform_percent`, `supplier_id` |
| `payment_settled` | Cardcom verified success → order `paid` (alias of today's `order_paid` in 086) | `orders` UPDATE + `payments` | `order_id`, `paid_on_site_agorot` / `total_*`, `invoice_number`, line money snapshots |
| `payment_failed` | Low Profile / charge failure or pending expiry without pay | `payments` status failed / order cancelled-expired | `order_id`, `payment_id`, `failure_code` (non-sensitive) |
| `coupon_redeemed` | Successful QR/manual scan (`redeem_voucher` / redeem RPC) | `vouchers` → `redeemed` | `voucher_id`, `code` (masked), `remaining_amount_due_agorot` (till), `supplier_id`, `redeemed_at` |
| `coupon_expired_after_scan` | Same commit as redeem: terminal used/redeemed (expires-on-scan). **Not** calendar expiry. | same | same as redeemed; template stresses "פג תוקף לאחר מימוש" |
| `coupon_expired_calendar` | Sweep `expire_vouchers` / time expiry without redeem | vouchers → `expired` | triggers wallet `refund_credit` path notifications separately if credited |
| `refund_initiated` | Admin/customer refund started (before PSP confirm) | refund request / order flag | `order_id`, `reason_code`, amounts requested |
| `order_refunded` | Refund finalized (086 already emits) | `orders.status=refunded` | `order_id`, refunded totals |
| `supplier_new_order` | After `payment_settled`, fanout per distinct `order_items.supplier_id` with physical lines (and coupon lines only if product policy notifies supplier of sale; default **physical required**, coupon optional off) | fanout from paid | `order_id`, `supplier_id`, lines, snapshotted residual / platform_percent |
| `subscription_renewal` | **Future** Cardcom recurring success | `subscriptions` (not in 026–053 scope) | `subscription_id`, `amount_agorot`, `platform_percent` snapshot | out of coupons-first launch |

Notes:

- Prefer one `payment_settled` fact plus fanout over duplicate emails from both payment and order triggers; dedupe_keys must collide intentionally (`payment_settled:{order_id}` === treat as same as `order_paid:{order_id}`).
- `coupon_expired_after_scan` may share dedupe with `coupon_redeemed:{voucher_id}` if a single template covers both; otherwise use `coupon_expired_after_scan:{voucher_id}` and skip redundant redeemed mail (**Q-NOTIF-1**).

---

## 2. Channels

| Channel | Transport | Use |
|---|---|---|
| **email** | Resend API from worker | All customer + supplier transactional mail |
| **inapp** | `notifications_outbox` row; bell UI via RLS | Customer account notifications; optional supplier home |
| **push** | Future Expo / FCM via outbox (mobile doc) | Same transactional set when devices registered |
| **ntfy** | Worker HTTP POST to ntfy topic (not customer outbox, or `audience=admin_ops`) | Admin limit alerts, DLQ depth, webhook failure spikes, fraud bursts |
| **sms / whatsapp** | Out of coupons-first unless counsel enables | Not required for events below |

### Event → channel map

| Event | Email (Resend) | In-app | Ntfy (admin) | Notes |
|---|---|---|---|---|
| `order_created` | optional (usually wait for pay) | optional | no | Default **skip email** until settled to avoid unpaid noise (**Q-NOTIF-2**) |
| `payment_settled` (coupon and/or physical) | customer: yes | yes | no | Money copy per §0 |
| `payment_failed` | customer: yes | yes | yes if spike | Soft fail vs systemic |
| `coupon_redeemed` / `coupon_expired_after_scan` | customer: yes | yes | no | Till amount highlighted |
| `coupon_expired_calendar` + wallet credit | customer: yes | yes | no | |
| `refund_initiated` | customer: yes | yes | admin if manual override | |
| `order_refunded` | customer: yes | yes | no | |
| `supplier_new_order` | supplier manager+: yes | optional | no | Physical split from **snapshot** `platform_percent` |
| `subscription_renewal` | customer: yes (future) | yes | no | |
| Rate limit / redeem fraud / outbox dead / Cardcom verify fail burst | no | no | **yes** | Admin only |

---

## 3. Recipients matrix

| Event | Customer | Supplier | Admin | Channel used |
|---|---|---|---|---|
| `order_created` | yes (if enabled) | no | no | inapp optional; email optional |
| `payment_settled` (coupon lines) | yes | no (default) | no | email + inapp |
| `payment_settled` (physical lines) | yes | yes (`supplier_new_order`) | no | email + inapp (customer); email (supplier) |
| `payment_failed` | yes | no | on spike | email + inapp; ntfy |
| `coupon_redeemed` | yes | optional (default off) | fraud ntfy only | email + inapp |
| `coupon_expired_after_scan` | yes (same or combined template) | no | no | email + inapp |
| `coupon_expired_calendar` | yes | no | no | email + inapp |
| `refund_initiated` | yes | if physical unshipped impact | yes if staff-initiated | email + inapp; ntfy optional |
| `order_refunded` | yes | if their lines affected | no | email + inapp |
| `supplier_new_order` | no | manager + owner | no | email |
| `subscription_renewal` | yes | no | no | email + inapp (future) |
| Outbox `dead` / worker stall | no | no | yes | ntfy |
| Redeem `rate_limited` burst | no | no | yes | ntfy |

Supplier recipients resolve from `supplier_members` where `is_active` and `member_role IN ('owner','manager')` (scanners do not get new-order email by default).

---

## 4. Data flow

### 4.1 Happy path

```
1. Domain mutation commits (checkout / webhook finalize / redeem_voucher / refund)
2. AFTER trigger or RPC calls fn_emit_notification_event(...)
     INSERT notification_events ON CONFLICT (dedupe_key) DO NOTHING
3. Fan-out (fn_fanout_notification_events cron/trigger, 031):
     - load prefs + suppressions
     - INSERT notifications_outbox rows per (user, channel)
       with dedupe_key UNIQUE (e.g. email:order_paid:{order_id}:{user_id})
4. Worker drains queue:
     POST /api/cron/notifications-worker  (Bearer CRON_SECRET)
     and/or Edge Function notifications-worker (service role + secret)
5. For channel=email: Resend send with Idempotency-Key = outbox.id
   For channel=inapp: mark sent (already visible)
   For admin ntfy: separate send path (not Resend)
6. Provider webhooks → notification_delivery_events (031)
7. Mark outbox status=sent, sent_at=now()
```

**Rule:** Cardcom webhook and redeem RPC must not await Resend. Enqueue only.

### 4.2 Idempotency keys

| Layer | Key |
|---|---|
| Fact | `notification_events.dedupe_key` e.g. `payment_settled:{order_id}` |
| Outbox | `notifications_outbox.dedupe_key` e.g. `email:payment_settled:{order_id}:{user_id}` |
| Resend | HTTP `Idempotency-Key: {outbox.id}` |
| Ntfy coalesce | `ntfy:{kind}:{bucket_5min}` |

### 4.3 Retry logic

Reuse and extend 031 outbox fields (`attempt_count`, `next_attempt_at`, `last_error` where present):

| Attempt | Delay before next |
|---|---|
| 1 | immediate |
| 2 | 2 min |
| 3 | 4 min |
| 4 | 8 min |
| 5 | 16 min |
| 6 | 32 min then **dead** |

Worker selects `status='queued' AND next_attempt_at <= now()` FOR UPDATE SKIP LOCKED (or equivalent) so concurrent crons do not double-send.

### 4.4 Dead letter handling (search-core DLQ pattern)

`feat/search-core` parks exhausted jobs in `search_index_dlq` (migration `069_search_index_dlq.sql`): jsonb payload, `status IN ('dead','replayed','discarded')`, RLS on with **zero** policies (service-role only), manual replay via secured route then `status=replayed`.

**Notifications adopt the same pattern:**

1. Outbox row reaches `status='dead'` after retries (031 meaning).
2. Mirror insert into `notification_delivery_dlq` (new; §7) with verbatim last error + outbox snapshot jsonb (like search DLQ `callback`/`job`).
3. Ntfy admin alert on insert / depth threshold.
4. Admin replay: requeue outbox to `queued` (031 `fn_requeue_dead_*` style) **or** POST worker with `CRON_SECRET`, then mark DLQ `replayed`.
5. Discard only by admin with audit_log entry.

Do not drop undeliverable customer payment receipts silently.

---

## 5. Templates (Hebrew RTL)

All email HTML: `dir="rtl"` `lang="he"`. Subjects Hebrew. Variables filled from **snapshots** and ids only.

| Template key | Channel | When | Variables |
|---|---|---|---|
| `order.created` | email/inapp | optional pending | `customer_first_name`, `order_id_short`, `pay_url`, `expires_at` |
| `payment.settled.coupon` | email/inapp | paid with coupon lines | `customer_first_name`, `order_id_short`, `paid_online_ils`, `balance_at_business_ils`, `voucher_list[]` (name, code_hint, expires_at), `voucher_wallet_url` |
| `payment.settled.physical` | email/inapp | paid with physical lines | `customer_first_name`, `order_id_short`, `paid_online_ils`, `lines[]` (name, qty), `shipping_summary` |
| `payment.settled.mixed` | email/inapp | both types | union of above |
| `payment.failed` | email/inapp | pay fail | `customer_first_name`, `order_id_short`, `retry_url`, `support_url` |
| `coupon.redeemed` | email/inapp | scan success | `customer_first_name`, `product_name`, `redeemed_at`, `till_collected_ils` (remaining_amount_due), `supplier_name` |
| `coupon.expired_after_scan` | email/inapp | if separate from redeemed | same as redeemed + `expired_reason=scanned` |
| `coupon.expired_credited` | email/inapp | calendar expiry + wallet credit | `credit_ils`, `wallet_url`, `credit_expires_at` |
| `refund.initiated` | email/inapp | refund started | `order_id_short`, `amount_ils`, `method_hint` (card/wallet) |
| `refund.completed` | email/inapp | refunded | `order_id_short`, `amount_ils`, `completed_at` |
| `supplier.new_order.physical` | email | supplier_new_order | `supplier_business_name`, `order_id_short`, `lines[]`, `paid_on_site_ils`, `platform_percent_snapshot`, `supplier_due_ils`, `ship_by_hint`, `portal_orders_url` |
| `supplier.new_order.coupon` | email | only if enabled | `product_name`, `qty`, note: prepaid handled by platform; till at scan |
| `subscription.renewal` | email/inapp | future | `amount_ils`, `period_end`, `manage_url` |
| `admin.ntfy.payment_fail_spike` | ntfy | ops | short title/body, counts, link to admin payments |
| `admin.ntfy.redeem_fraud` | ntfy | ops | counts of rate_limited / wrong_supplier |
| `admin.ntfy.outbox_dead` | ntfy | ops | dead depth, sample outbox ids |

Template storage: `notification_templates` (031) with one active version per `(template_key, channel, locale)`.

---

## 6. Failure handling

| Failure | Behavior |
|---|---|
| **Resend down / 5xx** | Leave outbox `queued`/`failed`; backoff §4.3; do not mark sent; after max attempts → `dead` + DLQ row + ntfy |
| **Resend 4xx (bad template/address)** | `skipped` or `dead` without endless retry; suppress address via `channel_suppressions` on bounce/complaint webhooks (031) |
| **Edge Function / worker timeout** | Transactional send must be idempotent (Resend key = outbox id). Cron retries pick same row. Use SKIP LOCKED |
| **Webhook signature fail (Resend)** | Reject 401; no status flip |
| **Fan-out crash after event insert** | Event remains `processed_at IS NULL`; fan-out job retries; outbox UNIQUE prevents dupes |
| **DB trigger error on order paid** | Must not roll back payment: emit in AFTER trigger autonomous or enqueue from finalize in same TX carefully; prefer finalize call site + trigger as belt (**Q-NOTIF-3**) |
| **Ntfy down** | Log; do not fail customer email path; local metric only |
| **Partial mixed order** | One customer email (`payment.settled.mixed`); separate supplier emails per supplier_id |

Search-core parallel: exhausted work is **parked visibly** (`search_index_dlq`), never deleted; replay is explicit. Notifications mirror that with `notification_delivery_dlq`.

---

## 7. Schema

### 7.1 Already specified (029 / 031)

| Table | Role |
|---|---|
| `user_notification_preferences` | per-user channel toggles + `locale` |
| `notifications_outbox` | queue: `user_id`, `kind`, `channel`, `payload`, `dedupe_key` UNIQUE, `status`, `scheduled_for`, `sent_at`, `read_at`, `error`, (+ 031: attempts, `next_attempt_at`, journey keys) |
| `notification_events` | append-only facts; `dedupe_key` UNIQUE |
| `notification_templates` | versioned RTL bodies |
| `notification_delivery_events` | provider callbacks; ~90 day retention |
| `consent_events` / `channel_suppressions` | marketing/compliance (031) |

`notification_status`: `queued | sent | failed | cancelled | dead | skipped`.

### 7.2 New / rename alignment

User-facing names `notification_log` and `notification_preferences`:

| Requested name | Binding mapping |
|---|---|
| `notification_preferences` | **Use existing** `user_notification_preferences` (029). Do not create a second prefs table. |
| `notification_log` | **Views + tables:** read model over `notification_events` ⋈ `notifications_outbox` ⋈ `notification_delivery_events`; optional SQL view `v_notification_log` for admin UI. |

### 7.3 `notification_delivery_dlq` (new, search-core analogue)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `outbox_id` | uuid null | FK → `notifications_outbox` ON DELETE SET NULL |
| `job` | jsonb | reconstructed send intent |
| `callback` | jsonb NOT NULL | last worker error / provider body (`{"raw":...}` if undecodable) |
| `last_error` | text | |
| `status` | text | CHECK `dead\|replayed\|discarded` DEFAULT `dead` |
| `created_at` | timestamptz | DEFAULT now() |
| `resolved_at` | timestamptz | |

Index: `(status, created_at DESC)`.
RLS: ENABLE with **no** authenticated policies (service-role / admin client only), same as `search_index_dlq`.

### 7.4 Preferred indexes (confirm on apply)

- `notifications_outbox (scheduled_for) WHERE status = 'queued'`
- `notifications_outbox (next_attempt_at) WHERE status = 'queued'` (031)
- `notification_events (occurred_at) WHERE processed_at IS NULL`
- UNIQUE `dedupe_key` on events and outbox

### 7.5 RLS summary

| Table | SELECT | WRITE |
|---|---|---|
| `user_notification_preferences` | own | own |
| `notifications_outbox` | own; `is_admin()` | service/fanout insert; owner UPDATE `read_at` only |
| `notification_events` | `is_admin()` | definer emit only |
| `notification_templates` | `is_admin()` | admin activate |
| `notification_delivery_dlq` | service/admin only | service only |

---

## 8. Migration plan

**Never** `supabase db push` for these objects. Apply only via **Supabase MCP `apply_migration`** (project convention; same as search/catalog docs).

| Proposed name | Depends on | Contents |
|---|---|---|
| Next free number **≥ 076** on the target host (if `076`–`091` already used, take **next unused**, e.g. `092_notification_delivery_dlq.sql`) | 029 outbox exists | Create `notification_delivery_dlq` + indexes + RLS |
| Following number | 031 or subset | Ensure `dead`/`skipped` on enum; outbox attempt columns; `fn_requeue_dead_notification` |
| Following number | 086 patterns | Emit `payment_failed`, `order_created` (if approved), redeem success emit from RPC, `supplier_new_order` fanout |
| Seed migration or admin script | templates table | Hebrew RTL active templates listed in §5 |

Pre-checks before apply:

1. `to_regclass('public.notifications_outbox')` present.
2. Do not re-apply full `027` (regressions on `platform_percent`).
3. Idempotent `IF NOT EXISTS` / `ADD VALUE IF NOT EXISTS`.
4. Apply-twice harness green on staging.

**Open Q-NOTIF-4:** Exact first migration ordinal on production journal (076 vs 092+) must be read from hosted `schema_migrations` at apply time, not guessed from this doc.

Rollout order:

1. Prefs + outbox confirmed (029).
2. Templates + events + fanout (031 or additive slice).
3. DLQ table.
4. Worker cron + Resend + ntfy.
5. Wire emits on finalize / redeem / refund / fail.
6. Seed templates; verify coupon vs physical payment emails against §0 snapshots.

---

## 9. Security and abuse

- No Resend from browser.
- Cron/Edge auth: `CRON_SECRET` or function JWT.
- Rate-limit worker global send (`RESEND_MAX_PER_MINUTE`).
- Redact tokens/PII from ntfy bodies (ids only).
- Audit: template activation, DLQ replay/discard, preference bulk admin edits → `audit_log` (011).

---

## 10. Acceptance checklist

- [ ] Paid coupon email shows online `coupon_price` and till balance; no false platform→supplier transfer for till cash
- [ ] Paid physical supplier email uses **snapshotted** `platform_percent` / residual
- [ ] Double webhook finalize → one customer email (dedupe)
- [ ] Resend outage → retries then DLQ + ntfy; no silent drop of `payment_settled`
- [ ] Redeem success enqueued outside RPC latency budget
- [ ] `subscription_renewal` documented but not required for coupons-first launch
- [ ] Migrations applied only via MCP `apply_migration`

---

## 11. Open questions

| ID | Question |
|---|---|
| Q-NOTIF-1 | Combined vs separate redeemed / expired-after-scan templates |
| Q-NOTIF-2 | Email on `order_created` or only after pay |
| Q-NOTIF-3 | Emit from trigger only vs finalize call site + trigger belt |
| Q-NOTIF-4 | First free migration number on hosted |
| Q-NOTIF-MONEY-1 | Show split to customers? (default no) |
| Q-NOTIF-5 | Notify supplier on coupon sale (default no) |
| Q-NOTIF-6 | Ntfy cloud vs self-hosted for admin PII |

---

## 12. Related references

| Artifact | Role |
|---|---|
| `029_accounts.sql` | outbox, prefs |
| `031_notifications.sql` | events, templates, fanout, dead |
| `086_triggers_post_059_money_columns.sql` | order paid/refunded emit |
| `069_search_index_dlq.sql` (feat/search-core) | DLQ pattern to mirror |
| `docs/ADMIN-PRODUCT-PAGE-SPEC.md` | dynamic money knobs |
| `MASTER-ARCHITECTURE-v2.md` | system externals (Resend), cron split |
