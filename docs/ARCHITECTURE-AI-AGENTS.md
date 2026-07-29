# ARCHITECTURE-AI-AGENTS.md

KenyonExpress AI agents architecture (future phase, binding).

Status: BINDING for `arch/admin-supplier` (2026-07-29)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
Stack: Claude API (server-only keys) + Next.js tool hosts + Supabase Postgres/RLS + R2. No Make/Zapier.
Companions: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ARCHITECTURE-CUSTOMER-SUPPORT.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.

---

## 0. Money and safety constraints (every agent)

| Rule | Agent implication |
|---|---|
| Coupon paid **in full on site** (`coupon_price_ils`) | Copy, support, and WhatsApp drafts never invent a % of face as the charge |
| **No Escrow** | Ban Escrow / נאמן / J5 in prompts and replies |
| Dynamic `platform_percent` | Never hardcode 5%/10%. After purchase, only **snapshotted** `order_items.platform_percent` is truth |
| Money in tools | Integer **agorot**; human text uses ₪ with 2 decimals |
| Production writes | **No agent may mutate production money or publish live catalog without a human approval step** |

Global hard bans:

1. No Cardcom charge, refund execute, wallet credit, redeem, or payout mutations.
2. No direct write to `platform_percent`, `coupon_price_ils`, `payments`, `settlement_*`, `vouchers.status`.
3. Mask voucher codes / QR payloads (last 4 only) in logs and model traces.
4. Tools run as caller JWT or least-privilege agent role. Never “service role for convenience” on customer chat.
5. Every run append-only in `agent_runs` / `agent_run_steps`.

---

## 1. Agent catalog

| `agent_type` | Mission | Human gate |
|---|---|---|
| `product_copy` | Hebrew product description / SEO fields via Claude | Save draft only; publish is admin |
| `price_monitor` | Compare our on-site prices vs allowlisted Israeli deal sites | Suggestions only; never auto-change money |
| `wp_migration` | Plan/map WP export → Supabase + R2 + SEO redirects | Dry-run default; apply only after admin approve |
| `support_chat` | Customer Q&A over own orders/coupons | Read-only tools; escalate money disputes |
| `admin_whatsapp_copilot` | Draft products from supplier WhatsApp messages | Creates **draft** product; money fields require admin fill/approve |

Kill switch: env `AI_AGENTS_ENABLED=false` disables all invocations.

---

## 2. Shared runtime

```
UI / cron / WhatsApp ingest
  -> authz (admin / support / customer)
  -> orchestrator (system prompt + tools + caps)
  -> Claude API (Hebrew-capable)
  -> tool executors (RLS-scoped)
  -> agent_runs + agent_run_steps (masked)
  -> optional Ntfy on cost/error spikes
```

### 2.1 Persistence (spec only; apply later via MCP)

