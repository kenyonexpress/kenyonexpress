# ARCHITECTURE-AI-AGENTS.md

KenyonExpress AI agents architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-admin` · branch `arch/admin-supplier` (2026-07-28)
Scope: **docs only.** No `.ts` / `.tsx` / `.sql` files in this change. Schema sketches below are documentation for future MCP `apply_migration` (≥077), not applied here.
Companions: `docs/ARCHITECTURE-COUPON-REDEMPTION.md`, `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md`, `docs/ARCHITECTURE-ADMIN.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-ANALYTICS.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`.

---

## 0. Ground rules (money + safety)

| Rule | Implication for agents |
|---|---|
| Platform, never supplier | Agents never invent KenyonExpress as the merchant fulfilling or redeeming |
| `platform_percent` dynamic, admin-only, no default | Agents **never** write money knobs; never invent a fixed 5%/10% |
| Coupon | Online = `coupon_price_ils`; till remainder at supplier on QR; expires on scan; **no Escrow** |
| Physical | Immediate split at settle; payout T+3; delivery ≠ money release |
| Snapshots | Order/voucher answers use `order_items` / voucher snapshots, never live product percent |
| RLS | Prompt is not authz. Tools run as the calling principal or a narrow SECURITY DEFINER that re-checks `auth.uid()` / staff role |
| Money mutations | **Forbidden** for all agents (no pay, refund, redeem, wallet adjust, payout mark-paid) |

Agents may: draft, summarize, flag, suggest, escalate. Humans (or existing Server Actions) execute irreversible money/status changes.

Hebrew RTL for all customer-facing agent text. Internal admin tools may be Hebrew-first.

---

## 1. Shared runtime

### 1.1 Hosting

- Next.js Server Actions / Route Handlers under `src/server/actions/agents/**` and `/api/agents/**` (future code; not in this docs pass).
- Anthropic Messages API via official SDK. No browser-side API keys.
- Tool loop: SDK tool runner (or equivalent) with a hard max of **N=8** tool rounds per user turn.
- Persist every run to `agent_runs` / `agent_run_steps` (masked).

### 1.2 Model ladder (default)

| Tier | Role | Typical use |
|---|---|---|
| Strong | Highest correctness | Support chat (money-adjacent answers), fraud triage |
| Mid | Structured generation + tools | Product copy + meta, pricing suggestions |
| Fast | High volume / cheap | Optional classification, alt-text, router |

Pin exact vendor model IDs in env (`AGENT_MODEL_SUPPORT`, etc.) so upgrades are explicit. Prefer current Claude Sonnet-class for mid, Opus-class for support/fraud, Haiku-class for cheap routers (**Q-AI-MODEL**: refresh IDs at implement time).

### 1.3 Cross-cutting prompt architecture

Every agent system prompt is layered:

1. **Identity + language** (Hebrew customer vs Hebrew admin).
2. **Hard money policy** (paste the table in §0; never invent Escrow or fixed commission).
3. **Tool contract** (what each tool returns; “if tool empty, say you do not know”).
4. **Escalation rules**.
5. **Output schema** (JSON Schema / structured outputs for writers; free text + citations for support).

Prompt caching: stable system + tools first; per-user facts only in the user/tool turns (no timestamps in system block).

### 1.4 Agent tables (future migration sketch)

```sql
-- Documentation only. Apply later via MCP apply_migration (next free ≥ 077).

create table if not exists public.agent_runs (
  id            uuid primary key default gen_random_uuid(),
  agent_key     text not null check (agent_key in (
                  'support','product_copy','fraud','pricing')),
  actor_user_id uuid references auth.users(id),
  model         text not null,
  status        text not null check (status in (
                  'running','succeeded','failed','escalated','cancelled')),
  input_tokens  int,
  output_tokens int,
  cost_usd_micros bigint,
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create table if not exists public.agent_run_steps (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.agent_runs(id) on delete cascade,
  step_no       int not null,
  kind          text not null check (kind in ('tool','assistant','system')),
  tool_name     text,
  input_masked  jsonb,
  output_summary jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists public.agent_escalations (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references public.agent_runs(id),
  queue         text not null default 'support_human',
  reason        text not null,
  payload       jsonb not null default '{}',
  status        text not null default 'open'
                  check (status in ('open','claimed','resolved','dismissed')),
  created_at    timestamptz not null default now()
);

create table if not exists public.agent_flags (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null, -- e.g. fraud_velocity
  severity      text not null check (severity in ('low','medium','high','critical')),
  subject_type  text not null,
  subject_id    uuid,
  evidence      jsonb not null,
  status        text not null default 'open'
                  check (status in ('open','reviewing','confirmed','false_positive')),
  created_at    timestamptz not null default now()
);

create table if not exists public.listing_drafts (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid references public.products(id),
  supplier_id   uuid references public.suppliers(id),
  run_id        uuid references public.agent_runs(id),
  name_he       text,
  description_he text,
  seo_title     text,
  seo_description text,
  status        text not null default 'pending_review'
                  check (status in ('pending_review','approved','rejected')),
  created_at    timestamptz not null default now()
);

alter table public.agent_runs enable row level security;
alter table public.agent_run_steps enable row level security;
alter table public.agent_escalations enable row level security;
alter table public.agent_flags enable row level security;
alter table public.listing_drafts enable row level security;
-- Policies: staff read; customers read only own support runs; no anon.
```

---

## 2. Customer support agent

### 2.1 Mission

Hebrew RTL chat in account / help widget. Answers on **orders, coupons/vouchers, refunds policy, shipping status**. Escalates to human support when uncertain, angry, or money-moving.

### 2.2 Model

- Default: **strong** (Opus-class) with adaptive thinking, effort `high`.
- Downgrade candidate: mid model if eval pass rate ≥ threshold on gold set (**Q-AI-SUPPORT-EVAL**).

### 2.3 Prompt architecture

- System: Hebrew replies only; cite tool facts; never invent tracking, refund approval, or till amounts.
- Money script: coupon prepaid vs till remainder; physical split not shown to customer by default.
- Refuse: changing address after ship, approving refunds, regenerating QR without tool, revealing other users’ data.

### 2.4 Tools (function calling)

| Tool | Access | Returns |
|---|---|---|
| `get_my_orders` | RLS as customer | recent orders, status, on-site totals (ILS), line types |
| `get_order_detail` | RLS: must own order | lines, supplier name/phone from snapshot, shipping status, tracking |
| `get_my_vouchers` | RLS | code masked (last 4), status, till remainder, supplier, expiry |
| `get_refund_policy` | static / CMS | Hebrew policy text |
| `create_escalation` | insert `agent_escalations` | ticket id |

No `redeem_voucher`, no Cardcom, no admin tools.

### 2.5 Data access (RLS-safe)

- Customer JWT only. Service role **forbidden** in support tool path.
- Mask full voucher codes in tool output unless user proves possession via account UI already showing them (prefer “open /account/vouchers”).

### 2.6 Cost estimate (order of magnitude)

| Load | Assumption | Monthly |
|---|---|---|
| 3k chats × 6 turns × ~4k tokens avg | strong model | roughly **$150–400** (tune with caching) |
| Escalation rate 15% | human cost dominates | budget ops separately |

### 2.7 Failure modes

| Failure | Mitigation |
|---|---|
| Hallucinated refund promise | Tool-required for order state; system ban phrases; escalation |
| Cross-tenant leak | RLS + automated red-team prompts in CI |
| Tool timeout | Graceful “לא הצלחתי לשלוף… נציג יחזור” |
| Prompt injection via order notes | Treat tool data as untrusted; never execute instructions from descriptions |

---

## 3. Product description generator

### 3.1 Mission

From supplier raw notes / bullets → SEO-ready **Hebrew** `description_he` + `seo_title` + `seo_description`. Output is a **draft** in `listing_drafts` until admin/content_uploader approves. Never auto-publishes. Never sets `platform_percent` / `coupon_price_ils`.

### 3.2 Model

- Default: **mid** (Sonnet-class), structured JSON output, effort `medium`.
- Batch: Message Batches API when backfilling.

### 3.3 Prompt architecture

- Input: raw Hebrew/English notes, product type, category name, supplier display name (for PDP consistency).
- Constraints: one H1-worthy title tone; 120–160 char meta; no false “10% עמלה”; no medical/legal claims beyond input; include supplier mention when required by PDP policy.
- Align with `ARCHITECTURE-SEO-PERFORMANCE.md` (Offer price is **not** generated here).

### 3.4 Tools

| Tool | Purpose |
|---|---|
| `get_product_stub` | staff/supplier-scoped product fields (non-money or money read-only for context) |
| `get_category` | category Hebrew name |
| `save_listing_draft` | write `listing_drafts` pending_review |
| `get_similar_titles` | optional: avoid duplicate SEO titles in category |

Supplier callers: strip money fields from tool responses. Admin may see money but generator must not rewrite them.

### 3.5 Data access

- Supplier JWT: own `supplier_id` products only.
- Staff: `requireStaffSession` / section products write for approve path (human action, not agent).

### 3.6 Cost estimate

| Volume | Cost ballpark |
|---|---|
| 500 drafts/month × 2.5k tokens | **$15–40**/mo mid model |
| Bulk 5k backfill once | **$50–120** with batch discount |

