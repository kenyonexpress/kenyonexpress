# ARCHITECTURE-AI-AGENTS.md

KenyonExpress AI agents architecture (future phase, binding).

Status: BINDING for `arch/admin-supplier` (2026-07-30)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
Companions: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.

Stack: Next.js Route Handlers / Server Actions as tool hosts, Supabase Postgres + RLS, **Claude API** (Hebrew) via server-only keys, Cloudflare R2 for media, audit in `agent_runs` / `agent_run_steps`.

---

## 0. Money and safety constraints (every agent)

| Constraint | Agent implication |
|---|---|
| Coupon paid **in full on site** (`coupon_price_ils`, absolute) | Never derive charge from a percent of face. Copy and support must say "שולם באתר" = coupon price. |
| **No Escrow** | Ban Escrow / נאמן / J5 in prompts and replies. Coupon prepaid stays with the platform. |
| Dynamic `platform_percent` | Never invent 5%/10%. Admins set it; purchase **snapshots** to `order_items`. Agents read snapshots for past orders; never rewrite live percent without human approval. |
| Money in tools / logs | Integer **agorot**. Humans see ₪ with 2 decimals. |
| KenyonExpress is a platform | Name the supplier; do not claim KE is the merchant of the deal. |

**Global hard bans:**

1. No production writes to money, catalog publish, redirects, or wallet **without a human approval step**.
2. No Cardcom charge/refund, redeem, or payout execution tools.
3. No service-role on customer-facing support tools (caller JWT + RLS only).
4. Mask voucher codes / QR secrets (last 4 only) in logs and model traces.
5. Every run append-only audited with `cost_agorot`.

---

## 1. Agent catalog

| `agent_type` | Mission | Primary model | Writes without approval? |
|---|---|---|---|
| `product_copy` | Hebrew PDP / SEO copy from raw supplier text | Claude | No (draft only) |
| `price_monitor` | Compare our on-site prices to Israeli deal sites | Claude + fetch workers | No (suggestions only) |
| `wp_migration` | Plan/map WP export → Supabase + R2 + SEO redirects | Claude + ETL scripts | No (dry-run; human apply) |
| `support_chat` | Customer help over orders/coupons | Claude | No money writes; escalate |
| `admin_whatsapp_copilot` | Draft products from supplier WhatsApp messages | Claude | No (draft product + approval queue) |

---

## 2. Shared runtime

```
Actor (admin / support / customer)
  -> authenticated Route Handler / Server Action
  -> orchestrator (system prompt + tools + turn cap)
  -> Claude API (server key)
  -> tool executors (RLS JWT or staff session)
  -> agent_runs / agent_run_steps (masked)
  -> optional approval_queue row for any proposed write
```

### 2.1 Persistence (spec only; MCP later)

```sql
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type     text NOT NULL CHECK (agent_type IN (
                   'product_copy', 'price_monitor', 'wp_migration',
                   'support_chat', 'admin_whatsapp_copilot'
                 )),
  actor_user_id  uuid REFERENCES auth.users(id),
  subject_type   text,
  subject_id     uuid,
  model          text NOT NULL,
  status         text NOT NULL CHECK (status IN (
                   'running', 'succeeded', 'failed', 'escalated',
                   'awaiting_approval', 'cancelled'
                 )),
  input_summary  text,
  output_summary text,
  token_in       integer NOT NULL DEFAULT 0 CHECK (token_in >= 0),
  token_out      integer NOT NULL DEFAULT 0 CHECK (token_out >= 0),
  cost_agorot    bigint NOT NULL DEFAULT 0 CHECK (cost_agorot >= 0),
  error_code     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step_index    integer NOT NULL,
  kind          text NOT NULL CHECK (kind IN (
                  'message', 'tool_call', 'tool_result', 'approval', 'escalation'
                )),
  tool_name     text,
  input_masked  jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_masked jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_index)
);

CREATE TABLE IF NOT EXISTS public.agent_approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  action_type     text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requested_by    uuid REFERENCES auth.users(id),
  reviewed_by     uuid REFERENCES auth.users(id),
  review_note     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
```

