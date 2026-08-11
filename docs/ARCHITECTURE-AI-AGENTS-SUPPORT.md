# ארכיטקטורה: סוכני AI לתמיכה

סוכן שירות לקוחות (CS) + סוכן ספקים: guardrails, כלים, הסלמה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; סוכנים לא מזיזים כסף.

מסמכים קשורים:

```
docs/ARCHITECTURE-AI-AGENTS.md
docs/ARCHITECTURE-AI-AGENTS-RUNTIME.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
docs/ARCHITECTURE-ACCOUNT-AREA.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| S1 | שני סוכנים: **CS Agent** (לקוחות) + **Supplier Agent** (ספקים מאומתים). |
| S2 | שכבת סיוע בלבד: לא גובים, לא משנים `platform_percent`, לא Escrow. |
| S3 | CS tools: read-only על `auth.uid()`; write = ticket / refund intake / handoff. |
| S4 | Supplier tools: redeem help, physical orders, payout summary (פיזי), draft copy. |
| S5 | Forbidden: PAN, `cardcom_token`, raw SQL, adminClient לא מוגבל, wallet transfer. |
| S6 | Handoff: refund מעל סף, הונאה, Cardcom stuck, שינוי עמלות, בקשת "נציג". |
| S7 | Shadow mode שבוע לפני הפעלה: סוכן מציע, אדם מאשר. |
| S8 | Cost cap: tokens/day + `cost_agorot` per turn; hard stop + Ntfy. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| סוכן "אדמין כל-יכול" ללקוח | סיכון RLS + כסף. |
| refund אוטומטי לכרטיס | human-in-the-loop + מדיניות. |
| Make/Zapier כ-orchestrator | NOTIFICATIONS: Resend+Trigger בלבד. |
| WhatsApp כערוץ v1 חובה | עתידי; web chat קודם. |
| הצגת קוד קופון מלא בצ'אט | מיסוך; הפניה ל-`/account/coupons`. |

---

## סכמת DB

```text
support_threads (user_id / supplier_id, status)
support_messages (thread_id, role, content, created_at)
support_tickets (handoff, priority, linked order_id)
agent_tool_invocations (tool_name, args_redacted, latency_ms)
agent_escalations (kind, user_id, status)  -- מ-028
```

אין DDL חדש. RLS: לקוח/ספק רואים רק threads שלהם; אדמין הכל.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | "הצג הזמנות של משתמש אחר" | סירוב; RLS → NOT_FOUND אחיד. |
| CE2 | בקשת PAN/CVV | סירוב; הפניה לתשלום מאובטח. |
| CE3 | "תשחרר Escrow" | הסבר No Escrow; prepaid נשאר בפלטפורמה. |
| CE4 | redeem כפול | tool מחזיר replay; הסבר לספק. |
| CE5 | ספק מבקש שינוי `platform_percent` | handoff; סוכן לא משנה. |
| CE6 | prompt injection בהודעת לקוח | data-not-instructions; המשך רגיל. |
| CE7 | tool timeout פעמיים | escalation אוטומטי עם הקשר. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | WhatsApp Business inbound | spec נפרד; לא v1. |
| O2 | CSAT / thumbs אחרי שיחה | KPI deflection rate. |
| O3 | סף ₪ ל-handoff refund | SUPPORT playbook. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | CS + Supplier agents, allowlists |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
