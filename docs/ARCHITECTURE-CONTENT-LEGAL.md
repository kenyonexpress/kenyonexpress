# ארכיטקטורה: תוכן ועמודים משפטיים

תקנון, מדיניות פרטיות, תנאי קופון למוצר, הצהרת נגישות לפי דין ישראלי (ת״י 5568 / תקנות הנגישות).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. **לא ייעוץ משפטי.** לפני GA: סקירת עורך דין.

מודל כסף: **No Escrow**. קופון = שולם באתר לפלטפורמה + יתרה בעסק. אין נאמן חיצוני, אין held, אין J5.

מסמכים קשורים:

```
docs/LEGAL-CHECKLIST.md
docs/ARCHITECTURE-LEGAL-PAGES.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/ARCHITECTURE-COOKIE-CONSENT.md
docs/CONTRADICTIONS.md
```

---

## החלטה

| # | הכרעה מחייבת |
|---|---|
| L1 | עמודי חובה בעברית RTL בפוטר: תקנון, פרטיות, ביטול עסקה, נגישות, יצירת קשר. |
| L2 | כל מסמך עם `wording_version` + תאריך עדכון. |
| L3 | מודל קופון בתקנון: שולם באתר + יתרה בעסק; **No Escrow** (לא נאמן, לא held). |
| L4 | ארנק: קרדיט פנימי בלבד, לא ניתן למשיכה. |
| L5 | נגישות: יעד התאמה לת״י 5568 / תקנות שוויון זכויות לאנשים עם מוגבלות (אינטרנט), ברמת AA כברירת מחדל. |
| L6 | תנאי קופון ספציפיים מופיעים גם ב-PDP (לא רק בתקנון הכללי). |
| L7 | CMS או MDX ב-repo; שינוי מהותי → bump version + הודעה אם נדרש. |

### Routes יעד

| מסמך | Route |
|---|---|
| תקנון / תנאי שימוש | `/legal/terms` |
| מדיניות פרטיות | `/legal/privacy` |
| ביטול עסקה / החזרות | `/legal/cancellation` |
| הצהרת נגישות | `/accessibility` |
| יצירת קשר | `/contact` |

### תוכן מינימלי (תקנון)

1. זהות העוסק (שם, ח.פ./ע.מ., כתובת, יצירת קשר)
2. תיאור השירות: פלטפורמה המחברת לקוחות לספקים
3. מודל קופון ופיזי (כסף, אחריות ספק מול פלטפורמה)
4. חשבון Google, שימוש מותר/אסור
5. קניין רוחני
6. הגבלת אחריות
7. דין ושיפוט (ישראל)
8. שינוי תקנון

**אסור בנוסח:** הבטחת עמלה קבועה 5%/10%; נוסח Escrow / נאמן חיצוני / held מטעה.

### תנאי קופון ב-PDP (חובה)

| שדה | חובה |
|---|---|
| מה כלול בקופון | כן |
| שולם באתר | כן (₪) |
| יתרה בבית העסק | כן (₪) |
| תוקף | כן |
| הגבלות (ימים/שעות, כשרות, מספר סועדים) | אם רלוונטי |
| אי-העברה / שם על השובר | לפי מדיניות |
| ביטול לפני מימוש | קישור ל-`/legal/cancellation` |

אי אפשר לפרסם קופון בלי תוקף ושני מספרי הכסף.

### הצהרת נגישות (`/accessibility`)

1. מחויבות לנגישות
2. רמת התאמה יעד (WCAG 2.x AA / ת״י 5568)
3. אמצעים שבוצעו (מקלדת, ניגודיות, RTL, טקסט חלופי)
4. מגבלות ידועות / תוכנית שיפור
5. פרטי רכז נגישות (שם, טלפון, אימייל)
6. תאריך בדיקה אחרון
7. הפניה לנציבות / הליך פנייה אם נדרש לפי ייעוץ

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow / held / נאמן חיצוני בנוסח משפטי | סותר No Escrow ו-CONTRADICTIONS; L3 קובע מודל שולם+יתרה. |
| עמלה קבועה 5%/10% בתקנון | סותר C1; `platform_percent` פר מוצר בלבד. |
| תנאי קופון רק בתקנון הכללי | L6: חובה גם ב-PDP. |
| CMS חיצוני בלבד (ללא MDX ב-repo) | MDX מאפשר versioning ו-review ב-git. |
| opt-out שיווקי כברירת מחדל | דין ישראלי: opt-in מפורש (30א). |
| משיכת ארנק החוצה | L4: קרדיט פנימי בלבד. |
| PDF סטטי בלי `wording_version` | L2: versioning חובה. |

---

## סכמת DB

**אין DDL חדש במסמך זה.** תוכן משפטי נשמר ב-repo (MDX) או בטבלת CMS אם תיווצר.

```text
legal_documents (
  id uuid PK,
  slug text UNIQUE,           -- terms | privacy | cancellation | accessibility
  wording_version int NOT NULL,
  title_he text NOT NULL,
  body_mdx text NOT NULL,
  published_at timestamptz,
  updated_at timestamptz,
  updated_by uuid FK → profiles(id)
)
```

| שדה מוצר (PDP) | מקור |
|---|---|
| `coupon_terms_he` | products / variant |
| `expiry_days` | products |
| `coupon_price_agorot` | products |
| `face_value_agorot` | products |

פרטיות: חובה לכסות נתונים (Google, הזמנות, קופונים, ארנק, לוגים), מעבדים (Supabase, Vercel, Cardcom, Resend, R2, Meilisearch), עוגיות (COOKIE-CONSENT), זכויות (עיון, תיקון, מחיקה), העברות חו״ל.

---

## מקרי קצה

| # | מקרה | התנהגות מחייבת |
|---|---|---|
| CE1 | שינוי תקנון מהותי אחרי רכישה | bump `wording_version`; הודעה לפי LEGAL |
| CE2 | קופון בלי שני מספרי כסף ב-PDP | publish נכשל |
| CE3 | נוסח Escrow בטיוטה ישנה | לא לפרסם; יישור ל-L3 |
| CE4 | transactional email (הזמנה/QR) | לא דורש opt-in שיווקי |
| CE5 | בקשת מחיקת נתונים עם חשבונית פתוחה | מחיקה בגבולות חוק ושמירת חשבוניות |
| CE6 | עמוד ביטול סותר REFUNDS-DISPUTES | `/legal/cancellation` מסכם בשפה ללקוח; לא סותר מדיניות |
| CE7 | PDP בלי תוקף קופון | לא publishable |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | טיוטת `claude_PRIVACY-POLICY-DRAFT.md` לא ב-worktree | עד איתור: LEGAL-CHECKLIST §2 + מסמך זה |
| O2 | סקירת עורך דין לפני GA | חובה לפי header |
| O3 | רכז נגישות: שם ופרטי קשר סופיים | LEGAL-CHECKLIST |
| O4 | האם `legal_documents` ב-DB או MDX בלבד | החלטת יישום |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מסמך ראשוני |
| 2026-08-12 | batch-2: כתיבה מחדש BINDING; No Escrow; 5 סעיפים |
