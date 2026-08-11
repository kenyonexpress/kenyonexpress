# ארכיטקטורה: Cardcom Webhooks

חתימה (URL secret), idempotency, DLQ/reconcile, double charge, webhook כפול, ו-multi-terminal. מקור אמת = GetLpResult.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/INCIDENT-PLAYBOOKS.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. Webhook לא משחרר כסף לספק ולא יוצר held. קופון: מקדמה נשארת בפלטפורמה.

קצה חי:

```
POST /api/payments/cardcom/webhook?s=<CARDCOM_WEBHOOK_SECRET>
```

API חי ליצירה/אימות: legacy

```
/Interface/LowProfile.aspx
/Interface/GetLpResult.aspx
```

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| WH1 | Cardcom **אינו חותם** את גוף ה-POST (אין HMAC / signature header על הגוף). |
| WH2 | אותנטיות שכבה 1: `?s=` ב-IndicatorUrl מול `CARDCOM_WEBHOOK_SECRET` ב-`timingSafeEqual`. |
| WH3 | אותנטיות שכבה 2 + מקור אמת: `GetLpResult` לפי `LowProfileCode` (סכום, הצלחה, trx, token). |
| WH4 | Dedup אירועים: UNIQUE `(provider, external_event_id)` על `payment_webhook_events`. |
| WH5 | `external_event_id` = `{lowprofilecode}:{InternalDealNumber\|na}` (או `unparsed:…` אם parse נכשל). |
| WH6 | Finalize idempotent: `orders.paid_at` + UPDATE payment רק מ-`initiated`/`redirected`. |
| WH7 | תשובה ל-Cardcom: 200 גם בכשל לוגי (מונע retry ספאם); 5xx רק כשל תשתית שמחייבת retry. |
| WH8 | DLQ תפעולי = audit P1 + reconcile/admin + Sentry; **אסור** shortcut ל-`paid` בלי GetLpResult. |
| WH9 | Double charge: אין LP חדש אוטומטי על אותו `payments` ב-`redirected`; מפתח `lp:{client_ref}`. |
| WH10 | Webhook כפול / return+webhook race = no-op בטוח אחרי paid_at / UNIQUE event. |
| WH11 | **Multi-terminal (MVP):** מסוף פלטפורמה יחיד (`CARDCOM_TERMINAL_NUMBER`). GetLpResult וה-Create חייבים על **אותו** TerminalNumber שיצר את ה-LP. |
| WH12 | Multi-terminal עתידי (ספק/סביבה): כל LP נושא `terminal_number` מצולם על `payments`; webhook מנתב אימות לטרמינל שצולם; סוד `?s=` יכול להיות משותף או per-terminal, אבל לעולם לא מחליף GetLpResult. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| HMAC / חתימת גוף webhook | Cardcom לא מספקת; טסטי E2E שממציאים חתימה נכשלים מול פרוד. |
| לסמוך על ResponseCode ב-POST בלבד | גוף לא חתום; ניתן לזייף בלי `?s=`+GetLpResult. |
| לסמן `paid` מ-Return URL | UI בלבד; אין אמת לסכום. |
| תור QStash חובה לכל finalize | הקוד החי מעבד inline; QStash = wake להתראות, לא תחליף ל-GetLpResult. |
| מסוף נפרד לכל ספק ב-MVP | מורכבות KYC/Cardcom + פיצול ב-charge; MVP = מסוף פלטפורמה; payout פיזי נפרד. |
| Webhook secret שונה per request בלי אחסון | אין מה לאמת מול; חייב סוד יציב ב-env (או מפת per-terminal מתועד). |
| יצירת LP חדש כ-retry על אותו payment redirected | מסלול double charge קלאסי. |

---

## 2. סכמת DB (קיים; אין DDL חדש במסמך זה)

| טבלה | שדות רלוונטיים |
|---|---|
| `payments` | `id`, `order_id`, `kind`, `status`, `amount_ils`, `idempotency_key`, `cardcom_low_profile_id`, `cardcom_transaction_id`, `wallet_applied_ils`, `raw_response`, `failed_at`, `succeeded_at` |
| `payment_webhook_events` | `provider`, `external_event_id`, `signature_valid`, `verified_against_api`, `payment_id`, `payload`, `processed_at` |
| `orders` | `status`, `paid_at` |
| `audit_log` | `amount_mismatch` ואזעקות ידניות |

אילוצים מחייבים לחוזה:

```text
UNIQUE (provider, external_event_id)   -- dedup webhook
UNIQUE / lookup cardcom_low_profile_id -- מצביע ל-payment
payments.idempotency_key = lp:{client_ref}
```

שדה עתידי מומלץ (לא DDL במסמך זה; פתוחה O2):

