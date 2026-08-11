# VENDOR-PAYOUT-SPEC.md
# מפרט מוצר: תשלום לספק (פיזי) אחרי חיוב Cardcom

נתיב הכסף: **הלקוח משלם ב-Cardcom** → ledger/`settlement_events` → **`payout_statements`** → ביצוע קנוני
`TransferFromDigitalBank`
(CSV = fallback).

Status: **SPEC** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמך מחייב (צינור ביצוע + סכמה):

```
docs/PAYOUT-ARCHITECTURE.md
```

פירוט באצ' / מסך / זכאות:

```
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
```

מסמכים קשורים:

```
docs/CARDCOM-ARCHITECTURE.md
docs/CHECKOUT-OPTIMIZATION.md
docs/LEGAL-TERMS-SUPPLIERS.md
docs/REFUNDS-CANCELLATION-POLICY.md
docs/FRAUD-PREVENTION-SPEC.md
docs/GO-LIVE-CHECKLIST.md
docs/CONTRADICTIONS.md
docs/GAPS-CODE-VS-DOCS.md
```

---

## 0. הכרעה (מיושרת ל-PAYOUT-ARCHITECTURE BINDING)

| # | הכרעה |
|---|---|
| VP1 | **קופון: אין payout** מהפלטפורמה (No Escrow; יתרה בעסק). |
| VP2 | **פיזי בלבד:** חלק הספק נצבר ב-`settlement_events` אחרי חיוב לקוח מאומת ב-Cardcom. |
| VP3 | ביצוע כסף קנוני לספק: Cardcom **`TransferFromDigitalBank`** אחרי אישור אדמין (`PAYOUT-ARCHITECTURE.md`). |
| VP4 | סליקת לקוח נשארת Low Profile / legacy Interface; payout לספק = שכבת v11 Financial נפרדת. |
| VP5 | אישור אדמין חובה לפני Transfer (או לפני סימון `paid` ב-fallback). |
| VP6 | CSV + העברה בנקאית ידנית = **fallback** בלבד (Financial לא זמין / Transfer נכשל). |
| VP7 | T+3, מינימום ₪100, `supplier_debit`, reconcile יומי: לפי המסמך הקנוני. |

שערי הפעלה לפני כסף אמיתי לספק: `PAYOUT-ARCHITECTURE.md` §11 + `GO-LIVE-CHECKLIST.md` §10.

---

## 1. זרימה מקצה לקצה

```text
לקוח משלם מוצר פיזי (Cardcom Low Profile)
  → אימות תשלום (GetLpResult / נוהל קיים)
  → order paid + split לפי platform_percent (snapshot)
  → settlement_events: charge_settled (supplier_due_agorot)
  → שעון T+3 (payout_available_at) + שער shipped|ready_for_pickup|fulfilled
  → cron: payout_statements (pending_approval)
  → admin מאשר
  → TransferFromDigitalBank  (קנוני)
       OR CSV + העברה ידנית  (fallback)
  → paid + payment_reference + payout_settled
  → reconcile יומי מול GetMoneyTransfers
```

פירוט מלא: `PAYOUT-ARCHITECTURE.md`.

---

## 2. תנאי זכאות לשורה

| תנאי | פירוט |
|---|---|
| סוג | `product_type = physical` |
| פיצול | `split_executed` |
| ledger | `charge_settled` עם `supplier_due_agorot > 0` |
| זמן | `payout_available_at <= now()` (ברירת מחדל T+3; חדש T+14) |
| משלוח | לפחות shipped / ready_for_pickup / fulfilled |
| ייחודיות | אין שורת `payout_statement_lines` לאותו אירוע |
| ספק | חשבון ב-`supplier_bank_accounts` מאומת; לא חסום |

סף מינימום (ברירת מחדל ₪100 = 10_000 אגורות): מתחת לסף → גלגול.

---

## 3. מסך אדמין (יעד מוצר)

