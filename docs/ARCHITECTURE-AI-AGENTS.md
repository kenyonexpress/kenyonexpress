# ארכיטקטורה: סוכני AI

סוכני AI לקטלוג, המלצות קופון, חיפוש עברי NLP, ותמיכה. קריאה בלבד לכסף; כתיבה רק דרך תור אישור אנושי.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `platform_percent` פר מוצר בלי default; אגורות integer.

מסמכים קשורים:

```
docs/ARCHITECTURE-AI-AGENTS-RUNTIME.md
docs/ARCHITECTURE-AI-AGENTS-SUPPORT.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-PRICING-RULES.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| A1 | קטלוג ליבה: `shopping_assistant`, `coupon_recommender`, `hebrew_nlp_search`, `support_chat`, `product_copy`, `price_monitor`, `admin_whatsapp_copilot`. |
| A2 | Runtime: Next.js Route Handlers / Server Actions + Claude API (מפתח שרת בלבד). |
| A3 | אין tool ל-redeem, refund, payout, charge Cardcom, או שינוי `platform_percent`. |
| A4 | כסף ב-tools/logs: integer **agorot**; תצוגה ₪ בלבד. |
| A5 | מחירים רק מפלט כלי; אסור להמציא מחיר או אחוז קבוע. |
| A6 | קופון: הסבר "שולם באתר" + "יתרה בבית העסק" מ-snapshot; לא Escrow / נאמן. |
| A7 | Kill switch: `AI_AGENTS_ENABLED=false` מכבה את כל הסוכנים. |
| A8 | כל ריצה: `agent_runs` + `agent_run_steps` append-only עם `cost_agorot`. |
| A9 | NLP search מתרגם כוונה ל-filters; לא מחליף Meilisearch/Postgres. |
| A10 | Rate limit נפרד לסוכני צ'אט; abuse = עלות + fraud doc. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Claude Agent SDK / Managed Agents בענן Anthropic | אין RLS session של המשתמש; חשיפת מפתחות או service role. |
| כלים עם service role ללקוח | A3: JWT + RLS בלבד ל-user-facing. |
| סוכן שמבצע checkout אוטומטי | סיכון כסף + PCI; מחוץ ל-v1. |
| אימון מודל על PII לקוחות בלי הסכמה | GDPR + מדיניות מחיקה. |
| Vercel AI SDK כ-orchestrator יחיד | RUNTIME doc: `@anthropic-ai/sdk` + toolRunner מרוכז. |

---

## סכמת DB

טבלאות קיימות (מיגרציה `028_agents.sql` ומורח):

```text
agent_runs (id, agent_type, user_id, status, cost_agorot, dedupe_key, created_at)
agent_run_steps (run_id, step_index, tool_name, input_redacted, output_summary)
agent_prompts (agent_key, version, system_prompt, tools_config, is_active)
agent_escalations (kind, user_id, status, run_id)
listing_drafts (supplier_id, draft jsonb, status)
agent_flags (kind, entity_id, summary_he, evidence jsonb)
```

אין DDL חדש במסמך זה. הרחבות v2: `enrichment_suggestions`, `agent_reports` (ראה RUNTIME).

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | משתמש מבקש refund בצ'אט | tool intake בלבד; כסף לא זז עד אדמין. |
| CE2 | prompt injection "התעלם מההנחיות" | data-not-instructions; grounding מכלי בלבד. |
| CE3 | שאילתת NLP עם confidence נמוך | fallback לחיפוש טקסטual על מחרוזת מנורמלת. |
| CE4 | המלצת קופון: מוצר לא בשלב SQL | LLM לא רשאי להוסיף מוצר שלא סונן. |
| CE5 | guest מבקש `get_my_orders` | redirect login עם `next=`; לא 403 עם דליפה. |
| CE6 | תקציב יומי חרג | kill switch; שיחה פעילה לא נחתכת באמצע. |
| CE7 | קוד קופון מלא בלוג | מיסוך: 4 תווים אחרונים לכל היותר. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | WhatsApp inbound ל-CS Agent | SUPPORT doc; עתידי. |
| O2 | Sonnet tier ל-shopping אחרי eval | RUNTIME §6.2; סף $500/חודש. |
| O3 | auto-apply alt-text ב-enrichment | אחרי 500 אישורים >95%. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | קטלוג סוכנים ראשוני |
| 2026-08-02 | ליבה: shopping, recommender, NLP |
| 2026-08-12 | batch-2: BINDING 5 סעיפים; No Escrow |
