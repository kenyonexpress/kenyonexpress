# ארכיטקטורה: מנויים (Subscriptions)

Cardcom Recurring Token, חידושים, ביטולים, כישלון גבייה.

Status: **BINDING (design)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-RECURRING-SUBSCRIPTIONS.md
docs/SUBSCRIPTIONS-BILLING-SPEC.md
docs/ARCHITECTURE-PRODUCT-TYPES.md
docs/ARCHITECTURE-MONEY.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/CARDCOM-ARCHITECTURE.md
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
```

**יחס ל-RECURRING:** המסמך הזה = מקור אמת טכני (Token, cron, retry, ביטול, ledger). Recurring = תצוגת מוצר. בהתנגשות גובר המסמך הזה.

מודל כסף: **No Escrow**. מנוי ≠ מקדמת קופון. אין voucher מימוש בעסק במפרט זה. אגורות integer. `platform_percent` snapshot פר מחזור. דגל `SUBSCRIPTIONS_ENABLED` נפרד משיגור קופונים.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| SU1 | `products.type = 'subscription'`. Interval ראשון: `monthly` בלבד. |
| SU2 | חיוב ראשון: Low Profile **ChargeAndCreateToken** (או מקביל מאושר). מקור אמת = GetLpResult / תוצאת charge מאומתת. |
| SU3 | מחזורים הבאים: **ChargeToken** server-to-server בלבד. אין iframe לכל חודש. |
| SU4 | Idempotency חיוב מחזור: UNIQUE `sub:{subscription_id}:{period_start_iso}` על invoice. |
| SU5 | טוקן Cardcom = server-only (עמודת מוצפנת / vault). לא ל-client, לא ל-Sentry, לא ללוגים. |
| SU6 | אין Escrow / held. פיצול לספק (אם יש) = residual לפי snapshot `%` על סכום המחזור. |
| SU7 | משתמש מחובר חובה בהצטרפות; לא אורח; לא דרך `beginCheckout` של עגלת קופון. |
| SU8 | ביטול מאזור אישי (+ `/cancel`); אחרי ביטול cron לא מחייב. ניסוח ללקוח דורש עו״ד לפני פרסום. |
| SU9 | Soft decline: עד 3 ניסיונות בחלון ~7 ימים על **אותו** idempotency_key; אז `paused` או `cancelled` (ברירת מחדל שמרנית: `paused` + דורשים עדכון כרטיס). |
| SU10 | Hard decline / token invalid: עצירת retry; סטטוס `past_due`/`paused`; CTA עדכון כרטיס. |
| SU11 | מיגרציות/קוד פרוד רק אחרי threat model + דגל כבוי כברירת מחדל. לא soft-open קופונים. |
| SU12 | Wallet spend על מנוי: אופציונלי עם מפתח `sub_spend:{invoice_id}`; לא חובה ב-MVP. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| חיוב חוזר בלי Token (PAN כל פעם) | PCI + חיכוך; Cardcom Token הוא המודל. |
| Webhook בלבד בלי idempotency לתקופה | double-charge ב-retry/cron חופפים. |
| מנוי דרך עגלת קופון רגילה | ערבוב voucher/settlement; מסלול נפרד. |
| Escrow עד "שימוש במנוי" | סותר No Escrow; מנוי = הכנסה מחזורית. |
| סימון `paid` מ-Return URL בלי אימות | כמו checkout חד-פעמי; אסור. |
| ביטול רק במייל לתמיכה | חובה UI עצמי לפי כיוון צרכני. |
| הנפקת voucher חודשי כמנוי | מחוץ למפרט; PRODUCT-TYPES. |

---

## 2. סכמת DB (יעד; אין DDL במסמך זה)

אין DDL כאן. מיגרציה עתידית ב-`migrations/pending` רק אחרי אישור.

### 2.1 מוצר

| שדה | כלל |
|---|---|
| `type` | `subscription` |
| `billing_interval` | `monthly` |
| `recurring_amount_agorot` | > 0 |
| `max_billing_cycles` | null = ללא הגבלה |
| `platform_percent` | חובה לפרסום; אין default |

### 2.2 `subscriptions`

סטטוסים: `incomplete` | `active` | `past_due` | `paused` | `cancelled` | `expired`.

שדות ליבה: `user_id`, `product_id`, `supplier_id`, `amount_agorot`, `platform_percent_snapshot` (של מחזור נוכחי/אחרון), `cardcom_token` (server), `card_last4`, `next_billing_at`, `current_period_start/end`, `cycles_completed`, `max_billing_cycles`, `retry_count`, `cancel_at_period_end`, `cancelled_at`, `paused_at`.

RLS: לקוח SELECT own; כתיבות כסף/טוקן = service role אחרי שער שרת.

### 2.3 `subscription_invoices`

| שדה | כלל |
|---|---|
| `status` | pending \| paid \| failed \| refunded \| void |
| `idempotency_key` | UNIQUE `sub:{id}:{period_start}` |
| `amount_agorot` | snapshot |
| `platform_percent_snapshot` | פר מחזור |
| `cardcom_deal_*` | מזהי ספק תשלום |

---

## 3. Cardcom Recurring Token

### 3.1 הצטרפות (חיוב ראשון)

```text
PDP subscription + SUBSCRIPTIONS_ENABLED
  → auth required
  → CreateLowProfile ChargeAndCreateToken (amount = recurring_amount)
  → return / webhook
  → GetLpResult (אמת)
  → success:
       store token server-only
       subscription = active
       invoice#1 = paid (idempotency period0)
       order + order_items snapshots
       mail RTL
  → fail: incomplete; אין token לשימוש חוזר
