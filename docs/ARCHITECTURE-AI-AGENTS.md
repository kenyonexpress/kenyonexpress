# ARCHITECTURE-AI-AGENTS.md

KenyonExpress AI agents architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-admin` · branch `arch/admin-supplier` (2026-07-29)
Scope: **docs only.** Zero `.ts` / `.tsx` / `.sql` files in this change. SQL below is specification text for later MCP migrations.
Companions: `docs/ARCHITECTURE-COUPON-REDEMPTION.md`, `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md`, `docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-ADMIN.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-ANALYTICS.md`.

Stack intent: Next.js Route Handlers / Server Actions as tool hosts, Supabase Postgres + RLS, model provider via server-only API keys, audit in `agent_runs` / `agent_run_steps` (names binding; ordinals via MCP later).

---

## 0. Platform and money rules (every agent)

| Rule | Agent implication |
|---|---|
| KenyonExpress is a **platform**, never a supplier | Never claim KE ships as merchant of record; name the supplier from snapshot |
| `platform_percent` dynamic, admin-only, no default | Never invent a fixed 5%/10%. Support may **read** snapshots; only admin UI writes percent |
| Coupon | Customer paid absolute `coupon_price_ils` online; till remainder at merchant on QR; expires on scan |
| Physical | Immediate split at `payment_settled`; payout T+3 + min threshold; delivery ≠ money release |
| **No Escrow** | Ban Escrow / J5 language in prompts and replies |
| PDP | Supplier contact (and rating/history when present) is public truth |

Global hard bans for all agents:

1. No Cardcom charge, refund, wallet credit, redeem, or payout mutations.
2. No writes to `platform_percent`, `coupon_price_ils`, `settlement_events`, `payments`.
3. No raw voucher codes / QR payloads in logs, ntfy, or model traces (mask to last 4).
4. Tools run as the **caller’s JWT** (customer / staff) or a dedicated **agent role** with least privilege. Never “service role for convenience” on customer chat tools.
5. Every run append-only audited.

Money: integer **agorot** in tools; format ILS for humans.

---

## 1. Shared runtime

### 1.1 Components

```
Client (chat / admin job)
  → API Route / Server Action (authz)
  → Agent orchestrator (system prompt + tools)
  → Model (Hebrew-capable)
  → Tool executors (RLS-scoped SQL / Server Actions read-only)
  → agent_runs + agent_run_steps (masked)