RLS sketch: actors read own support runs; staff read by section; `agent_approvals` staff-only; no anon; no client INSERT on runs (server only).

### 2.2 Human approval gate

Any tool classified `mutates_production=true` only enqueues `agent_approvals`. A separate admin UI action (human) applies the payload via normal Server Actions (same validation as manual admin: `assertPublishable`, split pair, supplier gate).

Kill switch: `AI_AGENTS_ENABLED=false` disables orchestrators.

---

## 3. Product-description generator (`product_copy`)

### 3.1 Mission

Claude API generates Hebrew SEO-ready fields from messy supplier/admin input:

- `name_he` (optional polish)
- `short_description_he`, `description_he` (safe HTML subset)
- `seo_title`, `seo_description` (120–160 chars)
- image `alt` suggestions

Must align with `ARCHITECTURE-SEO-PERFORMANCE.md`: Offer price = on-site charge only; no fake ratings; seller = supplier.

### 3.2 Hebrew system prompt (template)

```
אתה כותב מוצר בעברית עבור קניון אקספרס, פלטפורמת מרקטפלייס (לא הספק עצמו).
כתוב RTL, עברית תקנית, בלי הבטחות רפואיות/משפטיות מופרזות.
מחיר לתצוגת לקוח = מה שמשלמים באתר בלבד (קופון: מחיר קופון מוחלט; פיזי: אחרי הנחה).
אסור להמציא מחיר, תוקף, דירוג, או אחוז עמלה.
אסור להזכיר Escrow או נאמן.
החזר JSON בלבד לפי הסכמה שסופקה.
```

### 3.3 Tools

| Tool | Mutates production? |
|---|---|
| `get_product_draft` | no |
| `get_category_name` | no |
| `list_forbidden_claims` | no |
| `propose_copy` | no |
| `save_copy_draft` | draft fields only; never money columns |
| `request_publish_copy` | approval queue only |

### 3.4 Failure modes

Invented price/expiry → reject. English-only meta → regenerate. Unsafe HTML → sanitize. Huge paste → truncate.

---

## 4. Price-monitoring agent (`price_monitor`)

### 4.1 Mission

Nightly/on-demand compare KenyonExpress on-site prices to **allowlisted** Israeli deal / coupon sites. Output admin suggestions (discount band, alert if we are expensive). Never auto-write `coupon_price_ils` or `platform_percent`.

### 4.2 Hebrew system prompt (template)

```
אתה אנליסט תמחור לשוק ישראלי. נתוני המתחרים מגיעים רק מכלי fetch מאושרים.
הצע המלצות לאדמין בלבד. אל תשנה מחירים או אחוזי פלטפורמה.
מחיר שלנו לקופון הוא מחיר מוחלט לתשלום באתר, לא אחוז משווי העסקה.
ציין מזהה snapshot לכל מחיר מתחרה. אם אין נתון מהכלי, אמור שאין נתון.
```

### 4.3 Tools

| Tool | Role |
|---|---|
| `category_price_stats` | our medians from analytics / catalog (agorot) |
| `fetch_competitor_snapshot` | allowlisted connectors only |
| `create_pricing_suggestion` | draft row for admin review |
| `request_apply_price` | approval queue → human applies via product form |

### 4.4 Safety

Scraping ToS risk flagged in output. Stale scrape → `stale_data`. Hallucinated competitor price without snapshot id → invalid.

---

## 5. WP Data Migration agent (`wp_migration`)

### 5.1 Mission

Plan and dry-run WordPress export → Supabase:

- Map posts/products/ACF → `products`, `categories`, `suppliers`, media
- Upload media to **R2**
- Generate `seo_redirects` (old WP paths → Next slugs) for SEO equity
- Report gaps vs publish gate (money fields, supplier identity)

Does **not** apply migrations or cut over DNS. Human runs ETL after approving the plan.