```text
payments.cardcom_terminal_number  -- snapshot של המסוף שיצר את ה-LP
```

עד אז: כל הסביבה = מסוף יחיד מה-env.

---

## 3. חתימה (signature) בפועל

| שכבה | מנגנון | תוצאה אם נכשל |
|---|---|---|
| 1 | `?s=` מול `CARDCOM_WEBHOOK_SECRET` (`timingSafeEqual`) | `signature_valid=false`; אין finalize; עדיין 200 אחרי INSERT |
| 2 | `GetLpResult(LowProfileCode)` | אין paid |
| 3 | `verified.amountAgorot === round(payment.amount_ils * 100)` | audit `cardcom_amount_mismatch`; אין paid |
| 4 | Dedup UNIQUE event | replay; אין עיבוד שני |

`signature_valid` בעמודה = **רק** תוצאת בדיקת הסוד ב-URL. שם היסטורי מטעה; אין HMAC על הגוף.

IndicatorUrl בעת Create:

```text
{APP_URL}/api/payments/cardcom/webhook?s={CARDCOM_WEBHOOK_SECRET}
```

אסור לשים את הסוד בלוג גולמי; אסור לחשוף ב-client.

### 3.1 חוזה תשובת HTTP ל-Cardcom

| מצב | HTTP | גוף טיפוסי | למה |
|---|---|---|---|
| UNIQUE replay | 200 | `{ ok: true, replay: true }` | מונע ספאם retry |
| secret fail / parse fail | 200 | `{ ok: true }` | אחרי INSERT; לא לעודד brute על הסוד ב-retry אינסופי |
| unknown_payment | 200 | `{ unknown_payment: true }` | לא לחשוף מ enumeration; reconcile ידני |
| provider decline | 200 | `{ ok: true }` | עובד; payment failed |
| GetLpResult fail זמני | 200 | `{ verified: false }` | cron יאסוף; ראה O4 |
| amount_mismatch | 200 | `{ amount_mismatch: true }` | לא paid; P1 |
| finalize OK / replay | 200 | `{ ok: true }` / לפי תוצאה | הצלחה |
| קריסת תהליך / DB down לפני ack | 5xx | - | Cardcom ינסה שוב; dedup יטפל |

אין 401/403 על סוד שגוי ב-MVP (מונע מיפוי קל של הסוד דרך קודי סטטוס). הסוד נשפט רק פנימית ב-`signature_valid`.

---

## 4. זרימת IndicatorUrl

```text
Cardcom POST IndicatorUrl
  → raw body
  → secretMatches(?s=)
  → parse payload (lowprofilecode, InternalDealNumber, ResponseCode, …)
  → external_event_id = "{lp}:{deal|na}" | "unparsed:…"
  → INSERT payment_webhook_events (signature_valid, payload)
  → UNIQUE hit → 200 { replay: true }  STOP
  → !secretOk או parse fail → 200 בלי finalize  STOP
  → מצא payment לפי cardcom_low_profile_id
  → unknown → 200 { unknown_payment }  STOP
  → !success ב-payload → payment failed (רק initiated/redirected); 200
  → GetLpResult(lp) על אותו terminal שיצר את ה-LP
  → !verified → 200 { verified: false }  (reconcile יאסוף)
  → amount mismatch → audit P1; 200 { amount_mismatch }
  → mark verified_against_api + payment_id
  → finalizeOrder(...)
  → 200 { ok }
```

Return URL (`reconcileOrderReturn`) = **אותו** חוזה GetLpResult+finalize. לא מסלול נפרד לאמת.

---

## 5. Idempotency

| מפתח | שכבה | התנהגות |
|---|---|---|
| `lp:{client_ref}` | `payments.idempotency_key` | replay beginCheckout → אותו redirect / paid / IDEMPOTENT_REPLAY |
| `(cardcom, external_event_id)` | webhook events | INSERT כפול → replay |
| `cardcom_low_profile_id` | payments | LP אחד ל-payment אחד |
| `paid_at IS NULL` | orders | finalize שני = `{ replay: true }` |
| status ∈ initiated/redirected | payments → succeeded | לא דורס succeeded סופי |
| ספירת vouchers ≥ qty | mint | לא מנפיק כפול |
| `order:{id}:spend` / `order:{id}:cashback` | wallet | RPC idempotent |

---

## 6. Webhook כפול

| תרחיש | מה קורה |
|---|---|
| Cardcom שולח אותו IndicatorUrl פעמיים (אותו deal) | UNIQUE על external_event_id → 200 replay; אין finalize שני |
| אותו LP, InternalDealNumber חסר בשניהם (`na`) | אותו external_event_id → dedup |
| Return ואז webhook (או הפוך) | שניהם קוראים GetLpResult; הראשון משלם; השני paid_at replay |
| Webhook אחרי paid כבר | payment לא ב-initiated/redirected לעדכון; finalize replay |
| Payload זהה עם secret שגוי בפעם השנייה | אם הראשון כבר נשמר עם event id, השני UNIQUE; אם id שונה: נרשם signature_valid=false בלי finalize |

