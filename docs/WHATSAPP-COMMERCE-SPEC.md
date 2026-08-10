# WHATSAPP-COMMERCE-SPEC.md
# מפרט מסחר ותמיכה ב-WhatsApp

מתי שולחים הודעות, תבניות, opt-in, וגבולות מול קניות באתר.  
הקמת הערוץ הטכנית:

```
docs/WHATSAPP-BUSINESS-SETUP.md
```

Status: **SPEC** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/WHATSAPP-BUSINESS-SETUP.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/SUPPORT-SLA-POLICY.md
docs/EMAIL-TEMPLATES-COPY.md
docs/ANALYTICS-SPEC.md
docs/GUEST-VS-MEMBER-STRATEGY.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

עקרון MVP: **Resend קודם**. WhatsApp = utility / תמיכה אחרי בסיס יציב.  
אין סליקה בתוך WhatsApp בשלב זה (אין catalog checkout ב-WA כמסלול כסף ראשי).

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| W1 | כסף = לינק ל-checkout באתר/אפ עם UTM; לא גבייה בתוך הצ׳אט. |
| W2 | שיווק WA רק עם opt-in מתועד + תבנית מאושרת. |
| W3 | טרנזקציוני (אישור הזמנה / קופון מוכן) אחרי רכישה עם הסכמה מתאימה / חלון שירות. |
| W4 | תמיכה: session 24ש אחרי פניית לקוח; אחרת תבנית. |
| W5 | מספר עסקי ייעודי; לא מספר אישי של הבעלים כ-production. |

---

## 1. מקרי שימוש (עדיפות)

| עדיפות | use case | סוג הודעה |
|---|---|---|
| P0 | לקוח כותב לתמיכה | session reply |
| P1 | קופון מוכן + קישור לחשבון | utility template |
| P1 | תזכורת מימוש לפני תום תוקף | utility (opt-in) |
| P2 | נטישת עגלה | marketing template + opt-in |
| P2 | דיל השקה לקבוצת opt-in | marketing |
| P3 | קטלוג WhatsApp / הזמנה בתוך WA | **מחוץ ל-MVP** |

---

## 2. תוכן תבניות (כיוון בעברית)

### 2.1 קופון מוכן

```text
הקופון שלך מ{{1}} מוכן.
פתחו בחשבון: {{2}}
מציגים QR בעסק ומשלמים יתרה בקופה.
```

### 2.2 תזכורת תוקף

```text
תזכורת: הקופון ל{{1}} בתוקף עד {{2}}.
פרטים: {{3}}
```

### 2.3 נטישה (רק marketing opt-in)

```text
שכחתם משהו בעגלה ב{{1}}.
להשלמת הרכישה: {{2}}
להסרה מרשימה: {{3}}
```

אסור: ניסוחי Escrow / נאמן.

---

## 3. Opt-in

| מקור | איך נרשם |
|---|---|
| Checkout | צ׳קבוקס "אשמח לעדכונים ב-WhatsApp" (לא מסומן כברירת מחדל) |
| Account | הגדרות התראות |
| תמיכה | לקוח כתב קודם; session בלבד בלי שיווק |

שמירה: `notification_preferences.whatsapp = true` + חותמת זמן + מקור.

---

## 4. זרימת "מסחר"

```text
הודעת דיל / נטישה
  → לינק https://kenyonexpress.co.il/...?utm_source=whatsapp&...
  → checkout רגיל (Cardcom)
  → אישור במייל (+ WA utility אם opt-in)
```

Deep link לאפ: לפי `ARCHITECTURE-MOBILE-APP.md` / DEEP-LINKS כשקיים.

---

## 5. תפעול תמיכה

| כלל | פירוט |
|---|---|
| SLA | כמו ערוצי תמיכה אחרים (`SUPPORT-SLA-POLICY`) |
| תסריטים | `CUSTOMER-SUPPORT-PLAYBOOK.md` |
| העברה לאדמין | מחלוקות כסף / הונאה |
| מדידה | event פנימי `support_whatsapp_reply` (בלי גוף ההודעה המלא ב-analytics ציבורי) |

---

## 6. אבטחה ופרטיות

- אין לשלוח קוד קופון מלא בקבוצות  
- לינקים עם תוקף / auth כשצריך  
- webhook חתום; לוג סטטוסי משלוח  
- מחיקת מספר לפי בקשת משתמש (DATA-EXPORT)

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט WhatsApp commerce/support: מקרי שימוש, תבניות, opt-in |
