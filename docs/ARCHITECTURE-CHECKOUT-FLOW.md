# ארכיטקטורה: זרימת Checkout

מכונת מצבי הזמנה, snapshot של `platform_percent`, מסלולי קופון/פיזי (No Escrow), סליקת Cardcom, QStash, מיזוג עגלת אורח, תרחישי כשל, ו-ERD.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/CARDCOM-ARCHITECTURE.md
docs/CHECKOUT-OPTIMIZATION.md
docs/GUEST-VS-MEMBER-STRATEGY.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/PAYOUT-ARCHITECTURE.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-API-CONTRACTS.md
docs/INCIDENT-PLAYBOOKS.md
docs/GAPS-CODE-VS-DOCS.md
```

מודל כסף מחייב: **No Escrow** (C11א). קופון: כל תשלום האתר לפלטפורמה; יתרה בבית העסק. פיזי: חיוב מלא + פיצול ledger לפי snapshot של `platform_percent`. סכומים פנימיים באגורות integer; תצוגה ₪.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| CF1 | מקור אמת לתשלום = `GetLpResult` (או מקביל legacy Interface). Return URL ו-webhook הם טריגר/UI בלבד. |
| CF2 | `CHECKOUT_ENABLED=false` חוסם יצירת חיובים חדשים; finalize של חיובים שכבר הצליחו ממשיך. |
| CF3 | אין אחסון PAN/CVV. SAQ-A בלבד דרך Low Profile. |
| CF4 | `platform_percent` (+ `supplier_split_percent`) מצולמים ל-`order_items` ברכישה; שינוי במוצר לא משנה הזמנות ישנות (C10, P7). |
| CF5 | קופון: `supplier_due` / payout מהפלטפורמה = 0. אין held / J5 / נאמן. |
| CF6 | פיזי: פיצול ledger מיידי ב-finalize; payout בנקאי נפרד (T+3, מינימום). |
| CF7 | שמות סטטוס ב-DB לפי enum חי (`007`); תוויות מוצר (`draft` / `pending_payment` / `expired`) ממופות בסעיף 1.1. |
| CF8 | Webhook Cardcom: ack מהיר + עיבוד כבד ב-QStash (או waitUntil); idempotency על LowProfileId. |
| CF9 | לפני LP לקופון: זהות חובה; מיזוג עגלת אורח אחרי login דרך `fn_merge_guest_cart`. |
| CF10 | אגורות integer בכל חישוב כסף פנימי; Cardcom מקבל סכום בשקלים עשרוניים מאותו מספר. |

---

## 1. מכונת מצבי הזמנה

### 1.1 מיפוי תוויות מוצר ↔ enum סכמה

אודיט READ-ONLY: `supabase/migrations/007_orders_schema.sql` (מחליף את enum של `001`).

```text
public.order_status =
  pending | paid | partially_fulfilled | fulfilled | cancelled | refunded
```

ברירת מחדל בעמודה: `pending`.

| תווית במפרט מוצר | ערך ב-DB (`order_status`) | הערה |
|---|---|---|
| `draft` | **אין ערך** | שלב לפני INSERT להזמנה (עגלה / validateCart). |
| `pending_payment` | `pending` | הזמנה נוצרה; ממתין ל-Cardcom / finalize. |
| `paid` | `paid` | אחרי GetLpResult מוצלח + finalize אטומי. |
| `fulfilled` | `fulfilled` | כל השורות במצב סופי לפי מדיניות. |
| (ביניים) | `partially_fulfilled` | חלק מפריטי פיזי התקדמו. |
| `expired` | `cancelled` | אין `expired` ב-enum; פקיעת `expires_at` → `cancelled`. |
| `refunded` | `refunded` | אחרי מסלול החזר + אישור Cardcom. |

`order_item_status` (007):

```text
pending | issued | shipped | delivered | cancelled | refunded
```

מכונת תשלום:

```text
initiated → redirected → succeeded | failed | cancelled
succeeded → refunded (אחרי שורת refund מאושרת)
```

### 1.2 דיאגרמת מעברים (order)

```text
[cart / draft לוגי]
        │ submitCheckout (שרת)
        ▼
     pending  ──(expires_at / ביטול לפני תשלום)──► cancelled
        │
        │ GetLpResult OK + finalize
        ▼
       paid ──(חלק פיזי)──► partially_fulfilled ──(הכל סופי)──► fulfilled
        │                         │                              │
        └─────────────┬───────────┴──────────────────────────────┘
                      │ refund path + Cardcom confirm
                      ▼
                   refunded
