# Master Architecture v2 (אינדקס BINDING)

אינדקס business-model-first. **No Escrow.** פירוט ב-docs/.

Status: **BINDING (index + money)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
סעיף כסף דורס בסתירות. אין שינוי קוד.

**מקור קנוני:**

```
docs/MASTER-ARCHITECTURE-v2.md
docs/ARCHITECTURE-MONEY.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-DOCS-INDEX.md
docs/CONTRADICTIONS.md
```

Dump v2 (500+ שורות, כולל Escrow ישן): git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| MV1 | קופון: `coupon_price` מוחלט; prepaid **100% לפלטפורמה**; יתרה בעסק; **No Escrow**. |
| MV2 | פיזי: 100% באתר; `platform_percent` חובה פר מוצר, snapshot; payout T+N. |
| MV3 | Guest cart; Google OAuth at pay; wallet internal only. |
| MV4 | agorot everywhere; `src/lib/money.ts`. |
| MV5 | סדר סמכות: §כסף כאן + MONEY → security/legal → domain docs. |
| MV6 | root = מצביע; תוכן מלא ב-docs/MASTER-ARCHITECTURE-v2. |

---

## חלופות שנדחו

| חלופה | למה |
|---|---|
| Escrow/J5/held to supplier | No Escrow; CONTRADICTIONS C11א. |
| global 5%/10% percent | C1 per product. |
| root v2 mega dump | docs/ קנוני. |
| Make/Zapier notifications | Resend + triggers. |
| float money | MV4 agorot. |

---

## סכמת DB

Core (050: platform_percent NOT NULL NO DEFAULT):

```text
products, order_items (snapshots), orders, payments, vouchers
settlement_events, wallet_ledger, profiles, suppliers
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה |
|---|---|
| CE1 | unredeemed expiry | wallet credit C6 |
| CE2 | percent missing at publish | blocked |
| CE3 | physical payout before policy | manual only |
| CE4 | doc queue vs ke-arch | worktree ke-arch |
| CE5 | subscription recurring fail | retry policy |

---

## פתוחות

| # | פתוח |
|---|---|
| O1 | align STALE refs | docs batch |
| O2 | packages/money monorepo |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-24 | v2 dump root |
| 2026-08-12 | batch-2: BINDING index; No Escrow |
