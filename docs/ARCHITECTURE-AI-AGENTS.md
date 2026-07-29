# ARCHITECTURE-AI-AGENTS.md

KenyonExpress AI agents architecture (future phase, binding).

Status: BINDING for `arch/admin-supplier` (2026-07-29)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
SQL / prompts below are specification for later implementation (MCP migrations + server routes). Do not apply from this worktree.
Companions: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ARCHITECTURE-CUSTOMER-SUPPORT.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.

Primary model provider for generative Hebrew: **Claude API** (Anthropic), server-side keys only. Optional smaller models for classification only.

---

## 0. Money and safety constraints (every agent)

| Constraint | Agent implication |
|---|---|
| Coupon paid **in full on site** (`coupon_price_ils`, absolute) | Copy and support must say "שולם באתר" = coupon price. Never derive charge from a percent of face. |
| **No Escrow** | Ban Escrow / נאמן / J5 in prompts, drafts, and replies. Coupon prepaid stays with the platform. |
| Dynamic `platform_percent` | Never invent 5%/10%. Read **snapshots** on `order_items` for past orders. Only humans set percent in admin UI. |
| Money in tools | Integer **agorot**. Human text: ILS with 2 decimals. |
| Production writes | **No autonomous writes** to products, prices, redirects, orders, vouchers, wallet, or payouts without **human approval** (draft → review → apply). |

Global hard bans:

1. No Cardcom charge, refund, wallet credit, redeem, or payout mutations by an agent.
2. No direct UPDATE/INSERT on `products`, `order_items`, `vouchers`, `payments`, `seo_redirects` from the model tool loop.
3. Mask voucher codes / QR payloads in logs (last 4 only).
4. Customer-facing tools run as the **caller's JWT** (RLS). Admin tools require `requireAdminSession` / section gates. Never "service role for convenience" on chat tools.
5. Every run append-only in `agent_runs` / `agent_run_steps`.

---

## 1. Agent catalog

| Agent id | Mission | Model | Writes? |
|---|---|---|---|
| `product_copy` | Hebrew PDP description / highlights generator | Claude | Draft only → admin approve |
| `price_monitor` | Compare KE offers vs Israeli deal sites | Claude + fetch tools | Suggestions only |
| `wp_migration` | Plan/assist WP → Supabase mapping, R2 media, SEO redirects | Claude + structured jobs | Staging tables + human apply |
| `support_chat` | Customer Q&A over own orders/coupons | Claude | Tickets/escalations only |
| `admin_whatsapp_copilot` | Turn supplier WhatsApp text into product draft | Claude | Draft product → admin approve |

Shared runtime:

```
UI / job trigger
  → authenticated Route Handler / Server Action
  → orchestrator (system prompt + tools + budget)
  → Claude API
  → tool executors (read RLS / draft tables)
  → agent_runs (cost_agorot, tokens)
  → human approval gate before any production apply
```

---

## 2. Shared persistence (spec)

```sql
-- SPEC ONLY (later MCP apply_migration)
create table if not exists public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  agent_type      text not null check (agent_type in (
                    'product_copy',
                    'price_monitor',
                    'wp_migration',
                    'support_chat',
                    'admin_whatsapp_copilot'
                  )),
  actor_user_id   uuid references auth.users(id),
  subject_type    text,
  subject_id      uuid,
  model           text not null,
  status          text not null check (status in (
                    'running', 'succeeded', 'failed', 'needs_approval',
                    'approved', 'rejected', 'escalated', 'cancelled'
                  )),
  input_summary   text,
  output_summary  text,
  token_in        int not null default 0,
  token_out       int not null default 0,
  cost_agorot     bigint not null default 0 check (cost_agorot >= 0),
  approval_user_id uuid references auth.users(id),
  approved_at     timestamptz,
  error_code      text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create table if not exists public.agent_run_steps (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.agent_runs(id) on delete cascade,
  step_index    int not null,
  kind          text not null check (kind in (
                  'message', 'tool_call', 'tool_result', 'draft', 'escalation'
                )),
  tool_name     text,
  input_masked  jsonb not null default '{}'::jsonb,
  output_masked jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (run_id, step_index)
);

create table if not exists public.agent_drafts (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.agent_runs(id) on delete cascade,
  draft_type    text not null check (draft_type in (
                  'product_copy', 'product_create', 'price_suggestion',
                  'wp_row_mapping', 'seo_redirect_batch'
                )),
  payload       jsonb not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected', 'applied')),
  created_at    timestamptz not null default now(),
  applied_at    timestamptz
);
```

