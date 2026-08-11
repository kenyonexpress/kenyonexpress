# ארכיטקטורה: קמפיינים עונתיים

חגים ישראליים, flash deals, ראש השנה / פסח.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.  
מודל כסף: **No Escrow**; `platform_percent` admin per product.

מסמכים קשורים:

```
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| SC1 | קמפיין = ישות עם חלון זמן IL + אוסף מוצרים + כללי מחיר/בזק. |
| SC2 | Flash: `flash_price_agorot` או campaign override; snapshot ב-checkout. |
| SC3 | שיווק קמפיין: consent 30א; טרנזקציוני (receipt) לא. |
| SC4 | מלאי/מכסות נאכפים תחת לחץ עונתי. |
| SC5 | קמפיין משנה מחיר תצוגה/קופון באתר; **לא** Escrow; **לא** שינוי `platform_percent` אוטומטי. |
| SC6 | לוח חגים: ראש השנה, פסח, חנוכה, פורים, יום העצמאות, BF (זהירות LEGAL). |
| SC7 | סיום קמפיין: מחיר חוזר ל-live product; לא retroactive orders. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| global 10% off platform fee | SC5: percent per product admin. |
| campaign creates Escrow hold | No Escrow. |
| unlimited flash inventory | SC4: caps. |
| marketing blast without cap | MARKETING M7. |
| Hebrew calendar in UTC only | SC1: Asia/Jerusalem. |

---

## סכמת DB

```text
campaigns (name_he, starts_at, ends_at, timezone, status)
campaign_products (campaign_id, product_id, flash_price_agorot nullable)
products (flash_until, flash_price_agorot)  -- optional inline flash
```

DDL: campaigns tables pending migration. לא db push.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | checkout mid-campaign end | snapshot price at beginCheckout. |
| CE2 | flash sold out | hide CTA / show waitlist. |
| CE3 | BF misleading compare-at | LEGAL block publish. |
| CE4 | campaign + coupon stack | pricing rules precedence doc. |
| CE5 | supplier suspend mid-campaign | unpublish from campaign set. |
| CE6 | clock skew server/client | server IL time authoritative. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | automated Hebrew holiday calendar | iCal feed. |
| O2 | campaign analytics dashboard | ANALYTICS. |
| O3 | multi-supplier co-op campaigns | v2. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | seasonal campaigns QA |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