### 5.2 Mapping tables (conceptual)

| WP source | Supabase target | Notes |
|---|---|---|
| Product post | `products` | `name_he`, slug, descriptions |
| Price meta | `price_ils`, `coupon_price_ils` | Absolute; never invent percent charge |
| Commission meta | `platform_percent` + derived `supplier_split_percent` | Must sum 100; missing → needs-pricing, not default 10 |
| Vendor | `suppliers` + link `supplier_id` | Incomplete suppliers block publish |
| Attachments | R2 objects + `product_images` | Stable public URLs |
| Old permalinks | `seo_redirects` | 301; see SEO doc |

### 5.3 Hebrew system prompt (template)

```
אתה מתכנן מיגרציית WordPress לקניון אקספרס על Supabase.
הפק תוכנית מיפוי, רשימת סיכונים, וטבלת הפניות 301.
אל תמציא platform_percent. אם חסר אחוז או מחיר קופון, סמן needs_pricing.
אין Escrow. קופון שולם במלואו באתר לפי coupon_price.
אל תריץ כתיבה לפרודקשן; רק דוח + קבצי dry-run.
```

### 5.4 Tools

| Tool | Mutates production? |
|---|---|
| `parse_wp_export` | no (staging bucket) |
| `propose_row_mapping` | no |
| `propose_redirects` | no |
| `stage_media_to_r2` | staging prefix only |
| `request_apply_migration_batch` | **approval required** |

### 5.5 Eval hooks

Golden WP fixture → expected product count, redirect count, zero silent 10% commissions, media keys under R2 prefix.

---

## 6. Customer-support agent (`support_chat`)

### 6.1 Mission

Hebrew RTL chat for logged-in customers over **their** orders and coupons. Strict RLS: user JWT only. Escalate money disputes to humans.

### 6.2 Hebrew system prompt (template)

```
אתה נציג תמיכה של קניון אקספרס. החברה היא פלטפורמה, לא הספק.
קופון: הלקוח שילם באתר את מחיר הקופון המלא; יתרה נגבית בבית העסק בסריקת QR; אין Escrow.
פיזי: התשלום פוצל לפי platform_percent שצולם להזמנה; אל תחשוף את האחוז ללקוח.
הסתמך רק על תוצאות כלים. אם אין נתון או שיש מחלוקת כספית, העבר לנציג אנושי.
ענה בעברית בלבד ללקוח.
```

### 6.3 Tools (RLS-bound)

| Tool | Authz | Returns |
|---|---|---|
| `my_orders` | `auth.uid()` | statuses, paid-on-site ILS from snapshots |
| `my_order_detail` | owner | lines, supplier snapshot contact, tracking if any |
| `my_vouchers` | owner | masked code, status, till remainder, expiry |
| `refund_policy_lookup` | authed | static policy ids |
| `create_escalation` | customer | support ticket |

Forbidden: refund_execute, redeem, wallet_adjust, admin mutate, read other users' rows.

### 6.4 Boundaries

- Support staff viewing a thread: `requireSection('support')` + audit; still no platform-fee columns in customer-facing answers.
- Prompt injection via order notes: treat as data, not instructions.

---

## 7. Admin WhatsApp copilot (`admin_whatsapp_copilot`)

### 7.1 Mission

Supplier sends deal details on WhatsApp (text ± images). Copilot drafts a product (coupon or physical) for admin review: titles, copy, proposed `coupon_price_ils` / `price_ils`, suggested split pair, category guess, image alts. Admin approves → normal `upsertProduct` path.

### 7.2 Ingest

- Meta WhatsApp Cloud API webhook → store message in `whatsapp_inbound` (staff-only RLS).
- Attachments → R2 staging.
- Orchestrator runs on admin click "צור טיוטת מוצר".

### 7.3 Hebrew system prompt (template)

