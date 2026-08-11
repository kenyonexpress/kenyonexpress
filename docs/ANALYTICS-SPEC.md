# מפרט מדידה (Analytics)

אירועי משפך, מיפוי GA4/Meta Pixel, Consent Mode מול באנר עוגיות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. כסף ב-props: **agorot integer**; מקור אמת = DB/ledger.

מסמכים קשורים:

```
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-ANALYTICS-KPI.md
docs/ARCHITECTURE-COOKIE-CONSENT.md
docs/MARKETING-LAUNCH.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| A1 | אירועי ליבה: `view_product`, `add_to_cart`, `begin_checkout`, `purchase`, `redeem`. |
| A2 | `purchase` ו-`redeem` נגזרים **בשרת** אחרי אימות. |
| A3 | GA4 + Meta Pixel רק לפי **Consent Mode** מבאנר העוגיות. |
| A4 | בלי consent שיווקי: אין Pixel; analytics מוגבל לבחירה. |
| A5 | כסף ב-props: `*_agorot` integer; Ads value = המרה ל-₪ לתצוגה בלבד. |
| A6 | אין PII (email, טלפון, שם, IP מלא, PAN). |
| A7 | GA4/Pixel לא מחליפים דוחות אדמין; ledger = מקור עסקי. |

### מיפוי GA4 / Meta

| פנימי | GA4 | Meta |
|---|---|---|
| `view_product` | `view_item` | `ViewContent` |
| `add_to_cart` | `add_to_cart` | `AddToCart` |
| `begin_checkout` | `begin_checkout` | `InitiateCheckout` |
| `purchase` | `purchase` (`transaction_id`=order_id) | `Purchase` (`eventID`=order_id) |
| `redeem` | custom | custom (אופציונלי) |

Consent default: **denied** ל-analytics ו-marketing לפני בחירה (v2).

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| `purchase` רק מ-client | A2: אימות שרת חובה. |
| Pixel לפני באנר | A3: חוקי + Consent Mode. |
| float בשדות כסף | A5: agorot integer. |
| Session replay מלא ב-D0 | פרטיות; out of scope. |
| CAPI לכל משתמש בלי מדיניות | phase 2. |

---

## סכמת DB

```text
analytics_events (או equivalent)
  event_id, event_name, schema_version
  session_id, user_id nullable
  consent jsonb, context jsonb, props jsonb
  created_at

orders / vouchers  -- מקור purchase/redeem
notification_deliveries  -- consent_events אופציונלי
```

אין DDL חדש במסמך זה. אירועי שרת נשמרים ב-Postgres תמיד; שליחה ל-MP/CAPI לפי consent.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | בלי לחיצה על באנר | אין בקשות ל-GA/Meta |
| CE2 | analytics בלבד | GA4 כן; Pixel לא |
| CE3 | refund אחרי purchase | אירוע `refund` אופציונלי; ledger מקור |
| CE4 | `coupon_redeemed` ב-docs ישנים | alias ל-`redeem` |
| CE5 | סכום Ads ≠ ledger | מותר רק מעיגול/refunds; חקירה אם >1% |
| CE6 | UTM חסר | purchase ללא attribution; לא חוסם |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | CAPI עם dedup `eventID` | מומלץ אחרי השקה יציבה. |
| O2 | PostHog session replay | דורש מדיניות נפרדת. |
| O3 | `/admin/analytics` מפורט | `ARCHITECTURE-ANALYTICS-KPI`. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | rev A: אירועים + consent |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
