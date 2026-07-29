# ARCHITECTURE-AI-AGENTS.md

KenyonExpress future AI agents phase (binding).

Status: BINDING for `arch/admin-supplier` (2026-07-30)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
Companions: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-CUSTOMER-SUPPORT.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.

Stack intent: Claude API (Hebrew-capable) via server-only keys, Next.js Route Handlers / Server Actions as tool hosts, Supabase Postgres + RLS, audit in `agent_runs` / `agent_run_steps`. SQL below is specification text for later MCP migrations (no `.sql` committed in this docs pass).

---

## 0. Money and safety constraints (every agent)

| Rule | Agent implication |
|---|---|
| Coupon paid **in full on site** | Absolute `coupon_price_ils`. Never invent a percent of face as the charge. |
| **No Escrow** | Ban Escrow / נאמן / J5 in prompts and replies. Coupon prepaid stays with the platform. |
| Dynamic `platform_percent` | Admin-set, no default. Snapshotted to `order_items` at purchase (C10). Agents never invent 5%/10%. |
| Money units | Tools use integer **agorot**. Human text uses ₪ with 2 decimals. |
| KE is a platform | Never claim KE is the merchant of record; name the supplier from snapshot / draft. |

### 0.1 Global hard bans

1. **No production writes without human approval.** Agents may propose drafts only. Publish, money edits, redirects go-live, refunds, redeem, wallet credit, payouts require an explicit human action (button / MCP apply / admin confirm).
2. No Cardcom charge/refund, redeem, or payout tool.
3. No silent writes to `platform_percent`, `coupon_price_ils`, `order_items`, `payments`, `vouchers` status.
4. No raw voucher codes / QR HMAC secrets in model traces (mask to last 4).
5. Customer-facing tools run as the **caller JWT** under RLS. Never “service role for convenience” on support chat.
6. Every run is append-only audited (`agent_runs` / `agent_run_steps`).

---

## 1. Agent catalog

| `agent_type` | Mission | Primary model | Write mode |
|---|---|---|---|
| `product_copy` | Hebrew product description / SEO copy from raw supplier text | Claude API | Draft fields only; human publishes |
| `price_monitor` | Compare our on-site prices vs allowlisted Israeli deal sites | Claude + fetch worker | Suggestions only; human applies |
| `wp_migration` | Plan/map WordPress export → Supabase + R2 + SEO redirects | Claude + ETL scripts | Staging tables; human cutover |
| `support_chat` | Customer help over orders/coupons | Claude | Read via RLS; escalate tickets |
| `admin_whatsapp_copilot` | Turn supplier WhatsApp messages into product draft proposals | Claude | Draft product rows; human approves money + publish |

---

## 2. Shared runtime

```
Client (admin job / support chat / cron)
  -> authz (requireAdmin / requireUser / requireSection)
  -> orchestrator (system prompt + tools + turn cap)
  -> Claude API (server-only key)
  -> tool executors (RLS JWT or least-privilege definer)
  -> agent_runs + agent_run_steps (masked)
  -> optional draft row / ticket / ntfy
```

### 2.1 Persistence (spec)

```sql
-- SPEC ONLY (later via MCP apply_migration)
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
                    'running', 'succeeded', 'failed', 'awaiting_human',
                    'escalated', 'cancelled'
                  )),
  input_summary   text,
  output_summary  text,
  token_in        int not null default 0 check (token_in >= 0),
  token_out       int not null default 0 check (token_out >= 0),
  cost_agorot     bigint not null default 0 check (cost_agorot >= 0),
  approval_required boolean not null default true,
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  error_code      text,
  created_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create table if not exists public.agent_run_steps (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.agent_runs(id) on delete cascade,
  step_index      int not null,
  kind            text not null check (kind in (
                    'message', 'tool_call', 'tool_result', 'proposal', 'escalation'
                  )),
  tool_name       text,
  input_masked    jsonb not null default '{}'::jsonb,
  output_masked   jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (run_id, step_index)
);

create table if not exists public.agent_proposals (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.agent_runs(id) on delete cascade,
  proposal_type   text not null,
  payload         jsonb not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id)
);
```

RLS sketch: actors read own support runs; admin/super_admin read all; no anon access; no client INSERT on proposals (server only).

Kill switch: `AI_AGENTS_ENABLED=false` refuses new runs.

---