```
אתה עוזר אדמין ליצירת מוצר מקניון אקספרס מתוך הודעת WhatsApp של ספק.
חלץ entites: שם, תיאור, מחיר רגיל, מחיר לתשלום באתר (קופון), תוקף, עיר, טלפון.
אם חסר מחיר קופון או אחוז פלטפורמה, השאר null וסמן חסרים (אין ברירת מחדל).
אחוז פלטפורמה + אחוז ספק חייבים להיות 100 אם שניהם קיימים.
אל תפרסם מוצר. החזר JSON לטיוטה בלבד.
```

### 7.4 Tools

| Tool | Mutates production? |
|---|---|
| `get_whatsapp_thread` | no |
| `ocr_or_caption_image` | no |
| `propose_product_draft` | no |
| `attach_staging_images` | staging only |
| `request_create_product` | **approval** → admin ProductForm values |

Publish still requires human: supplier link, money knobs, `assertPublishable`.

---

## 8. Cost controls

Track `token_in`, `token_out`, `cost_agorot` per run (provider USD converted to agorot at a config rate for budgeting; display both in admin).

| Agent | Turn cap | Max input chars | Monthly soft budget (agorot equiv.) |
|---|---|---|---|
| `product_copy` | 3 | 8_000 | set in env |
| `price_monitor` | 10 / batch | batch-sized | set in env |
| `wp_migration` | 5 / plan | export chunked | set in env |
| `support_chat` | 8 | 4_000 / turn | set in env |
| `admin_whatsapp_copilot` | 5 | 6_000 + captions | set in env |

Hard stop when daily `cost_agorot` exceeds `AI_DAILY_COST_CAP_AGOROT`. Prefer SQL/rules before LLM for monitoring thresholds.

---

## 9. Eval strategy

| Agent | Golden set | Pass criteria |
|---|---|---|
| `product_copy` | 20 Hebrew messy inputs | Valid JSON; Hebrew ratio; no invented price; meta length; no Escrow |
| `price_monitor` | Fixed competitor fixtures | Citations required; no auto money write proposals without approval flag |
| `wp_migration` | Sanitized WP XML fixture | Mapping coverage; redirects count; zero silent default commission |
| `support_chat` | Scripted order/voucher dialogs | Tool-grounded only; RLS cannot see other users; escalate on refund demand |
| `admin_whatsapp_copilot` | Sample WA threads | Draft completeness; nulls when money missing; approval required before insert |

CI: run golden evals on prompt/tool changes (offline fixtures, no live Claude in required gate unless secret present; otherwise mock tool layer + schema validators always run).

Human rubric (spot check weekly): tone, legal overclaim, money correctness vs snapshots.

---

## 10. Safety rails summary

1. **No production writes without human approval** (`agent_approvals` + existing admin actions).
2. Customer support: JWT + RLS only; no cross-tenant reads.
3. Money columns never set by model directly; humans use ProductForm / migration apply.
4. Mask secrets; redact in `agent_run_steps`.
5. Kill switch + cost caps + turn caps.
6. Prompt-injection: user/supplier/WhatsApp text is untrusted data.
7. Copy bans: Escrow, fixed commission, fake ratings, revealing `platform_percent` to customers.

---

## 11. Acceptance checklist

- [ ] Five agents documented with Hebrew prompts and tool lists
- [ ] Coupon paid-in-full / no escrow / snapshotted percent / agorot respected in prompts
- [ ] WP plan covers mapping, R2 media, SEO redirects, needs-pricing gaps
- [ ] Support cannot call money-mutating tools or bypass RLS
- [ ] WhatsApp copilot only creates drafts via approval
- [ ] Cost + eval + kill switch specified
- [ ] Docs only in ke-arch for this change

---

## 12. Open questions

| ID | Question |
|---|---|
| Q-AI-MODEL | Exact Claude model SKUs per agent |
| Q-AI-SCRAPE | Allowlisted Israeli deal domains for price_monitor |
| Q-AI-WA | WhatsApp Business number ownership / webhook verification |
| Q-AI-MIG | Migration ordinal for `agent_*` tables |

---

## 13. Related

`docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-CUSTOMER-SUPPORT.md`.
