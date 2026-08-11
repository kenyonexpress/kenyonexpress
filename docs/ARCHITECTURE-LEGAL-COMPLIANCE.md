# ארכיטקטורה: ציות משפטי

הגנת הצרכן, ביטול 14 יום, דמי ביטול 5% או 100 ₪ (משפטי, לא עמלה), תוקף שוברים, נגישות ישראלית.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #44/50
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-DATA-EXPORT-GDPR.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-SUBSCRIPTIONS.md
docs/CONTRADICTIONS.md
```

אזהרה: חוזה מוצר/הנדסה. לא מחליף ייעוץ משפטי.

מודל כסף: **No Escrow**. אין נאמן/held/J5. מקדמת קופון באתר = הכנסת פלטפורמה; יתרה בבית העסק מחוץ לפלטפורמה.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| L1 | מכירה באתר = עסקת מכר מרחוק. |
| L2 | זכות ביטול: **14 יום** (לפי דין וסוג העסקה). |
| L3 | דמי ביטול: עד **5% או 100 ₪, הנמוך**, כשמותר בחוק. |
| L3a | דמי ביטול הם **חיוב משפטי (LEGAL)**, לא `platform_percent` ולא עמלת פלטפורמה. |
| L4 | תוקף שובר ב-`expires_at`; אחרי פקיעה אין מימוש. |
| L5 | נגישות ישראלית: ת"י 5568 / WCAG + תקנות התאמות נגישות לשירות; RTL. |
| L6 | גילוי: שולם באתר + יתרה בבית העסק; לא להציג face כאילו שולם במלואו. |
| L7 | ביטול מקוון חובה: `/cancel` + קישור ב-footer. |
| L8 | **No Escrow:** אין נאמן/החזקה של חברת אשראי על מקדמת קופון; המקדמה לפלטפורמה; יתרה בבית העסק. פיזי לפי `platform_percent` פר מוצר (בלי default). |

---

## 1. הגנת הצרכן

| חובה | יישום |
|---|---|
| גילוי מוקדם | בלוק פרטי עסקה ב-PDP |
| מסמך בכתב | מייל ב-paid / עם הקופון |
| ביטול 14 יום | מנוע בשרת; לקופון מ-`paid_at` אם לא מומש / לא פטור |
| דמי ביטול | `min(5%, 100 ₪)`; פגם/אי אספקה → 0 |
| החזר תוך 14 יום | כרטיס→Cardcom; ארנק→יתרה פנימית |
| ביטול מקוון | `/cancel` + אזור אישי |

```text
fee_agorot = min(floor(amount_agorot * 5 / 100), 10000)
refund = amount_agorot - fee_agorot
```

סכום רלוונטי לקופון = מה ששולם באתר בלבד.

### 1.1 דמי ביטול ≠ עמלה

| מושג | מה זה | מה זה לא |
|---|---|---|
| דמי ביטול 5% או 100 ₪ | ניכוי חוקי בעסקת מכר מרחוק (כשחל) | לא `platform_percent` |
| `platform_percent` | עמלת פיצול פיזי פר מוצר (snapshot) | לא דמי ביטול צרכן |
| מקדמת קופון | הכנסת פלטפורמה on-site | לא Escrow לספק |

אסור להציג דמי ביטול כ"עמלת שירות קבועה" או לערבב עם אחוז הספק. שדה/לוג נפרד: `cancellation_fee_agorot` (LEGAL), לא `platform_fee`.

---

## 2. תוקף שוברים

| כלל | פירוט |
|---|---|
| חובה | `expires_at` על כל voucher |
| תזכורת | `coupon_expiry_48h` |
| פקיעה | `expired` + מייל + Wallet void |
| הארכה | admin + audit בלבד |

---

## 3. נגישות ישראלית

| דרישה | יישום |
|---|---|
| תקנות נגישות לשירות | אתר ציבורי נגיש |
| ת"י 5568 / WCAG 2.x AA | יעד בדיקות |
| RTL | `lang=he` `dir=rtl` מהמסמך |
| הצהרה | `/accessibility` ב-footer |
| ניגודיות / מקלדת / תוויות | חובה על CTA וטפסים |

אין להסתמך על תוסף כתחליף ל-HTML נכון.

---

## 4. מנויים (הפניה)

ביטול מנוי מתמשך + חלון 14 יום על חיוב ראשון: לפי
`docs/ARCHITECTURE-SUBSCRIPTIONS.md`
סעיף זכויות צרכן. ניסוח ללקוח דורש עו״ד לפני פרסום.

---

## 5. Acceptance

- [ ] 14 יום בשרת  
- [ ] דמי ביטול = min(5%, 100 ₪)  
- [ ] דמי ביטול מתועדים כ-LEGAL (לא commission / לא `platform_percent`)  
- [ ] `/cancel` חי  
- [ ] תוקף נאכף  
- [ ] הצהרת נגישות + RTL  
- [ ] אין נוסח Escrow בגילוי ללקוח  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | 14 יום, 5%/100 ₪, תוקף שוברים, נגישות ישראלית |
| 2026-08-06 | QA: L8 No Escrow + `platform_percent`; קישור GDPR/PRICING |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS (No Escrow + platform_percent) |
| 2026-08-12 | batch #44/50: L3a דמי ביטול LEGAL לא עמלה; רענון על arch/docs-batch-2 |
| 2026-08-12 | batch-2 #44: BINDING על arch/docs-batch-2 |
