# ארכיטקטורת Cardcom (סקירה)

תקציר BINDING לסליקה KenyonExpress × Cardcom. פירוט API, webhook, edge cases:

```
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-CARDCOM-EDGE-CASES.md
docs/ARCHITECTURE-PAYMENT-RECONCILIATION.md
```

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; אגורות integer.

**הערת יישום:** הקוד החי משתמש ב-legacy

```
/Interface/LowProfile.aspx
/Interface/GetLpResult.aspx
```

מחקר v11 JSON REST שמור ל-migration עתידי. ראה `GAPS-CODE-VS-DOCS.md` G8.

---

## החלטה

| # | הכרעה |
|---|---|
| CC1 | ספק סליקה: **Cardcom**; ILS; סכום ב-agorot, wire בשקלים. |
| CC2 | זרימה: Low Profile (iframe/redirect) → webhook `IndicatorUrl` → **אימות חוזר** `GetLpResult` = מקור אמת יחיד. |
| CC3 | Webhook **לא חתום** (אין HMAC). הגנה: `?s=<CARDCOM_WEBHOOK_SECRET>` + re-fetch server-side. |
| CC4 | קופון: charge = `coupon_price` בלבד; **100% לפלטפורמה**; אין supplier payout. |
| CC5 | פיזי: charge = מחיר מלא; split לפי `platform_percent` snapshot (לא recompute). |
| CC6 | Idempotency: journal + `ReturnValue` / order id; webhook כפול = no-op. |
| CC7 | Refund: `RefundDeal` legacy; TODO: אימות שדות מול מסוף חי לפני go-live. |
| CC8 | Recurring (מנוי): Token + charge חוזר; אותו split פר חיוב. |
| CC9 | Route handler: `src/app/api/payments/cardcom/webhook/route.ts` (Next.js, לא Worker). |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| v11 REST מיידי | legacy עובד; migration אחרי smoke prod. |
| HMAC webhook מזויף | Cardcom לא מספק; re-fetch חובה. |
| Cloudflare Worker ל-webhook | Next.js route + secret query. |
| J5 / Escrow hold | No Escrow; קופון לפלטפורמה. |
| סכום float | אגורות integer בלבד. |

---

## סכמת DB

```text
payments: status, cardcom_low_profile_id, cardcom_deal_id, amount_agorot, idempotency_key
orders: status, paid_at
order_items: paid_on_site_agorot, platform_percent (snapshot)
payment_events / webhook journal (idempotency)
subscriptions: token, next_billing_at (מנוי)
```

אין DDL חדש במסמך זה.

Env חובה (prod):

```
CARDCOM_TERMINAL_NUMBER
CARDCOM_API_NAME
CARDCOM_API_PASSWORD
CARDCOM_WEBHOOK_SECRET
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | Webhook לפני return URL | finalize מ-webhook; return = poll/display. |
| CE2 | Webhook כפול | idempotent; אין double voucher. |
| CE3 | GetLpResult ≠ webhook | **GetLpResult wins**; לא mark paid. |
| CE4 | סכום שונה מ-order | reject; alert ops. |
| CE5 | Timeout redirect | מסך pending + reconcile cron. |
| CE6 | Refund אחרי redeem | חסום / מדיניות SUPPORT. |
| CE7 | `CHECKOUT_ENABLED=false` | mock / block redirect. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | אימות RefundDeal prod | `cardcom.ts:149` TODO. |
| O2 | מעבר v11 REST | אחרי legacy stable. |
| O3 | TransferFromDigitalBank (payout) | `ARCHITECTURE-PAYOUT-MECHANISM.md`. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING קצר; הפניות ARCHITECTURE-CARDCOM-* |
