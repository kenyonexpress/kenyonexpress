# LAUNCH-WEEK-RUNBOOK.md
# Runbook: שבוע השקה (D-2 עד D+7)

תפעול יומי סביב soft-open: מי עושה מה, שערי עצירה, ותלויות במסמכים האחרים.  
יום ה-cutover עצמו מפורט ב-

```
docs/RUNBOOK-LAUNCH-DAY.md
```

Status: **RUNBOOK** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/RUNBOOK-LAUNCH-DAY.md
docs/LAUNCH-CHECKLIST.md
docs/LAUNCH-VALIDATION.md
docs/MARKETING-LAUNCH-PLAN.md
docs/MARKETING-LAUNCH.md
docs/CHECKOUT-OPTIMIZATION.md
docs/INCIDENT-PLAYBOOKS.md
docs/OPS-DAILY-ROUTINE.md
docs/SECURITY-AUDIT-CHECKLIST.md
docs/ANALYTICS-SPEC.md
docs/PROGRESS-REPORT-AUG.md
```

בעלים יחיד על השבוע: אתה. סדר השערים קשיח.

---

## 0. שערי כניסה לשבוע (חובה לפני D0)

- [ ] ≥ 5/10 דילי seed `verified` ב-`LAUNCH-VALIDATION.md`  
- [ ] Cardcom production smoke: הזמנה → LP → return → אימות → `paid`  
- [ ] `CHECKOUT_ENABLED=true` רק אחרי smoke  
- [ ] באנר עוגיות + Consent Mode חיים  
- [ ] Sentry / התראות בסיסיות  
- [ ] סעיף כסף ב-`SECURITY-AUDIT-CHECKLIST` מסומן  

אם שער נכשל: אין מדיה ממומנת (`MARKETING-LAUNCH-PLAN`).

---

## 1. לוח ימים

### D-2 / D-1

| משימה | תוצר |
|---|---|
| אימות דילים + תמונות | רשימת Go/No-Go פר דיל |
| כרטיס טסט + ספק טסט | מוכנים |
| גיבוי/PITR | מאושר |
| טיוטת פוסטים | לפי MARKETING-LAUNCH |
| Kill switch ידוע | איך מכבים checkout / מדיה |

### D0 (יום עלייה / soft-open)

| שעה (כיוון) | פעולה |
|---|---|
| בוקר | לפי `RUNBOOK-LAUNCH-DAY` (env, DNS אם חל) |
| אחרי smoke ירוק | `CHECKOUT_ENABLED=true` |
| +1ש | רכישת אמת אחת + redeem טסט אצל ספק אחד |
| צהריים | פרסום אורגני D0 (לא חובה ממומן) |
| ערב | סקירת errors ב-Sentry + הזמנות |

### D1–D3

| יום | תפעול | שיווק |
|---|---|---|
| D1 | OPS-DAILY + מענה תמיכה | דיל היום + Search אם מאושר |
| D2 | בדיקת redeem אצל 2 ספקים | חינוך מימוש |
| D3 | reconciliation Cardcom מול ledger | פוסט דיל זוגי |

### D4–D7

| מיקוד | פעולה |
|---|---|
| יציבות | אין פיצ'רים חדשים; רק תיקוני חוסם |
| מדיה | רימרקטינג רק עם consent marketing |
| ספקים | טלפון לספקים עם redeem כושל |
| D7 | סיכום: רכישות, redeem, תקריות, החלטת שבוע 2 |

---

## 2. שערי עצירה באמצע השבוע

| תנאי | פעולה מיידית |
|---|---|
| כשל reconciliation / כסף כפול | כבה checkout + מדיה; INCIDENT playbook |
| Spike 5xx | rollback / freeze deploy |
| ספק מרכזי לא מכבד קופונים | pause מוצר; תמיכה לפי PLAYBOOK |
| Pixel יורה בלי consent | כבה תג שיווקי מיד |

---

## 3. צ׳קליסט בוקר (כל יום D0–D7)

העתק מקוצר מ-`OPS-DAILY-ROUTINE.md`:

- [ ] הזמנות paid בלי voucher  
- [ ] שגיאות Sentry חדשות  
- [ ] מלאי דילי ליבה  
- [ ] תור פניות תמיכה  
- [ ] השוואת סכום יומי Cardcom ↔ ledger (ברמת סבירות)

---

## 4. תפקידים

| תפקיד | אחריות בשבוע |
|---|---|
| בעלים | Go/No-Go, כסף, מדיה |
| תמיכה | PLAYBOOK + SLA |
| תוכן | פוסטים + איסור מודל שגוי |
| טכני | deploy freeze חוץ מ-hotfix |

---

## 5. אחרי D7

עדכן `PROGRESS-REPORT-AUG.md` (או דוח הבא) במספרים אמיתיים: purchases, redeem rate, תקריות, דילים שעדיין missing.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | Runbook שבוע השקה D-2 עד D+7 |