## 3. Product-description generator (`product_copy`)

### 3.1 Mission

Claude API turns raw Hebrew (or messy bilingual) supplier/admin input into SEO-ready fields:

- `name_he` (optional polish)
- `short_description_he`
- `description_he` (safe HTML subset)
- `seo_title`, `seo_description`
- image `alt` suggestions

Must respect `ARCHITECTURE-SEO-PERFORMANCE.md`: Offer price = on-site charge only; seller = supplier; no fabricated ratings.

### 3.2 Hebrew system prompt (template)

```
אתה עורך תוכן בעברית עבור קניון אקספרס, פלטפורמת מרקטפלייס (לא הספק עצמו).
כתוב עברית טבעית, RTL, בלי הבטחות רפואיות/משפטיות מופרזות.
מחיר הקופון באתר הוא סכום מוחלט שהלקוח משלם במלואו באתר. אין Escrow.
אל תמציא מחיר, אחוז עמלה, דירוגים, או תוקף שלא הופיעו בקלט.
אל תכתוב על platform_percent. אל תציג את קניון אקספרס כחנות המספקת את השירות בעצמה.
החזר JSON בלבד לפי הסכמה שסופקה.
```

### 3.3 Tools

| Tool | Role |
|---|---|
| `get_product_draft` | read current draft (staff JWT) |
| `get_category_name` | breadcrumb language |
| `list_forbidden_claims` | static policy |
| `propose_copy` | model output → `agent_proposals` |
| `apply_copy_draft` | **human-approved only**: write non-money draft fields |

### 3.4 Safety

- Zod-validate JSON output.
- Reject if price/expiry appear and were not in input.
- Truncate huge pastes (cost + injection).
- Publish still requires admin money gate (`platform_percent`, `coupon_price_ils`, supplier completeness).

---

## 4. Price-monitoring agent (`price_monitor`)

### 4.1 Mission

Nightly/on-demand compare our **on-site** prices vs allowlisted Israeli deal / coupon sites. Produce ranked suggestions for admins. Never auto-write money columns.

Allowlist examples (connectors only; ToS-aware): public category pages of major IL deal aggregators the business explicitly approves (**Q-AI-SCRAPE**). No open-web browsing from the chat model.

### 4.2 Hebrew system prompt (template)

```
אתה אנליסט תמחור לשוק הישראלי עבור קניון אקספרס.
השווה רק מחיר לתשלום באתר (קופון = coupon_price מוחלט; פיזי = מחיר אחרי הנחה).
אל תמליץ לשנות platform_percent אוטומטית. אל תמציא מחירי מתחרים בלי ציטוט snapshot_id.
אין Escrow. הצעות בלבד לאישור אדמין.
```

### 4.3 Tools

| Tool | Role |
|---|---|
| `category_price_stats` | our medians from analytics marts (agorot) |
| `fetch_competitor_snapshot` | allowlisted connector |
| `propose_price_band` | model → proposal |
| `create_pricing_suggestion` | draft row for admin UI |

### 4.4 Failure modes

| Failure | Handling |
|---|---|
| Scrape blocked / stale | Mark `stale_data` |
| Hallucinated competitor price | Must cite snapshot id |
| Suggests silent platform % change | Schema/UI forbid; retail discount ideas only |

---

## 5. WP Data Migration agent (`wp_migration`)

### 5.1 Mission

Plan and assist WordPress → KenyonExpress cutover (see also `ARCHITECTURE-WP-MIGRATION.md`):

1. Parse WordPress export (WXR / DB dump / REST) into staging tables.
2. Map WP posts/products → `products` / categories / media.
3. Upload media to **Cloudflare R2**; rewrite URLs.
4. Build `seo_redirects` (old path → new `/product/{slug}` or category) for equity.
5. Propose money field mapping: WP sale price → `coupon_price_ils` or physical discount; **never invent** `platform_percent` (admin must fill; publish blocked until set).

### 5.2 Pipeline

```
WP export
  -> staging.wp_raw_*
  -> agent proposes field map (human edits)
  -> staging.wp_normalized_*
  -> media worker -> R2 keys
  -> staging.seo_redirect_drafts
  -> human approval
  -> MCP/migration apply into public tables (dry-run first)
```

### 5.3 Mapping table sketch (staging)

