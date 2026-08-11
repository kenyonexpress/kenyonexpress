# ארכיטקטורה: סוכני AI (מצביע BINDING)

סקירה קצרה לסוכני AI. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; agorot integer; אין tool לכסף.

**מקור קנוני:**

```
docs/ARCHITECTURE-AI-AGENTS.md
docs/ARCHITECTURE-AI-AGENTS-RUNTIME.md
docs/ARCHITECTURE-AI-AGENTS-SUPPORT.md
```

Dump ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| A1 | Runtime: Route Handlers + Claude API; מפתח שרת בלבד. |
| A2 | אין tool ל-redeem, refund, payout, charge, שינוי percent. |
| A3 | כסף ב-tools: agorot; תצוגה ₪ בלבד. |
| A4 | Kill switch: `AI_AGENTS_ENABLED=false`. |
| A5 | audit: `agent_runs` + `agent_run_steps` append-only. |
| A6 | קופון: הסבר "שולם באתר + יתרה בעסק"; לא Escrow. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root mega dump | docs/ קנוני. |
| Agent SDK בענן Anthropic | אין RLS session. |
| service role tools ללקוח | JWT + RLS. |
| checkout אוטומטי מסוכן | מחוץ ל-v1. |
| Escrow terminology ב-prompts | No Escrow. |

---

## סכמת DB

```text
agent_runs, agent_run_steps, agent_prompts
agent_escalations, listing_drafts, agent_flags
```

מיגרציה `028_agents.sql`. אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | refund request בצ'אט | intake בלבד. |
| CE2 | prompt injection | grounding מכלי. |
| CE3 | guest `get_my_orders` | redirect login. |
| CE4 | תקציב יומי חרג | kill switch. |
| CE5 | קוד קופון בלוג | mask 4 chars. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | WhatsApp inbound CS | SUPPORT doc. |
| O2 | Sonnet tier post-eval | RUNTIME. |
| O3 | auto alt-text enrichment | 500 approvals. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | dump root |
| 2026-08-12 | batch-2: BINDING מצביע |
