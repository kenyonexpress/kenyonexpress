# ארכיטקטורה: Cardcom Webhooks

חתימה (URL secret), idempotency, DLQ/reconcile, ומניעת double charge. מקור אמת = GetLpResult.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #2/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/INCIDENT-PLAYBOOKS.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. Webhook לא משחרר כסף לספק ולא יוצר held.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| WH1 | Cardcom **אינו חותם** את גוף ה-POST (אין HMAC / signature header). |
| WH2 | אותנטיות = `?s=<CARDCOM_WEBHOOK_SECRET>` ב-IndicatorUrl + השוואת `timingSafeEqual`. |
| WH3 | מקור אמת יחיד לסכום/סטטוס/token = `GetLpResult` (שרת↔Cardcom). |
| WH4 | Dedup אירועים: UNIQUE `(provider, external_event_id)` על `payment_webhook_events`. |
| WH5 | Finalize idempotent: `orders.paid_at` + עדכון payment רק מ-`initiated`/`redirected`. |
| WH6 | תשובת HTTP ל-Cardcom בדרך כלל 200 גם בכשל לוגי (מונע retry ספאם); כשל תשתית → 5xx + reconcile. |
| WH7 | DLQ = audit P1 + תור reconcile/admin; לא מסלול שמסמן `paid` בלי GetLpResult. |
| WH8 | Double charge נחסם ב-`lp:{client_ref}` + LowProfileId יחיד ל-payment. |

---

## 1. זרימת IndicatorUrl

קצה חי:

```
POST /api/payments/cardcom/webhook?s=<secret>
```

```text
Cardcom POST
  → קרא raw body
  → secretMatches(?s=, CARDCOM_WEBHOOK_SECRET)
  → parse payload (lowprofilecode, InternalDealNumber, ResponseCode, …)
  → external_event_id = "{lp}:{deal|na}"
  → INSERT payment_webhook_events
       (provider=cardcom, external_event_id, signature_valid, payload)
  → אם UNIQUE violation → 200 { replay: true }  (עצור)
  → אם !secretOk או parse fail → 200 (בלי finalize)
  → מצא payments לפי cardcom_low_profile_id
  → אם לא הצלחה Cardcom → payment failed (רק initiated/redirected)
  → verifyLowProfile(lp) = GetLpResult
  → אם amountAgorot ≠ expected → audit amount_mismatch; לא finalize
  → סמן verified_against_api=true
  → finalizeOrder(orderId, paymentId, transactionId, token)
  → 200
```

Return URL (`/checkout/return` → `reconcileOrderReturn`) רץ **אותו** חוזה GetLpResult+finalize. Race בין return ל-webhook = בטוח בגלל WH5.

---

## 2. "חתימה" בפועל

| שכבה | מה נבדק | מה לא |
|---|---|---|
| URL secret | `?s=` מול env | לא חתימת גוף |
| GetLpResult | סכום, הצלחה, trx id, token | לא סומכים על ResponseCode ב-POST לבד |
| Amount gate | `round(amount_ils*100) === verified.amountAgorot` | סטייה → לא paid |
| Dedup | UNIQUE event id | replay לא מעבד שוב |

עמודת `signature_valid` = תוצאת בדיקת הסוד ב-URL בלבד. שם מטעה היסטורית; אין HMAC.

אסור: להמציא אימות "גוף חתום" בטסטי E2E (סותר את Cardcom האמיתי).

---

## 3. Idempotency

| מפתח | טבלה / שכבה | התנהגות |
|---|---|---|
| `lp:{client_ref}` | `payments.idempotency_key` | beginCheckout replay → אותו redirect/paid |
| `(cardcom, external_event_id)` | `payment_webhook_events` | INSERT כפול → replay |
| `cardcom_low_profile_id` | `payments` | מזהה LP אחד ל-payment |
| `paid_at IS NULL` | `orders` | finalize שני = `{ replay: true }` |
| payment status ∈ {initiated, redirected} | UPDATE → succeeded | לא דורס succeeded/failed סופי |
| voucher count ≥ qty | הנפקה | לא מנפיק כפול ב-replay |

---

## 4. DLQ ו-reconcile

אין תור DLQ נפרד חובה בקוד החי ל-webhook (עיבוד inline). חוזה תפעולי:

| מצב | פעולה |
|---|---|
| GetLpResult timeout / 5xx Cardcom | לא paid; cron/reconcile על `payments.status=redirected` מעל N דק׳ |
| amount_mismatch | audit P1; חסימת finalize; בדיקת ידנית |
| webhook עם secret שגוי | נרשם `signature_valid=false`; התראת abuse אם נפח גבוה |
| paid בלי vouchers מלאים | job השלמת הנפקה; לא מבטל paid |
| אחרי max ניסיונות reconcile | Sentry P1 + admin payments tab (webhooks/reconcile) |

QStash משמש ל-wake של notification drain אחרי paid; אינו תחליף ל-GetLpResult.

---

## 5. Double charge

| תרחיש | הגנה |
|---|---|
| לחיצה כפולה / שני טאבים אותו `client_ref` | אותו `idempotency_key` → לא יוצר payment שני |
| Return + webhook במקביל | finalize replay בטוח |
| Cardcom שולח IndicatorUrl פעמיים | UNIQUE external_event_id |
| משתמש חוזר אחרי failed ומתחיל שוב | `client_ref` חדש → LP חדש לגיטימי; הישן failed/expiry |
| שני `client_ref` באג לקוח | שני pending אפשריים; רק מה שחויב ב-Cardcom עובר paid; השני → cancelled ב-expiry; אם שני חיובים אמיתיים → refund ידני + INCIDENT |

כלל ברזל: **אסור** ליצור Low Profile חדש כ-retry אוטומטי על אותו payment `redirected`.

---

## 6. מקרי כשל (טבלת תפעול)

| קוד | סימפטום | תגובה |
|---|---|---|
| `secret_invalid` | `signature_valid=false` | 200; אלרט אם spike |
| `payload_unparsed` | external_event_id מתחיל ב-`unparsed:` | 200; לוג |
| `unknown_payment` | LP לא ב-DB | 200; reconcile ידני |
| `provider_decline` | ResponseCode לא success | payment→failed |
| `verify_failed` | GetLpResult לא success | לא paid; retry reconcile |
| `amount_mismatch` | סכום לא תואם | audit; לא paid |
| `finalize_internal` | שגיאת DB באמצע | payment אולי succeeded חלקי; reconcile משלים; אלרט |
| `double_event` | UNIQUE hit | no-op |

---

## 7. Secrets ו-SAQ

| סוד | שימוש |
|---|---|
| `CARDCOM_WEBHOOK_SECRET` | `?s=` ב-IndicatorUrl |
| Terminal / ApiName | יצירת LP + GetLpResult |
| ApiPassword | זיכויים בלבד (לא webhook) |
| `CHECKOUT_ENABLED` | kill switch ליצירת LP |

אין PAN/CVV בלוגים. Payload webhook נשמר ב-`payment_webhook_events.payload` ללא כרטיס מלא.

---

## 8. Acceptance

- [ ] מתועד: אין HMAC על גוף Cardcom  
- [ ] `?s=` + timing-safe compare  
- [ ] GetLpResult לפני כל paid  
- [ ] UNIQUE webhook events + paid_at idempotency  
- [ ] amount_mismatch לא מסמן paid  
- [ ] תרחישי double charge מוגדרים  
- [ ] DLQ/reconcile תפעולי בלי shortcut ל-paid  
- [ ] No Escrow  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING ראשון (batch-2 #2): signature, idempotency, DLQ, double charge |
