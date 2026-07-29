# ARCHITECTURE-NOTIFICATIONS.md

KenyonExpress notifications architecture (binding).

Status: BINDING for `arch/admin-supplier` (2026-07-29)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
Stack: **Resend** (email) + **Supabase Database Trigger** (emit) + **Edge Function / cron worker** (drain). No Make. No Zapier.
Companions: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.

---

## 0. Business model constraints (copy and payloads)

| Rule | Consequence for notifications |
|---|---|
| Coupon is paid **in full on site** (`coupon_price_ils`, absolute, no default) | Customer paid email shows that amount as "שולם באתר". Never invent a percent of face as the charge. |
| No Escrow | No template, subject, or payload may say "נאמן", "Escrow", "מוחזק אצל צד שלישי", or promise a release of coupon prepaid to the supplier. Coupon prepaid stays with the platform (`platform_settled`). |
| Dynamic `platform_percent` per product | Never hardcode 5%/10%. Always read the **snapshot** on `order_items` (and voucher money columns), never live `products.platform_percent`. |
| Till balance on coupons | `price_ils - coupon_price_ils` is collected in cash/card **at the business** on QR scan. Templates may show it as "יתרה בבית העסק". That money never flows through KE. |
| Physical | Customer pays on site (after `discount_percent`). Platform/supplier split uses snapshotted `platform_percent`. Supplier due appears on supplier alerts and payout mail only. |

Money in DB / JSON payloads: **integer agorot**. Money in Hebrew email bodies: ILS with exactly 2 decimals and ₪.

---

## 1. Pipeline (no Make / Zapier)

```
Domain mutation commits
  -> AFTER trigger / SECURITY DEFINER RPC
  -> INSERT notification_events (idempotent dedupe_key)
  -> fanout -> notification_log (+ optional notifications_outbox)
  -> Edge Function or Vercel cron worker (Bearer CRON_SECRET)
  -> Resend (email) | in-app mark | Ntfy.sh (admin only)
  -> delivery webhook / status update
  -> on exhaustion: DLQ + Ntfy
```

Rules:

1. Cardcom webhook, redeem RPC, and payout RPCs **must not await Resend**. Enqueue only inside the same DB transaction as the money fact when possible.
2. Worker uses service role. Browser never holds Resend or Ntfy secrets.
3. One worker implementation may run as Supabase Edge Function **or** `POST /api/cron/notifications-worker`. Same drain semantics.

---

## 2. Event catalog (required set)

Canonical `event_type` values. Emit after the money/state mutation is durable.

| `event_type` | When | Emitter (source of truth) | Primary audience |
|---|---|---|---|
| `order.paid` | Order becomes `paid` after Cardcom verify / finalize | trigger on `orders` / emit inside finalize | customer |
| `coupon.issued` | Voucher rows created for paid coupon lines | emit inside finalize after voucher insert | customer |
| `coupon.redeemed` | Successful QR/manual scan (`redeem_voucher`) | emit inside redeem RPC after success | customer (supplier optional, default off) |
| `coupon.expired` | Calendar sweep marks voucher `expired` without redeem | `expire_vouchers` / cron | customer |
| `order.physical_supplier_alert` | Paid order contains physical lines for a supplier | fanout from `order.paid` per `supplier_id` | supplier owner/manager |
| `payout.sent` | Payout statement marked paid / transfer recorded | admin/super_admin payout path | supplier owner |
| `order.refunded` | Refund finalized (PSP or wallet credit completed) | refund finalize path | customer (supplier if their lines affected) |

### 2.1 Supporting / optional emits (same pipeline)

| `event_type` | When | Notes |
|---|---|---|
| `order.pending` | Checkout created, unpaid | Default: **no email** (avoid unpaid noise). In-app optional. |
| `payment.failed` | Charge declined / pending expired | Customer email + in-app; Ntfy on spike |
| `refund.initiated` | Refund requested, not yet settled | Customer email; staff Ntfy if manual override |
| `coupon.redeem_rate_limited` | Burst of scan rate limits | Ntfy admin only |

