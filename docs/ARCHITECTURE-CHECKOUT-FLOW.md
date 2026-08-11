# ארכיטקטורה: זרימת Checkout

מכונת מצבי הזמנה, snapshot של `platform_percent`, מסלולי קופון/פיזי (No Escrow), וסליקת Cardcom מקצה לקצה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/CARDCOM-ARCHITECTURE.md
docs/CHECKOUT-OPTIMIZATION.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/PAYOUT-ARCHITECTURE.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/INCIDENT-PLAYBOOKS.md
docs/GAPS-CODE-VS-DOCS.md
```

מודל כסף מחייב: **No Escrow** (C11א). קופון: כל תשלום האתר לפלטפורמה; יתרה בבית העסק. פיזי: חיוב מלא + פיצול ledger לפי snapshot של `platform_percent`.

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

---

## 1. מכונת מצבי הזמנה

### 1.1 מיפוי תוויות מוצר ↔ enum סכמה

אודיט READ-ONLY: `supabase/migrations/007_orders_schema.sql` (מחליף את enum של `001`).

```text
public.order_status =
  pending | paid | partially_fulfilled | fulfilled | cancelled | refunded
```

ברירת מחדל בעמודה: `pending`.

| תווית במפרט מוצר (בקשת המשתמש) | ערך ב-DB (`order_status`) | הערה |
|---|---|---|
| `draft` | **אין ערך** | שלב לפני INSERT להזמנה (עגלה / validateCart). אין `draft` ב-`order_status`. |
| `pending_payment` | `pending` | הזמנה נוצרה; ממתין ל-Cardcom / finalize. |
| `paid` | `paid` | אחרי GetLpResult מוצלח + finalize אטומי. |
| `fulfilled` | `fulfilled` | כל השורות הגיעו למצב סופי (קופון הונפק / פיזי נמסר לפי מדיניות). |
| (ביניים) | `partially_fulfilled` | חלק מהשורות הפיזיות התקדמו; לא בתוויות המקוצרות של המשתמש. |
| `expired` | `cancelled` | אין `expired` ב-enum. פקיעת `expires_at` (cron) → `cancelled`. |
| `refunded` | `refunded` | אחרי מסלול החזר מאושר + אישור Cardcom. |

`order_item_status` (007, נפרד):

```text
pending | issued | shipped | delivered | cancelled | refunded
```

מכונת תשלום (`payment_status` ב-COMMERCE / 026 draft; קוד חי: legacy statuses דומים):

```text
initiated → redirected → succeeded | failed | cancelled
succeeded → refunded (אחרי שורת refund מאושרת)
```

ראה גם:
`docs/ARCHITECTURE-COMMERCE.md`
סעיף 3,
`docs/CARDCOM-ARCHITECTURE.md`
סעיף 4 (payment_intent statuses במחקר).

### 1.2 דיאגרמת מעברים (order)

```text
[cart / draft לוגי]
        │ submitCheckout (שרת)
        ▼
     pending  ──(expires_at / ביטול לפני תשלום)──► cancelled
        │
        │ GetLpResult OK + finalize (webhook או return reconcile)
        ▼
       paid ──(חלק פיזי התקדם)──► partially_fulfilled ──(הכל סופי)──► fulfilled
        │                              │                                  │
        └──────────────┬───────────────┴──────────────────────────────────┘
                       │ admin / legal refund path + Cardcom confirm
                       ▼
                    refunded
