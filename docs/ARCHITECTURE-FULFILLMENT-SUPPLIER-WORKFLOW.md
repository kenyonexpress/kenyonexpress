# ארכיטקטורה: fulfillment וזרימת ספק

מימוש לאחר תשלום: הודעות לספק, משלוח פיזי, מסירת קופון, מכונת סטטוסים. **No Escrow**: payout לפי T+N, לא לפי delivery.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. קופון: 100% מקדמה לפלטפורמה. פיזי: פיצול ב-settle; payout T+N (לא delivery release).

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
```

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| F1 | Trigger: `payment_settled` (order `paid`) → fulfillment start. |
| F2 | קופון: issue voucher (QR); יתרה בעסק; **אין** payout לספק. |
| F3 | פיזי: notify supplier; ship workflow; split כבר ב-settle. |
| F4 | `platform_percent` מצולם; לא live product ב-UI fulfillment. |
| F5 | **No Escrow:** delivery משנה סטטוס בלבד; **לא** משחרר כסף. |
| F6 | Payout eligibility: T+N + shipped (PAYOUT-MECHANISM); לא `delivered_at` כברירת מחדל. |
| F7 | מייל לספק על מכירת קופון: **default off**. |
| F8 | tracking חובה על `shipped` (ברירת מחדל). |
| F9 | refunds: admin-gated; `requireRecentAuth`. |
| F10 | כסף: agorot integer; snapshots בלבד. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow released on delivery | סותר No Escrow; T+N קנוני |
| payout tied to `delivered_at` | Q-FUL-PAYOUT-GATE; default no |
| supplier self-approve refund | fraud |
| notify supplier על כל coupon sale | noise; default off |
| חישוב commission מ-product חי | snapshot בלבד |
| KenyonExpress כ-MoR למשלוח | ספק ממלא; לא KE |

---

## 2. סכמת DB (קיים / יעד; אין DDL חדש)

| ישות | תפקיד |
|---|---|
| `orders` | `status`, `paid_at` |
| `order_items` | snapshot money; `supplier_id`; `product_type` |
| `vouchers` | קופון post-settle |
| `shipments` | tracking, carrier, `fulfillment_status` |
| `notifications_outbox` | Resend + in-app |
| `settlement_events` | כבר ב-settle; לא ב-delivery |

אין טבלאות Escrow / release. אין DDL חדש במסמך זה.

---

## 3. Trigger: payment settled

```text
payment_settled (order.status = paid)
  ├─ coupon lines  → issue vouchers → customer delivery
  ├─ physical lines → supplier_new_order per supplier_id
  ├─ settlement_events (already at settle)
  └─ customer payment_settled email
```

---

## 4. הודעות לספק

| ערוץ | מתי |
|---|---|
| Email (Resend) | פיזי: owner/manager |
| In-app | אופציונלי |
| Ntfy | ops/fraud בלבד |

תוכן: snapshot money; **לא** "יתרת קופון מ-KE".

---

## 5. מסכי פורטל

| Route | תפקיד |
|---|---|
| `/supplier/orders` | רשימה + פילטרים |
| `/supplier/orders/[id]` | פירוט + actions |
| `/supplier/scan` | redeem (מסמך נפרד) |

RLS: `supplier_id` ∈ memberships.

---

## 6. מכונת סטטוס (פיזי)

```text
pending_fulfillment → processing → shipped → delivered
                                              ↓
                                    refund_requested → refund_approved → refunded
```

קופון: `issued` → `redeemed` / `expired` / `refunded`. אין `shipped`.

---

## 7. mark shipped

```json
{
  "order_id": "uuid",
  "tracking_url": "https://...",
  "tracking_code": "optional",
  "carrier": "optional"
}
```

→ `shipped` + customer notification + audit.

---

## 8. מקרי קצה

| מקרה | התנהגות |
|---|---|
| paid בלי webhook replay | idempotent finalize |
| ship בלי tracking (policy required) | reject action |
| delivered לפני shipped | reject / admin fix |
| refund mid-ship | freeze ship actions |
| partial physical + coupon order | split notifications |
| supplier suspended after paid | fulfill existing; no new publish |
| outbox lag | ntfy ops; retry |
| coupon PDF crawlable token | link to account; not raw token in email |
| multi-supplier order | fanout per supplier_id |
| carrier webhook delivered | status only; no payout trigger |

---

## 9. Acceptance

- [ ] פיזי paid → email לספק עם snapshot
- [ ] mark shipped + tracking
- [ ] קופון: account QR; no Escrow language
- [ ] delivery לא משחרר payout
- [ ] refunds admin-gated

---

## 10. פתוחות

| ID | שאלה | ברירת מחדל |
|---|---|---|
| Q-FUL-PAYOUT-GATE | payout לפי delivered? | **לא** |
| Q-FUL-TRACK | tracking חובה? | **כן** |
| Q-FUL-COUPON-MAIL | email על מכירת קופון? | **לא** |
| Q-FUL-PDF | PDF library | v2 |

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-28 | Fulfillment binding |
| 2026-07-31 | No Escrow coupon language |
| 2026-08-12 | batch-2: עברית RTL; BINDING template; חמשת סעיפי חובה |
