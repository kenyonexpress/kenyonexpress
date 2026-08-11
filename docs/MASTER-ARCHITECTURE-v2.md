# Master Architecture v2

אינדקס BINDING business-model-first. פירוט דומיין:

```
docs/ARCHITECTURE-DOCS-INDEX.md
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
```

Status: **BINDING (index + money)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
סעיף 1 דורס בסתירות כסף.

---

## החלטה

| # | הכרעה |
|---|---|
| MV1 | קופון: `coupon_price` מוחלט; prepaid באתר **100% לפלטפורמה**; יתרה בעסק; **No Escrow**. |
| MV2 | פיזי: 100% באתר; `platform_percent` **חובה פר מוצר**, snapshot; payout T+N. |
| MV3 | Guest cart; Google OAuth at pay; wallet internal only. |
| MV4 | Notifications: Resend + triggers (WhatsApp P2). |
| MV5 | סדר סמכות: §1 כאן → security/legal → domain docs. |
| MV6 | agorot everywhere; `src/lib/money.ts`. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| Escrow/J5/held to supplier | C11א |
| global 5%/10% percent | C1 |
| Make/Zapier notifications | MV4 |
| float money | MV6 |

---

## סכמת DB

Core tables:

```text
products, order_items (snapshots), orders, payments, vouchers
settlement_events, wallet_ledger
profiles, suppliers
```

050: platform_percent NOT NULL NO DEFAULT.

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | unredeemed expiry | wallet credit C6 |
| CE2 | percent missing at publish | blocked |
| CE3 | physical payout before G1 | manual only |
| CE4 | doc queue vs ke-arch | worktree rule |
| CE5 | subscription recurring fail | retry policy |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | align all STALE refs (done 08-06) |
| O2 | packages/money monorepo |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 sections |
