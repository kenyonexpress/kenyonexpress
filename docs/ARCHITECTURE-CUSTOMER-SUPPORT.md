# ARCHITECTURE-CUSTOMER-SUPPORT.md

KenyonExpress customer support / tickets architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-arch` · branch `arch/admin-supplier` (2026-07-29)
Scope: **docs only.** No application code in this change. Schema sketches are specification for later MCP `apply_migration` only (never `db push`).
Companions: `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-ADMIN.md`, `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md`, `docs/ARCHITECTURE-COUPON-REDEMPTION.md`, `docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.

Stack intent: Next.js App Router (customer widget + `/admin/support`), Supabase Postgres + RLS, Resend (bidirectional email), notification outbox worker, future WhatsApp Business Cloud API.

---

## 0. Business and support context

| Rule | Support implication |
|---|---|
| Platform, never supplier | Support speaks for KenyonExpress marketplace; supplier disputes escalate with supplier portal context, not as if KE is the merchant of goods |
| `platform_percent` | Dynamic, admin-set, snapshotted. Agents **must not** invent fixed commission when explaining charges |
| Coupon | Customer paid online `coupon_price`; till remainder at supplier on QR; expires on scan. Till cash is not “held by KE” |
| Physical | Immediate split at settle; shipping is supplier-operated |
| **No Escrow** | No “release escrow” macros in macros/canned replies |
| Money | Agorot in DB links; agent UI shows ₪ |
| PDP | Ticket context should show supplier contact when order/product linked |

Support handles: orders, payments, coupons/vouchers, shipping, account/auth, refunds requests (approval remains admin money path).

---

## 1. Goals

1. Single inbox for customer conversations across **on-site chat**, **email**, and (later) **WhatsApp**.
2. Durable `tickets` + `messages` with clear statuses and SLA clocks.
3. Hebrew RTL for customer and admin surfaces; touch targets ≥ 44px.
4. Bidirectional email via Resend (outbound + inbound parse → same ticket).
5. Extensible channel adapter for WhatsApp Business without rewriting the core model.
6. RLS: customers see only their tickets; staff by RBAC; no supplier write into KE support tables in v1 (suppliers use portal; KE support may @-link supplier id).

---

## 2. Core data model

### 2.1 `support_tickets` (logical name: tickets)

| Column | Type intent | Notes |
|---|---|---|
| `id` | uuid PK | |
| `public_number` | text UNIQUE | Human id e.g. `KE-10482` |
| `status` | enum | see §3 |
| `priority` | enum | `low` \| `normal` \| `high` \| `urgent` |
| `channel` | enum | `chat` \| `email` \| `whatsapp` \| `internal` (origin channel) |
| `subject` | text | Hebrew/Latin; required |
| `requester_user_id` | uuid NULL | FK profiles; null if guest email-only |
| `requester_email` | citext | required for email thread |
| `requester_phone` | text NULL | E.164; WhatsApp later |
| `assignee_user_id` | uuid NULL | staff |
| `team` | text NULL | e.g. `general`, `payments`, `coupons` |
| `order_id` | uuid NULL | deep link context |
| `voucher_id` | uuid NULL | |
| `product_id` | uuid NULL | |
| `supplier_id` | uuid NULL | disclosure / escalation context |
| `sla_policy_id` | uuid | |
| `first_response_due_at` | timestamptz | |
| `resolution_due_at` | timestamptz | |
| `first_responded_at` | timestamptz NULL | |
| `resolved_at` | timestamptz NULL | |
| `closed_at` | timestamptz NULL | |
| `last_customer_message_at` | timestamptz | SLA pause/resume |
| `last_agent_message_at` | timestamptz | |
| `metadata` | jsonb | channel ids, Resend thread keys |
| `created_at` / `updated_at` | timestamptz | |

### 2.2 `support_messages` (logical name: messages)

| Column | Type intent | Notes |
|---|---|---|
| `id` | uuid PK | |
| `ticket_id` | uuid FK | ON DELETE CASCADE (or soft) |
| `author_type` | enum | `customer` \| `agent` \| `system` \| `bot` |
| `author_user_id` | uuid NULL | |
| `channel` | enum | `chat` \| `email` \| `whatsapp` \| `note` |
| `visibility` | enum | `public` \| `internal` (agent notes never emailed) |
| `body_text` | text | plain / sanitized |
| `body_html` | text NULL | email inbound sanitized subset |
| `attachments` | jsonb | R2 keys + mime + size; no exec |
| `provider_message_id` | text NULL | Resend / WA id; UNIQUE partial |
| `in_reply_to` | text NULL | email Message-ID |
| `delivery_status` | enum | `pending` \| `sent` \| `delivered` \| `failed` \| `n/a` |
| `created_at` | timestamptz | append-only preferred |