| פעולה | תוצאה |
|---|---|
| צפייה ב-statements | סכומים באגורות + פירוט ספק |
| אישור / דחייה | audit + סטטוס |
| הפעלת Transfer | רק אחרי `approved` |
| הורדת CSV | fallback / ייצוא בנק |
| סימון שולם ידני | חובת אסמכתה (fallback) |
| חובות | הצגת `supplier_debit` לקיזוז |

סוגר פער G1 לפי GAPS / `PAYOUT-ARCHITECTURE.md` §10.

### 3.1 עמודות CSV (fallback)

| עמודה | תוכן |
|---|---|
| `supplier_id` | מזהה פנימי |
| `supplier_name_he` | שם לתצוגה |
| `bank_code` / `branch` / `account` | פרטי חשבון מאומתים |
| `amount_agorot` | סכום נטו אחרי קיזוז debit |
| `amount_ils` | תצוגה לבנק (נגזר; מקור = אגורות) |
| `statement_id` | מזהה statement |
| `lines_count` | מספר שורות settlement |

אין לכלול PAN לקוח או טוקני Cardcom ב-CSV.

---

## 4. החזרים אחרי payout

```text
refund ללקוח (Cardcom) על פיזי שכבר שולם לספק
  → settlement_events.kind = supplier_debit
  → קיזוז ב-statement הבא (לא מחיקת היסטוריה)
```

---

## 5. מה Cardcom כן עושה כאן

| פעולה | Cardcom |
|---|---|
| חיוב לקוח על מוצר פיזי | כן (LP / token לפי הזרימה) |
| אימות paid (מקור אמת) | כן (`GetLpResult` / נוהל קיים) |
| Refund ללקוח | כן (admin) |
| העברה לספק | כן: **`TransferFromDigitalBank`** (קנוני אחרי שערי §11 ב-PAYOUT) |

### 5.1 פירוש "payout דרך Cardcom"

1. **Cardcom** = סליקת הלקוח לפלטפורמה **וגם** צינור יציאה לספק (`TransferFromDigitalBank`).  
2. **ledger / `payout_statements`** = חישוב ואישור לפני היציאה.  
3. **CSV ידני** = fallback בלבד.

פרטי API / client: `CARDCOM-ARCHITECTURE.md` §1.5 + §7.1; אלגוריתם: `PAYOUT-ARCHITECTURE.md` §5–§8.

### 5.2 שערי הפעלה (לפני Transfer אמיתי)

זהים ל-`PAYOUT-ARCHITECTURE.md` §11: בנק דיגיטלי, מפתחות, sandbox, bank verified, kill switch, CSV fallback מנוסה.

### 5.3 כשל Transfer

```text
approved → Transfer נכשל
  → status=failed / transfer_failed
  → fallback CSV + אסמכתה ידנית
  → paid + payout_settled
```

קופון נשאר מחוץ לכל נתיב Financial.

---

## 6. Acceptance

- [ ] אין שורות coupon ב-statements  
- [ ] אין Transfer / `paid` בלי אישור אדמין  
- [ ] סכומים `bigint` אגורות בלבד  
- [ ] קיזוז debit עובד אחרי refund  
- [ ] LEGAL-TERMS לא מבטיח מועד לפני שהמסך חי  
- [ ] CSV בלי PAN / טוקנים  
- [ ] שערי PAYOUT §11 + GO-LIVE §10 מסומנים לפני כסף אמיתי לספק  

---

## 7. החלטה שתועדה ב-STATE

Payout פיזי קנוני = `TransferFromDigitalBank` אחרי Cardcom customer settlement; CSV = fallback. מקור: `PAYOUT-ARCHITECTURE.md`.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט payout פיזי (CSV כ-MVP זמני) |
| 2026-08-11 | Phase B / שערי Financial |
| 2026-08-11 | **יישור לקנוני:** TransferFromDigitalBank; CSV=fallback; מצביע ל-PAYOUT-ARCHITECTURE |