```

### 1.3 טבלת מעברים מלאה

| מ | אל | טריגר | מי | Idempotency | אסור |
|---|---|---|---|---|---|
| (אין שורה) | `pending` | `submitCheckout` אחרי validate + זהות (+ כתובת אם פיזי) | Next server | מפתח payment; לא LP כפול לאותו attempt | יצירה כש-`CHECKOUT_ENABLED=false`; סימון `paid` כאן |
| `pending` | `paid` | GetLpResult OK + finalize | webhook / return / cron / QStash worker | UNIQUE tx id / LP id; UPDATE רק מ-`pending` | paid מ-query string בלבד |
| `pending` | `cancelled` | `expires_at` או ביטול לפני חיוב | cron / server | UPDATE … WHERE `pending` | ביטול אחרי `paid` בלי refund |
| `pending` | (payment failed) | דחייה Cardcom אחרי אימות | שרת | payment→`failed`; order נשאר `pending` עד expiry | order=`refunded` בלי חיוב |
| `paid` | `partially_fulfilled` | חלק פריטי פיזי התקדמו | server / supplier | אגרגציית `item_status` | דילוג ל-refunded בלי Cardcom |
| `paid` / partial | `fulfilled` | כל השורות טרמינליות | server | אגרגציה דטרמיניסטית | `fulfilled`→`pending` |
| `paid` / partial / `fulfilled` | `refunded` | REFUNDS + Cardcom confirm | admin / legal | מפתח refund יציב | refund מ-`cancelled` בלי payment |
| אחר | * | אין | אין | אין | מעבר לא חוקי |

מעברים אסורים לטסטים: `paid`/`fulfilled`/`refunded`→`pending`; `cancelled`→`paid`; `refunded`→כל מצב; `paid` בלי GetLpResult.

---

## 2. Snapshot של `platform_percent` על `order_items`

### 2.1 למה

C10 / P7: אחרי רכישה האחוזים והסכומים על השורה קבועים. שינוי באדמין חל רק על הזמנות עתידיות. דוחות/payout/refund מול מה שנקנה.

### 2.2 איך

ב-`submitCheckout`, לפני redirect:

| שדה | מקור |
|---|---|
| `platform_percent` | `products.platform_percent` (חובה; אין default) |
| `supplier_split_percent` | משלים ל-100 |
| `charged_on_site_*` | קופון: `coupon_price`; פיזי: מחיר מלא (אגורות) |
| `platform_fee_*` | קופון: = on-site; פיזי: אחוז מהחיוב |
| `supplier_due_*` | קופון: **0**; פיזי: charged - fee |
| `balance_due_at_business_*` | קופון: face - coupon; פיזי: 0 |

Finalize לא קורא מחדש למוצר החי לפיצול כסף.

### 2.3 שינוי אחוז אחרי רכישה

הזמנות ישנות לא מתעדכנות. הזמנת `pending` עם LP פתוח לא מרעננת אחוז (מונע amount_mismatch).

---

## 3. קופון: No Escrow

| כלל | פירוט |
|---|---|
| חיוב | `coupon_price` באגורות → Cardcom |
| כסף באתר | **100% לפלטפורמה** |
| יתרה | face - coupon בבית העסק |
| Payout | **0** לספק מהפלטפורמה |
| אסור | Escrow, J5, held, נאמן |

DB מינימום: order/items snapshots, payment, vouchers `issued`, ledger platform בלבד, redemption ללא payout.

פירוט מימוש:
`docs/ARCHITECTURE-COUPON-LIFECYCLE.md`
,
`docs/ARCHITECTURE-COUPON-REDEMPTION.md`.

---

## 4. פיזי: פיצול מיידי + הודעה לספק

```text
platform_fee = round(charged * platform_percent_snapshot / 100)
supplier_due = charged - platform_fee
```

Finalize: order `paid` + ledger payable + settlement event; **אין** העברה בנקאית מיידית. Outbox: `order_paid`, `supplier_sale`.

---

## 5. Cardcom + webhook + QStash + idempotency

### 5.1 Low Profile

1. `CHECKOUT_ENABLED`  
2. validateCart + order `pending` + snapshots  
3. payment `initiated`  
4. Low Profile Create (legacy Interface בקוד חי; v11 במחקר)  
5. `ReturnValue` = מזהה פנימי  
6. IndicatorUrl עם `?s=<secret>`  
7. שמירת LowProfileId → `redirected` → redirect  

Operation: ChargeOnly / Do3DS. **J5 אסור**.

### 5.2 מקור אמת

| ערוץ | תפקיד |
|---|---|
| Return URL | UI בלבד |
| IndicatorUrl | טריגר; אין HMAC על הגוף |
| `GetLpResult` | **מקור האמת היחיד** |

### 5.3 Webhook → QStash → finalize

```text
Cardcom POST IndicatorUrl
  → בדוק ?s=<secret>
  → חלץ LowProfileId
  → INSERT payment_webhook_events ON CONFLICT DO NOTHING
  → אם שורה חדשה: publish QStash job { lowProfileId, attempt }
  → החזר 200 מיד (< שניות)

