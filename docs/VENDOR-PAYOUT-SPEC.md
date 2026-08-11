# VENDOR-PAYOUT-SPEC.md
# מפרט תשלום לספק (מוצר פיזי) אחרי חיוב Cardcom

נתיב הכסף: **הלקוח משלם ב-Cardcom** → ledger/`settlement_events` → **payout לספק בהעברה בנקאית ידנית** (CSV) אחרי אישור אדמין.

Status: **SPEC** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמך מחייב:

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
docs/CONTRADICTIONS.md
docs/GAPS-CODE-VS-DOCS.md
```

---

## 0. הכרעה (אוטומטית, מיושרת ל-BINDING)

| # | הכרעה |
|---|---|
| VP1 | **קופון: אין payout** מהפלטפורמה (No Escrow; יתרה בעסק). |
| VP2 | **פיזי בלבד:** חלק הספק נצבר ב-`settlement_events` אחרי חיוב לקוח מאומת ב-Cardcom. |
| VP3 | ביצוע כסף לספק ב-MVP: **העברה בנקאית ידנית + CSV**, לא Cardcom Financial ולא מסה"ב אוטומטי. |
| VP4 | Cardcom = סליקת **לקוח** (וקבלת כסף לפלטפורמה). לא משיכת כסף אוטומטית לספק בגרסה הנוכחית. |
| VP5 | אישור אדמין חובה לפני סימון `paid` על באצ'. |
| VP6 | עתיד (לא מחייב עכשיו): Cardcom Financial / מסה"ב רק אחרי threat model + מפתחות מופרדים. |

**למה לא Cardcom→ספק ישירות עכשיו:** הלקוח החי הוא legacy Interface; אין הפרדת מפתחות בטוחה לפעולות שמוציאות כסף; טעות עולה בכסף אמיתי. המערכת מחשבת ומאשרת; האדם מבצע.

---

## 1. זרימה מקצה לקצה

```text
לקוח משלם מוצר פיזי (Cardcom Low Profile)
  → אימות תשלום (GetLpResult / נוהל קיים)
  → order paid + split לפי platform_percent (snapshot)
  → settlement_events: charge_settled (supplier_due_agorot)
  → שעון T+N + שער shipped|ready_for_pickup|fulfilled
  → cron שבועי: payout_batch (pending_approval)
  → admin מאשר → ייצוא CSV
  → העברה בבנק (ידנית)
  → admin מזין payment_reference → batch paid
  → settlement_events: payout_settled
```

---

## 2. תנאי זכאות לשורה

| תנאי | פירוט |
|---|---|
| סוג | `product_type = physical` |
| פיצול | `split_executed` |
| ledger | `charge_settled` עם `supplier_due_agorot > 0` |
| זמן | `payout_available_at <= now()` (ברירת מחדל T+3; חדש T+14) |
| משלוח | לפחות shipped / ready_for_pickup / fulfilled |
| ייחודיות | אין `supplier_payout_lines` קיימת לאותו אירוע |
| ספק | חשבון בנק מאומת; לא חסום |

סף מינימום באצ' (ברירת מחדל ₪100 = 10_000 אגורות): מתחת לסף → גלגול.

---

## 3. מסך אדמין (יעד מוצר)

| פעולה | תוצאה |
|---|---|
| צפייה בבאצ' | סכומים באגורות + פירוט ספק |
| אישור / דחייה | audit + סטטוס |
| הורדת CSV | פורמט בנק מוסכם |
| סימון שולם | חובת אסמכתה |
| חובות | הצגת `supplier_debit` לקיזוז |

סוגר פער G1 (מסך payouts) לפי GAPS / PAYOUT-MECHANISM.

---

## 4. החזרים אחרי payout

```text
refund ללקוח (Cardcom) על פיזי שכבר שולם לספק
  → settlement_events.kind = supplier_debit
  → קיזוז בבאצ' הבא (לא מחיקת היסטוריה)
```

---

## 5. מה Cardcom כן עושה כאן

| פעולה | Cardcom |
|---|---|
| חיוב לקוח על מוצר פיזי | כן (LP / token לפי הזרימה) |
| אימות paid (מקור אמת) | כן (`GetLpResult` / נוהל קיים) |
| Refund ללקוח | כן (admin) |
| העברה / משיכה לספק | **לא ב-MVP** |

### 5.1 פירוש "payout דרך Cardcom"

במסמכי מוצר אומרים לפעמים "payout דרך Cardcom". הפירוש המחייב:

1. **Cardcom** = נקודת הכניסה של הכסף מהלקוח לפלטפורמה.  
2. **ledger / settlement_events** = חישוב חלק הספק אחרי settlement.  
3. **העברה בנקאית ידנית + CSV** = יציאת הכסף לספק.

Cardcom Financial (או מסה"ב אוטומטי) = שלב עתידי אחרי threat model + מפתחות נפרדים לפעולות שמוציאות כסף. לא חלק מהשקה.

---

## 6. Acceptance

- [ ] אין שורות coupon בבאצ'  
- [ ] אין `paid` בלי אסמכתה  
- [ ] סכומים `bigint` אגורות בלבד  
- [ ] קיזוז debit עובד אחרי refund  
- [ ] LEGAL-TERMS לא מבטיח מועד לפני שהמסך חי  

---

## 7. החלטה שתועדה ב-STATE

Payout פיזי = ידני אחרי Cardcom customer settlement; לא Cardcom Financial עד איום-מודל נפרד.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט payout פיזי: Cardcom ללקוח, העברה בנקאית לספק |
| 2026-08-11 | סעיף 5.1: פירוש מחייב ל"payout דרך Cardcom" |