### 2.2 Payload facts (ids + agorot only)

Every event payload is JSONB. Include:

- Entity ids: `order_id`, `order_item_id`, `voucher_id`, `supplier_id`, `user_id`, `payout_statement_id` as applicable
- Money as integers: `paid_on_site_agorot`, `coupon_price_agorot`, `balance_due_agorot`, `platform_fee_agorot`, `supplier_due_agorot`, `refund_agorot`, `payout_agorot`
- Snapshots: `platform_percent` (numeric as stored on the line), `product_type`, `product_name_he`
- Never embed full card numbers, raw QR HMAC secrets, or service-role keys

---

## 3. Channels: customer vs supplier vs admin

| Channel | Transport | Who |
|---|---|---|
| `email` | Resend | Customer and supplier transactional mail |
| `inapp` | Row readable under RLS | Customer account bell; optional supplier home |
| `ntfy` | HTTPS publish to Ntfy topic | **Admin / ops only** (never customers or suppliers) |
| `push` | Future (Expo/FCM) | Same transactional set when devices exist |

### 3.1 Matrix

| Event | Customer email | Customer in-app | Supplier email | Ntfy admin |
|---|---|---|---|---|
| `order.paid` | yes | yes | no (use physical alert) | no |
| `coupon.issued` | yes (or folded into paid) | yes | no | no |
| `coupon.redeemed` | yes | yes | default off | fraud/rate only |
| `coupon.expired` | yes | yes | no | no |
| `order.physical_supplier_alert` | no | no | yes (owner+manager) | no |
| `payout.sent` | no | no | yes (owner) | optional |
| `order.refunded` | yes | yes | if lines affected | no |
| `payment.failed` | yes | yes | no | on spike |
| Worker/DLQ depth / Cardcom verify burst | no | no | no | **yes** |

Supplier recipients: `supplier_members` where `is_active` and `member_role IN ('owner','manager')`. Scanners do not get order/payout email by default.

Preferences: `notification_preferences` (per user, per `event_type`, per channel) may disable email but **must not** disable legal/receipt class events without an in-app substitute. v1: paid, issued, refunded are non-disableable for email if the user has an address.

---

## 4. Idempotency keys (per event)

| Layer | Key format | Uniqueness |
|---|---|---|
| Fact (`notification_events`) | `{event_type}:{entity_id}` | UNIQUE `dedupe_key` |
| Per recipient log (`notification_log`) | `{channel}:{event_type}:{entity_id}:{recipient_user_id}` | UNIQUE `idempotency_key` |
| Resend HTTP | `Idempotency-Key: {notification_log.id}` | Provider-side |
| Ntfy coalesce | `ntfy:{alert_kind}:{floor(epoch/300)}` | One alert per 5 min bucket |

### 4.1 Concrete keys

| Event | Fact `dedupe_key` | Log `idempotency_key` (email) |
|---|---|---|
| `order.paid` | `order.paid:{order_id}` | `email:order.paid:{order_id}:{user_id}` |
| `coupon.issued` | `coupon.issued:{voucher_id}` | `email:coupon.issued:{voucher_id}:{user_id}` |
| `coupon.redeemed` | `coupon.redeemed:{voucher_id}` | `email:coupon.redeemed:{voucher_id}:{user_id}` |
| `coupon.expired` | `coupon.expired:{voucher_id}` | `email:coupon.expired:{voucher_id}:{user_id}` |
| `order.physical_supplier_alert` | `order.physical_supplier_alert:{order_id}:{supplier_id}` | `email:order.physical_supplier_alert:{order_id}:{supplier_id}:{user_id}` |
| `payout.sent` | `payout.sent:{payout_statement_id}` | `email:payout.sent:{payout_statement_id}:{user_id}` |
| `order.refunded` | `order.refunded:{order_id}` | `email:order.refunded:{order_id}:{user_id}` |