RLS: actors read own support runs; admin/super_admin read all; support staff read `support_chat` without exporting platform-fee columns; no anon; **no client INSERT** on drafts/runs (server only).

---

## 3. Product-description generator (`product_copy`)

### 3.1 Mission

Generate Hebrew RTL product copy (title polish optional, short description, long description, highlights bullets, SEO description) from structured admin fields + optional supplier notes. Output is a **draft**; publish requires human click.

### 3.2 Claude usage

- Model: Claude Sonnet-class (Hebrew).
- Temperature: 0.4 for creative copy; 0.2 for SEO meta.
- Max tokens capped per job (e.g. 1200 out).

### 3.3 Hebrew system prompt (template)

```
אתה כותב תוכן מוצר עבור קניון אקספרס, פלטפורמת מרקטפלייס ישראלית (לא הספק עצמו).
כתוב בעברית תקנית, RTL, בלי אימוג'ים ובלי הבטחות משפטיות שלא סופקו בקלט.
מחיר לתשלום באתר לקופון הוא הסכום המוחלט coupon_price בלבד (הלקוח משלם אותו במלואו באתר).
יתרת העסקה בבית העסק אינה עוברת דרך הפלטפורמה. אסור להזכיר Escrow או נאמן.
אסור להמציא אחוז עמלה או platform_percent. אם חסר מידע, סמן [חסר] במקום להמציא.
החזר JSON עם השדות: short_description_he, description_he, highlights_he[], seo_title, seo_description.
```

### 3.4 User prompt skeleton

```
סוג מוצר: {coupon|physical}
שם: {name_he}
ספק: {supplier_name}
מחיר רגיל (אגורות): {price_agorot}
מחיר לתשלום באתר (אגורות, קופון בלבד): {coupon_price_agorot}
הערות ספק: {notes}
שפת יעד: עברית
```

### 3.5 Tools (read-only)

`get_product_draft_context(product_id)`, `get_supplier_public(supplier_id)`, `list_category_names()`.

### 3.6 Approval

Draft → admin reviews in ProductForm → Apply overwrites text fields only (not money knobs unless admin edits them manually).

---

## 4. Price-monitoring agent (`price_monitor`)

### 4.1 Mission

Nightly / on-demand compare selected KE published offers against public pages on Israeli deal / coupon sites (allowlisted domains only). Produce **suggestions** (lower coupon_price, change discount badge, flag outlier). Never auto-change prices.

### 4.2 Sources

Allowlist config table `price_monitor_sources` (domain, robots policy, scrape method). Respect robots.txt; prefer official APIs if any; rate-limit fetches; store raw HTML hashed, not indefinitely.

### 4.3 Hebrew system prompt (template)

```
אתה אנליסט תמחור למרקטפלייס ישראלי. השווה מחירים גלויים בלבד.
הפלט: המלצות בעברית + מספרים באגורות (integers) וגם תצוגת ₪.
אסור לעדכן מוצרים. אסור להמציא platform_percent. לקופונים: המחיר באתר הוא coupon_price המוחלט ששולם במלואו.
אין Escrow. אם מקור לא אמין או חסום, סמן confidence=low.
```

### 4.4 Output draft

```json
{
  "product_id": "uuid",
  "ke_on_site_agorot": 900,
  "competitor_hits": [{"domain": "…", "price_agorot": 850, "url": "…"}],
  "suggestion": "שקול להוריד את מחיר הקופון באתר ל־₪8.50",
  "suggested_coupon_price_agorot": 850,
  "confidence": "medium"
}
```

Admin must approve before any product money field changes (manual or gated apply).

---

## 5. WP Data Migration agent (`wp_migration`)

### 5.1 Mission

Assist the one-time (or batched) migration: WordPress / WooCommerce export → staging mapping tables → Supabase `products` / `categories` / media on R2 → `seo_redirects` for SEO equity. Agent proposes mappings; **humans approve apply batches**.

### 5.2 Pipeline (agent-assisted)

