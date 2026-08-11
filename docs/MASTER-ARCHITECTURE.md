# Master Architecture (מקור הכרעות)

**Pointer:** מסמך האב ההיסטורי קוצר. הכרעות כסף ודומיין:

```
docs/MASTER-ARCHITECTURE-v2.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-DOCS-INDEX.md
```

Status: **BINDING (pointer)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
No Escrow; `platform_percent` NOT NULL no default; agorot.

**בוטלו (לא ליישם):** nullable `platform_percent` + fallback; `suppliers.commission_percent` as checkout default.

---

## החלטה

| # | הכרעה |
|---|---|
| MA1 | סדר סמכות: CONTRADICTIONS (כסף) → SECURITY → LEGAL → domain `ARCHITECTURE-*`. |
| MA2 | כל מסמך חי ב-`docs/` בלבד; קונבנציה `ARCHITECTURE-<TOPIC>.md`. |
| MA3 | כסף: agorot int; snapshot `order_items`; No Escrow on coupons. |
| MA4 | מיגרציות: רצף `supabase/migrations/`; idempotent; MCP prod. |
| MA5 | דומיינים: COMMERCE, SUPPLIER-REDEMPTION, LEGAL, TESTING-CICD, etc. (ראה INDEX). |
| MA6 | WP migration: ARCHITECTURE-WP-* ; לא duplicate repos. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| platform_percent nullable + fallback | C1/C2 |
| supplier default commission in checkout | MA1 |
| side-folder architecture docs | MA2 |
| Escrow held until redeem | C11א |

---

## סכמת DB

אין DDL במסמך pointer. מיגרציות ליבה: 026 commerce, 027 redemption, 050 percent NOT NULL, 041 suppliers.

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | doc vs code drift | GAPS-CODE-VS-DOCS |
| CE2 | two masters conflict | v2 + CONTRADICTIONS |
| CE3 | migration number gap | update INDEX |
| CE4 | numeric(12,2) vs agorot | COMMERCE open |
| CE5 | revoked decision still cited | this pointer |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | full v3 body archive (git history) |
| O2 | 036-041 planned migrations status |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING pointer; mega dump retired |
