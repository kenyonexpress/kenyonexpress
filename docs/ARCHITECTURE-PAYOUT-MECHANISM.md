# ארכיטקטורה: מנגנון תשלום לספקים (מוצר פיזי)

תשלום יתרת ספק על **מוצר פיזי בלבד**: זכאות T+N, באצ', אישור אדמין, ביצוע Cardcom `TransferFromDigitalBank` או CSV fallback.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. אין held/נאמן/J5 לקופון. **קופון: אין payout** מהפלטפורמה (יתרה נגבית בבית העסק).

צינור ביצוע קנוני מפורט ב:

```
docs/PAYOUT-ARCHITECTURE.md
```

(`TransferFromDigitalBank` + `payout_statements`). מסמך זה מחייב לזכאות, באצ', CSV fallback, וגבולות No Escrow.

מסמכים קשורים:

```
docs/PAYOUT-ARCHITECTURE.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/GAPS-CODE-VS-DOCS.md
```

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| PY1 | פיזי בלבד. שורות קופון לא נכנסות ל-payout. |
| PY2 | מקור סכום = `settlement_events` באגורות `bigint`, לא חישוב מחדש מ-`order_items` בזמן תשלום. |
| PY3 | זכאות: `charge_settled` + `split_executed` + שעון T+N + שער משלוח. |
| PY4 | ביצוע: `TransferFromDigitalBank` (קנוני) או CSV (fallback); אישור אדמין לפני יציאת כסף. |
| PY5 | סף מינימום מצולם לריצה (ברירת מחדל 100 ₪ = 10_000 אגורות). מתחת: גלגול, בלי שורות. |
| PY6 | ספק חסום / בלי חשבון מאומת: לא נכנס לבאצ' תשלום. |
| PY7 | אחרי payout: החזר יוצר `supplier_debit` ומתקזז בבאצ' הבא; לא מוחקים חוב. |
| PY8 | אין Escrow/held/J5. קופון מחוץ לצינור. |
| PY9 | כל סכום באגורות integer; אין float. |
| PY10 | סליקת לקוח נשארת Low Profile / Interface; payout לספק שכבה נפרדת. |

**קנוני:** Cardcom `TransferFromDigitalBank` אחרי אישור אדמין (T+N, מינימום, `supplier_debit`, reconcile).

**Fallback:** ייצוא CSV + העברה בנקאית ידנית מתוך באצ' מאושר, עם הזנת `payment_reference`.

ארנק קאשבק משתמש **אינו** חלק מ-payout ספק.

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Multi-Account Cardcom בזמן checkout (פיצול מיידי לספק) | מורכבות תפעולית; snapshot + payout batch מספיק. |
| Escrow / held-until-redeem לקופון | סותר No Escrow; קופון לא עובר בצינור payout. |
| payout אוטומטי בלי אישור אדמין | סיכון fraud / שגיאת באצ'; אדמין חובה. |
| חישוב net מ-`products.platform_percent` החי | משנה היסטוריה; snapshot בלבד. |
| תשלום מיידי ב-`paid` (בלי T+N) | חשיפה ל-chargeback/refund; T+3/T+14 נדרש. |
| מחיקת `supplier_debit` אחרי החזר | מאבד audit; קיזוז בבאצ' הבא בלבד. |

---

## 2. סכמת DB (קיים / יעד; אין DDL חדש במסמך)

| ישות | תפקיד |
|---|---|
| `settlement_events` | ledger; `kind`, `supplier_due_agorot`, `idempotency_key` UNIQUE |
| `order_items` | `settlement_status`, `supplier_immediate_agorot`, snapshot amounts |
| `suppliers` | `payout_hold_business_days`, `min_payout_ils`, `status` |
| `supplier_bank_accounts` | פרטי בנק; RLS אדמין; חשבון פעיל מאומת אחד |
| `payout_batches` / statements | תקופה, סטטוסים, gross/debit/net באגורות |
| ריצת ספק | gross / debit / net, `payment_reference`, UNIQUE על `settlement_event_id` |

```text
net_agorot = gross_agorot - debit_agorot
idempotency_key על באצ' ועל ריצת ספק
```

אין DDL חדש במסמך זה. יישור ל-PAYOUT-ARCHITECTURE ומיגרציות pending.

---

## 3. מתי משולם (טריגר)

### 3.1 שעון כסף

| תנאי | פירוט |
|---|---|
| סוג | `order_items.product_type = 'physical'` |
| פיצול | `settlement_status = 'split_executed'` |
| ledger | `settlement_events.kind = 'charge_settled'` עם `supplier_due_agorot > 0` |
| עיכוב | `payout_available_at(occurred_at) <= now()` |
| חד-פעמי | אין שורת payout לאותו אירוע |

```text
payout_available_at =
  add_business_days(event_at, suppliers.payout_hold_business_days)
```

ברירת מחדל: **T+3 ימי עסקים**. ספק חדש (שלושת החודשים הראשונים): **T+14** פר ספק.