```
WP export (XML/JSON/CSV)
  → staging.wp_raw_* (immutable)
  → agent proposes row maps (agent_drafts.wp_row_mapping)
  → human approve batch
  → writers copy into public.products / categories (server job)
  → media download → R2 keys → product images
  → seo_redirects (old WP path → /product/{slug}) status 301
```

### 5.3 Mapping rules the agent must obey

| WP field | Supabase | Notes |
|---|---|---|
| post title | `name_he` | Hebrew preferred |
| slug | `products.slug` | ASCII stable; collide → suffix |
| regular price | `price_ils` / agorot convert | |
| sale / coupon online | `coupon_price_ils` | Absolute; if only % in WP, **do not invent**; flag human |
| commission | ignore fixed 10% | Set `platform_percent` only if explicit in export; else leave null → needs-pricing |
| images | R2 objects | Rewrite URLs after upload |
| old permalink | `seo_redirects.from_path` | 301 to new PDP |

Never mark product published if money knobs or supplier gate incomplete (`ADMIN-PRODUCT-PAGE-SPEC`).

### 5.4 Hebrew system prompt (template)

```
אתה סוכן מיגרציית WordPress לקניון אקספרס. הצע מיפוי לשורות staging בלבד.
כסף באגורות (integers). קופון: מחיר האתר הוא סכום מוחלט ששולם במלואו; אין Escrow.
אם חסר platform_percent, אל תמלא ברירת מחדל. סמן needs_human=true.
החזר JSON של מיפויים + רשימת הפניות 301 מוצעת. אסור לכתוב לייצור.
```

### 5.5 Apply gate

`agent_drafts` status `approved` → migration worker applies N rows → `applied`. Rejected drafts never touch `public`.

---

## 6. Customer-support agent (`support_chat`)

### 6.1 Mission

Hebrew RTL chat for logged-in customers over **their** orders, coupons/vouchers, refund policy, shipping status, supplier contact from snapshot. Escalate money disputes to humans.

### 6.2 RLS boundaries (strict)

| Tool | Allowed rows |
|---|---|
| `list_my_orders` | `orders.user_id = auth.uid()` |
| `get_my_order` | same + `order_items` via parent |
| `list_my_vouchers` | `vouchers.user_id = auth.uid()` |
| `get_supplier_public` | active supplier public fields only |
| `create_escalation` | inserts support ticket for self |

Forbidden tools: any admin list, any other user's order, platform fee export, redeem, refund execute, wallet adjust.

Staff "view as" requires support section + audit; still no mutating money tools.

### 6.3 Hebrew system prompt (template)

```
אתה נציג תמיכה של קניון אקספרס. ענה בעברית קצרה וברורה.
החברה היא פלטפורמה, לא הספק. פרטי ספק מגיעים מההזמנה/סנאפשוט.
קופון: הלקוח שילם באתר את מחיר הקופון המלא; יתרה בבית העסק בעת מימוש QR; אין Escrow.
לשאלות על עמלה השתמש רק ב־platform_percent שמצולם ב־order_items, אם מוצג ללקוח בכלל (בדרך כלל לא).
אם אין נתון בכלי, אל תנחש. להסלמה: מחלוקת כסף, חשד הונאה, בקשת החזר מורכבת.
```

### 6.4 Escalation

Creates ticket (`ARCHITECTURE-CUSTOMER-SUPPORT.md`) + optional Resend to support alias; `agent_runs.status = escalated`.

---

## 7. Admin WhatsApp copilot (`admin_whatsapp_copilot`)

### 7.1 Mission

Paste / forward supplier WhatsApp message (text; optional image OCR later) → structured **product draft** (name, type guess, prices in agorot, category suggestion, copy). Admin reviews and saves via normal ProductForm / `assertPublishable`.

### 7.2 Flow

```
WhatsApp text (admin paste)
  → Claude extract JSON draft
  → agent_drafts.product_create (pending)
  → admin UI diff
  → Approve → upsertProduct (human session)
```

Agent must not call `upsertProduct` itself.

### 7.3 Hebrew system prompt (template)

