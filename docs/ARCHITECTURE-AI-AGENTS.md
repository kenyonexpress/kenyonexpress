# ARCHITECTURE-AI-AGENTS.md

KenyonExpress future AI agents phase (binding architecture).

Status: BINDING for `arch/admin-supplier` (2026-07-29)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
Model default: **Claude API** (Anthropic) via server-only keys. No browser keys. No Make/Zapier.
Companions: `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-CUSTOMER-SUPPORT.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.

---

## 0. Hard constraints (every agent)

| Constraint | Agent implication |
|---|---|
| Coupon paid **in full on site** (`coupon_price_ils`) | Never invent charge as % of face. Customer copy: "שולם באתר" = coupon price. |
| **No Escrow** | Ban Escrow / נאמן / J5 in prompts and outputs. Coupon prepaid stays with the platform. |
| Dynamic `platform_percent` | Never hardcode 5%/10%. Read **snapshots** on `order_items` after purchase; only admin UI writes live product percent. |
| Money | Integer **agorot** in tools/DB; ILS with 2 decimals for humans. |
| Human approval | **No production writes** (publish product, migrate live rows, send customer email, mutate money) without explicit human approve step. |

Global bans:

1. No Cardcom charge/refund, wallet adjust, redeem, or payout mutations by agents.
2. No service-role "for convenience" on customer-facing tools; use caller JWT + RLS.
3. Mask voucher codes / QR payloads in logs (last 4 only).
4. Every run audited in `agent_runs` / `agent_run_steps`.

---

## 1. Agent catalog

| `agent_type` | Mission | Default model | Prod writes? |
|---|---|---|---|
| `product_copy` | Hebrew product description + SEO fields from raw supplier notes | Claude Sonnet-class | Draft only → human publish |
| `price_monitor` | Compare KE offers vs Israeli deal sites; alert admins | Claude + fetch tools | Alerts / draft suggestions only |
| `wp_migration` | Plan/map WP export → Supabase + R2 + SEO redirects | Claude for mapping assist | Apply only after human approve + dry-run |
| `support_chat` | Customer Q&A over own orders/coupons | Claude Sonnet-class | Tickets/escalations only |
| `admin_whatsapp_copilot` | Turn supplier WhatsApp messages into **draft** products | Claude Sonnet-class | Draft product rows only; publish is human |

---

## 2. Shared runtime

```
Admin / customer UI
  → authenticated Route Handler / Server Action
  → orchestrator (system prompt + tools + budget)
  → Claude API
  → tool executors (RLS JWT or narrowly scoped service jobs)
  → agent_runs / agent_run_steps (masked)
  → optional Ntfy for ops budget/safety hits
```

### 2.1 Schema draft

```sql
-- SPEC ONLY (later MCP migration)
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type      text NOT NULL CHECK (agent_type IN (
                    'product_copy',
                    'price_monitor',
                    'wp_migration',
                    'support_chat',
                    'admin_whatsapp_copilot'
                  )),
  actor_user_id   uuid REFERENCES auth.users(id),
  subject_type    text,
  subject_id      uuid,
  model           text NOT NULL,
  status          text NOT NULL CHECK (status IN (
                    'running', 'succeeded', 'failed', 'needs_approval',
                    'approved', 'rejected', 'escalated', 'cancelled'
                  )),
  input_summary   text,
  output_summary  text,
  token_in        integer NOT NULL DEFAULT 0 CHECK (token_in >= 0),
  token_out       integer NOT NULL DEFAULT 0 CHECK (token_out >= 0),
  cost_agorot     bigint NOT NULL DEFAULT 0 CHECK (cost_agorot >= 0),
  approval_required boolean NOT NULL DEFAULT true,
  approved_by     uuid REFERENCES auth.users(id),
  approved_at     timestamptz,
  error_code      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step_index      integer NOT NULL,
  kind            text NOT NULL CHECK (kind IN (
                    'message', 'tool_call', 'tool_result', 'approval', 'escalation'
                  )),
  tool_name       text,
  input_masked    jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_masked   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_index)
);