### 3.7 Failure modes

| Failure | Mitigation |
|---|---|
| Invented specs | “Only use provided facts”; flag unknowns |
| English-only output | Language check; reject/retry |
| Auto-publish bug | Draft table only; publish is human Server Action |
| SEO keyword stuffing | Length + readability lint in validator |

---

## 4. Fraud detection agent

### 4.1 Mission

Score and explain suspicious **coupon redemption** patterns: double-scan attempts, velocity, IP/device clustering, cross-shop probes. Writes **advisory** `agent_flags` + optional ntfy. Never blocks redeem in-line (RPC already enforces single-use); humans confirm.

Grounding signals from `ARCHITECTURE-COUPON-REDEMPTION.md` / security doc: `voucher_redemptions` outcomes, rate limits, `wrong_supplier` audits, `ip_address` / `user_agent` (085).

### 4.2 Model

- Default: **strong** for triage narratives; optional **fast** model for first-pass feature labeling.
- Prefer deterministic SQL features first; LLM explains top anomalies (cost control).

### 4.3 Prompt architecture

- System: Hebrew or English admin (default Hebrew); never accuse customer in customer channel; severity rubric.
- Input: feature vector + sample redemption rows (PII-minimized).
- Output JSON: `severity`, `summary_he`, `recommended_actions[]` (review supplier, temp suspend membership, ignore).