```

| כלל | פירוט |
|---|---|
| סכום | agorot → ILS רק בשכבת Cardcom |
| חתימה / אימות | כמו CARDCOM-WEBHOOKS (`?s=` + GetLpResult) |
| כפילות return+webhook | אותו finalize idempotent |

### 3.2 חידוש (ChargeToken)

```text
Cron (CRON_SECRET) יומי:
  claim due subscriptions (FOR UPDATE SKIP LOCKED)
    status=active
    next_billing_at <= now()
    cancel_at_period_end = false
    cycles < max (אם מוגדר)

  per sub:
    INSERT invoice pending ON CONFLICT idempotency_key DO NOTHING → exit if exists paid/pending-in-flight
    ChargeToken(token, amount_agorot)
    OK  → mark paid, order, cycles++, advance period, reset retry_count
    FAIL → §5
```

תזמון עוגן: יום מ-`paid_at` הראשון, `Asia/Jerusalem`. אם אין יום בחודש (31) → יום אחרון בחודש.

אין ChargeToken בלי שורת invoice עם מפתח תקופה.

### 3.3 החלפת כרטיס

Low Profile CreateTokenOnly או ChargeAndCreateToken קטן/אפס לפי יכולת Cardcom המאושרת. מחליפים טוקן בשרת בלבד. אם `past_due`: ניסיון מיידי לאותה תקופה **עם אותו idempotency_key** (אם עדיין לא paid).

---

## 4. חידושים (renewal) מול הלקוח

| אירוע | התנהגות |
|---|---|
| הצלחה שקטה | מייל קבלה אופציונלי; גישה נמשכת |
| תזכורת לפני חיוב | אופציונלי T-3; לא חוסם |
| הגעת `max_billing_cycles` | `expired`; אין ChargeToken נוסף |
| שינוי מחיר במוצר | לא משנה מנויים פעילים עד מדיניות מפורשת; ברירת מחדל שמרנית = נשאר `amount_agorot` שצולם בהצטרפות/מחזור אחרון |

החלטה שמרנית (מתועדת): מחיר מנוי מצולם בהצטרפות; שינוי קטלוג לא מזיז מנויים חיים בלי consent מפורש (פתוח O2).

---

## 5. כישלון גבייה (dunning)

| סוג כשל | זיהוי | פעולה |
|---|---|---|
| Soft (insufficient funds, temp) | קוד Cardcom soft | `past_due`; retry |
| Hard (stolen, invalid token) | קוד hard | עצירת retry; CTA עדכון כרטיס; `paused` אחרי מדיניות |
| Technical (timeout, 5xx) | רשת/ספק | backoff; לא נחשב soft מיד; לא מסמנים paid |

### 5.1 לוח retry (יעד)

| ניסיון | מתי |
|---|---|
| 1 | מיידי עם כשל ראשון ב-cron |
| 2 | +2 ימים מניסיון 1 |
| 3 | +5 ימים מניסיון 1 |
| אחרי 3 soft בחלון 7 ימים | `paused` (שמרני) + מייל; לא ChargeToken עד עדכון כרטיס / resume |

כל ה-retries לאותה תקופה משתמשים ב**אותו** `idempotency_key`. אסור invoice חדש לאותה period.

### 5.2 גישה בזמן `past_due`

ברירת מחדל שמרנית: גישה נמשכת עד סוף חלון ה-dunning או עד hard pause (מוצר דיגיטלי). ניסוח ללקוח + האם לחסום גישה מיד = עו״ד (O3).

---

## 6. ביטולים והקפאה

```text
incomplete → active
active → past_due → active (אחרי תשלום)
active|past_due → paused → active (resume + charge אם צריך)
active|paused|past_due → cancelled
active → expired (max cycles)
```

| פעולת לקוח | תוצאה |
|---|---|
| ביטול מיידי | `cancelled_at=now()`; אין חיוב עתידי; גישה עד `current_period_end` אם התקופה שולמה |
| `cancel_at_period_end` | נשאר `active` עד סוף תקופה; cron מדלג על renew |
| הקפאה (אם מוצג) | cron מדלג; resume = חיוב לתקופה חדשה לפי כללים |
| אדמין cancel | audit + אותו איסור ChargeToken |

אחרי `cancelled` / `expired`: כל ChargeToken נחסם בשער cron (בדיקת status לפני charge).

Refund על מחזור ששולם: לפי REFUNDS/LEGAL; לא אוטומטי בביטול.

---

## 7. Ledger / כסף פר מחזור

```text
invoice paid
  → order + items (amount, platform_percent snapshot)
  → extractVat על חלק פלטפורמה
  → supplier_due = residual אם פיזי-שירות עם ספק (לא קופון)
  → optional wallet spend / cashback עם מפתחי sub_*
