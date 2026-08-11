# ארכיטקטורה: התאמת תשלומים

התאמה יומית בין Cardcom, `payments`, `orders`, ledger ו-wallet. מטרה: כל שקל שנגבה ב-Cardcom מיושב להזמנה `paid`, וכל הזמנה `paid` יש לה ראיית תשלום, בלי כפילויות ובלי Escrow מדומה.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held לספק על מקדמת קופון.

מסמכים קשורים:

```
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-ANALYTICS-KPI.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
```

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| RC1 | התאמה יומית אוטומטית (cron) + דוח אדמין; diff קריטי → Ntfy ops. |
| RC2 | מקור אמת לסכום שנגבה: `payments` + Cardcom export/API; לא חישוב מחדש מ-`products`. |
| RC3 | כל `payments.status = succeeded` חייב `orders.paid_at` לא null (או wallet-covers-all מתועד). |
| RC4 | אין `orders.paid_at` בלי payment succeeded או wallet-covers-all עם audit. |
| RC5 | סכום Cardcom == `paid_on_site` snapshot (סובלנות עיגול אגורה אחת). |
| RC6 | אין שתי שורות payment succeeded לאותו `idempotency_key`. |
| RC7 | קופון: אין שורות escrow hold; מקדמת אתר = `platform_settled` בלבד. |
| RC8 | Refunds: סכום מצטבר ≤ original; כל refund עם `cardcom_refund_transaction_id` או wallet audit. |
| RC9 | דוחות reconciliation: `is_admin()` בלבד; ספק לא רואה התאמת פלטפורמה מלאה. |
| RC10 | כל סכום באגורות integer; אין float במסלול ההתאמה. |

Job יעד:

```
fn_reconcile_payments_daily
```

או Edge cron + דוח ל-admin + Ntfy על diff.

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| התאמה ידנית בלבד (Excel) | לא סקייל; אין התראה על drift בזמן. |
| מקור אמת = דוח Cardcom בלבד (בלי DB) | לא מקשר order/voucher; לא תומך wallet-only. |
| Escrow hold פנימי לקופון + reconcile על release | סותר No Escrow; מוסיף מצב כסף שלא קיים. |
| התאמה רק על gross Cardcom (בלי refunds/chargebacks) | מסתיר החזרים חלקיים ו-disputes פתוחים. |
| ספק רואה reconcile מלא | דליפת PII ונתוני פלטפורמה; RBAC נדחה. |
| float / ILS בחישובי diff | round-trip שובר אגורה; נדחה לטובת agorot. |

---

## 2. סכמת DB (קיים; אין DDL חדש)

| ישות | מפתח / שדות רלוונטיים |
|---|---|
| `payments` | `idempotency_key`, `cardcom_transaction_id`, `cardcom_account_key`, `status`, `amount_agorot` |
| `orders` | `paid_at`, `total_*_agorot`, `status` |
| `payment_events` | append-only trail; replay / webhook audit |
| `order_items` | snapshot `paid_on_site_agorot`, `platform_fee_agorot`, `supplier_due` |
| `settlement_events` | ledger posts; `kind`, `supplier_due_agorot`, `idempotency_key` |
| `refunds` | `amount_agorot`, `status`, `cardcom_refund_transaction_id` |
| `wallet_ledger` / journal | wallet-covers-all path |
| Cardcom reports | export חיצוני; לא טבלת DB |

אין DDL חדש במסמך זה. יישור למיגרציות קיימות ב-`supabase/migrations/`.

---

## 3. כללי התאמה יומיים

| בדיקה | צפי |
|---|---|
| R1 | כל `payments.status=succeeded` עם `order.paid_at` לא null |
| R2 | אין `order.paid_at` בלי payment succeeded או wallet-covers-all |
| R3 | סכום Cardcom == `paid_on_site` snapshot (±1 agora) |
| R4 | אין duplicate succeeded על אותו `idempotency_key` |
| R5 | קופון: אין שורות escrow hold חדשות |
| R6 | Refunds: סכום מצטבר ≤ original |
| R7 | `settlement_events` לשורה paid תואם snapshot `order_items` |
| R8 | אין voucher כפול לאותה יחידת קופון |

---

## 4. מקרי קצה

| מקרה | התנהגות |
|---|---|
| Paid in Cardcom, order pending | replay finalize / manual runbook; freeze payout עד סגירה |
| Order paid, no Cardcom id | חקירה wallet-only vs bug; audit חובה |
| Amount mismatch (±>1 agora) | freeze payouts related; SEV2; human |
| Duplicate vouchers לאותה יחידה | mark extras void; alert SEV1 |
| Webhook replay / duplicate finalize | idempotency על payment + settlement |
| Partial refund אחרי paid | `payments` + `refunds` מצטבר; voucher frozen/refunded |
| Chargeback פתוח | order freeze; לא payout לספק על שורה disputed |
| Wallet covers 100% | payment succeeded עם amount 0 + wallet debit audit |
| Clock skew בין Cardcom ל-DB | reconcile לפי `TransactionId`, לא timestamp בלבד |
| Cron כשל באמצע batch | resume idempotent; לא double-alert |

---

## 5. מצבי חריגה (ops)

| מצב | טיפול |
|---|---|
| Paid in Cardcom, order pending | replay finalize / manual runbook |
| Order paid, no Cardcom id | חקירה wallet-only vs bug |
| Amount mismatch | freeze payouts; human |
| Duplicate vouchers | mark extras void; alert SEV1 |

---

## 6. הרשאות

- דוחות reconciliation: `is_admin()` בלבד.
- ספק לא רואה התאמת פלטפורמה מלאה.
- support: קריאה מוגבלת לפי RBAC (אם יוגדר).

---

## 7. Acceptance

- [ ] cron יומי + דוח admin
- [ ] Ntfy על diff קריטי
- [ ] אין escrow hold בבדיקות קופון
- [ ] idempotency על payment
- [ ] agorot בלבד

---

## 8. פתוחות

| ID | שאלה | ברירת מחדל |
|---|---|---|
| Q-RC-API | Cardcom reconcile API vs export ידני? | export יומי + API כשזמין |
| Q-RC-TOL | סובלנות diff מעבר לאגורה אחת? | 0; חקירה על כל diff |
| Q-RC-WALLET | reconcile wallet-only נפרד? | כן, באותו job |

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | Payment reconciliation (arch/docs-queue) |
| 2026-08-12 | batch-2: BINDING template; No Escrow; חמשת סעיפי חובה |