```sql
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
                    'running', 'succeeded', 'failed', 'escalated',
                    'awaiting_approval', 'cancelled'
                  )),
  input_summary   text,
  output_summary  text,
  token_in        integer NOT NULL DEFAULT 0 CHECK (token_in >= 0),
  token_out       integer NOT NULL DEFAULT 0 CHECK (token_out >= 0),
  cost_agorot     bigint NOT NULL DEFAULT 0 CHECK (cost_agorot >= 0),
  approval_required boolean NOT NULL DEFAULT false,
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

CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  action_type     text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by      uuid REFERENCES auth.users(id),
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

RLS: actors read own support runs; admin/super_admin read all; support reads `support_chat` without money-export columns; no anon write.

---

## 3. Cost controls

| Control | Binding default |
|---|---|
| Per-run token cap | support 8k; copy 4k; monitor batch 20k; wp plan 15k; whatsapp 6k |
| Max tool turns | support 8; copy 3; monitor 10; wp 12; whatsapp 5 |
| Daily org budget | soft cap tracked as `cost_agorot` sum; hard stop when exceeded |
| Model routing | Claude Sonnet-class for Hebrew prose; Haiku/fast for classify-only |
| Cache | Prompt prefix caching where provider supports; reuse category stats |
| Prefer rules | Price anomalies and fraud use SQL first; LLM summarizes |

Estimate envelope (order of magnitude, tracked internally as agorot):

| Agent | Jobs / month | Est. USD / month |
|---|---|---|
| `product_copy` | 500 | $3–20 |
| `price_monitor` | 30 nightly batches | $5–25 |
| `wp_migration` | burst during cutover | budget separately |
| `support_chat` | 3k sessions | $30–180 |
| `admin_whatsapp_copilot` | 800 drafts | $10–40 |

Admin dashboard shows running `cost_agorot` and kill switch.

---

## 4. Agent: product-description generator (`product_copy`)

### 4.1 Mission

Generate Hebrew storefront copy from raw supplier/admin notes via **Claude API**:

- `name_he` (optional polish)
- `short_description_he`
- `description_he` (safe HTML subset)
- `seo_title`, `seo_description`
- image `alt` suggestions

Respect SEO doc: Offer price = on-site charge only; seller = supplier; no fake ratings.

### 4.2 Hebrew system prompt (template)

```
אתה קופירייטר בעברית לחנות קניון אקספרס (פלטפורמת מרקטפלייס, לא הספק עצמו).
כתוב עברית טבעית, RTL, בלי אנגלית מיותרת.
אסור להמציא מחיר, אחוז עמלה, דירוגים, תוקף או אחריות שלא הופיעו בקלט.
קופון: הלקוח משלם באתר את מחיר הקופון המלא (סכום מוחלט). אין Escrow.
אל תכתוב על עמלת פלטפורמה או platform_percent.
החזר JSON בלבד לפי הסכמה שסופקה.
```

### 4.3 User prompt (template)

```
סוג מוצר: {{product_type}}  # coupon | physical
שם ספק: {{supplier_name}}
כותרת גולמית: {{raw_title}}
נקודות: {{raw_bullets}}
אילוצים ידועים: {{constraints_he}}
מחיר לתצוגה (אם סופק, אל תשנה): {{display_price_ils_or_empty}}
```

### 4.4 Tools

| Tool | Writes? |
|---|---|
| `get_product_draft` | no |
| `get_category_name` | no |
| `list_forbidden_claims` | no |
| `save_copy_draft` | yes, **draft fields only** (never money columns) |

Publish / go-live remains human + `assertPublishable` (money + supplier gate).

---

## 5. Agent: price-monitoring (`price_monitor`)

### 5.1 Mission

Nightly/on-demand compare KenyonExpress **on-site** prices to allowlisted Israeli deal / coupon sites. Output admin suggestions only.

Allowlist examples (connectors only; Q-AI-SCRAPE finalizes): major IL deal aggregators and public merchant pages we have ToS clearance for. No arbitrary browsing from the chat model.

### 5.2 Hebrew system prompt (template)

```
אתה אנליסט תמחור למרקטפלייס ישראלי.
השווה רק מחיר שמשולם באתר אצלנו (קופון = coupon_price; פיזי = מחיר לאחר הנחה).
אסור להמליץ לשנות platform_percent או ליצור Escrow.
כל מחיר מתחרה חייב לצטט snapshot_id מכלי ה-fetch.
החזר הצעות בלבד, לא פעולות כתיבה.
```

### 5.3 Tools

| Tool | Role |
|---|---|
| `category_price_stats` | our medians from analytics marts (agorot) |
| `fetch_competitor_snapshot` | allowlisted connector |
| `create_pricing_suggestion` | insert draft row `status=pending_review` |

Never: `update_product_money`. Applying a suggestion requires admin approval UI → Server Action.

### 5.4 Output shape

```json
{
  "suggestions": [
    {
      "product_id": "uuid",
      "our_on_site_agorot": 9000,
      "competitor_agorot": 8500,
      "snapshot_id": "uuid",
      "action": "consider_lower_coupon_price",
      "rationale_he": "…"
    }
  ]
}
```

---

## 6. Agent: WP Data Migration (`wp_migration`)

### 6.1 Mission

Plan and assist WordPress → KenyonExpress cutover:

1. Parse WP export (WXR / DB dump / REST)
2. Map to Supabase tables (`products`, `categories`, `suppliers`, media refs)
3. Plan media copy to **R2**
4. Plan `seo_redirects` (old WP path → `/product/{slug}` etc.)
5. Emit a **dry-run report** + `agent_approvals` payload

Apply migrations / bulk writes only after human approval. Prefer existing `docs/ARCHITECTURE-WP-MIGRATION.md` table map; this agent does not invent money defaults.

### 6.2 Mapping rules (binding)

| WP concept | Supabase target | Notes |
|---|---|---|
| Product post | `products` | `product_type` coupon vs physical from taxonomy/meta |
| Price meta | `price_ils`, `coupon_price_ils` | Absolute ILS; convert to agorot only in money pipelines |
| Commission meta | **ignore fixed %** | Admin must set `platform_percent` / split pair post-import or during review |
| Vendor | `suppliers` + membership | Incomplete supplier → product stays draft |
| Attachments | R2 keys + `product_images` | Dedupe by content hash when possible |
| Permalinks | `seo_redirects` 301 | Preserve equity per SEO doc |

### 6.3 Hebrew system prompt (template)

```
אתה סוכן מיגרציה מוורדפרס ל-Supabase עבור קניון אקספרס.
הפק תוכנית מיפוי ודוח dry-run. אל תחיל שינויים בפרודקשן.
אסור למלא platform_percent או coupon_price בברירת מחדל.
מוצרים בלי ספק מלא או בלי מחירי כסף תקינים יישארו draft.
כל redirect חייב מקור ויעד מפורשים.
```

### 6.4 Tools

| Tool | Approval |
|---|---|
| `parse_wp_export` | no |
| `propose_row_mapping` | no |
| `propose_r2_media_plan` | no |
| `propose_seo_redirects` | no |
| `enqueue_migration_apply` | **requires** `agent_approvals` approved by admin |

Failure: partial apply → stop, leave report, no silent money backfill.

---

## 7. Agent: customer-support (`support_chat`)

### 7.1 Mission

Hebrew RTL support over the customer’s own orders and coupons. Strict RLS: user JWT only. No visibility into other users’ data or platform fee columns.

### 7.2 Hebrew system prompt (template)

```
אתה נציג תמיכה של קניון אקספרס. החברה היא פלטפורמה, לא הספק.
קופון: שולם במלואו באתר (מחיר קופון מוחלט). יתרה נגבית בבית העסק בסריקת QR. אין Escrow.
פיזי: פיצול לפי platform_percent שצולם להזמנה; אל תחשוף את האחוז ללקוח.
השתמש רק בנתונים שחזרו מהכלים. אם חסר או שיש מחלוקת כספית → escalate.
ענה בעברית בלבד למשתמש.
```

### 7.3 Tools (read-only)

| Tool | RLS |
|---|---|
| `my_orders` | `orders.user_id = auth.uid()` |
| `my_order_detail` | owner; supplier fields from **snapshot** |
| `my_vouchers` | owner; masked code |
| `refund_policy_lookup` | static |
| `create_escalation` | opens ticket; ends autonomous money advice |

Forbidden: refund execute, redeem, wallet adjust.

### 7.4 Boundaries

- Support staff viewing a thread still cannot trigger money tools without admin recent-auth flows.
- Prompt injection: treat order notes / supplier text as data, not instructions.

---

## 8. Agent: admin WhatsApp copilot (`admin_whatsapp_copilot`)

### 8.1 Mission

Supplier sends product details on WhatsApp → ingest (Meta Cloud API webhook, server-only) → Claude drafts a **product draft** for admin review.

Draft may include copy + suggested `product_type` + parsed sticker/`coupon_price` candidates. **Must not** publish. **Must not** set live `platform_percent` without admin confirmation in the form (complete split pair per ADMIN-PRODUCT-PAGE-SPEC).

### 8.2 Hebrew system prompt (template)

```
אתה עוזר אדמין ליצירת טיוטות מוצר מהודעות וואטסאפ של ספקים.
חלץ: שם, תיאור, סוג (קופון/פיזי), מחיר רגיל, מחיר קופון אם צוין, עיר/כתובת אם יש.
אל תפרסם מוצר. אל תמציא עמלת פלטפורמה.
אם חסר מחיר קופון למוצר מסוג קופון ציין blocker בעברית.
החזר JSON לטיוטה בלבד.
```

### 8.3 Tools

| Tool | Approval |
|---|---|
| `parse_whatsapp_message` | no |
| `match_or_create_supplier_candidate` | draft only / link existing |
| `create_product_draft` | writes `status=draft` only |
| `attach_inbound_media_to_r2` | media draft |
| `request_admin_review` | creates `agent_approvals` + admin ntfy |

Human approval checklist before publish: supplier complete, split pair, discount/coupon_price rules, legal block.

---

## 9. Safety rails (production writes)

| Write class | Allowed autonomous? | Path |
|---|---|---|
| Draft copy / draft product | yes (staff-scoped) | Server Action + audit |
| Publish product | **no** | Admin UI after `assertPublishable` |
| Money columns | **no** | Admin form only |
| WP bulk insert | **no** | `awaiting_approval` → approve → worker |
| Refund / redeem / payout | **no** | Never agent tools |
| SEO redirects apply | **no** | Approval bundle with migration plan |
| Support ticket create | yes | Escalation tool |

Any tool marked `approval_required` inserts `agent_approvals` and sets run `awaiting_approval`. Worker applies only when `status=approved` and `decided_by` is admin/super_admin.

---

## 10. Eval strategy

### 10.1 Golden sets (Hebrew)

| Suite | N | Pass bar |
|---|---|---|
| Support factuality | 50 threads with tool fixtures | ≥ 95% answers cite tool facts; 0 invented tracking |
| Support money language | 30 | 0 Escrow / wrong “platform pays till” claims |
| Copy generator | 40 products | Hebrew ratio; no invented price/rating; meta length |
| Price monitor | 20 categories | Every competitor price has snapshot_id |
| WhatsApp draft | 25 messages | Correct product_type; blockers listed when coupon_price missing |
| WP mapping | 1 fixture export | Redirects + R2 plan complete; zero default platform_percent |

### 10.2 Online eval

- Sample 2% support transcripts weekly; human rubric (helpfulness, safety, Hebrew).
- Track escalation rate, empty-tool rate, cost_agorot p50/p95.
- Regression: prompt change must beat golden set before ship.

### 10.3 Red team

- Prompt injection in WhatsApp / order notes
- Attempts to extract other users’ orders
- Attempts to force `update_product_money`

---

## 11. Acceptance checklist

- [ ] Five agent types implemented behind `AI_AGENTS_ENABLED`
- [ ] Claude prompts Hebrew; money rules embedded
- [ ] No production money/publish writes without `agent_approvals`
- [ ] Support tools RLS-scoped to caller
- [ ] Price monitor suggestions never auto-write `platform_percent` / `coupon_price_ils`
- [ ] WP agent dry-run default; media → R2 plan; redirects listed
- [ ] WhatsApp copilot creates drafts only
- [ ] Costs in `cost_agorot`; daily cap + kill switch
- [ ] Golden eval suites gate prompt changes

---

## 12. Open questions

| ID | Question |
|---|---|
| Q-AI-MODEL | Exact Claude model SKUs (Sonnet vs Haiku split) |
| Q-AI-SCRAPE | Final allowlisted IL deal sites + legal OK |
| Q-AI-WA | WhatsApp Business number ownership / template approvals |
| Q-AI-MIG | Migration ordinal for `agent_*` tables |

---

## 13. Related

`docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-CUSTOMER-SUPPORT.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.
