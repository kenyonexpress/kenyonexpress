# מפרט תבניות Resend

מיפוי `kind` → מבנה טכני + RTL. נוסחים: `EMAIL-TEMPLATES-COPY.md`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
סכומים: agorot בשרת → ₪ בתצוגה; **No Escrow** בנוסח.

מסמכים קשורים:

```
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/EMAIL-TEMPLATES-COPY.md
docs/COUPON-LIFECYCLE-SPEC.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| T1 | `lang="he"`, `dir="rtl"`, פס `#fed700`, Arial/Heebo. |
| T2 | סכומים ב-`<bdi dir="ltr">`; plaintext חובה. |
| T3 | CTA יחיד; escape משתנים. |
| T4 | אסור: QR `data:` URI; Escrow/held/J5. |
| T5 | Idempotency `(kind, entity_id)`; webhook Resend. |
| T6 | `unsubscribe_url` רק marketing. |

Kinds: `order_paid`, `coupon_issued`, `coupon_expiry_48h`, `coupon_redeemed`, `coupon_expired`, `coupon_refunded`, `wallet_activity`, `abandoned_cart`, `supplier_sale`, `welcome`.

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| HTML בלי plaintext | deliverability |
| Escrow ב-supplier_sale | T4 |
| unsubscribe בטרנזקציוני | T6 |
| float בסכומים | agorot |

---

## סכמת DB

```text
notification_deliveries
  kind, entity_id, status, resend_message_id
  idempotency unique (kind, entity_id)
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | שליחה כפולה | idempotency |
| CE2 | bounce marketing | השבת marketing |
| CE3 | bounce transactional | לוג בלבד |
| CE4 | first_name ריק | "שלום" |
| CE5 | supplier_sale קופון | יתרה בעסק; בלי payout |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | Preview Resend D0 | QA |
| O2 | WhatsApp parallel | WHATSAPP-COMMERCE |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