```

קופון בלבד: אחרי `paid` הנפקת voucher (`issued`) נחשבת למילוי שורת הקופון; הזמנה קופון-טהורה עוברת ל-`fulfilled` כשכל הקופונים הונפקו (או נשארת `paid` עד שהמנוע מסמן fulfilled לפי מימוש קיים ב-COMMERCE).

### 1.3 טבלת מעברים מלאה

| מ | אל | טריגר | מי | Idempotency | אסור |
|---|---|---|---|---|---|
| (אין שורה) | `pending` | `submitCheckout` אחרי validateCart + זהות (+ כתובת אם פיזי); INSERT order + payment attempt + Low Profile Create | Next server action | מפתח עגלה/idempotency על יצירת payment; לא יוצרים LP כפול לאותו attempt פתוח | יצירה כש-`CHECKOUT_ENABLED=false`; סימון `paid` כאן |
| `pending` | `paid` | IndicatorUrl ו/או SuccessRedirect → שרת קורא `GetLpResult`; סכום ומזהה תואמים; finalize | webhook route / return reconcile / cron | UNIQUE על `cardcom_transaction_id` / LowProfileId; עדכון status רק מ-`pending` | סימון paid מ-query string בלבד; LP amount ≠ order |
| `pending` | `cancelled` | `expires_at` עבר (ברירת מחדל ~30 דק׳) או ביטול משתמש לפני חיוב | cron / server | UPDATE … WHERE status=`pending` | ביטול אחרי `paid` בלי מסלול refund |
| `pending` | `failed` payment | דחייה ב-Cardcom / FailedRedirect אחרי אימות | שרת | payment → `failed`; order נשאר `pending` עד expiry/cancel | order=`refunded` בלי חיוב |
| `paid` | `partially_fulfilled` | חלק מפריטי פיזי: shipped/delivered (או שקול) | server / supplier ops | לפי `item_status` אגרגציה | דילוג ל-`refunded` בלי Cardcom |
| `paid` או `partially_fulfilled` | `fulfilled` | כל השורות טרמינליות לפי מדיניות (delivered / coupon issued) | server (trigger/fn) | אגרגציה דטרמיניסטית על items | `fulfilled` → `pending` |
| `paid` / `partially_fulfilled` / `fulfilled` | `refunded` | מסלול REFUNDS + `RefundByTransactionId` (או CancelOnly) הצליח | admin / legal engine | מפתח refund יציב; `AllowMultipleRefunds` רק במודע | refund מ-`cancelled`/`pending` בלי payment succeeded |
| כל מצב שאינו ברשימה | * | אין | אין | אין | **מעבר לא חוקי** (למשל `refunded`→`paid`, `fulfilled`→`pending`, `cancelled`→`paid`) |

כללי זהות נוספים:

1. Finalize כותב באותה טרנזקציית DB: payment succeeded, order `paid`, snapshots כבר על items, הנפקת קופונים / ledger פיזי, outbox התראות.
2. Webhook כפול: `payment_webhook_events` UNIQUE → no-op.
3. Return אחרי finalize קיים: no-op; מציג אזור אישי / קופונים.

מעברים לא חוקיים (רשימת חובה לטסטים):

- כל מעבר אחורה מ-`paid` / `fulfilled` / `refunded` ל-`pending`
- `cancelled` → `paid` (חיוב חדש = הזמנה חדשה)
- `refunded` → כל מצב אחר
- סימון `paid` בלי שורת payment `succeeded` מאומתת ב-GetLpResult

---

## 2. Snapshot של `platform_percent` על `order_items`

### 2.1 למה

1. **C10 / P7:** אחרי `paid` האחוזים והסכומים על השורה לא משתנים.
2. שינוי עמלת מוצר באדמין משפיע רק על רכישות עתידיות.
3. דוחות, payout פיזי, והחזרים מחושבים מול מה שנקנה, לא מול המוצר החי.

מקור:
`docs/CONTRADICTIONS.md`
(C10),
`docs/ARCHITECTURE-PRICING-RULES.md`
(P4, P7).

### 2.2 איך (ברכישה)

ב-`submitCheckout` / בניית שורות, לפני redirect ל-Cardcom:

| שדה על `order_items` (COMMERCE / 026) | מקור |
|---|---|
| `platform_percent` | `products.platform_percent` בזמן הרכישה (חובה; אין default) |
| `supplier_split_percent` | משלים ל-100 (מצולם גם כן) |
| `charged_on_site_ils` | קופון: `coupon_price_ils` (או flash); פיזי: מחיר מלא |
| `platform_fee_ils` | קופון: = charged_on_site; פיזי: אחוז מהחיוב |
| `supplier_due_ils` | קופון: **0**; פיזי: charged − platform_fee |
| `balance_due_at_business_ils` | קופון: face − coupon; פיזי: 0 |

אין קריאה חוזרת ל-`products.platform_percent` ב-finalize לצורך פיצול כסף; משתמשים ב-snapshot על השורה (או ב-intent שכבר צילם אותו).

### 2.3 מה קורה אם האחוז משתנה אחרי רכישה

| מצב | התנהגות |
|---|---|
| מוצר עודכן באדמין | הזמנות `pending`/`paid`/`fulfilled` ישנות **לא** מתעדכנות |
| הזמנה עדיין `pending` | שורות כבר נוצרו עם snapshot; לא לרענן אחוז ממוצר (מונע amount_mismatch מול LP שכבר נפתח) |
| payout / refund | תמיד לפי snapshot + ledger; לא לפי מוצר חי |
| קופון | `platform_percent` על השורה לביקורת/דיווח; לא יוצר payout לספק |

---

## 3. קופון: No Escrow

כללי כסף (BINDING):

| כלל | פירוט |
|---|---|
| חיוב Cardcom | סכום = `coupon_price` (אגורות/שקלים לפי שכבת הכסף בקוד) |
| כסף באתר | **100% נשאר בפלטפורמה** |
| יתרה | `face − coupon` נגבית בבית העסק במימוש |
| Payout לספק | **0** מהפלטפורמה על קופון |
| אסור | Escrow, J5, `held` עד מימוש, שחרור מקדמה לספק |

### 3.1 מה נשמר ב-DB (מינימום מחייב)

| ישות | תוכן רלוונטי |
|---|---|
| `orders` | `status=pending`→`paid`; `total_ils` = סכום on-site; `paid_at` |
| `order_items` | snapshots (§2); `supplier_due_ils=0`; `balance_due_at_business_ils` |
| `payments` / payment intent | amount = on-site; LowProfileId; transaction id אחרי אימות |
| `coupon_codes` / vouchers | אחרי paid: `issued`, קוד, QR, snapshots כסף, `expires_at` |
| ledger | שורת הכנסת פלטפורמה על סכום האתר; **אין** `supplier_share` / held לקופון |
| redemptions | סריקה → `used`/`redeemed` (טרמינלי); אין תשלום פלטפורמה→ספק |

פירוט מימוש:
`docs/ARCHITECTURE-COUPON-REDEMPTION.md`
,
`docs/CARDCOM-ARCHITECTURE.md`
§3.1-3.2.

---

## 4. פיזי: פיצול מיידי + הודעה לספק

### 4.1 פיצול

```text
charged_on_site = מחיר מלא (או flash)
platform_fee    = round(charged * platform_percent_snapshot / 100)
supplier_due    = charged - platform_fee
```

ב-finalize (אחרי GetLpResult):

1. order → `paid`
2. ledger: `platform_commission` + `supplier_share` בסטטוס `payable` (עם `available_at` T+N)
3. `settlement_events` / `split_executed` לפי PAYOUT docs
4. **אין** העברה בנקאית באותו רגע; payout באצ' נפרד

מקור:
`docs/CARDCOM-ARCHITECTURE.md`
§3.3,
`docs/PAYOUT-ARCHITECTURE.md`,
`docs/ARCHITECTURE-PAYOUT-MECHANISM.md`.

### 4.2 הודעה לספק

| אירוע | Kind / ערוץ | מתי |
|---|---|---|
| מכירה פיזית שולמה | `supplier_sale` / מקביל ב-outbox | אחרי finalize → `paid` |
| לקוח | `order_paid` | אותו finalize |
| משלוח | לפי NOTIFICATIONS (shipped/delivered) | שינוי `item_status` |

Idempotency התראות: `dedupe_key` יציב (למשל `order_paid:<order_id>`, `supplier_sale:<order_id>`).

ראה:
`docs/ARCHITECTURE-NOTIFICATIONS.md`.

---

## 5. Cardcom

סיכום מחייב מתוך ADRs קיימים. פירוט API מלא:
`docs/CARDCOM-ARCHITECTURE.md`.
אופטימיזציית משפך וכשלים:
`docs/CHECKOUT-OPTIMIZATION.md`.

### 5.1 Low Profile / יצירת session

1. שרת בודק `CHECKOUT_ENABLED`.
2. validateCart + יצירת `orders` (`pending`) + שורות עם snapshots.
3. יצירת payment attempt (`initiated`).
4. קריאה ל-Low Profile Create (מחקר: `/LowProfile/Create`; קוד חי: legacy `/Interface/LowProfile.aspx`).
5. `ReturnValue` = מזהה פנימי (order / intent id).
6. `SuccessRedirectUrl` / `FailedRedirectUrl` + IndicatorUrl/WebHookUrl עם `?s=<secret>`.
7. שמירת `LowProfileId`; status → `redirected`; redirect ללקוח.

Operation: `ChargeOnly` או `Do3DSAndSubmit`. **J5 / SuspendedDeal אסורים** בכל מסלול (C3).

### 5.2 Return URL מול GetLpResult (מקור אמת)

| ערוץ | תפקיד |
|---|---|
| Success / Failed Redirect | UI לדפדפן/WebView בלבד |
| IndicatorUrl (webhook) | טריגר server-to-server; **אין HMAC על הגוף** |
| `GetLpResult` | **מקור האמת היחיד** לפני כתיבת succeeded/paid |

אסור לסמן `paid` על סמך query string ב-return. אם return מגיע לפני webhook: אותה קריאת GetLpResult + finalize idempotent.

### 5.3 IndicatorUrl / webhook

1. בדיקת `?s=<secret>` (סינון ראשוני; לא תחליף ל-GetLpResult).
2. חילוץ `LowProfileId` (+ ReturnValue).
3. INSERT idempotent ליומן webhook.
4. `GetLpResult` עם credentials שלנו.
5. התאמת סכום ומזהה הזמנה.
6. Finalize או failed; תשובה 200 מהירה ל-Cardcom.
7. גיבוי: reconcile cron על intents תקועים.

מימוש חי מתועד: Next route
`src/app/api/payments/cardcom/webhook/route.ts`
(לא Cloudflare Worker כמקור אמת לקוד הנוכחי; ראה באנר QA ב-CARDCOM-ARCHITECTURE).

### 5.4 Finalize → paid

בטרנזקציה אחת (או הכל או כלום):

1. payment → `succeeded`
2. order → `paid` + `paid_at`
3. קופון: הנפקת vouchers / קודי קופון
4. פיזי: ledger split לפי snapshot
5. ארנק: spend/cashback אם חל (מפתחות idempotency)
6. outbox: `order_paid`, `supplier_sale` (פיזי), וכו׳
7. ניקוי עגלה

כשל אחרי חיוב (paid בלי voucher): מסלול reconcile / תמיכה (`paid_no_voucher` ב-CHECKOUT-OPTIMIZATION); לא לסמן paid שוב.

### 5.5 החזרים (מצביע)

מסלול מלא:
`docs/ARCHITECTURE-REFUNDS-DISPUTES.md`
,
`docs/CARDCOM-ARCHITECTURE.md`
§3.4.

בקצרה: `RefundByTransactionId` (+ `CancelOnly` אותו יום כשמתאים); דמי ביטול חוקיים כשחל; קופון לפני מימוש בלבד אוטומטית; פיזי עם `supplier_debit` אם כבר שולם לספק; order → `refunded` אחרי אישור Cardcom.

### 5.6 Secrets ו-kill switch

| משתנה / סוד | שימוש |
|---|---|
| `CARDCOM_TERMINAL` / TerminalNumber | מסוף |
| `CARDCOM_API_NAME` | כל קריאה |
| `CARDCOM_API_PASSWORD` | זיכויים / מסמכים / Financial בלבד |
| `CARDCOM_WEBHOOK_SECRET` | `?s=` על IndicatorUrl |
| `CHECKOUT_ENABLED` | `false` = אין LP חדש / אין retry סליקה גלובלי |

סודות רק ב-env שרת (Vercel). מסוף בדיקות (1000) לא ב-production.

Incident: קודם
`CHECKOUT_ENABLED=false`
(ראה
`docs/INCIDENT-PLAYBOOKS.md`
).

### 5.7 אין אחסון PAN

| מותר | אסור |
|---|---|
| 4 ספרות אחרונות, Token Cardcom, expiry token | מספר כרטיס מלא, CVV, track |
| טופס Low Profile של Cardcom | טופס כרטיס עצמי / postMessage מתוך iframe |

PCI: SAQ-A. לוגים: scrub ל-body של Cardcom ב-Sentry.

---

## 6. זרימה מקצה לקצה (תמצית)

```text
עגלה תקינה
  → draft לוגי (אין order row)
  → submitCheckout → order pending + snapshots + LP Create
  → Cardcom (לקוח משלם)
  → webhook ו/או return → GetLpResult
  → paid + (קופון: vouchers | פיזי: ledger split + הודעת ספק)
  → fulfilled / partially_fulfilled לפי פריטים
  → או cancelled (פקיעה) / refunded (מסלול החזר)
```

---

## 7. Acceptance

- [ ] טבלת מעברי `order_status` כוללת טריגר, בעלים, idempotency, ומעברים אסורים
- [ ] מיפוי מפורש: `pending_payment`→`pending`, `expired`→`cancelled`, `draft`=לפני INSERT
- [ ] Snapshot `platform_percent` על `order_items`; שינוי מוצר לא משנה הזמנות ישנות
- [ ] קופון: 100% on-site לפלטפורמה; `supplier_due=0`; No Escrow
- [ ] פיזי: פיצול ledger ב-finalize + הודעת ספק; payout נפרד
- [ ] GetLpResult מקור אמת; אין paid מ-return בלבד
- [ ] `CHECKOUT_ENABLED` + secrets מתועדים; אין PAN
- [ ] קישורים ל-CARDCOM / CHECKOUT-OPTIMIZATION / PRICING / CONTRADICTIONS / REFUNDS / PAYOUT

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | מסמך BINDING ראשון: state machine, snapshot, קופון/פיזי, Cardcom end-to-end |