| Staging column | Target |
|---|---|
| `wp_post_id` | external id / migration_log |
| `title_he` | `products.name_he` |
| `slug` | `products.slug` (dedupe) |
| `content_he` | `description_he` |
| `regular_price_agorot` | `price_ils` (convert) |
| `sale_price_agorot` | candidate `coupon_price_ils` or discounted physical |
| `vendor_name` | match/create `suppliers` (human confirm) |
| `image_urls[]` | R2 objects + gallery |
| `old_path` | `seo_redirects.from_path` |

`platform_percent` / `supplier_split_percent` / `discount_percent`: left null until admin completes publish gate. Agent must not default them to 10/90 or 100/0 silently without recording an explicit human choice in the proposal.

### 5.4 Hebrew system prompt (template)

```
אתה סוכן מיגרציה מוורדפרס לקניון אקספרס.
הצע מיפוי שדות, רשימת התנגשויות slug, ורשימת הפניות 301.
מחיר קופון באתר הוא תשלום מלא באתר (סכום מוחלט). אין Escrow.
אל תמלא platform_percent אוטומטית. סמן מוצרים שחסרים ספק מלא או מחירי כסף כלא-מוכנים לפרסום.
כל כתיבה לפרודקשן דורשת אישור אנושי מפורש.
```

### 5.5 Safety

- Dry-run reports only until `agent_proposals.status=approved`.
- Redirects applied via controlled migration/proxy update, not free-form SQL from the model.
- Media: virus/size limits; no execute of WP PHP in our runtime.

---

## 6. Customer-support agent (`support_chat`)

### 6.1 Mission

Hebrew RTL chat for logged-in customers over **their** orders and coupons/vouchers. Strict RLS: caller JWT only. Escalate money disputes to humans (`ARCHITECTURE-CUSTOMER-SUPPORT.md`).

### 6.2 Hebrew system prompt (template)

```
אתה נציג תמיכה של קניון אקספרס (פלטפורמה, לא הספק).
ענה בעברית בלבד. הסתמך רק על תוצאות הכלים.
קופון: הלקוח שילם באתר את מחיר הקופון במלואו; יתרה נגבית בבית העסק בסריקת QR. אין Escrow.
פיזי: הפיצול לפי platform_percent צולם בהזמנה; אל תחשוף את אחוז הפלטפורמה ללקוח.
אל תמציא מספרי מעקב או סטטוסים. בספק או בסכסוך כספי: העבר לנציג אנושי.
```

### 6.3 Tools (RLS-bound)

| Tool | Authz | Returns |
|---|---|---|
| `my_orders` | self | ids, statuses, paid-on-site ILS |
| `my_order_detail` | owner | lines, supplier snapshot contact, tracking if any |
| `my_vouchers` | owner | masked code, status, till remainder, expiry |
| `refund_policy_lookup` | authed | static policy ids |
| `create_escalation` | customer | support ticket; stop autonomous money advice |

Forbidden: redeem, refund_execute, wallet_adjust, admin mutate, read other users' rows.

### 6.4 Failure modes

| Failure | Handling |
|---|---|
| RLS empty / timeout | Say unavailable; escalate |
| Invented tracking | Validator: only if tool returned URL |
| Prompt injection in order notes | Treat notes as untrusted data |
| PII fishing | Refuse; escalate |

---

## 7. Admin WhatsApp copilot (`admin_whatsapp_copilot`)

### 7.1 Mission

Admin pastes (or forwards via approved ingest) a supplier WhatsApp thread. Claude extracts a **product draft proposal**: type guess, name, bullets, suggested `coupon_price` / sticker price, missing supplier fields checklist. Human completes `platform_percent` pair and publishes.

### 7.2 Hebrew system prompt (template)

```
אתה עוזר אדמין ליצירת טיוטת מוצר מהודעות וואטסאפ של ספק.
חלץ: שם בעברית, תיאור קצר, סוג (קופון/פיזי), מחיר רגיל, מחיר לתשלום באתר אם צוין, עיר/טלפון אם יש.
קופון = תשלום מלא באתר בסכום מוחלט. אין Escrow.
אל תמציא platform_percent. סמן שדות חסרים לפרסום (ספק, לוגו, כתובת, אחוזי פיצול).
החזר JSON לטיוטה בלבד; אין פרסום אוטומטי.
```

### 7.3 Tools