```
אתה עוזר אדמין שמחלץ טיוטת מוצר מהודעת וואטסאפ של ספק.
החזר JSON בעברית לשדות: name_he, product_type (coupon|physical|unknown),
price_agorot, coupon_price_agorot (או null), discount_percent_guess או null,
platform_percent: תמיד null (האדמין חייב לקבוע; אין ברירת מחדל),
supplier_name_guess, notes_he, confidence.
קופון = תשלום מלא באתר של coupon_price. אין Escrow. אל תמציא עמלות.
אם המחיר לא ברור, null + needs_human=true.
```

### 7.4 Example extraction shape

```json
{
  "name_he": "עיסוי זוגי 60 דקות",
  "product_type": "coupon",
  "price_agorot": 50000,
  "coupon_price_agorot": 9900,
  "platform_percent": null,
  "supplier_name_guess": "ספא הגליל",
  "confidence": "high",
  "needs_human": false
}
```

---

## 8. Cost controls

| Control | Rule |
|---|---|
| Per-run token cap | `product_copy` 2k out; `support_chat` 4k out/turn budget; `price_monitor` batch budget |
| Daily org ceiling | `agent_cost_daily_agorot` soft then hard stop (config) |
| Track | `agent_runs.cost_agorot` (provider USD → agorot at fixed FX config) |
| Prefer rules first | Fraud/rate signals before LLM; SQL before Claude on support intent |
| Cache | Identical product_copy inputs → return prior draft for 24h unless forced |
| Model tier | Classification on small model; generation on Claude Sonnet-class |
| Max tool calls | support 8; copy 3; price_monitor 15/batch; wp 20/batch; whatsapp 4 |

Ntfy admin alert when daily cost &gt; 80% ceiling or error rate spikes.

---

## 9. Eval strategy

### 9.1 Golden sets (Hebrew)

| Agent | Fixtures | Pass criteria |
|---|---|---|
| `product_copy` | 30 products (coupon+physical) | No Escrow; coupon price not reinvented; JSON schema valid; toxicity/off-policy = 0 |
| `price_monitor` | 20 mocked competitor HTML | Correct agorot parse ±1; no auto-write side effects |
| `wp_migration` | 15 WP rows incl. missing commission | Leaves `platform_percent` null when absent; redirect paths sane |
| `support_chat` | 40 dialogues with tool stubs | No cross-user data; escalate on refund dispute; snapshot percent only |
| `admin_whatsapp_copilot` | 25 WhatsApp dumps | `platform_percent` always null in draft; money integers |

### 9.2 Online eval

- Sample 2% of support transcripts weekly for human rubric (correctness, tone, policy).
- Track: escalation rate, approval rate of drafts, apply revert rate, cost_agorot p50/p95.

### 9.3 Regression

CI job (docs-gated until agents ship): run golden set against prompt snapshots; fail if policy classifiers detect Escrow / fixed-10% / cross-tenant leakage in outputs.

---

## 10. Safety rails (no production writes without human approval)

```
Agent output
  → agent_drafts.status = pending
  → Admin / support human reviews in UI
  → approve | reject
  → only then server Apply job (same auth as manual admin actions)
```

| Action | Allowed without human? |
|---|---|
| Read own orders / public catalog | Yes |
| Create support ticket | Yes |
| Generate copy / WhatsApp draft / price suggestion / WP map | Yes (draft) |
| Update `products.*` money or content | **No** |
| Insert `seo_redirects` | **No** (batch approve) |
| Refund / redeem / wallet / payout | **Never** (not agent tools) |

Additional rails:

- Output filter: block phrases Escrow/נאמן/עמלה קבועה 10% before showing to user.
- Tool allowlists per `agent_type` (cannot call another agent's tools).
- Idempotency keys on apply jobs: `agent_apply:{draft_id}`.

---

## 11. Acceptance checklist

- [ ] Five agents specified with Hebrew prompts and Claude as generator
- [ ] Coupon paid-in-full + no Escrow + snapshot `platform_percent` enforced in prompts
- [ ] Money in tools as integer agorot
- [ ] WP migration: staging → R2 → redirects, human apply only
- [ ] Support tools RLS-scoped to caller
- [ ] WhatsApp copilot never sets `platform_percent` by itself
- [ ] Cost caps + `cost_agorot` accounting
- [ ] Golden-set eval + online sampling plan
- [ ] No production writes without approval gate

---

## 12. Related

`docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ARCHITECTURE-CUSTOMER-SUPPORT.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.
