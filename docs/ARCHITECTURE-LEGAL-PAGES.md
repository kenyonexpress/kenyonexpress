# ארכיטקטורה: עמודים משפטיים (מפרט)

תקנון, מדיניות ביטולים, פרטיות, נגישות: routes, שלד סעיפים, שערי GA.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
מפרט מוצר; **לא ייעוץ משפטי**. עורכת דין חייבת לאשר נוסח לפני GA.

מודל כסף: **No Escrow**. קופון = `coupon_price` באתר לפלטפורמה; יתרה בבית העסק.

מסמכים קשורים:

```
docs/ARCHITECTURE-LEGAL.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
docs/ARCHITECTURE-COOKIE-CONSENT.md
docs/ARCHITECTURE-ACCESSIBILITY.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| LP0 | העמוד המשפטי = מקור אמת ללקוח; תמיכה מצטטת, לא להפך. |
| LP1 | ארבעה עמודים P0 + `/cancel` כלי: terms, cancellation-policy, privacy, accessibility. |
| LP2 | עברית פשוטה, RTL, כותרות עוגן (anchors). |
| LP3 | תאריך עדכון + `wording_version` בראש כל עמוד. |
| LP4 | checkbox תקנון ב-checkout → `/terms` בטאב חדש. |
| LP5 | ISR ארוך (86400s); on-demand revalidate אחרי שינוי גרסה. |
| LP6 | נוסח קופון בעמודים תואם 1:1 התנהגות בקוד. |

### routes

| עמוד | route | footer |
|---|---|---|
| תקנון | `/terms` | כן + checkout |
| ביטולים והחזרים | `/cancellation-policy` | כן |
| פרטיות | `/privacy` | כן + checkout |
| נגישות | `/accessibility` | כן |
| ביטול עסקה (טופס) | `/cancel` | כן |

redirects: `/terms-and-conditions` → `/terms`; `/privacy-policy` → `/privacy`.

### תקנון: שלד חובה

```
1. הגדרות (פלטפורמה, ספק, קופון, יתרה, ארנק)
2. מהות השירות (תיווך)
3. כשרות (18+)
4. הזמנה ותשלום (Cardcom)
5. קופונים (QR, תוקף, יתרה בבית העסק)
6. פיזי (אספקה: ספק)
7. ארנק (קרדיט באתר בלבד)
8. ביטולים → /cancellation-policy
9. אחריות ושיפוי
10. קניין רוחני, שינוי תקנון, דין ישראל
```

### ניסוחי חובה (קופון)

| נושא | חייב לומר |
|---|---|
| מחיר | "מחיר הקופון משולם לפלטפורמה במלואו באתר. יתרת המחיר משולמת ישירות לבית העסק במימוש" |
| מימוש | "פעם אחת, בהצגת QR" |
| ארנק | "קרדיט באתר בלבד; לא למשיכה/המרה" |

אסור: "נאמנות", התחייבות להעברת מקדמה לספק.

### ביטולים (קופון)

| כלל | מפרט |
|---|---|
| חלון | 14 יום; **לא מומש** |
| דמי ביטול | עד 5% או 100 ₪ (הנמוך); soft-launch: לא גובים |
| אחרי מימוש | אין ביטול דרך האתר |
| החזר | `coupon_price` באתר בלבד |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| תמיכה כמקור אמת | LP0: עמודים קודם. |
| CMS חיצוני day-1 | `src/content/legal/*.he.ts` + ISR |
| תרום EN ביום 1 | out of scope |
| עמוד משלוחים נפרד | בתקנון עד נפח פיזי |
| checkbox אחד לכל המדיניות | terms ב-checkout; הפניות לשאר |
| נוסח שלא תואם קוד | LP6: 1:1 |

---

## סכמת DB

```text
orders (
  accepted_terms_at timestamptz,
  terms_version text,
  ...
)

consent_events (
  id uuid PK,
  user_id uuid,
  consent_type text,           -- terms | analytics | marketing_30a
  granted boolean,
  wording_version text,
  created_at timestamptz
)

legal_versions (
  key text PK,                 -- TERMS_VERSION, PRIVACY_VERSION, ...
  version text,
  effective_date date,
  counsel_approved boolean DEFAULT false
)
```

| אירוע | נשמר |
|---|---|
| אישור תקנון בקופה | `orders.terms_version` |
| באנר אנליטיקה | cookie + `consent_events` |
| בקשת ביטול | `cancellation_requests` |

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | שינוי תקנון אחרי הזמנה | `terms_version` על order = מה שאושר |
| CE2 | counsel לא אישר | `counselApproved=false` + באנר טיוטה |
| CE3 | סיווג 14ח (תו קנייה) | תוקף מינימום 5 שנים; counsel |
| CE4 | מקרו תמיכה ישן | LP6: עוגנים לסעיף נוכחי |
| CE5 | `/cancel` noindex | כלי; לא SEO |
| CE6 | קופון פקע | נוסח = Wallet void בפועל |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | הכרעת סיווג קופון §14ח | counsel; חוסם GA |
| O2 | אישור עו"ד מתועד (LP3) | שער S4 Go-Live |
| O3 | `/cookies` עמוד נפרד | LEGAL.md |
| O4 | כפתור ביטול ב-`/account` | post soft-launch |

### שערי קבלה (GA)

| # | בדיקה | חוסם |
|---|---|---|
| LP1 | ארבעה עמודים + footer | כן |
| LP2 | נוסח קופון = קוד | כן |
| LP3 | אישור עו"ד | כן |
| LP4 | סיווג 14ח | כן |
| LP5 | checkbox → `/terms` | כן |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | rev A: 4 עמודים, ביטול קופון |
| 2026-08-12 | batch-2: תבנית חובה (5 סעיפים) |