### 2.3 Supporting tables

| Table | Purpose |
|---|---|
| `support_sla_policies` | name, first_response_minutes, resolve_minutes, by priority |
| `support_canned_replies` | Hebrew snippets; never auto-invent money |
| `support_ticket_events` | audit: status change, assign, SLA breach |
| `support_channel_threads` | map `ticket_id` ↔ email Message-ID / WA `wamid` / chat session |

Money macros in canned replies: only “שולם באתר” / “יתרה בבית העסק” for coupons; never Escrow.

---

## 3. Status state machine

```
new
  → open              (agent takes / auto-assign)
  → pending_customer  (waiting on customer)
  → pending_internal  (waiting on finance/ops)
  → resolved          (agent marks done; soft)
  → closed            (customer confirm or auto after idle)
  → reopened          → open (customer replies after resolved/closed)
```

| Status | Who sets | SLA clock |
|---|---|---|
| `new` | system on create | first-response clock **running** |
| `open` | agent / system | first-response stops on first public agent msg; resolution clock runs |
| `pending_customer` | agent | resolution clock **paused** |
| `pending_internal` | agent | resolution clock paused or continues per policy (**Q-SUP-SLA-INT**, default pause) |
| `resolved` | agent | clocks stop; auto-close after N days without reply |
| `closed` | system / agent | terminal until reopen |
| `reopened` | customer message or agent | new first-response window optional; usually resume resolution SLA |

Illegal: customer setting `resolved`/`closed` without rules; agent deleting message history (soft-hide only).

---

## 4. SLA

### 4.1 Default policy (v1, Asia/Jerusalem business hours optional)

| Priority | First response | Resolution |
|---|---|---|
| `low` | 24h | 5 business days |
| `normal` | 8h | 3 business days |
| `high` | 2h | 1 business day |
| `urgent` (payment failed / fraud) | 30m | 8h |

Business hours: Sun–Thu 09:00–18:00 IL (**Q-SUP-HOURS**). After-hours tickets: clock starts next open or continuous wall clock (default: **wall clock** for urgent, business hours for normal).

### 4.2 Breach handling

1. Cron / worker marks `sla_breached` on ticket + `support_ticket_events`.
2. Ntfy / admin badge for breached open tickets.
3. Dashboard sorts breached first.
4. Breach does not auto-refund or auto-change order money.

---

## 5. On-site support chat

### 5.1 Customer UX

- Widget on storefront (not on `/checkout` payment iframe focus; allow from account/order pages).
- Hebrew RTL; guest may start with email capture, or logged-in user auto-linked.
- Creates `support_tickets` (`channel=chat`, `status=new`) + first `support_messages`.
- Realtime: Supabase Realtime on messages for the ticket id (RLS-scoped) **or** short polling; agent replies appear live.
- File upload: images/PDF size-capped to R2; virus/type allow-list.
- Deep links: “פנייה לגבי הזמנה זו” pre-fills `order_id`.

### 5.2 Agent UX (admin)

- `/admin/support` and `/admin/support/[id]`.
- Presence optional; typing indicator optional (v1 can skip).
- Internal notes (`visibility=internal`) never sent to customer channels.

---

## 6. Bidirectional email (Resend)

### 6.1 Outbound (agent → customer)

1. Agent sends public message.
2. Outbox / worker calls Resend with:
   - From: `support@…` (verified domain)
   - To: `requester_email`
   - Subject: `[KE-10482] …`
   - Headers: `Message-ID`, `In-Reply-To`, `References` for threading
3. Store `provider_message_id`; `delivery_status` from Resend webhooks.

Uses same notification worker patterns as `ARCHITECTURE-NOTIFICATIONS.md` (Resend, dedupe, DLQ). Support mail is a **conversation channel**, not only one-shot transactional templates.

### 6.2 Inbound (customer → ticket)

1. Resend inbound / route receiving address (`support+…@` or catch-all) → webhook to `/api/support/email/inbound`.
2. Verify webhook signature.
3. Parse thread: match `In-Reply-To` / subject `KE-#####` / `support_channel_threads`.
4. If no match: create new ticket (`channel=email`).
5. Insert `support_messages` (`author_type=customer`); sanitize HTML; strip scripts.
6. If ticket was `resolved`/`closed` → `reopened` / `open`.
7. Notify assignee (in-app + optional ntfy for unassigned).

### 6.3 Anti-abuse

- Rate limit creates per email / IP.
- Drop auto-responders (`Auto-Submitted`, `Precedence: bulk`) from reopening loops.
- Never echo full card numbers; redact PAN-like patterns in inbound body.

---

## 7. Future: WhatsApp Business

Out of coupons-first launch; design hooks now.