```

### 1.2 Persistence (spec)

```sql
-- SPEC ONLY (apply later via MCP apply_migration, next free >= 077)
create table if not exists public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  agent_type      text not null check (agent_type in (
                    'support_chat', 'product_copy', 'fraud_triage', 'pricing_intel'
                  )),
  actor_user_id   uuid references auth.users(id),
  subject_type    text,          -- order | product | voucher | supplier | null
  subject_id      uuid,
  model           text not null,
  status          text not null check (status in (
                    'running', 'succeeded', 'failed', 'escalated', 'cancelled'
                  )),
  input_summary   text,          -- redacted
  output_summary  text,          -- redacted
  token_in        int not null default 0,
  token_out       int not null default 0,
  cost_agorot     bigint not null default 0,
  error_code      text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create table if not exists public.agent_run_steps (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.agent_runs(id) on delete cascade,
  step_index      int not null,
  kind            text not null check (kind in ('message', 'tool_call', 'tool_result', 'escalation')),
  tool_name       text,
  input_masked    jsonb not null default '{}'::jsonb,
  output_masked   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (run_id, step_index)
);
```

RLS sketch: actors read own support runs; `admin`/`super_admin` read all; `support` read support_chat + fraud triage without money export fields; no anon access.

### 1.3 Cost envelope (order of magnitude, USD → track as agorot internally)

| Agent | Typical model | Tokens / job | Est. cost / job | Monthly volume assumption | Monthly est. |
|---|---|---|---|---|---|
| Support chat | mid-tier chat (e.g. Claude Sonnet class or GPT-4.1-mini class) | 2–6k | $0.01–0.06 | 3k sessions | $30–180 |
| Product copy | same mid-tier | 1–3k | $0.005–0.03 | 500 gens | $3–15 |
| Fraud triage | small/fast + rules first | 0.5–2k when LLM used | $0.002–0.02 | 200 alerts | $1–4 |
| Pricing intel | mid-tier batch nightly | 5–15k / category batch | $0.05–0.25 | 30 batches | $2–8 |

Prefer **rules + SQL** before LLM for fraud. Cap max tools/turns per run (support: 8; copy: 3; fraud: 5; pricing: 10).

---

## 2. Customer support agent

### 2.1 Mission

Hebrew RTL chat for logged-in customers (and staff-assisted views): orders, coupons/vouchers, refunds policy, shipping status, supplier contact from snapshot. Escalate to human support when confidence low, money dispute, or abuse.

UI: account help widget / `/account/support` thread. `dir="rtl"` `lang="he"`.

### 2.2 Model choice

- Primary: Hebrew-strong chat model (Sonnet-class or equivalent).
- Fallback: smaller model for classification / intent only.
- Temperature low (0.2–0.4). No browsing unless tool-gated.

### 2.3 Prompt architecture

Layers:

1. **System (static):** platform identity, No Escrow, coupon vs physical money copy, never invent tracking/prices, escalate rules, Hebrew only in user-visible text.
2. **Policy pack:** refund windows, voucher states (`issued`/`redeemed`/`expired`/`cancelled`/`refunded`), fulfillment states.
3. **Session:** `user_id`, locale `he-IL`.
4. **Tool results:** injected as JSON facts; model must quote tool data, not invent.

System prompt must include:

```
You are KenyonExpress support. The company is a marketplace platform, not a supplier.
Coupon: customer paid coupon_price online; remainder is paid at the merchant on QR scan; voucher expires on scan.
Physical: payment split was recorded at purchase; delivery does not release Escrow (there is none).
Never promise bank transfers of till balances. Never reveal platform_percent to customers.
If unsure or refund-money dispute → escalate.
```

### 2.4 Tools (function calling)

| Tool | Authz | Returns |
|---|---|---|
| `my_orders` | customer = self | order ids, statuses, totals paid on site (ILS), line types |
| `my_order_detail` | owner | lines, supplier name/phone from snapshot, shipping city, tracking if any |
| `my_vouchers` | owner | masked code, status, till remainder, supplier name, expires_at |
| `refund_policy_lookup` | any authed | static policy text ids |
| `create_escalation` | customer | opens support ticket; stops autonomous money advice |

Forbidden tools: redeem, refund_execute, wallet_adjust, admin order mutate.

### 2.5 Data access (RLS-safe)

- Use user JWT + existing RLS on `orders`, `order_items`, `vouchers`.
- Staff impersonation: `requireSection('support')` + explicit `acting_as` audit; still no `canSeeMoney` for support on platform fee columns.

### 2.6 Failure modes

| Failure | Handling |
|---|---|
| Tool timeout / RLS empty | Say data unavailable; escalate |
| Model invents tracking | Validator: tracking only if tool returned URL |
| Prompt injection via order notes | Strip HTML; treat notes as untrusted data, not instructions |
| Abuse / PII fishing | Refuse; escalate |
| High token loop | Cap turns; escalate |

---

## 3. Product description generator

### 3.1 Mission

Turn supplier/admin **raw Hebrew (or messy) input** into SEO-ready:

- `name_he` (optional polish)
- `short_description_he`
- `description_he` (safe HTML subset)
- `seo_title`, `seo_description`
- image `alt` suggestions

Respect `ARCHITECTURE-SEO-PERFORMANCE.md`: Offer price = on-site charge only; seller = supplier; no fabricated ratings/expiry/warranty.

### 3.2 Model choice

Mid-tier generative model; temperature 0.5 for prose, 0.2 for meta length discipline.

### 3.3 Prompt architecture

1. System: Hebrew marketplace copywriter; no medical/legal overclaim; no platform fee talk.
2. Input schema: raw title, bullets, product_type (`coupon`|`physical`), supplier name, known constraints (expiry days if provided).
3. Output JSON schema enforced (Zod on server).
4. Optional second pass: length check for meta 120–160 chars.

### 3.4 Tools

| Tool | Role |
|---|---|
| `get_product_draft` | read current fields (staff JWT) |
| `get_category_name` | breadcrumb language |
| `list_forbidden_claims` | static policy |
| `propose_copy` | model-only (no DB write) |
| `save_copy_draft` | staff write to draft product fields only; **never** money columns |

Publish still requires human admin + money gate (`platform_percent`, coupon_price).

### 3.5 Data access

`content_uploader` / admin via `requireStaffSession`. Suppliers may invoke propose on own draft products if portal allows; money fields stripped.

### 3.6 Failure modes

| Failure | Handling |
|---|---|
| Invented price / expiry | Reject output if not in input |
| English-only meta | Regenerate; enforce Hebrew script ratio |
| Unsafe HTML | Sanitize to allow-list |
| Cost runaway on huge paste | Truncate input to N chars |

---

## 4. Fraud detection agent

### 4.1 Mission

Triage coupon abuse: double-scan patterns, redemption velocity, IP/device signals. Output risk score + recommended action for admin/ntfy. **Does not** auto-block redeem in v1 without admin rule flag (**Q-AI-FRAUD-AUTO**).

Ground truth tables: `vouchers`, `voucher_redemptions` (ops view `v_redemption_events`).

### 4.2 Model choice

1. **Rules engine first** (SQL + thresholds).
2. LLM only to summarize anomalies for humans (small/fast model).

### 4.3 Prompt architecture

- System: security analyst; No Escrow; anti-enumeration (never suggest returning `wrong_supplier` to API clients).
- Input: pre-aggregated feature vector from SQL (counts, distinct IPs, outcomes).
- Output: `{ risk: low|medium|high, reasons[], recommended_actions[] }`.

### 4.4 Tools

| Tool | Role |
|---|---|
| `redemption_features` | windowed aggregates for code/supplier/user |
| `list_recent_outcomes` | masked codes, outcomes, ip |
| `open_fraud_case` | write `fraud_cases` + ntfy |
| `suggest_rate_limit` | advisory only |

Signals (align redeem doc):

- Double scan / already_redeemed bursts
- Velocity: scans / user / 60s (above 30 → already rate_limited)
- Distinct IPs per code
- Forged QR / invalid_signature spikes
- Cross-shop probes (audit `wrong_supplier`)
- Suspended supplier activity

### 4.5 Data access

Service role **read** on redemptions for cron worker OR `security definer` feature RPC returning aggregates without raw PII to the model. Admin UI uses `requireAdminSession`. Support may see triage summaries without export.

### 4.6 Failure modes

| Failure | Handling |
|---|---|
| False positive blocks sales | Default advise-only; human confirm |
| LLM overconfident ban | Require rule score ≥ threshold before “high” |
| PII in prompt | Pass aggregates + hashed IP prefixes only |

---

## 5. Pricing intelligence agent

### 5.1 Mission

Category-level **suggestions** for admins: competitor price scan (allowlisted public sources), discount suggestions, never auto-write `platform_percent` or `coupon_price_ils`.

### 5.2 Model choice

Mid-tier for synthesis; separate fetch worker for HTTP scrape/API. Do not browse arbitrary web from the chat model.

### 5.3 Prompt architecture

1. System: pricing analyst for Israeli marketplace; suggestions only; respect No Escrow / absolute coupon online price model.
2. Features: our median on-site price, category, historical conversion (from analytics marts), competitor samples.
3. Output: ranked suggestions with rationale + confidence; flag legal/ToS risk of scraping.

### 5.4 Tools

| Tool | Role |
|---|---|
| `category_price_stats` | read marts (`ARCHITECTURE-ANALYTICS.md`) |
| `fetch_competitor_snapshot` | allowlisted connectors only |
| `propose_discount_band` | model |
| `create_pricing_suggestion` | insert draft row for admin review |

Never: `update_product_money`.

### 5.5 Data access

Admin-only. Money-visible. Competitor raw HTML stored in private bucket; retention capped.

### 5.6 Failure modes

| Failure | Handling |
|---|---|
| Scrape blocked / stale | Mark suggestion `stale_data` |
| Suggests changing platform % silently | Schema forbids; UI only shows retail discount ideas |
| Hallucinated competitor price | Must cite snapshot id from tool |

---

## 6. Escalation and human handoff

| Agent | Escalate when |
|---|---|
| Support | Refund demand, chargeback language, legal threat, tool miss, user asks “human” |
| Copy | Supplier disputes generated claims |
| Fraud | risk=high or burst ntfy |
| Pricing | legal/ToS uncertainty on source |

Escalation creates ticket + optional Resend to support alias; agent_run `status=escalated`.

---

## 7. Security checklist

- [ ] Server-only API keys
- [ ] Masked step logs
- [ ] No money mutation tools
- [ ] RLS or definer aggregates for fraud
- [ ] Prompt-injection hardening on user/supplier free text
- [ ] Cost caps + kill switch env `AI_AGENTS_ENABLED`

---

## 8. Migrations (MCP only)

Never `supabase db push`. Next free ≥ 077 (**Q-AI-MIG**): `agent_runs`, `agent_run_steps`, optional `fraud_cases`, `pricing_suggestions`. Docs only in this change (no `.sql` file committed here).

---

## 9. Acceptance

- [ ] Support answers Hebrew with tool-grounded order/voucher facts
- [ ] Copy generator never emits money fields or fake SEO ratings
- [ ] Fraud prefers SQL rules; LLM summarizes
- [ ] Pricing never writes `platform_percent`
- [ ] Costs within envelope or flagged in admin

---

## 10. Open questions

| ID | Question |
|---|---|
| Q-AI-MIG | Migration ordinal |
| Q-AI-MODEL | Exact provider SKUs |
| Q-AI-FRAUD-AUTO | Auto rate-limit amplify on high risk? (default no) |
| Q-AI-SCRAPE | Which competitor sources allowlisted |

---

## 11. Related

`ARCHITECTURE-ANALYTICS.md` (marts for pricing/support stats), `ARCHITECTURE-COUPON-REDEMPTION.md` (fraud signals), `ARCHITECTURE-SEO-PERFORMANCE.md` (copy constraints), `ARCHITECTURE-ADMIN.md` (RBAC).