כלל: **אין** "עיבוד מפצה" שמדלג על GetLpResult בגלל שנראה כפול.

### 6.1 ציר זמן: כפילות

```text
t0  Cardcom charge OK
t1  IndicatorUrl #1  → INSERT event E1 → GetLpResult → finalize → paid_at
t2  IndicatorUrl #2 (אותו deal) → UNIQUE(E1) → 200 replay STOP
t1' SuccessRedirect במקביל ל-t1 → GetLpResult → finalize replay (paid_at set)
t3  IndicatorUrl אחרי paid עם deal id חדש בטעות → event E2 חדש
       → מוצא payment כבר succeeded → לא דורס; finalize replay / no-op
```

אם `InternalDealNumber` חסר תמיד (`na`): שני POSTs לאותו LP מתנגשים באותו `external_event_id` וזה **רצוי** ל-dedup.

---

## 7. Double charge

| תרחיש | הגנה |
|---|---|
| לחיצה כפולה / שני טאבים אותו `client_ref` | אותו idempotency_key → לא יוצר payment שני |
| Retry אוטומטי שיוצר LP חדש על אותו payment | **אסור**; נשארים על אותו redirected + GetLpResult |
| משתמש אחרי failed מתחיל שוב | `client_ref` חדש → LP חדש לגיטימי; הישן failed/expiry |
| שני `client_ref` באג לקוח | שני pending אפשריים; רק מי שחויב ב-Cardcom → paid; השני → cancelled ב-expiry |
| שני חיובים אמיתיים ב-Cardcom | INCIDENT + refund ידני ליתר; לא auto-paid כפול ב-DB |
| Return+webhook | לא double charge; idempotent finalize |

---

## 8. DLQ ו-reconcile

אין חובת תור DLQ נפרד ל-webhook ב-MVP (עיבוד inline). חוזה תפעולי ≡ DLQ:

| מצב | יעד DLQ / פעולה |
|---|---|
| GetLpResult timeout / 5xx | לא paid; cron על `payments.status=redirected` מעל N דק׳ |
| amount_mismatch | audit P1; חסימה; תור ידני admin |
| signature_valid=false בנפח | אלרט abuse; לא finalize |
| unknown_payment | תור reconcile ידני מול דוח Cardcom |
| finalize_internal באמצע | Sentry P1; reconcile משלים vouchers/wallet; לא מבטל paid אם paid_at נכתב |
| paid בלי vouchers מלאים | job השלמת הנפקה |
| אחרי max ניסיונות cron | Sentry P1 + מסך admin payments (webhooks / reconcile) |

QStash: wake ל-notification drain אחרי paid בלבד. לא מחליף אימות סליקה.

### 8.1 חוזה פריט DLQ / reconcile (לוגי)

כל פריט בתור התפעולי חייב:

| שדה | משמעות |
|---|---|
| `payment_id` / `low_profile_id` | מזהה |
| `order_id` | קישור |
| `reason` | אחד מ: `verify_failed`, `amount_mismatch`, `unknown_payment`, `finalize_internal`, `stale_redirected`, … |
| `first_seen_at` / `attempts` | לעצירת max |
| `last_error` | מחרוזת קצרה בלי סודות |
| `terminal_number` | MVP=env; עתידי=snapshot |

אסור לפריט DLQ לסמן `paid` ישירות. רק: קריאה חוזרת ל-GetLpResult → finalize, או החלטה ידנית מתועדת ב-audit.

---

## 9. Multi-terminal

### 9.1 MVP (מחייב היום)

| כלל | פירוט |
|---|---|
| מסוף יחיד | `CARDCOM_TERMINAL_NUMBER` + `CARDCOM_API_NAME` (+ password לזיכויים) |
| Create + GetLpResult | אותו TerminalNumber |
| Webhook | URL אחד; סוד אחד; חיפוש payment לפי LP id (לא לפי terminal ב-payload) |
| Sandbox מול prod | סביבות נפרדות (env נפרד); לא שני מסופים באותו process בלי הפרדה |

### 9.2 עתידי (אם יופעל Multi-Account / מסוף ספק)

| כלל | פירוט |
|---|---|
| Snapshot | בעת Create: לשמור `cardcom_terminal_number` על `payments` |
| Routing | webhook מוצא payment לפי LP → קורא GetLpResult עם הטרמינל שצולם (לא עם default env עיוור) |
| Secret | מותר `CARDCOM_WEBHOOK_SECRET` משותף לכל המסופים, או מפה terminal→secret; תמיד + GetLpResult |
| כסף | מסוף ספק **לא** הופך קופון ל-Escrow; מודל No Escrow נשאר |
| Payout | לא דרך webhook charge; ראה PAYOUT-ARCHITECTURE |

