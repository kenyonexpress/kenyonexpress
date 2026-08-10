# INTEGRATIONS-ROADMAP.md
# מפת דרכים: ורטיקלים פנימיים (סגנון Wolt / Gett)

בנייה **פנימית** של משלוחי אוכל ונסיעות בתוך KenyonExpress.  
אין חיבור OAuth ל-Wolt/Gett חיצוניים ואין סליקה מחוץ ל-Cardcom.

Status: **ROADMAP** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמך מחייב לעקרונות:

```
docs/ARCHITECTURE-INTEGRATIONS.md
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-MOBILE-APP.md
docs/ARCHITECTURE-API-CONTRACTS.md
docs/CARDCOM-ARCHITECTURE.md
docs/CONTRADICTIONS.md
```

---

## 0. עקרונות (לא לדיון חוזר)

| # | הכרעה |
|---|---|
| R1 | ורטיקל = קוד ב-`verticals/<key>` בתוך המונורפו / האפ. |
| R2 | כסף רק דרך ליבת checkout (Cardcom + ledger). |
| R3 | הזמנה = `orders` + `vertical` + טבלת job. |
| R4 | Webhooks נכנסים חתומים + idempotent; לא מעדכנים `paid`. |
| R5 | Kill switch per vertical בלי להפיל את חנות הקופונים. |

---

## 1. שלבים

| שלב | תוצר | תלות | אופק |
|---|---|---|---|
| V0 | ליבת חנות + מובייל Expo יציבים | soft-open | עכשיו |
| V1 | חוזה API לורטיקל + `orders.vertical` | API-CONTRACTS | אחרי השקה יציבה |
| V2 | `food`: תפריט, עגלה, שיבוץ שליח mock | V1 + geo ספקים | V2 |
| V3 | מעקב GPS + push job updates | MOBILE push | V2 |
| V4 | `rides`: בקשה, שיבוץ, תעריף | V1 + threat model | מאוחר ל-food |
| V5 | אופטימיזציית שיבוץ / תמחור דינמי | נתונים אמיתיים | אופציונלי |

אין affiliate ל-Wolt/Gett בשלבים אלה.

---

## 2. מיפוי מוצר

| יכולת "כמו Wolt" | מימוש פנימי |
|---|---|
| בחירת מסעדה | ספקים עם `verticals` flag + תפריט |
| עגלת מנות | cart scoped ל-`food` |
| שליח | `delivery_jobs` + סטטוסים |
| מעקב | Realtime + מפה באפ |

| יכולת "כמו Gett" | מימוש פנימי |
|---|---|
| בקשת נסיעה | `ride_jobs` |
| שיבוץ נהג | queue פנימי |
| מחיר | תעריף פלטפורמה; חיוב מלא on-site |

קופון חנות נשאר No Escrow. ורטיקל משלוח/נסיעה = חיוב מלא באתר/אפ לפי מחיר הוורטיקל.

---

## 3. אינטגרציות מותרות vs אסורות

| מותר | אסור |
|---|---|
| Webhook מספק מטבח / צי שליחים פנימי | WebView תשלום של אפ צד ג' |
| Maps SDK לתצוגה | שיתוף `cardcom_token` החוצה |
| Push topics לורטיקל | הורדת JS זר בזמן ריצה לסליקה |

---

## 4. מדדי הצלחה לשלב V2 (food)

| מדד | יעד כיוון |
|---|---|
| הזמנות food paid / שבוע | כיול אחרי פיילוט עיר אחת |
| זמן שיבוץ שליח P50 | ≤ יעד שייקבע בפיילוט |
| ביטולי לקוח אחרי paid | נמוך; playbook נפרד |
| השפעה על חנות קופונים | אפס downtime מ-kill switch |

---

## 5. סיכונים

| סיכון | הפחתה |
|---|---|
| בלבול מודל כסף מול קופון | UI מפורש: "תשלום מלא למשלוח" |
| רגולציה שליחים / נהגים | ייעוץ משפטי לפני V2 prod |
| דליפת scope למונורפו | manifest permissions ב-SUPERAPP |

פירוט טכני: `ARCHITECTURE-INTEGRATIONS.md`.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפת דרכים V0–V5 לורטיקלים פנימיים בסגנון Wolt/Gett |