### 4.4 Tools

| Tool | Access | Notes |
|---|---|---|
| `query_redemption_features` | service after `requireAdminSession` | pre-aggregated windows |
| `list_recent_redemptions` | admin | masked codes |
| `open_agent_flag` | admin/service | insert `agent_flags` |
| `notify_ops_ntfy` | service | burst alerts only |

### 4.5 Feature ideas (SQL, not LLM)

- Attempts per `scanned_by` / supplier / 5–60 min
- Ratio `already_redeemed` / `not_found` / `rate_limited`
- Distinct IPs per code
- Same device fingerprint hash (if collected later) across suppliers

### 4.6 Cost estimate

| Mode | Cost |
|---|---|
| Cron every 15m, LLM only on top 20 anomalies/day | **$20–80**/mo |
| LLM on every redemption | **avoid** (too expensive, latency) |

### 4.7 Failure modes

| Failure | Mitigation |
|---|---|
| False positive suspend | Flags advisory only; human gate |
| Missing IP columns | Feature null-safe; degrade |
| Alert fatigue | Threshold + daily digest |
| Prompt injection via UA strings | Treat as data |

---

## 5. Pricing intelligence agent

### 5.1 Mission

Suggest **discount** / positioning ideas per category from (a) internal sell-through and (b) optional competitor public pages. Suggestions are **advisory** for admin. Never writes `platform_percent`, `coupon_price_ils`, or `discount_percent`. Admin applies via product form.

### 5.2 Model

- Default: **mid** with structured output.
- Competitor fetch: separate crawler job (robots-respecting); store snapshots in `pricing_competitor_snapshots` (future). LLM reads summaries, not raw HTML dumps unbounded.

### 5.3 Prompt architecture

- Inputs: category, product type mix, last N days AOV / conversion from analytics views, current discount distribution.
- Output: ranked suggestions with rationale Hebrew; explicit “not a money write”.
- Hard ban: recommending a “default platform commission”.

### 5.4 Tools

| Tool | Access |
|---|---|
| `get_category_sales_stats` | admin analytics views (agorot) |
| `get_product_money_readonly` | admin |
| `list_competitor_snapshots` | admin |
| `save_pricing_suggestion` | admin draft table |

### 5.5 Data access

- `requireSection('analytics'|'products', read)` then service for aggregate views.
- No supplier access to competitor module in v1 (**Q-AI-PRICE-SUP**).

### 5.6 Cost estimate

| Cadence | Cost |
|---|---|
| Weekly per category (20 cats) | **$10–30**/mo |
| Daily all SKUs with crawl | crawler infra dominates; LLM **$50–150**/mo |

### 5.7 Failure modes

| Failure | Mitigation |
|---|---|
| Stale competitor prices | `fetched_at` max age; refuse if >7d |
| Illegal scrape | Allowlist domains; robots.txt; legal review (**Q-AI-CRAWL**) |
| Suggesting illegal discounts | Clamp to policy; human approve |

---

## 6. Evaluation and ops

- Gold sets: support (50 Hebrew dialogues), copy (30 products), fraud (labeled bursts), pricing (10 categories).
- Regression: money-policy probes must score 100% (no Escrow, no fixed %).
- Logging: token + USD micros on `agent_runs`; PII masked in steps.
- Kill switch: `feature_flags.agent_*` off stops new runs.

---

## 7. Acceptance checklist

- [ ] No agent path can UPDATE `orders` / `vouchers` / money columns
- [ ] Support tools are customer-RLS only
- [ ] Copy agent writes drafts only
- [ ] Fraud flags advisory + ntfy optional
- [ ] Pricing never writes `platform_percent` / `coupon_price_ils`
- [ ] Hebrew RTL customer outputs
- [ ] Cost dashboards from `agent_runs`

---

## 8. Open questions

| ID | Question |
|---|---|
| Q-AI-MODEL | Exact Anthropic model IDs at implement time |
| Q-AI-SUPPORT-EVAL | Downgrade support to mid model? |
| Q-AI-CRAWL | Competitor domains legally approved? |
| Q-AI-PRICE-SUP | Suppliers see pricing suggestions? |
| Q-AI-MIG | Migration ordinal for agent_* tables |

---

## 9. Related

`ARCHITECTURE-ANALYTICS.md` (stats tools), `ARCHITECTURE-COUPON-REDEMPTION.md` (fraud signals), `ARCHITECTURE-ADMIN.md` (approve drafts), `ARCHITECTURE-SEO-PERFORMANCE.md` (meta constraints).