```

| כלל | פירוט |
|---|---|
| יחידה | agorot |
| כשל אחרי ChargeToken לפני ledger | reconcile; **לא** charge שני לאותה period |
| קופון | אין |

---

## 8. מקרי קצה

| קוד | סימפטום | תוצאה |
|---|---|---|
| `double_cron` | שני workers | SKIP LOCKED + UNIQUE idempotency |
| `return_and_webhook` | כפילות הצטרפות | finalize פעם אחת |
| `charge_ok_db_fail` | Cardcom OK, DB down | reconcile by deal/idempotency; no second charge |
| `cancel_during_charge` | ביטול תוך כדי | אם invoice כבר paid נשאר; אחרת לא renew |
| `token_missing` | active בלי token | paused + alert P1 |
| `flag_off` | SUBSCRIPTIONS_ENABLED=false | אין CTA/cron charge |
| `guest_subscribe` | בלי auth | חסום |
| `period_31` | חיוב ב-31 לחודש קצר | יום אחרון בחודש |

---

## 9. פתוחות

| # | פתוח | הערה שמרנית עד סגירה |
|---|---|---|
| O1 | ניסוח ביטול/14 יום לעו״ד | אין copy פרוד בלי אישור |
| O2 | האם שינוי מחיר קטלוג מזיז מנויים חיים | לא; נשאר amount מצולם |
| O3 | חסימת גישה מיידית ב-past_due | לא; גישה עד סוף dunning/pause |
| O4 | wallet על מנוי ב-MVP | כבוי |
| O5 | שנתי / הנחת prepay | phase 2 |
| O6 | קודים מדויקים soft/hard של Cardcom | למפות ב-CARDCOM לפני קוד |

עודכן: 2026-08-12.

---

## 10. Acceptance

- [ ] ChargeAndCreateToken + GetLpResult בהצטרפות  
- [ ] ChargeToken + idempotency לתקופה  
- [ ] Dunning 3/7 + paused שמרני  
- [ ] ביטול חוסם renew  
- [ ] Token לא ב-client  
- [ ] No Escrow; לא voucher  
- [ ] חלופות + DB + מקרי קצה + פתוחות  

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | ארכיטקטורת מנוי מלאה |
| 2026-08-12 | batch #48 / pass-2 |
| 2026-08-12 | שכתוב לפי תבנית: Token, renew, cancel, dunning, חלופות, פתוחות שמרניות |