| Concern | Intent |
|---|---|
| Provider | Meta Cloud API (or approved BSP); secrets in vault |
| Mapping | `support_channel_threads`: `wa_phone` ↔ `ticket_id` |
| Inbound | webhook → same `support_messages` insert path as email |
| Outbound | 24h session window + template messages for outside window |
| Consent | explicit opt-in; store consent timestamp |
| Media | download to R2; same attachment rules |
| Fail closed | if WA down, fall back to email/chat; ticket remains |

No Zapier/Make. First-party worker only.

---

## 8. Admin dashboard (פניות)

Route matrix (align `ARCHITECTURE-ADMIN.md`):

| Role | Access |
|---|---|
| support | read/write tickets assigned or unassigned queue; no money export |
| admin / super_admin | full; reassign; SLA policies; canned replies |
| content_uploader | none |

Views:

1. Queue: filters status, priority, SLA breach, channel, assignee, team
2. Ticket detail: timeline messages, order/voucher/supplier context cards (snapshot money read-only for admin)
3. SLA board: breached / due soon
4. Reports: first-response median, CSAT later (**Q-SUP-CSAT**)

RTL: `dir="rtl"` `lang="he"`; logical properties; Hebrew empty states.

---

## 9. Customer surfaces

| Surface | Behavior |
|---|---|
| Chat widget | §5 |
| `/account/support` | list own tickets + thread |
| Order detail | “פתח פנייה” with `order_id` |
| Email | reply in thread |

RLS: `requester_user_id = auth.uid()` OR (guest magic link token, short-lived, **Q-SUP-GUEST**).

---

## 10. Integration with money / fulfillment (read-only context)

Ticket sidebar (staff):

- Order status, paid_on_site, line types
- Coupon: voucher status, masked code, till remainder (informational)
- Physical: shipment status / tracking if any
- Supplier name/phone from snapshot

Actions that **change money** (refund approve, wallet adjust) stay on admin money paths with `requireRecentAuth`; support may only **request** via `pending_internal` + link.

---

## 11. Notifications related to support

| Event | Email | In-app | Ntfy |
|---|---|---|---|
| Ticket created (chat) | optional auto-ack | customer yes | no |
| Agent reply | yes (if channel email or customer prefers) | yes | no |
| Customer reply (email/WA) | no to customer | assignee yes | unassigned queue |
| SLA breach | no | yes | yes |
| Ticket resolved | yes | yes | no |

Dedupe keys e.g. `support.agent_reply:{message_id}`.

---

## 12. Security and privacy

- RLS on tickets/messages; service role only for inbound webhooks after verify.
- Attachments: private R2; signed GET for participants.
- Audit: status/assign changes in `support_ticket_events` + `audit_log` for staff.
- PII minimization in analytics: support volume aggregates only (see analytics doc).
- No Cardcom PAN in tickets; redact.

---

## 13. Migrations (077+, MCP only)

Never `supabase db push`. Next free ordinal (**Q-SUP-MIG**).

| Object | Intent |
|---|---|
| `support_tickets`, `support_messages` | core |
| `support_sla_policies`, `support_ticket_events`, `support_channel_threads` | SLA + threading |
| `support_canned_replies` | optional v1 |
| RLS + indexes | `(status, priority)`, `(assignee_user_id)`, `(requester_user_id)`, `(public_number)` |
| Realtime publication | messages for participants |

Idempotent `IF NOT EXISTS`.

---

## 14. Acceptance checklist

- [ ] Chat creates ticket + message; customer sees only own threads
- [ ] Agent public reply emails via Resend with thread headers; inbound lands on same ticket
- [ ] Internal notes never emailed
- [ ] Status machine + SLA due/breach visible in RTL admin
- [ ] Order/coupon context uses snapshots; no Escrow copy
- [ ] WhatsApp documented as future adapter on same messages table
- [ ] Money-mutating actions not available from support alone

---

## 15. Open questions

| ID | Question |
|---|---|
| Q-SUP-MIG | First free migration ordinal |
| Q-SUP-HOURS | Business-hours vs wall-clock SLA |
| Q-SUP-SLA-INT | Pause on `pending_internal`? |
| Q-SUP-GUEST | Magic-link guest ticket access |
| Q-SUP-CSAT | Post-resolve survey |
| Q-SUP-WA | Target date / BSP for WhatsApp |

---

## 16. Related

| Doc / path | Role |
|---|---|
| `ARCHITECTURE-NOTIFICATIONS.md` | Resend outbox, ntfy |
| `ARCHITECTURE-ADMIN.md` | RBAC sections |
| `/admin/support` | staff UI |
| `/account/support` | customer UI |
| `/api/support/email/inbound` | Resend inbound |
| Future `/api/support/whatsapp/webhook` | WA adapter |