QStash worker /api/jobs/cardcom-finalize
  → GetLpResult
  → התאם סכום (אגורות↔ILS) ומזהה הזמנה
  → BEGIN finalize אטומי (paid / failed)
  → COMMIT
  → כשל 5xx → QStash retry (max N, backoff)
  → אחרי max → DLQ + Sentry P1
```

| מנגנון | כלל |
|---|---|
| Dedupe webhook | UNIQUE על LowProfileId (או provider+external_id) |
| Dedupe finalize | UPDATE order WHERE status=`pending`; UNIQUE cardcom_transaction_id |
| QStash | חתימת Upstash על ה-job; `dedupe_id` = `cardcom-finalize:{lpId}` |
| בלי QStash (גשר) | `waitUntil` / עיבוד inline קצר; אותו חוזה idempotency |
| Return לפני webhook | אותה GetLpResult + finalize; QStash כפול = no-op |
| Cron | intents `redirected` מעל 5 דק׳ → GetLpResult; מעל שעה → expire path |

### 5.4 Finalize → paid

טרנזקציה אחת: payment succeeded, order paid, vouchers / ledger פיזי, wallet spend/cashback, outbox, ניקוי עגלה.

### 5.5 Refund / secrets / PAN

מצביע:
`docs/ARCHITECTURE-REFUNDS-DISPUTES.md`.
Secrets: Terminal, ApiName, ApiPassword (זיכויים בלבד), WEBHOOK_SECRET, `CHECKOUT_ENABLED`. אין PAN/CVV.

---

## 6. מיזוג עגלת אורח (Guest Cart)

| כלל | פירוט |
|---|---|
| מזהה אורח | cookie `ke_cart_sid` (httpOnly, 30d) |
| לפני login | עגלה ב-`carts.session_id`; בלי מחירים קבועים |
| אחרי login | RPC `fn_merge_guest_cart(p_session_id)` עם advisory lock |
| כמויות | union שורות; אותן product/variant → סכימה (cap 99) |
| מחיר | תמיד מהמוצר החי בקופה, לא מזיכרון אורח |
| מלאי לא תקין | drop / clamp; לא חוסם login |
| Idempotency | מחיקת עגלת האורח באותה TX; replay = no-op |
| קופון | לפני LP: חשבון חובה (G3 ב-GUEST-VS-MEMBER) |

יעד חוזה:
`docs/ARCHITECTURE-API-CONTRACTS.md`
(C3). אין מיזוג מלקוח עם userId זר.

```text
guest browse → addToCart (session)
  → login / OAuth callback
  → fn_merge_guest_cart
  → validateCart
  → submitCheckout → Cardcom