`INSERT … ON CONFLICT (dedupe_key) DO NOTHING` on facts. Same for log idempotency keys. Retries of the worker with the same Resend Idempotency-Key must not create duplicate customer mail.

If `coupon.issued` is folded into the paid email, still emit the fact (for audit) but skip a second email by marking log `status='skipped_folded'` with the paid log id as `related_log_id`.

---

## 5. Delivery guarantees, retry, DLQ

### 5.1 Guarantee level

- **At-least-once** enqueue after commit.
- **Exactly-once effect** at the provider via idempotency keys (duplicate worker runs are safe).
- Payment and redeem paths never fail the money transaction because Resend is down.

### 5.2 Retry schedule

| Attempt | `next_attempt_at` delay |
|---|---|
| 1 | immediate |
| 2 | 2 minutes |
| 3 | 4 minutes |
| 4 | 8 minutes |
| 5 | 16 minutes |
| 6 | 32 minutes, then `dead` |

Worker claim: `FOR UPDATE SKIP LOCKED` on due rows (`status IN ('queued','retry') AND next_attempt_at <= now()`).

### 5.3 Dead letter queue

After max attempts:

1. Set `notification_log.status = 'dead'`.
2. Insert into `notification_delivery_dlq` (payload snapshot, last error, attempt_count).
3. Publish Ntfy alert when DLQ insert happens or when depth exceeds threshold (default 25).
4. Admin replay: requeue to `queued` with `attempt_count` reset policy (keep history), audit_log entry.
5. Discard only via admin action + audit.

Do not silently drop `order.paid`, `coupon.issued`, or `order.refunded`.

---

## 6. Rate limits

| Scope | Limit | Behavior |
|---|---|---|
| Resend account | Provider plan cap | Worker backs off; Ntfy if 429 streak |
| Per user email | 30 / hour transactional | Excess → queue delay, not drop of paid/refund |
| Per supplier email | 60 / hour | Same |
| Redeem-related customer mail | 10 / hour / user | Coalesce duplicates via idempotency |
| Ntfy admin | 1 / kind / 5 min | Coalesce key above |
| Fanout storm guard | Max N recipient rows per fact (default 50) | Cap + Ntfy if exceeded |

Money-path emitters fail **open** on rate-limit check (still enqueue). Worker fail **closed** on repeated 429 from Resend (slow drain, alert).

---

## 7. Hebrew RTL email templates

All HTML emails: `dir="rtl"` `lang="he"`. Plain-text part also Hebrew. Subjects Hebrew. Brand yellow only via approved tokens (no raw ad-hoc hex in new templates without design review).

| Template key | Event | Subject (example) | Required body facts |
|---|---|---|---|
| `customer.order_paid` | `order.paid` | קיבלנו את התשלום · הזמנה {order_short} | שם, מזהה הזמנה, **שולם באתר ₪X.XX** (מסנאפשוט), לפי סוג: יתרה בבית העסק / פירוט פיזי |
| `customer.coupon_issued` | `coupon.issued` | הקופון שלך מוכן | שם מוצר, רמז קוד / קישור לארנק, תוקף, שולם באתר, יתרה בבית העסק |
| `customer.coupon_redeemed` | `coupon.redeemed` | הקופון מומש | שם מוצר, זמן מימוש, שם העסק, יתרה שנגבתה בבית העסק |
| `customer.coupon_expired` | `coupon.expired` | הקופון פג תוקף | שם מוצר, תאריך פקיעה, האם זוכה ארנק (אם כן: סכום באגורות→₪) |
| `supplier.physical_order` | `order.physical_supplier_alert` | הזמנה חדשה לפיזי · {order_short} | שם עסק, שורות, שולם באתר, **platform_percent מהסנאפשוט**, יתרת ספק משוערת, קישור לפורטל |
| `supplier.payout_sent` | `payout.sent` | בוצעה העברה · {statement_short} | סכום, תקופה, מזהה דוח, הערה T+3 כבר סופק |
| `customer.order_refunded` | `order.refunded` | הזיכוי בוצע · הזמנה {order_short} | סכום זוכה, אמצעי (כרטיס/ארנק), זמן |

