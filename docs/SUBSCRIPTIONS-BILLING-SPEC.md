# מפרט מנויים: Cardcom Recurring

מקור מלא: `docs/ARCHITECTURE-SUBSCRIPTIONS.md`

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
agorot; **No Escrow**.

---

## החלטה

| # | הכרעה |
|---|---|
| S1 | `type=subscription`. |
| S2 | agorot; monthly. |
| S3 | Cardcom Recurring Token. |
| S4 | snapshot platform_percent. |
| S5 | idempotency per billing period. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| IAP | out of scope |
| float | agorot |

---

## סכמת DB

```text
subscriptions, subscription_charges
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | double charge period | idempotency |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | UI admin | EDITOR E6 |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