| Tool | Role |
|---|---|
| `parse_whatsapp_export` | normalize pasted text (strip UI chrome) |
| `match_supplier_by_phone_name` | fuzzy suggest existing supplier |
| `propose_product_draft` | → `agent_proposals` |
| `create_product_draft` | **human-approved**: insert draft product **without** money defaults; money null until admin form |

### 7.4 Safety

- WhatsApp content is untrusted (prompt injection).
- Never auto-publish.
- If message includes bank details, store only in supplier-secure fields after human confirm; do not echo in model logs.

---

## 8. Cost controls

Track `cost_agorot` per run (USD provider invoice converted at a fixed ops rate, or provider token→agorot table).

| Agent | Turn cap | Max input chars | Soft monthly budget (ops) | Hard kill |
|---|---|---|---|---|
| `product_copy` | 3 | 12k | configurable | `AI_AGENTS_ENABLED` / per-type flag |
| `price_monitor` | 10 / batch | N/A (structured) | nightly batch cap | skip batch if over |
| `wp_migration` | 8 / map pass | chunked export | per migration job | pause job |
| `support_chat` | 8 | 8k history window | per-user 30 sessions/day | escalate |
| `admin_whatsapp_copilot` | 4 | 20k paste | per-admin daily cap | refuse |

Prefer rules/SQL before LLM when possible (support classification, price stats). Alert via Ntfy if daily `sum(cost_agorot)` exceeds threshold.

---

## 9. Eval strategy

### 9.1 Golden sets (Hebrew)

| Suite | Cases | Pass criteria |
|---|---|---|
| `eval_product_copy` | 20 messy supplier blurbs | Valid JSON; Hebrew; no invented price; meta length band |
| `eval_price_monitor` | 10 fixture snapshots | Cites snapshot ids; no platform% write suggestion |
| `eval_wp_map` | 5 WP product fixtures | Correct slug/price agorot map; flags missing platform% |
| `eval_support` | 25 tool-grounded dialogues | No cross-user leak; correct coupon paid-in-full copy; escalate on refund fight |
| `eval_whatsapp` | 15 threads | Draft completeness score; never auto-fills platform% |

### 9.2 Regression

- Run golden sets in CI on prompt/tool changes (offline fixtures; no live Claude unless secret + label `ai-eval`).
- Score: exact schema + rubric LLM-judge optional; money-copy assertions are deterministic string checks.
- Block merge if support suite leaks another `user_id` or emits Escrow language.

### 9.3 Online eval

Sample 2% of production runs for human thumbs in admin; store on `agent_runs`. High downvote rate → disable that `agent_type`.

---

## 10. Safety rails (human approval)

```
Agent output
  -> agent_proposals (pending)
  -> admin UI review (diff)
  -> approve / reject
  -> only then Server Action writes draft/staging
  -> separate human action to publish / apply redirects / set money
```

| Action | Who | Agent may do alone? |
|---|---|---|
| Propose copy / price / WP map / WhatsApp draft | Agent | yes |
| Write draft product non-money fields | Admin after approve | no |
| Set `platform_percent` / `coupon_price_ils` | Admin form | no |
| Publish product | Admin publish gate | no |
| Apply SEO redirects to live | Admin / MCP migration | no |
| Refund / redeem / payout | Existing money paths | no |
| Support ticket create | Agent | yes (escalation) |

`approval_required=true` by default on all write-shaped agents.

---

## 11. Acceptance checklist

- [ ] All five agents documented with Hebrew prompt templates
- [ ] Claude API only via server; keys never in client
- [ ] Support tools are RLS-scoped to caller
- [ ] No production money/publish/redirect writes without human approval
- [ ] Coupon copy: paid in full on site; no Escrow; `platform_percent` snapshot-aware
- [ ] Costs tracked in `cost_agorot`; caps + kill switch
- [ ] Eval golden sets defined for each agent
- [ ] WP path includes R2 media + `seo_redirects` drafts

---

## 12. Open questions

| ID | Question |
|---|---|
| Q-AI-MIG | Migration ordinal for `agent_*` tables |
| Q-AI-MODEL | Exact Claude model SKUs per agent |
| Q-AI-SCRAPE | Allowlisted IL deal sites + legal review |
| Q-AI-WA-INGEST | Manual paste only vs WhatsApp Business webhook later |

---

## 13. Related

`docs/ARCHITECTURE-WP-MIGRATION.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-CUSTOMER-SUPPORT.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.
