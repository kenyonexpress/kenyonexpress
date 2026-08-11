# PRODUCTION-CHANGES-2026-07-27 (ארכיון)

**Snapshot היסטורי.** מודל 27.07 Escrow **בוטל**. No Escrow גובר.

Status: **BINDING (ארכיון)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`

פירוט ~714 שורות: git history.

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| P1 | יומן MCP 27-28.07. |
| P2 | 071, 054, 072, 073, 091 applied subset. |
| P3 | לא verbatim 027/054 full. |
| P4 | **No Escrow** נוכחי. |

---

## 2. חלופות שנדחו

Escrow state machine; escrow_held; db push.

---

## 3. סכמת DB

| MCP | result |
|---|---|
| 071 | platform_settled |
| 072 | supplier_members |
| 073 | vouchers |

---

## 4. מקרי קצה

Cardcom+enum; parallel 085 half-applied.

---

## 5. פתוחות

027 rewrite; redeem RPC review.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | ארכיון No Escrow |
