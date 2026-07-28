# ARCHITECTURE-NOTIFICATIONS.md

KenyonExpress notification and marketing delivery architecture.

Status: BINDING for `arch/admin-supplier` (2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
Authority: `MASTER-ARCHITECTURE-v2.md` §1 (business model) overrides conflicting money copy; §2 system diagram (Resend + Vercel cron); §3 tables (029+031); domain source `ARCHITECTURE-NOTIFICATIONS-MARKETING.md`.
No Make. No Zapier. Approved externals only: Resend (email), Meta WhatsApp (when enabled), ntfy for admin ops (optional ops channel).

---

## 0. Money model that templates must obey

From MASTER-ARCHITECTURE-v2 §1 (C1, C10, C11):

| Type | Customer pays on site | Platform keeps | Supplier from platform | Snapshot |
|---|---|---|---|---|
| **Coupon** | Absolute `coupon_price` (admin-set, no default) | **100% of `coupon_price`** | **0** (till balance at merchant) | `order_items` / voucher money fields immutable |
| **Physical** | Full on-site price | Dynamic **`platform_percent`** (per product, required, **no default**) | Residual `100% - platform_percent` after T+3 / min 100 ILS | `platform_percent` + fees snapshotted at purchase |

- **`platform_percent` is always admin-chosen and dynamic.** No fixed 5%/10%. Missing percent → refuse sale (physical). On coupon lines it may be stored for display/reporting; settlement still keeps the full prepaid amount as platform revenue (v2 §1.4).
- **No Escrow.** No template may promise a platform payout for coupon prepaid money.
- Expired unredeemed coupon → wallet `refund_credit` (5 years), not silent forfeiture (v2 C6).
- Internal wallet only; cashback never leaves the system.

---

## 1. Principles

1. **Emit ≠ send.** Triggers / definers only enqueue. Network I/O is Vercel cron or Edge worker (v2: split crons; pg_cron for SQL-only, Vercel for email).
2. **Idempotent `dedupe_key` UNIQUE** on `notifications_outbox` (029). Retries never double-send.
3. **Hebrew RTL first.** Template HTML `dir="rtl"` `lang="he"`.
4. **Transactional vs marketing.** Marketing respects `user_notification_preferences` + consent; transactional order/voucher/payout kinds listed below may still send (**Q-NOTIF-1**: exact transactional set for counsel).
5. **Customer email ≠ admin alerts.** Customers/suppliers: Resend. Admin urgent: ntfy (or Better Stack), not mixed into customer templates.

---

## 2. Pipeline

```
domain event (orders paid, voucher issued/redeemed/expired, payout status, application)
  -> fn_emit_notification_event (031) / call site in finalize or redeem RPC
  -> notification_events (fact)
  -> fn_fanout_notification_events (prefs, suppressions)
  -> notifications_outbox (status=queued, dedupe_key UNIQUE)
  -> Vercel Cron POST /api/cron/notifications-worker (CRON_SECRET)
       email -> Resend
       inapp -> row already readable via RLS
       push  -> future push_subscriptions / Expo (mobile doc)
       whatsapp -> Meta Cloud API when templates approved
  -> notification_delivery_events (90-day retention per v2)
  -> failure -> backoff -> status=dead; admin alert
```

Never call Resend inside Cardcom webhook or `redeem_*` beyond enqueue.

---

## 3. Event catalog

### 3.1 Commerce

| Event | Source | Recipient | Channel | Template | Timing | Copy constraints |
|---|---|---|---|---|---|---|
| Order pending | `orders` insert | buyer | email+inapp | `order.placed` | immediate | amounts from server snapshots only |
| Order paid | status→`paid` (086 / finalize) | buyer | email+inapp | `order.paid` | immediate | coupon: show `coupon_price` paid online + till balance; physical: show full charge + that platform/supplier split is internal |
| Supplier physical order | same paid, fanout per `order_items.supplier_id` | manager+ | email | `supplier.order.paid` | immediate | include residual due from **snapshotted** `platform_percent`, not live product |
| Cancelled / refunded | status transitions | buyer (+ supplier if physical) | email+inapp | `order.cancelled` / `order.refunded` | immediate | wallet vs card refund paths per v2 §4 |
| Dispute | admin / disputes table | buyer; admin ntfy | email+ntfy | `order.dispute.*` | immediate | |

Dedupe: `order.paid:{order_id}`, `supplier.order.paid:{order_id}:{supplier_id}`.

### 3.2 Coupons / vouchers

| Event | Source | Recipient | Channel | Template | Timing |
|---|---|---|---|---|---|
| Issued | finalize issues codes/vouchers | buyer | email+inapp | `voucher.issued` | immediate |
| Redeemed / used | redeem RPC success | buyer | email | `voucher.redeemed` | immediate |
| Expiry 7d / 48h | `fn_enqueue_coupon_expiry_reminders` (029) | buyer | email | `voucher.expiry_*` | scheduled |
| Expired → wallet credit | expire job + wallet credit | buyer | email+inapp | `voucher.expired_credited` | after credit |

Redeemed copy: till amount collected at merchant; **platform kept online prepaid; supplier gets 0 from platform for that coupon.**

Dedupe: `voucher.issued:{id}`, `voucher.redeemed:{id}`, `voucher.expiry_7d:{id}`.

### 3.3 Payouts (physical only)

| Event | Source | Recipient | Channel | Template |
|---|---|---|---|---|
| Generated | `generate_payout_statement` | admin | email+ntfy | `admin.payout.generated` |
| Approved / paid | status machine | supplier owners | email | `supplier.payout.approved` / `.paid` |

Templates must reference residual after snapshotted `platform_percent`. No coupon remittance lines (v2 C11 / 081).

### 3.4 Onboarding and wallet

| Event | Recipient | Template |
|---|---|---|
| Supplier application / approve / reject | admin or applicant | `admin.supplier.application`, `supplier.application.*` |
| Member invite | invitee | `supplier.member.invited` |
| Cashback earn / wallet credit | buyer | `wallet.earn` (names: `wallet_earn` analytics) |
| Wallet spend at checkout | optional receipt line in `order.paid` | do not imply external cash-out |

### 3.5 Admin ntfy

Topics (ops): payments webhook failures, redeem fraud bursts, payouts needing approval, dead-letter outbox, money alarms (`v_money_alarms` cron per v2 launch gates).

---

## 4. Idempotency, retry, dead letter

| Mechanism | Detail |
|---|---|
| `notifications_outbox.dedupe_key` | UNIQUE; ON CONFLICT skip |
| Resend Idempotency-Key | outbox `id` |
| Status enum | `queued|sent|failed|cancelled|dead|skipped` (029+031) |
| Backoff | `scheduled_for` += exponential; cap attempts then `dead` |
| Requeue | admin-only definer; audit |

Queue index: `(scheduled_for) WHERE status = 'queued'`.

---

## 5. Templates and RTL

`notification_templates` (031): `template_key`, `channel`, `locale` (`he`|`en`), `version`, `subject`, `body_text`, `body_html`, `variables`, one active per key/channel/locale.
Activation: admin `fn_activate_template`. Money placeholders always filled from **snapshots**, never live `products.platform_percent` after purchase.

---

## 6. Rate limits (Resend quota)

Worker env `RESEND_MAX_PER_MINUTE`. Coalesce admin ntfy 5 min. Marketing fanout spreads `scheduled_for`. Align with v2 fail-closed money path rate limits (checkout 10/min, scan 30/min) separately from email caps.

**Open Q-NOTIF-2:** production Resend plan cap.

---

## 7. Data model (grounded)

| Table | Role | Retention (v2) |
|---|---|---|
| `user_notification_preferences` | channels + locale | account life |
| `notifications_outbox` | delivery queue, dedupe | operational |
| `notification_events` | facts | per 031 |
| `notification_templates` | versioned copy | forever versions |
| `consent_events` | consent | forever (v2) |
| `channel_suppressions` | blocks | until lifted |
| `notification_delivery_events` | provider callbacks | **90 days** |
| `notification_conversions` | attribution | per analytics |

RLS: owner reads own outbox; update `read_at` only; admin select; inserts service/definer only.

Admin-alert storage without fake `user_id`: **Q-NOTIF-3** (nullable audience vs `admin_alert_outbox`).

---

## 8. Security

Signed Resend webhooks; `CRON_SECRET` on worker; no service role in browser; PII minimized in ntfy; template XSS sanitized; audit template activate + dead requeue.

---

## 9. Rollout (docs checklist)

1. Confirm 029 outbox/prefs on host; apply 031 safely (v2 notes enum edit gates).
2. Fix post-059 column names in order notification triggers (086).
3. Wire enqueue on finalize, redeem, expire→wallet credit, payout status.
4. Seed Hebrew templates obeying §0 money table.
5. Cron worker + Resend + ntfy.
6. Replay tests on dedupe_key.

---

## 10. Open questions

| ID | Question |
|---|---|
| Q-NOTIF-1 | Which kinds ignore marketing opt-out? |
| Q-NOTIF-2 | Resend monthly cap |
| Q-NOTIF-3 | Admin alert row model |
| Q-NOTIF-4 | WhatsApp in coupons-first launch? (v2 lists Meta as approved external) |
| Q-NOTIF-5 | Buyer email on every redeem vs inapp-only default |

---

## 11. Related

`MASTER-ARCHITECTURE-v2.md` §1–4, §6; migrations 029, 031, 086; `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`; `docs/ADMIN-PRODUCT-PAGE-SPEC.md` (dynamic knobs; C11 coupon economics from v2 win for payout/notify copy).