### 9.3 מה אסור ב-multi-terminal

- לאמת LP שנוצר במסוף A עם GetLpResult על מסוף B  
- לקבל webhook ולסמן paid בלי התאמת terminal לצילום  
- לערבב מסוף בדיקות עם מסוף פרוד באותו `payments` namespace  

### 9.4 מטריצת סביבות / מסופים

| סביבה | Terminal | Webhook secret | DB payments |
|---|---|---|---|
| local/mock | mock / `CARDCOM_USE_MOCK` | mock-secret | DB מקומי |
| staging | מסוף בדיקות Cardcom | secret staging | DB staging |
| production | מסוף פרוד יחיד (MVP) | secret prod | DB prod |
| עתידי: ספק X | מסוף ספק (אחרי snapshot) | shared או per-terminal | אותו DB; סינון לפי snapshot |

מעבר staging→prod = החלפת env מלאה, לא שני מסופים באותו deployment.

---

## 10. מקרי קצה (טבלת תפעול)

| קוד | סימפטום | תגובה |
|---|---|---|
| `secret_invalid` | signature_valid=false | 200; אלרט אם spike |
| `payload_unparsed` | external_event_id=`unparsed:…` | 200; לוג |
| `webhook_dup` | UNIQUE hit | 200 replay; no-op |
| `unknown_payment` | LP לא ב-DB | 200; reconcile ידני |
| `provider_decline` | ResponseCode לא success | payment→failed |
| `verify_failed` | GetLpResult לא success | לא paid; cron |
| `amount_mismatch` | סכום לא תואם | audit; לא paid |
| `terminal_mismatch` | (עתידי) GetLpResult על מסוף לא נכון | לא paid; P1 |
| `return_webhook_race` | שני ערוצים | finalize אחד + replay |
| `double_charge_same_ref` | אותו client_ref | אותו payment |
| `double_charge_two_refs` | שני refs | expiry/refund ידני אם צריך |
| `finalize_internal` | DB באמצע | reconcile + אלרט |
| `cardcom_down` | timeouts | CHECKOUT_ENABLED off + playbook |

---

## 11. Secrets ו-SAQ

| סוד / משתנה | שימוש |
|---|---|
| `CARDCOM_WEBHOOK_SECRET` | `?s=` |
| `CARDCOM_TERMINAL_NUMBER` | Create + GetLpResult (MVP) |
| `CARDCOM_API_NAME` | API |
| `CARDCOM_API_PASSWORD` | זיכויים בלבד (לא webhook) |
| `CHECKOUT_ENABLED` | kill switch ליצירת LP |

אין PAN/CVV בלוגים. Payload ב-`payment_webhook_events` בלי כרטיס מלא.

---

## 12. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | ערך N המדויק ל-cron על redirected (דקות) | לקבע ב-env מתועד + OBSERVABILITY |
| O2 | האם להוסיף עמודה `payments.cardcom_terminal_number` לפני multi-terminal | מומלץ לפני הפעלת מסוף שני; דורש DDL באישור נפרד |
| O3 | האם סוד webhook per-terminal או משותף כשיופעל multi-terminal | הכרעה אבטחה לפני go-live multi |
| O4 | האם 5xx מכוון ב-GetLpResult timeout (לעודד retry Cardcom) מול 200+cron | היום: מעדיפים 200 + reconcile; לשקול מדיניות מדודה |
| O5 | תצוגת admin לאירועי signature_valid=false (ספיק abuse) | קשור ל-OBSERVABILITY |

עודכן: 2026-08-12.

---

## 13. Acceptance

- [ ] אין HMAC על גוף; `?s=` + timing-safe מתועדים  
- [ ] GetLpResult לפני כל paid  
- [ ] UNIQUE webhook + paid_at + lp:client_ref  
- [ ] Webhook כפול / race = no-op  
- [ ] Double charge scenarios מכוסים  
- [ ] DLQ/reconcile בלי shortcut ל-paid  
- [ ] Multi-terminal: MVP יחיד + חוזה עתידי עם snapshot  
- [ ] חלופות שנדחו + סכמת DB + פתוחות  
- [ ] No Escrow  

---

## 14. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING ראשון (batch-2 #2) |
| 2026-08-12 | שכתוב לפי תבנית חובה: webhook כפול, multi-terminal, חלופות, DB, פתוחות |
| 2026-08-12 | השלמה: חוזה HTTP, ציר זמן כפילות, סכמת פריט DLQ, מטריצת סביבות/מסופים |
