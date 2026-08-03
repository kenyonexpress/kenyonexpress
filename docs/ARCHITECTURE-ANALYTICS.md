# ARCHITECTURE: Analytics

סכימת אירועים, משפכים, ובחירת כלי: **GA4 מול PostHog**.

Status: **BINDING** · Updated: 2026-08-03 (pack-20)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

עקרון: אירועים התנהגותיים לניתוח משפך; **כסף עסקי רק מה-ledger** (`orders` / `order_items` / `payments` / vouchers). אין PII ב-payloads.

---

## 0. הכרעת כלי (GA4 מול PostHog)

| קריטריון | GA4 | PostHog |
|---|---|---|
| עלות התחלה | חינם עד ספים גבוהים | חינם/cloud; self-host אפשרי |
| משפך מוצר (product analytics) | חלש/מסורבל | חזק (funnels, paths, feature flags) |
| SEO / Ads / Google ecosystem | חזק (חיבור Ads, Search Console) | חלש כמקור מרקטינג גוגל |
| פרטיות / שליטה | Google מעבד נתונים | שליטה טובה יותר; אפשר EU/self-host |
| RTL / עברית במוצר | לא רלוונטי לאיסוף | לא רלוונטי לאיסוף |
| תלות ב-consent (חוק 30א / GDPR-style) | דורש Consent Mode | דורש consent גם כן |
| כסף GMV | לא מקור אמת | לא מקור אמת |

### הכרעה מחייבת

| שכבה | כלי | תפקיד |
|---|---|---|
| מקור אמת פנימי | `analytics_events` ב-Postgres (+ rollups) | משפך מוצר, audit, בלי PII |
| Product analytics UI | **PostHog** (cloud או self-host בהמשך) | funnels, retention, session replay **רק אחרי consent** ובלי PII בשדות מותאמים |
| Marketing / Ads | **GA4** | תנועה, קמפיינים, חיבור Google Ads; Consent Mode חובה |
| כסף / עמלה | Admin reports מה-ledger | אף פעם לא `sum()` מ-GA4/PostHog |

אין Make/Zapier כגשר אנליטיקה. אין לשלוח email/phone/שם ל-GA4 או PostHog.

---

## 1. Envelope אירוע (פנימי)

```json
{
  "event_id": "uuid",
  "event_name": "view_product",
  "schema_version": 1,
  "occurred_at": "2026-08-03T00:00:00.000Z",
  "session_id": "uuid",
  "user_id": "uuid-or-null",
  "consent": { "analytics": true, "marketing": false },
  "context": {
    "locale": "he-IL",
    "path": "/product/example",
    "referrer_host": "www.google.com",
    "viewport": "mobile",
    "ip_trunc": "1.2.3.0"
  },
  "props": {}
}
```

כסף ב-props: **integer agorot** בלבד, עותק לתצוגת משפך.

---

## 2. קטלוג אירועים + משפכים

### 2.1 Primary

| event_name | מקור | derived? |
|---|---|---|
| `view_product` | client | no |
| `add_to_cart` | client | no |
| `begin_checkout` | client | no |
| `purchase` | server/ledger | **yes** |
| `coupon_redeemed` | server/ledger | **yes** |

### 2.2 Secondary

`remove_from_cart`, `search` (`query_hash` בלבד), `login`, `sign_up`, `referral_click`, `cashback_earned` (server).

### 2.3 משפכים מחייבים

| משפך | שלבים |
|---|---|
| רכישה | `view_product` → `add_to_cart` → `begin_checkout` → `purchase` |
| מימוש קופון | `purchase` (has_coupon) → open coupon → `coupon_redeemed` |
| הפניה | `referral_click` → `sign_up`/`login` → `purchase` (qualifying) |

GMV / take rate: רק מ-SQL על ledger, לא ממשפך PostHog.

---

## 3. No PII

אסור: email, phone, שם, ת.ז., IP מלא, מחרוזת חיפוש גולמית, PAN, כתובת מלאה.  
מותר: `user_id` (uuid), `query_hash`, `ip_trunc` `/24` או `/48`, path בלי query.

---

## 4. מיפוי ל-GA4 / PostHog

| אירוע פנימי | GA4 | PostHog |
|---|---|---|
| `view_product` | `view_item` | `view_product` |
| `add_to_cart` | `add_to_cart` | `add_to_cart` |
| `begin_checkout` | `begin_checkout` | `begin_checkout` |
| `purchase` | `purchase` (value = on-site ILS בלבד) | `purchase` |
| `coupon_redeemed` | custom / לא חובה | `coupon_redeemed` |

Client SDKs נטענים רק אחרי consent. Server-side `purchase`/`coupon_redeemed` מועדפים לדיוק.

---

## 5. Acceptance

- [ ] הכרעת PostHog (מוצר) + GA4 (מרקטינג) מתועדת
- [ ] Envelope + deny-list PII
- [ ] משפכי רכישה / מימוש / הפניה מוגדרים
- [ ] כסף מדוחות ledger בלבד
- [ ] Consent Mode / העדפות לפני טעינת SDKs

---

## 6. Revision

| Date | Change |
|---|---|
| 2026-08-03 | סכימת אירועים בלי PII |
| 2026-08-03 | pack-20: משפכים + הכרעת GA4 מול PostHog |
