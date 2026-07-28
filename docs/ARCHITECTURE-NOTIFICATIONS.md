# ARCHITECTURE-NOTIFICATIONS.md

KenyonExpress notification architecture (Resend + Supabase triggers + Edge Functions / cron workers).

Status: BINDING for `arch/admin-supplier` (2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only (docs). No application code.
No Make. No Zapier. No third-party automation SaaS in the critical path.
Companions: `docs/ARCHITECTURE-ADMIN-DASHBOARD.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`.
Grounding: migrations `029_accounts.sql` (outbox + prefs), `031_notifications.sql` (DRAFT templates/events/fanout), `086_triggers_post_059_money_columns.sql` (`trg_orders_notification_events` → `fn_emit_notification_event`), voucher redeem RPCs `074`/`085`, payout `081`.

Money model for copy: coupon prepaid stays with platform; till balance at merchant; physical split by snapshotted `platform_percent`; no Escrow.

---

## 0. Principles

1. **Emit ≠ send.** DB triggers only write facts (`notification_events`) or enqueue (`notifications_outbox`). Network I/O happens in a worker (Route Handler cron and/or Edge Function).
2. **Idempotent by `dedupe_key`.** Retried triggers and webhook replays never double-send.
3. **Hebrew RTL first.** Email HTML uses `dir="rtl"` `lang="he"`. Templates versioned per locale.
4. **Customer email ≠ admin ops alerts.** Customers: Resend. Admin urgent: ntfy.sh (iPhone). Suppliers: Resend to member emails.
5. **Consent and prefs.** `user_notification_preferences` gates marketing; transactional kinds may still send (flag open questions below).

---

## 1. Pipeline (trigger → worker → Resend / ntfy)

```
domain change (orders / vouchers / payouts / applications)
  -> AFTER trigger or SECURITY DEFINER call site
  -> fn_emit_notification_event(kind, entity_type, entity_id, actor, payload)
  -> notification_events (append-only fact)
  -> fn_fanout_notification_events (031)
       respects prefs, builds channel rows
  -> notifications_outbox (UNIQUE dedupe_key, status=queued)
  -> worker drains queue
       email  -> Resend API
       inapp  -> already in outbox (bell reads via RLS)
       push   -> future FCM/APNs OR admin ntfy channel
       sms    -> out of scope v1 unless decided
  -> notification_delivery_events (provider callbacks)
  -> on failure: retry/backoff -> dead
```

Worker transport (binding):

| Path | Auth | Role |
|---|---|---|
| `POST /api/cron/notifications-worker` | `Authorization: Bearer CRON_SECRET` | Primary drain on Vercel/Node |
| Edge Function `notifications-worker` | service role + cron secret | Optional; same drain SQL |
| Edge Function `resend-webhook` | Resend signed webhook | Delivery events |

**Do not** call Resend inside `redeem_voucher` or Cardcom webhook request path beyond enqueue.

---

## 2. Event catalog

Channels: `email` | `inapp` | `push` | `sms` (029 CHECK). Admin ntfy is an **extra outbound** from the worker when `kind` is admin-alert (not stored as customer `user_id` row, or stored against a platform ops user).

Timing: `immediate` = `scheduled_for = now()`; delayed uses future `scheduled_for`.

### 2.1 Order and payment

| Event | Trigger source | Recipient | Channel | Template key | Timing |
|---|---|---|---|---|---|
| Order placed (pending) | `orders` INSERT or status→`pending` | buyer `orders.user_id` | email + inapp | `order.placed` | immediate |
| Payment captured / paid | `trg_orders_notification_events` on `orders.status` → `paid` (086) | buyer | email + inapp | `order.paid` | immediate |
| Physical split + supplier notified | same paid transition; fanout also to supplier manager+ emails | supplier members (manager/owner) | email | `supplier.order.paid` | immediate |
| Order cancelled | status → `cancelled` | buyer; supplier if physical lines | email + inapp | `order.cancelled` / `supplier.order.cancelled` | immediate |
| Refund completed | refund finalize success | buyer | email + inapp | `order.refunded` | immediate |
| Dispute opened/resolved | disputes table / admin action | buyer; admin ntfy | email + ntfy | `order.dispute.*` / `admin.dispute` | immediate |

Dedupe examples:

- `order.paid:{order_id}`
- `supplier.order.paid:{order_id}:{supplier_id}`

### 2.2 Coupons / vouchers

| Event | Trigger source | Recipient | Channel | Template key | Timing |
|---|---|---|---|---|---|
| Coupon issued | voucher INSERT after finalize (`vouchers` status `issued`) | buyer | email + inapp | `voucher.issued` | immediate |
| Coupon scanned/redeemed | after successful `redeem_voucher` (call `fn_emit` from RPC or trigger on status→`redeemed`) | buyer (receipt); optional supplier inapp off-by-default | email | `voucher.redeemed` | immediate |
| Expiry reminder 7d / 48h | `fn_enqueue_coupon_expiry_reminders` (029) | buyer | email | `voucher.expiry_7d` / `voucher.expiry_48h` | scheduled |
| Expired | `expire_vouchers` sweep | buyer | email + inapp | `voucher.expired` | immediate after sweep |

Copy rule: redeemed email must state till amount was collected at merchant; **no** platform transfer promise for coupon prepaid.

Dedupe: `voucher.issued:{voucher_id}`, `voucher.redeemed:{voucher_id}`, `voucher.expiry_7d:{voucher_id}`.

### 2.3 Payouts

| Event | Trigger source | Recipient | Channel | Template key | Timing |
|---|---|---|---|---|---|
| Payout generated | `generate_payout_statement` → status `draft`/`pending_approval` | admin email + ntfy (ops) | email + ntfy | `admin.payout.generated` | immediate |
| Payout approved | status → `approved` | supplier owners | email | `supplier.payout.approved` | immediate |
| Payout paid | status → `paid` | supplier owners | email | `supplier.payout.paid` | immediate |

Physical-only money; templates must not imply coupon platform remittance.

### 2.4 Supplier onboarding

| Event | Trigger source | Recipient | Channel | Template key | Timing |
|---|---|---|---|---|---|
| Application submitted | `supplier_applications` INSERT | admin ntfy + email | ntfy + email | `admin.supplier.application` | immediate |
| Approved | approve RPC/action | applicant user | email | `supplier.application.approved` | immediate |
| Rejected | reject with reason | applicant | email | `supplier.application.rejected` | immediate |
| Member invited | `inviteSupplierMember` | invitee | email | `supplier.member.invited` | immediate |

### 2.5 Admin iPhone alerts (ntfy.sh)

Separate from Resend customer mail.

| Alert | When | Topic |
|---|---|---|
| Payment webhook failure spike | worker/health | `ke-admin-payments` |
| Redeem fraud burst | rate_limited / multi wrong_supplier | `ke-admin-fraud` |
| Payout generated needing approval | §2.3 | `ke-admin-payouts` |
| Supplier application pending | §2.4 | `ke-admin-suppliers` |
| Dead-letter notifications | outbox `dead` count | `ke-admin-notify` |

Worker POSTs to `https://ntfy.sh/<topic>` (or self-hosted) with title/body. Auth: ntfy access token in server env `NTFY_TOKEN`. **Open Q-NOTIF-1:** hosted ntfy.sh vs self-hosted for production PII.

---

## 3. Idempotency and dedup

1. `notifications_outbox.dedupe_key text NOT NULL UNIQUE` (029): insert conflict → skip (treat as success/idempotent).
2. Emit function should upsert-or-ignore events with a natural key in payload / unique index on `(kind, entity_type, entity_id, occurrence)` where 031 defines it.
3. Resend `Idempotency-Key` header = outbox `id` (or dedupe_key) so HTTP retries do not double-deliver.
4. Cardcom webhook and redeem RPC retries only call `fn_emit_*`; never raw Resend.

---

## 4. Failure handling, retry, dead-letter

`notification_status` (029 + 031): `queued | sent | failed | cancelled | dead | skipped`.

| Stage | Behavior |
|---|---|
| Provider 5xx / timeout | stay `queued` or mark soft-fail; increment `attempt_count` (031 column if present; else `payload.attempts`) |
| Backoff | `scheduled_for = now() + interval '2 min' * 2^attempt` capped (e.g. 6 attempts / ~1h) |
| Exhausted | `status = dead`; emit admin ntfy |
| Consent fail | `skipped` (not error) |
| Admin requeue | `fn_requeue_dead_notification(id)` (031 design) → `queued` |

Index: `notifications_outbox_queue_idx` on `(scheduled_for) WHERE status = 'queued'`.

---

## 5. Templates and Hebrew RTL

Table `notification_templates` (031):

| Column | Notes |
|---|---|
| `template_key`, `channel`, `locale`, `version` | UNIQUE together |
| `subject`, `body_text`, `body_html` | HTML must set `dir="rtl"` for `he` |
| `variables` jsonb | placeholder list |
| `is_active` | one active per key/channel/locale (`notification_templates_one_active_idx`) |

Activation: `fn_activate_template` (admin only).
Marketing WhatsApp: out of coupons-first scope unless **Q-NOTIF-2** decides Meta templates.

---

## 6. Rate limiting (Resend quota)

| Layer | Limit |
|---|---|
| Per-user transactional | reuse `check_user_rate_limit` patterns; soft |
| Global send worker | max N sends/minute from env `RESEND_MAX_PER_MINUTE` (suggest 30–50 until quota known) |
| Burst admin ntfy | coalesce identical alerts 5 min (`dedupe_key` time bucket) |
| Marketing fanout | separate slower queue / scheduled_for spreading |

**Open Q-NOTIF-3:** exact Resend plan monthly cap.

---

## 7. Data model

### 7.1 `user_notification_preferences` (029)

Per `user_id` PK: channel booleans, `locale` CHECK `he|en`, timestamps.
**Gap:** supplier digest frequency columns not in 029 base; add migration when needed.

### 7.2 `notifications_outbox` (029)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL → auth.users CASCADE |
| `kind` | text | NOT NULL |
| `channel` | text | CHECK email/inapp/push/sms |
| `payload` | jsonb | NOT NULL DEFAULT `{}` |
| `dedupe_key` | text | NOT NULL UNIQUE |
| `status` | `notification_status` | DEFAULT `queued` |
| `scheduled_for` | timestamptz | NOT NULL DEFAULT now() |
| `sent_at` / `read_at` | timestamptz | |
| `error` | text | |
| `created_at` / `updated_at` | timestamptz | |

Indexes: queue partial; user+created_at.
RLS: owner select; owner update `read_at` only; admin select; no client insert.

### 7.3 `notification_templates` / `notification_events` / `notification_delivery_events` / `notification_conversions` (031 DRAFT)

Apply 031 only after 029 confirmed on host. Events are append-only facts; delivery_events store Resend message ids + webhook payloads (90-day retention design in 031).

### 7.4 Migration needed for admin alerts without fake user_id

**Option A:** nullable `user_id` + `audience text` CHECK (`user|supplier_member|admin_ops`).
**Option B:** dedicated `admin_alert_outbox` table.
**Open Q-NOTIF-4:** choose A vs B before coding worker.

---

## 8. Security

| Threat | Control |
|---|---|
| Spoof Resend webhook | Verify Svix/Resend signature; reject unsigned |
| Steal CRON_SECRET | env only; rotate; no client exposure |
| Enumerate other users' outbox | RLS `user_id = auth.uid()` |
| Trigger injection flooding email | dedupe_key + rate limits + worker cap |
| PII in ntfy public topic | private topic + token; minimize payload (ids not emails) |
| Template XSS in HTML | admin-only template write; sanitize variables on render |
| Audit | template activate, requeue dead, preference changes → `audit_log` |

---

## 9. Audit trail

- Every template activation: `audit_log` entity_type `notification_template`.
- Dead requeue: audit.
- Worker stores provider id in `notification_delivery_events`.
- Redeem/payment paths already audit via domain tables (`voucher_redemptions`, `payments`); notifications reference those ids in payload.

---

## 10. Rollout

1. Confirm 029 objects on hosted (`notifications_outbox`, prefs, enum).
2. Apply 031 (or additive subset): templates, events, fanout, dead/skipped.
3. Fix 086 trigger column names for post-059 money (`total_agorot` not `total_ils`).
4. Implement `/api/cron/notifications-worker` + Resend client.
5. Wire emit on voucher issue/redeem and payout status (not only orders).
6. Add ntfy admin alerts.
7. Seed Hebrew templates for §2 events.
8. Load test dedupe under webhook replay.

---

## 11. Open questions

| ID | Question |
|---|---|
| Q-NOTIF-1 | ntfy.sh cloud vs self-hosted |
| Q-NOTIF-2 | WhatsApp / SMS in v1? |
| Q-NOTIF-3 | Resend monthly cap and domain |
| Q-NOTIF-4 | Admin alert storage model (nullable user_id vs separate table) |
| Q-NOTIF-5 | Which kinds are transactional (ignore marketing opt-out)? |
| Q-NOTIF-6 | Email buyer on every redeem, or inapp only? |
| Q-NOTIF-7 | Supplier redeem success email default on/off |

---

## 12. Related code / migrations

| Artifact | Role |
|---|---|
| `029_accounts.sql` | outbox, prefs, status enum, expiry enqueue |
| `031_notifications.sql` | templates, emit/fanout, dead letter (DRAFT) |
| `086_triggers_post_059_money_columns.sql` | orders paid/cancelled emit |
| `074`/`085` redeem RPCs | enqueue point for `voucher.redeemed` |
| `081` payout generate | enqueue payout events |
| Cardcom webhook / finalize | order paid + voucher issued |
