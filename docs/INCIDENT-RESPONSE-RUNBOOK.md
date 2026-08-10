# INCIDENT-RESPONSE-RUNBOOK.md
# Runbook: תגובה לתקריות (IR)

מסגרת כללית לניהול תקריות: דירוג, תפקידים, תקשורת, וסגירה.  
תרחישים מפורטים (Cardcom, DB, redeem וכו'):

```
docs/INCIDENT-PLAYBOOKS.md
```

Status: **RUNBOOK** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/INCIDENT-PLAYBOOKS.md
docs/SLA-MONITORING.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/RUNBOOK-PRODUCTION.md
docs/BACKUP-RESTORE-RUNBOOK.md
docs/SECURITY-AUDIT-CHECKLIST.md
docs/CUSTOMER-SUPPORT-PLAYBOOK.md
docs/LAUNCH-WEEK-RUNBOOK.md
```

אין NOC. מפעיל יחיד = אתה. סדר קבוע: **זיהוי → עצירת דימום → תקשורת → שחזור → postmortem**.

---

## 1. דירוג חומרה

| SEV | הגדרה | יעד תגובה | דוגמאות |
|---|---|---|---|
| 1 | כסף / auth / DB down; סיכון גניבה | ≤ 15 דק' | Cardcom down, RLS שבור, double-charge |
| 2 | פגיעה חלקית במשפך; עקיפה אפשרית | ≤ 1 שע' | redeem איטי, חיפוש down |
| 3 | מטרד; אין אובדן כסף מיידי | ≤ יום עסקים | באג UI, מייל delayed |

---

## 2. תפקידים (MVP)

| תפקיד | מי | אחריות |
|---|---|---|
| Incident lead | בעלים | החלטות kill switch, תקשורת חיצונית |
| Tech | אתה / סוכן | לוגים, rollback, DB |
| Comms / support | תמיכה | נוסחים ללקוחות לפי PLAYBOOK |
| Counsel | עו״ד | רק אם פריצת נתונים / תביעה |

---

## 3. Kill switches

| מתג | מתי |
|---|---|
| `CHECKOUT_ENABLED=false` | כשל סליקה, חשד חיוב כפול, פריצת כסף |
| pause מוצר / ספק | ספק לא מכבד / הונאה נקודתית |
| כיבוי תג שיווקי | Pixel בלי consent / דליפת PII באירועים |
| Vercel Instant Rollback | רגרסיית קוד ברורה אחרי deploy |

אין למחוק הזמנות `pending` כ"תיקון".

---

## 4. תקשורת

| קהל | ערוץ | כללים |
|---|---|---|
| לקוחות באתר | באנר קצר בעברית | בלי פרטים טכניים; בלי Escrow |
| תור פניות | מייל / WA | PLAYBOOK; אין CVV |
| פנימי | STATE.md + הערת זמן | חותמת התחלה/סיום |
| רגולטור / נושא מידע | רק אחרי עו״ד | פריצת פרטיות |

תבנית באנר:

> יש תקלה זמנית ב-{תשלום/מימוש/אתר}. העגלות נשמרות כשאפשר. נעדכן כאן כשהשירות חוזר.

---

## 5. ראיות חובה לפני סגירה

- [ ] חלון זמן מדויק (timezone Asia/Jerusalem)  
- [ ] Sentry issue ids / לוגים  
- [ ] order_id / payment refs רלוונטיים  
- [ ] האם בוצע refund / freeze  
- [ ] האם נדרש PITR / restore  

---

## 6. Postmortem (תבנית קצרה)

```text
תאריך:
SEV:
סימפטום:
שורש:
מה עצר דימום:
מה תוקן:
פעולות למניעה (ticket):
עודכן STATE.md: כן/לא
```

שמירה ב-`STATE.md` History או קובץ incidents/ (אופציונלי).

---

## 7. מיפוי ל-playbooks

| תרחיש | מסמך |
|---|---|
| Cardcom / DB / redeem / DNS / fraud spike | INCIDENT-PLAYBOOKS |
| אובדן נתונים | BACKUP-RESTORE-RUNBOOK |
| שבוע השקה | LAUNCH-WEEK-RUNBOOK שערי עצירה |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מסגרת IR: SEV, kill switches, תקשורת, postmortem |