### 3.2 שער מימוש משלוח

בנוסף ל-T+N, השורה לפחות ב:

```text
shipped | ready_for_pickup | fulfilled
```

אישור משלוח אינו מחליף את T+N; הוא מונע תשלום על הזמנה ששולמה ועדיין לא יצאה.

### 3.3 מתי רץ המנוע

```text
/api/cron/payouts
ראשון 03:00 Asia/Jerusalem
כותרת: CRON_SECRET
```

ה-cron יוצר באצ'/ריצות ב-`pending_approval`. **אף שקל לא יוצא בלי אישור אדמין.**

---

## 4. איך משולם (ביצוע)

### 4.1 קנוני (TransferFromDigitalBank)

```text
cron → pending_approval
  → /admin/payouts אישור
  → TransferFromDigitalBank (לפי PAYOUT-ARCHITECTURE)
  → reconcile + status paid
  → settlement_events.kind = payout_settled
```

### 4.2 Fallback (CSV)

```text
cron → pending_approval
  → /admin/payouts אישור
  → ייצוא CSV באצ'
  → העברה בבנק (ידנית)
  → הזנת payment_reference
  → status = paid
  → payout_settled על השורות
```

---

## 5. אלגוריתם באצ' (cron)

לכל ספק פעיל שאינו חסום:

```text
1. אסוף charge_settled זכאים (סעיף 3)     → gross
2. אסוף supplier_debit שלא קוזזו         → debit
3. net = gross - debit
4. אם אין בנק מאומת / חסום / net < min / net <= 0
     → דילוג / rolled_over; אפס שורות תשלום
5. INSERT באצ' + ריצה pending_approval + שורות
6. commit (idempotent)
```

---

## 6. מסך אדמין

```text
/admin/payouts
```

| יכולת | פירוט |
|---|---|
| רשימת באצ'ים | תקופה, סטטוס, ברוטו/קיזוז/נטו ב-₪ |
| פירוט ספק | שורות עד הזמנה; 4 ספרות אחרונות של חשבון |
| אישור | שערים: בנק מאומת, לא חסום, net>0, אין dispute פתוח |
| CSV / Transfer | לפי מצב המערכת; paid דורש אסמכתה |

---

## 7. מקרי קצה

| מקרה | התנהגות |
|---|---|
| החזר אחרי payout | `supplier_debit`; קיזוז בבאצ' הבא; לא מחיקה |
| ספק חסום לפני באצ' | דילוג; אין ריצה |
| חסום ב-`pending_approval` | cancelled; שורות לא נצרכות כשולם |
| חסום אחרי approved לפני paid | הקפאה; אסור Transfer/CSV/paid עד שחרור |
| מתחת לסף | `rolled_over`; אפס שורות |
| בלי בנק מאומת | skipped; לא חוסם redeem קופונים |
| קופון ברשימה | reject לפי PY1; אין מסלול Escrow |
| TransferFromDigitalBank כשל | `payout_failed`; retry; לא double-pay |
| duplicate cron run | idempotency על באצ' + event |
| dispute פתוח על שורה | exclude מבאצ' עד סגירה |

---

## 8. אינווריאנטות

| # | טענה |
|---|---|
| I1 | אירוע ledger לא בשתי ריצות (UNIQUE על event) |
| I2 | `net = gross - debit` |
| I3 | באצ'/ריצה לא נוצרים פעמיים לאותה תקופה |
| I4 | אין תשלום מתחת לסף או על נטו ≤ 0 |
| I5 | אין תשלום בלי בנק מאומת ובלי אישור אדמין |
| I6 | לשובר/קופון אין payout |
| I7 | כל סכום באגורות `bigint` |
| I8 | ספק חסום לא מגיע ל-`paid` |
| I9 | No Escrow: אין held לקופון בצינור payout |

---

## 9. Acceptance

- [ ] באצ' עם idempotency יציב
- [ ] רק פיזי + T+N + שער משלוח
- [ ] TransferFromDigitalBank מתועד כקנוני; CSV כ-fallback
- [ ] אישור אדמין חובה לפני יציאת כסף
- [ ] החזר אחרי paid → debit בבאג' הבא
- [ ] קופון: 0 שורות payout
- [ ] אין float; No Escrow מפורש

---

## 10. פתוחות

| ID | שאלה | ברירת מחדל |
|---|---|---|
| Q-PY-SHIP | האם `delivered` חובה מעבר ל-`shipped`? | לא; `shipped` מספיק |
| Q-PY-NEW | T+14 לספק חדש: 3 חודשים קלנדריים? | כן |
| Q-PY-TABLE | שם טבלת באצ' סופי: `payout_batches` vs statements | לפי PAYOUT-ARCHITECTURE |

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | מסמך מחייב: T+N + באצ' + CSV + edge cases |
| 2026-08-12 | batch-2: BINDING template; חמשת סעיפי חובה; No Escrow |