```

---

## 7. תרחישי כשל

| קוד | סימפטום | פעולה |
|---|---|---|
| `checkout_disabled` | `CHECKOUT_ENABLED=false` | באנר; אין LP |
| `cart_invalid` | מחיר/מלאי השתנו | רענון עגלה; אין LP |
| `auth_required` | אורח לפני קופון | מסך התחברות; עגלה נשמרת |
| `merge_failed` | RPC מיזוג נכשל | לוג security_events; לא חוסם session; עגלה משתמש נשארת |
| `lp_create_failed` | Cardcom/env | "נסו שוב"; order cancellable |
| `user_cancel` / `3ds_fail` | FailedRedirect | חזרה לcheckout; LP חדש |
| `amount_mismatch` | GetLpResult ≠ order | **לא** paid; alert P1 |
| `webhook_dup` | retry Cardcom | no-op אחרי UNIQUE |
| `qstash_fail` | job לא רץ | cron reconcile + DLQ |
| `lp_pending` | return בלי תוצאה | poll GetLpResult; מסך "בודקים תשלום" |
| `paid_no_voucher` | paid בלי הנפקה | reconcile / תמיכה |
| `cardcom_down` | timeouts | kill switch + INCIDENT |

אסור: לסמן paid מ-return בלבד. Retry לא יוצר חיוב כפול (LP חדש רק אחרי failed/cancel מפורש).

פירוט משפך:
`docs/CHECKOUT-OPTIMIZATION.md`.

---

## 8. ERD (ישויות checkout)

```text
profiles (user)
    │ 1
    │
    ├──< carts >──< cart_items >── products
    │                 session_id (guest) | profile_id (user)
    │
    └──< orders >──< order_items >── products
              │         │  snapshots: platform_percent, fees, balance_due
              │         │
              │         └──< vouchers / coupon_codes  (coupon lines)
              │
              ├──< payments >── payment_webhook_events
              │        │
              │        └── cardcom_low_profile_id / transaction_id
              │
              ├── wallet_transactions (spend / cashback; agorot)
              │
              └── settlement_events / ledger (physical supplier_due)

QStash jobs (external): cardcom-finalize:{lowProfileId}
notification_outbox: order_paid, supplier_sale, …
```

יחסים מחייבים:

1. `order_items` נכתבים עם snapshot לפני LP.  
2. `payments` append-oriented; refund = שורה חדשה.  
3. voucher נוצר רק אחרי `paid`.  
4. אין טבלת escrow פעילה למודל קופון.

---

## 9. זרימה מקצה לקצה

```text
עגלת אורח (אופציונלי) → login + merge
  → validateCart
  → submitCheckout → pending + snapshots + LP
  → Cardcom
  → IndicatorUrl → QStash → GetLpResult → finalize paid
  → vouchers | ledger פיזי + התראות
  → fulfilled / cancelled / refunded
```

---

## 10. Acceptance

- [ ] טבלת מעברי order עם idempotency ומעברים אסורים  
- [ ] מיפוי draft / pending_payment / expired מול enum 007  
- [ ] Snapshot platform_percent; שינוי מוצר לא רטרואקטיבי  
- [ ] קופון No Escrow; פיזי split + payout נפרד  
- [ ] GetLpResult מקור אמת; QStash + UNIQUE webhook  
- [ ] Guest cart merge עם advisory lock מתועד  
- [ ] טבלת כשלים כוללת amount_mismatch ו-qstash_fail  
- [ ] ERD כולל orders/payments/items/vouchers/outbox  

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING ראשון: state machine, snapshot, Cardcom |
| 2026-08-12 | הרחבה: QStash, guest merge, failures, ERD, agorot |
