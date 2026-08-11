# ארכיטקטורה: ציות משפטי

הגנת הצרכן, ביטול 14 יום, דמי ביטול, תוקף שוברים, נגישות ישראלית.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מודל כסף: **No Escrow**. מקדמת קופון באתר = הכנסת פלטפורמה; יתרה בבית העסק מחוץ לפלטפורמה.

מסמכים קשורים:

```
docs/ARCHITECTURE-LEGAL-PAGES.md
docs/ARCHITECTURE-LEGAL.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-DATA-EXPORT-GDPR.md
docs/ARCHITECTURE-SUBSCRIPTIONS.md
docs/CONTRADICTIONS.md
```

אזהרה: חוזה מוצר/הנדסה. לא מחליף ייעוץ משפטי.

---

## החלטה

| # | הכרעה |
|---|---|
| L1 | מכירה באתר = עסקת מכר מרחוק. |
| L2 | זכות ביטול: **14 יום** (לפי דין וסוג העסקה). |
| L3 | דמי ביטול: עד **5% או 100 ₪, הנמוך**, כשמותר בחוק. |
| L3a | דמי ביטול = חיוב **LEGAL**; לא `platform_percent`. |
| L4 | תוקף שובר ב-`expires_at`; אחרי פקיעה אין מימוש. |
| L5 | נגישות: ת"י 5568 / WCAG + תקנות התאמות נגישות; RTL. |
| L6 | גילוי: שולם באתר + יתרה בבית העסק; לא להציג face כאילו שולם במלואו. |
| L7 | ביטול מקוון חובה: `/cancel` + קישור ב-footer. |
| L8 | פיזי: `platform_percent` פר מוצר (snapshot); קופון: 100% on-site לפלטפורמה. |

### דמי ביטול

```text
fee_agorot = min(floor(amount_agorot * 5 / 100), 10000)
refund = amount_agorot - fee_agorot
```

סכום לקופון = מה ששולם באתר בלבד. שדה נפרד: `cancellation_fee_agorot` (LEGAL).

| מושג | מה זה | מה זה לא |
|---|---|---|
| דמי ביטול | ניכוי חוקי (כשחל) | לא `platform_percent` |
| `platform_percent` | עמלת פיצול פיזי (snapshot) | לא דמי ביטול |
| מקדמת קופון | הכנסת פלטפורמה on-site | לא held לספק |

### תוקף שוברים

| כלל | פירוט |
|---|---|
| חובה | `expires_at` על כל voucher |
| תזכורת | `coupon_expiry_48h` |
| פקיעה | `expired` + מייל + Wallet void |
| הארכה | admin + audit בלבד |

### נגישות ישראלית

| דרישה | יישום |
|---|---|
| תקנות נגישות לשירות | אתר ציבורי נגיש |
| ת"י 5568 / WCAG 2.x AA | יעד בדיקות |
| RTL | `lang=he` `dir=rtl` |
| הצהרה | `/accessibility` ב-footer |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| דמי ביטול = `platform_percent` | L3a: LEGAL נפרד. |
| ביטול אחרי redeem | terminal; סכסוך מול ספק. |
| גילוי face כ"שולם" | L6: רק coupon_price באתר. |
| תוסף נגישות במקום HTML | L5: markup נכון. |
| ביטול בלי `/cancel` | L7: חובה בדין. |
| held על מקדמת קופון | No Escrow. |

---

## סכמת DB

```text
cancellation_requests (
  id uuid PK,
  order_id uuid FK,
  user_id uuid,
  reason text,
  status text,                 -- pending | approved | rejected
  cancellation_fee_agorot int,
  refund_agorot int,
  created_at timestamptz,
  resolved_at timestamptz
)

orders (
  accepted_terms_at timestamptz,
  terms_version text,
  paid_at timestamptz,
  ...
)

vouchers (
  expires_at timestamptz NOT NULL,
  status voucher_status,
  ...
)

consent_events (
  user_id uuid,
  consent_type text,
  granted boolean,
  created_at timestamptz
)
```

| שדה | שימוש |
|---|---|
| `cancellation_fee_agorot` | LEGAL; לא commission |
| `terms_version` | ראיה ב-checkout |

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | ביטול אחרי מימוש | דחייה; מסלול תמיכה |
| CE2 | פגם / אי אספקה | fee = 0 |
| CE3 | קופון + שירות בתאריך קבוע | חריג 14ג(ג); גילוי ב-PDP |
| CE4 | פקיעה בלי מימוש | expired; זיכוי לפי מדיניות |
| CE5 | אזרח ותיק / 14ג1 | חלון 4 חודשים; counsel |
| CE6 | refund כרטיס vs ארנק | לאמצעי מקורי |
| CE7 | מנוי מתמשך | SUBSCRIPTIONS |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | סיווג קופון (14ח vs שובר הטבה) | counsel; חוסם תוקף |
| O2 | `cancellation_requests` migration | pending |
| O3 | גביית דמי ביטול בפועל | soft-launch: לא |
| O4 | ניסוח מנויים ללקוח | counsel |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | 14 יום, 5%/100 ₪, תוקף, נגישות |
| 2026-08-12 | L3a LEGAL; batch-2 |
| 2026-08-12 | batch-2: תבנית חובה (5 סעיפים) |