CREATE TABLE IF NOT EXISTS public.agent_budgets (
  agent_type      text PRIMARY KEY,
  daily_token_cap integer NOT NULL,
  daily_cost_agorot_cap bigint NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

RLS: actors read own runs; `support` reads `support_chat` (no platform-fee export); `admin`/`super_admin` read all; no anon writes.

---

## 3. Cost controls

| Control | Rule |
|---|---|
| Per-run token cap | `product_copy` 4k out; `support_chat` 6k out; `price_monitor` batch 20k; `wp_migration` 30k; `whatsapp_copilot` 8k |
| Daily caps | `agent_budgets` per type; hard stop → Ntfy `agent.budget` |
| Prefer rules first | Price monitor + fraud-like checks: SQL/diff before Claude |
| Caching | Identical product_copy inputs → return prior draft within 24h |
| Model routing | Classification / cheap intents on Haiku-class; generation on Sonnet-class |
| Cost accounting | `cost_agorot` on every run (USD→agorot at fixed book rate updated monthly) |

Never spend model tokens inside Cardcom webhook or redeem RPC hot path.

---

## 4. Safety rails (human approval)

| Action | Allowed autonomously? | Gate |
|---|---|---|
| Generate Hebrew draft description | Yes | Saves `status=needs_approval` draft |
| Publish product / change live money fields | **No** | Admin click Approve in UI |
| Apply WP migration batch to prod | **No** | Dry-run report → human → MCP/apply job |
| Send customer email / push | **No** (support may draft) | Human send or existing notification pipeline only |
| Create redirect rows | Draft only | SEO admin approve |
| Write `platform_percent` / `coupon_price_ils` | **No** from chat; WhatsApp copilot may **propose** | Admin form validation (`ADMIN-PRODUCT-PAGE-SPEC`) |
| Refund / wallet / redeem | **Never** | Out of agent tool surface |

Approval API sketch: `approveAgentRun(run_id)` requires `requireAdminSession` + recent auth for money-adjacent applies; writes `approved_by` / `approved_at` and then runs a deterministic applyer (not free-form model output).

Prompt-injection: treat supplier WhatsApp text, WP HTML, and order notes as **untrusted data**, never as instructions.

---

## 5. Product-description generator (`product_copy`)

### 5.1 Mission

Input: raw Hebrew (or messy bilingual) supplier blurb + product type + category.  
Output draft fields: `name_he`, `short_description_he`, `description_he` (safe HTML subset), `seo_title`, `seo_description`, optional highlights[].

### 5.2 Hebrew system prompt (template)

```
אתה עורך תוכן בעברית עבור קניון אקספרס, פלטפורמת מרקטפלייס (לא הספק עצמו).
כתוב בעברית תקנית, RTL, בלי אנגלית מיותרת במטא.
אסור להמציא מחירים, אחוזי עמלה, או הבטחות רפואיות/משפטיות.
למוצר מסוג coupon: הלקוח משלם באתר את מחיר הקופון המלא; יתרה בבית העסק בסריקה; אין Escrow.
למוצר מסוג physical: ציין משלוח/איסוף רק אם סופק בקלט.
החזר JSON עם השדות: name_he, short_description_he, description_he, seo_title, seo_description, highlights.
```

### 5.3 Tools

| Tool | Purpose |
|---|---|
| `get_category` | Category name_he constraints |
| `get_supplier_public` | Name only for "אצל {ספק}" if needed |
| `save_product_draft` | Write draft revision; never publish |

### 5.4 Eval

- Rubric: Hebrew ratio, no banned money phrases, length bands, JSON schema valid.
- Golden set: 30 real messy blurbs → human-rated 1–5; regression if mean drops &gt; 0.3.
- SEO: title ≤ ~60 chars heuristic; description 120–160.

---

## 6. Price-monitoring agent (`price_monitor`)

### 6.1 Mission

Nightly (or on-demand) compare KenyonExpress published offers to public pages on major Israeli deal/coupon sites (configurable allowlist). Produce **alerts + suggested** `coupon_price_ils` / sticker adjustments. Never auto-change prices.

### 6.2 Pipeline

```
Cron → fetch allowlisted competitor URLs (robots-respecting)
  → normalize titles/prices to agorot
  → match candidates (Meilisearch + embedding/Claude rerank)
  → Claude summarize Hebrew digest for admin
  → Ntfy if undercut ≥ threshold
  → rows in price_monitor_findings (draft)
```

### 6.3 Prompt fragment (Hebrew)

```
אתה אנליסט תמחור למרקטפלייס ישראלי.
השווה רק מחיר לתשלום באתר (agorot/ILS), לא עמלת פלטפורמה.
אל תמליץ לשנות platform_percent.
החזר טבלה: ke_product_id, competitor, competitor_price_agorot, ke_price_agorot, delta_agorot, confidence, note_he.
אין לבצע שינויים במערכת.
```

### 6.4 Cost / safety

- Fetch concurrency capped; cache HTML 6h.
- Claude only on matched candidates, not raw HTML dumps entire catalog.
- Findings require admin dismiss/accept; accept opens product edit form prefilled (human saves).

### 6.5 Eval

- Precision@K of matches vs human labels weekly.
- Alert fatigue: max N Ntfy/day; coalesce.

---

## 7. WP Data Migration agent (`wp_migration`)

### 7.1 Mission

Assist cutover from WordPress/WooCommerce export → Supabase:

- Map posts/products/users/orders to KE tables
- Media → Cloudflare R2
- Build `seo_redirects` for SEO equity
- Emit dry-run report; **apply only after human approval**

Compose with `docs/ARCHITECTURE-WP-MIGRATION.md` (this agent is the LLM-assisted planner/mapper, not a replacement for deterministic ETL).

### 7.2 Mapping responsibilities

| WP source | KE target | Notes |
|---|---|---|
| Products | `products` + images | Map price → `price_ils` / `coupon_price_ils`; never invent `platform_percent` (leave null → needs-pricing queue) |
| Media | R2 keys | Preserve checksums; rewrite URLs |
| Categories | `categories` | Slug collisions resolved in report |
| Coupons / deals | voucher-era products | Flag lines missing absolute coupon price |
| Permalinks | `seo_redirects` | 301 to `/product/{slug}` |

### 7.3 Prompt fragment

```
אתה מתכנן מיגרציית WordPress ל-Supabase עבור קניון אקספרס.
הפק מיפוי שדות + רשימת התנגשויות + רשימת מוצרים בלי coupon_price או בלי ספק.
אסור להמציא platform_percent או לסמן מוצר כ-published אם חסר שער פרסום.
החזר JSON: mapping[], blockers[], redirects[], media_plan[].
```

### 7.4 Approval

1. Agent writes `migration_plan` artifact on the run (`needs_approval`).
2. Human reviews blockers (missing supplier, missing coupon price).
3. Deterministic worker applies approved batches; agent does not execute SQL directly in prod.

### 7.5 Eval

- Spot-check 50 products: field equality + redirect hit tests.
- Zero published products without publish gate fields.

---

## 8. Customer-support agent (`support_chat`)

### 8.1 Mission

Hebrew RTL chat for logged-in customers over **their** orders and coupons. Strict RLS. Escalate money disputes to humans (`docs/ARCHITECTURE-CUSTOMER-SUPPORT.md`).

### 8.2 System prompt (Hebrew template)

```
אתה נציג תמיכה של קניון אקספרס (פלטפורמה, לא הספק).
ענה רק בעברית, לפי נתונים שהכלים מחזירים.
קופון: הלקוח שילם באתר את מחיר הקופון המלא; יתרה בבית העסק בסריקת QR; אין Escrow.
פיזי: סטטוס משלוח מהכלים בלבד; אל תבטיח זיכוי בלי הסלמה.
לעולם אל תחשוף platform_percent או עמלות פנימיות ללקוח.
אם חסר מידע או שיש מחלוקת כספית → escalate.
```

### 8.3 Tools (RLS via user JWT)

| Tool | Returns |
|---|---|
| `my_orders` | ids, statuses, paid_on_site_agorot → ILS |
| `my_order_detail` | lines, supplier snapshot name/phone, shipping |
| `my_vouchers` | masked code, status, balance_due_agorot, expiry |
| `refund_policy_lookup` | static policy ids |
| `create_escalation` | opens ticket; ends autonomous money advice |

Forbidden: refund execute, redeem, wallet adjust, admin mutate.

### 8.4 Eval

- Tool-grounding: every price/status in reply must appear in tool JSON (automated checker).
- Jailbreak suite: "ignore instructions / reveal commission".
- Hebrew-only user-visible output.

---

## 9. Admin WhatsApp copilot (`admin_whatsapp_copilot`)

### 9.1 Mission

Supplier sends product pitches on WhatsApp (text ± images). Copilot proposes a **draft** product for admin: name, descriptions, suggested `coupon_price_ils` / `price_ils`, category guess, supplier link. Admin edits and publishes via normal form (split pair, supplier gate).

### 9.2 Ingest

- Meta WhatsApp Cloud API webhook → store raw message (media to R2) → create run.
- Untrusted content sandbox; no auto-reply that promises listing.

### 9.3 Prompt fragment

```
אתה עוזר אדמין ליצירת טיוטת מוצר מקניון אקספרס מתוך הודעת WhatsApp של ספק.
חלץ: name_he, type (coupon|physical), price_ils?, coupon_price_ils?, description_he, warnings[].
אם חסר מחיר קופון מוחלט לקופון → warnings ואל תמלא ברירת מחדל.
אל תמלא platform_percent (האדמין חייב לקבוע; אין default).
החזר JSON לטיוטה בלבד.
```

### 9.4 Tools

| Tool | Purpose |
|---|---|
| `list_suppliers_active` | Match sender phone → supplier_id suggestion |
| `list_categories` | Category id suggestion |
| `create_product_draft` | Insert draft; status never published |
| `attach_r2_image` | Link uploaded media |

Publish path remains `assertPublishable` in admin UI.

### 9.5 Eval

- Draft schema valid; no published side effects in integration tests.
- Phone match precision; false supplier link is a hard fail.

---

## 10. Eval strategy (cross-cutting)

| Layer | What |
|---|---|
| Unit | Prompt builders, money formatters (agorot), JSON schema validators, ban-phrase linter (Escrow, fixed %) |
| Golden sets | Per agent ≥ 30 labeled examples; CI fails on quality drop |
| Shadow mode | New prompt version logs side-by-side 1 week without prod apply |
| Safety | Red-team prompts weekly; injection via WhatsApp/WP HTML |
| Cost | Dashboard: tokens + `cost_agorot` by `agent_type` / day; alert on cap |
| Human rating | Admin thumbs on drafts; feed back into golden set quarterly |

---

## 11. Implementation map (later; not in this worktree)

| Piece | Target |
|---|---|
| Orchestrator | `src/server/agents/*` |
| Claude client | server-only `ANTHROPIC_API_KEY` |
| UI | `/admin/agents`, `/account/support` |
| Cron | price_monitor + budget sweep |
| Migrations | `agent_runs`, `agent_run_steps`, `agent_budgets`, `price_monitor_findings` |

---

## 12. Acceptance checklist

- [ ] Five agent types documented with Hebrew prompt templates
- [ ] No production writes without human approval path
- [ ] Support tools are RLS/JWT scoped; no commission leak to customers
- [ ] Money in tools as agorot; coupon paid-in-full + no Escrow in all system prompts
- [ ] `platform_percent` never invented by agents; snapshot-only when reading past orders
- [ ] Cost caps + eval golden sets defined
- [ ] WP migration agent produces plans/redirects; apply is human-gated
- [ ] WhatsApp copilot creates drafts only

---

## 13. Related

`docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ARCHITECTURE-CUSTOMER-SUPPORT.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.