Copy bans:

- No "Escrow" / נאמן
- No fixed commission percent
- No telling the customer the platform/supplier split on coupon prepaid (v1). Supplier physical mail **does** show snapshotted split.
- No "הספק יקבל מהפלטפורמה את מקדמת הקופון" (false under no-escrow coupon model)

---

## 8. Ntfy.sh admin alerts

| Alert kind | Trigger | Topic payload |
|---|---|---|
| `notif.dlq` | DLQ insert or depth ≥ 25 | count, sample `idempotency_key`, last_error |
| `notif.worker_stall` | No successful drain for 15 min while queued > 0 | queued count, oldest age |
| `payments.verify_burst` | Cardcom verify failures ≥ N / 5 min | count |
| `redeem.rate_burst` | `rate_limited` outcomes ≥ N / 5 min | count |
| `payout.sent_ops` | optional mirror of payout.sent for ops | statement id, amount_agorot |

Config: `NTFY_BASE_URL`, `NTFY_ADMIN_TOPIC`, optional bearer. Worker publishes with coalesce key. Never put PII beyond order/voucher ids in the title; body may include error strings stripped of emails if needed.

---

## 9. DB schema draft (`notification_log` + support tables)

Money columns are **integer agorot**. Percents on snapshots stay `numeric(5,2)` as on `order_items`.

```sql
-- Fact stream (idempotent emit)
CREATE TABLE IF NOT EXISTS public.notification_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key    text NOT NULL UNIQUE,
  event_type    text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_events_type_created_idx
  ON public.notification_events (event_type, created_at DESC);

-- Per-recipient delivery log (source of truth for worker + audit)
CREATE TABLE IF NOT EXISTS public.notification_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key    text NOT NULL UNIQUE,
  event_id           uuid NOT NULL REFERENCES public.notification_events(id) ON DELETE CASCADE,
  event_type         text NOT NULL,
  channel            text NOT NULL CHECK (channel IN ('email', 'inapp', 'ntfy', 'push')),
  recipient_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email    text,
  supplier_id        uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  template_key       text,
  status             text NOT NULL DEFAULT 'queued'
                       CHECK (status IN (
                         'queued', 'retry', 'sending', 'sent', 'failed',
                         'dead', 'skipped', 'skipped_folded'
                       )),
  attempt_count      integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at    timestamptz NOT NULL DEFAULT now(),
  last_error         text,
  provider_message_id text,
  -- Money mirrors for support/search (agorot). Nullable when N/A.
  paid_on_site_agorot     integer CHECK (paid_on_site_agorot IS NULL OR paid_on_site_agorot >= 0),
  coupon_price_agorot     integer CHECK (coupon_price_agorot IS NULL OR coupon_price_agorot >= 0),
  balance_due_agorot      integer CHECK (balance_due_agorot IS NULL OR balance_due_agorot >= 0),
  platform_fee_agorot     integer CHECK (platform_fee_agorot IS NULL OR platform_fee_agorot >= 0),
  supplier_due_agorot     integer CHECK (supplier_due_agorot IS NULL OR supplier_due_agorot >= 0),
  refund_agorot           integer CHECK (refund_agorot IS NULL OR refund_agorot >= 0),
  payout_agorot           integer CHECK (payout_agorot IS NULL OR payout_agorot >= 0),
  platform_percent_snapshot numeric(5,2),
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_log_id     uuid REFERENCES public.notification_log(id) ON DELETE SET NULL,
  sent_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_log_drain_idx
  ON public.notification_log (status, next_attempt_at)
  WHERE status IN ('queued', 'retry');

CREATE INDEX IF NOT EXISTS notification_log_recipient_idx
  ON public.notification_log (recipient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_delivery_dlq (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_log_id uuid REFERENCES public.notification_log(id) ON DELETE SET NULL,
  idempotency_key    text NOT NULL,
  event_type         text NOT NULL,
  channel            text NOT NULL,
  payload            jsonb NOT NULL,
  last_error         text,
  attempt_count      integer NOT NULL,
  status             text NOT NULL DEFAULT 'dead'
                       CHECK (status IN ('dead', 'replayed', 'discarded')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  channel     text NOT NULL CHECK (channel IN ('email', 'inapp', 'push')),
  enabled     boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, event_type, channel)
);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_dlq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Clients: read own in-app / prefs only. No client INSERT on log/events/dlq.
-- Writes: triggers + worker service role only.

CREATE POLICY notification_log_recipient_read
  ON public.notification_log
  FOR SELECT
  TO authenticated
  USING (
    channel = 'inapp'
    AND recipient_user_id = auth.uid()
  );

CREATE POLICY notification_preferences_own
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DLQ: zero client policies (service role only).
```

