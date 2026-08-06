# ארכיטקטורה: אנליטיקה

משפך מצפייה בדיל עד מימוש. המלצה: **PostHog** (מוצר) + **GA4** (מרקטינג).

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-REFERRAL.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/CONTRADICTIONS.md
```
עקרון: משפך התנהגותי באירועים; כסף עסקי רק מה-ledger. בלי PII.
עמלה/GMV: לפי snapshot של `platform_percent` ו-No Escrow (לא מ-GA4/PostHog).

---

## 0. GA4 מול PostHog (המלצה)

| קריטריון | GA4 | PostHog |
|---|---|---|
| משפכי מוצר | מסורבל | חזק |
| Google Ads / Search Console | חזק | חלש |
| פרטיות / שליטה | מעבד Google | שליטה טובה יותר |
| Session replay | מוגבל | חזק (אחרי consent, בלי PII) |

| שכבה | כלי |
|---|---|
| מקור אמת פנימי | `analytics_events` ב-Postgres |
| Product analytics | **PostHog** |
| Marketing / Ads | **GA4** + Consent Mode |
| GMV / עמלה | דוחות אדמין מה-ledger בלבד |

---

## 1. משפך: צפייה → מימוש

```text
view_product → add_to_cart → begin_checkout → purchase → coupon_redeemed
```

| שלב | event_name | מקור |
|---|---|---|
| צפייה בדיל | `view_product` | client |
| עגלה | `add_to_cart` | client |
| קופה | `begin_checkout` | client |
| תשלום | `purchase` | server (derived) |
| מימוש | `coupon_redeemed` | server (derived) |

אופציונלי: `coupon_view` בפתיחת דף הקופון.

---

## 2. Envelope בלי PII

```json
{
  "event_id": "uuid",
  "event_name": "view_product",
  "schema_version": 1,
  "session_id": "uuid",
  "user_id": "uuid-or-null",
  "consent": { "analytics": true, "marketing": false },
  "context": { "locale": "he-IL", "path": "/product/…", "ip_trunc": "1.2.3.0" },
  "props": { "product_id": "uuid", "product_type": "coupon", "list_price_agorot": 12000 }
}
```

אסור: email, phone, שם, IP מלא, מחרוזת חיפוש גולמית, PAN.  
כסף ב-props: אגורות integer בלבד.

---

## 3. מיפוי לכלים

| פנימי | GA4 | PostHog |
|---|---|---|
| `view_product` | `view_item` | `view_product` |
| `add_to_cart` | `add_to_cart` | `add_to_cart` |
| `begin_checkout` | `begin_checkout` | `begin_checkout` |
| `purchase` | `purchase` (value = on-site) | `purchase` |
| `coupon_redeemed` | custom אופציונלי | `coupon_redeemed` |

SDKs רק אחרי consent.

---

## 4. Acceptance

- [ ] משפף עד מימוש מתועד  
- [ ] המלצת PostHog + GA4 מפורשת  
- [ ] Deny-list PII  
- [ ] כסף לא מ-sum ב-GA4/PostHog  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | משפך צפייה→מימוש + המלצת GA4/PostHog |
| 2026-08-06 | QA: קישור REFERRAL/PRICING; כסף מ-ledger + `platform_percent` |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS (No Escrow + platform_percent) |
| 2026-08-07 | QA: קישור הדדי ל-OBSERVABILITY |
