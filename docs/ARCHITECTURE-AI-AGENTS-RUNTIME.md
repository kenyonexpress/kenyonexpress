# ארכיטקטורה: Runtime סוכני AI

פלטפורמת הרצה: SDK, transport, כלים, תקציבים, סדר השקה. מעמיק את `ARCHITECTURE-AI-AGENTS.md`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; כתיבת כסף אסורה לכל סוכן.

מסמכים קשורים:

```
docs/ARCHITECTURE-AI-AGENTS.md
docs/ARCHITECTURE-API-CONTRACTS.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/MASTER-ARCHITECTURE.md
```

קוד יישום ישן (dump): git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| R1 | SDK: `@anthropic-ai/sdk` + `client.beta.messages.toolRunner` + `betaZodTool`. |
| R2 | מודל ברירת מחדל: `claude-opus-4-8`; enrichment: Batch API + הנחת 50%. |
| R3 | Transport: `shopping`/`support` = SSE; `supplier_ops` = Server Action; cron ל-fraud/pricing/enrichment. |
| R4 | כלים = עטיפה דקה של RPC/RLS מ-API contracts; Zod מ-`src/contracts/agents.ts`. |
| R5 | 6 סוכנים: `shopping`, `support`, `supplier_ops`, `catalog_enrichment`, `pricing_analyst`, `fraud_watch`. |
| R6 | אף סוכן לא כותב כסף / publish / block; תוצר → תור אישור (`agent_escalations`, `listing_drafts`, `enrichment_suggestions`, `agent_reports`, `agent_flags`). |
| R7 | prompt caching: system+tools קבועים עם `cache_control: ephemeral` (TTL 5 דק'). |
| R8 | kill switch דו-שלבי: soft 1.5x תקציב → התראה; hard 3x → `is_active=false`. |
| R9 | סדר השקה: 1) enrichment 2) support 3) shopping 4) supplier_ops 5) fraud 6) pricing. |
| R10 | eval harness ב-CI; שערי 5.3 ירוקים לפני הפעלת prompt חדש. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Claude Agent SDK (filesystem/bash) | כלים מיותרים; סיכון אבטחה. |
| Managed Agents בענן Anthropic | אין session RLS של המשתמש. |
| BFF נפרד לסוכנים | כפילות auth; Next.js RH מספיק. |
| לולאת כלים ידנית | toolRunner עם hooks + streaming. |
| Sonnet לכל הסוכנים מיום 1 | איכות עברית; downgrade רק אחרי eval. |

---

## סכמת DB

קיים + מתוכנן (`039_agents_v2.sql`):

```text
agent_runs, agent_run_steps, agent_prompts, agent_escalations,
listing_drafts, agent_flags
enrichment_suggestions (product_id, run_id, suggestion jsonb, status)
agent_reports (agent_key, period, report_md, recommendations jsonb)
fn_agent_open_refund_intake (definer, חלון 14 יום)
v_agent_costs_daily (view עלויות)
```

DDL חדש: WO-2 במיגרציה 039 (מתוכנן, לא מוחל עד אישור prod).

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | כלי נכשל פעמיים ב-support | escalation אוטומטי + "מעביר לנציג". |
| CE2 | refund מחוץ ל-14 יום | `EXPIRED`; הסבר חוקי; לא הבטחת החזר. |
| CE3 | batch enrichment: תוצאה פגה | מוצר חוזר לתור; אחרי 3 כישלונות → flag. |
| CE4 | fraud_watch: 0 מועמדות | 0 קריאות LLM (עלות אפס). |
| CE5 | pricing_analyst: מספר שלא בקלט SQL | eval נכשל; אין המצאת KPI. |
| CE6 | שיחה פעילה + hard kill | לא נחתכת; חסימה לריצות חדשות בלבד. |
| CE7 | injection בתמונת supplier_ops | data-not-instructions; טיוטה → אישור אדמין. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | מיגרציה 039 על prod | WO-2; ממתין אישור MCP. |
| O2 | TTL cache שעה | רק אם יחס read/write גרוע ב-`v_agent_costs_daily`. |
| O3 | auto-apply alt-text | אחרי 500 אישורים staff. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-17 | Runtime v2.0 טיוטה מלאה |
| 2026-08-12 | batch-2: BINDING קצר; dump קוד → git history |