Emit helper (sketch): `fn_emit_notification_event(dedupe_key, event_type, entity_type, entity_id, user_id, payload)` → insert event + fanout rows into `notification_log`.

---

## 10. Testing strategy

### 10.1 Unit

- Idempotency key builders (table in §4.1): stable strings, no PII.
- Template variable mapping from snapshots: agorot → ILS formatting; coupon paid-in-full copy; physical split uses snapshot percent.
- Preference + non-disableable rules for paid/issued/refunded.
- Retry delay function and dead transition at attempt 6.

### 10.2 Integration (local Supabase)

1. Insert paid order with coupon line → one `order.paid` fact, one `coupon.issued` per voucher, customer email logs queued with agorot columns filled from snapshots.
2. Re-run finalize (idempotent) → no second fact / no second Resend key.
3. Redeem voucher → `coupon.redeemed` once; double redeem → still one log.
4. Expire sweep → `coupon.expired` once per voucher.
5. Physical paid order → one `order.physical_supplier_alert` per supplier; scanners not emailed.
6. Mark payout paid → `payout.sent` once.
7. Refund finalize → `order.refunded` once; blocked redeem-consumed amounts do not invent refund mail for those lines.
8. Force Resend 500 ×6 → row `dead`, DLQ row, Ntfy called (mock).
9. Replay DLQ → single subsequent send with same Resend Idempotency-Key.

### 10.3 Contract / snapshot money

Fixtures must include `order_items.platform_percent` and `coupon_price` snapshots. Assert templates and log columns **ignore** mutated live `products.platform_percent` after purchase.

### 10.4 E2E (optional CI)

With Resend test mode / sandbox API key: place order → assert inbound test mailbox or Resend dashboard message for paid + issued. No real Ntfy in CI unless secret present (skip).

### 10.5 Load

Simulate 1k queued rows: worker with SKIP LOCKED does not double-send (assert unique provider_message_id / idempotency).

---

## 11. Implementation map

| Piece | Home (target) |
|---|---|
| Triggers / emit RPCs | `supabase/migrations/*_notifications*.sql` |
| Worker | Edge Function `notifications-worker` and/or `src/app/api/cron/notifications-worker/route.ts` |
| Resend client | `src/server/notifications/resend.ts` |
| Ntfy client | `src/server/notifications/ntfy.ts` |
| Templates | `src/server/notifications/templates/*.tsx` or HTML partials (RTL) |
| Admin DLQ UI | `/admin` support/ops section |

---

## 12. Acceptance checklist

- [ ] No Make/Zapier in the path
- [ ] Required seven events emit with stable dedupe keys
- [ ] Coupon paid email shows full on-site `coupon_price` from snapshot; no Escrow wording
- [ ] All money in `notification_log` stored as integer agorot
- [ ] Worker retries then DLQ + Ntfy; paid/issued/refunded never dropped silently
- [ ] Supplier physical alert uses snapshotted `platform_percent`, not live product
- [ ] Customer vs supplier vs admin channels match §3
- [ ] Hebrew RTL templates for every required event
- [ ] Tests cover idempotency, redeem double-scan, expire, payout, refund, DLQ replay
