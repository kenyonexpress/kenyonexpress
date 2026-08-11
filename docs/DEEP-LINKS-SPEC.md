# מפרט Deep Links

סכמת `kenyonexpress://` ו-universal links.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מקור יישום: `src/lib/app/deep-links.ts`, `apps/mobile/app.json`.

מסמכים קשורים:

```
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-MOBILE-APP.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| L1 | **שתי משפחות:** https = ציבורי; scheme = פנימי בלבד. |
| L2 | **כל מה שנשלח/משותף = https.** |
| L3 | **Scheme לשניים:** חזרה מתשלום; OAuth (D9). |
| L4 | **Cardcom return = https** (`/checkout/app-return`). |
| L5 | **קופון לא בקישור שיתוף** (D9). |
| L6 | universal link = **עמוד אמיתי באתר**. |
| L7 | `status` ב-URL = קישוט; מסך קורא DB. |

| מטרה | Universal | Scheme |
|---|---|---|
| קופונים | `/account/coupons` | `kenyonexpress://coupons` |
| חזרה מתשלום | `/checkout/app-return?...` | `kenyonexpress://checkout/return?...` |
| מוצר | `/product/<slug>` | (אין) |

Cardcom: redirect לסכמה מ-WKWebView **נחסם ב-iOS**; לכן L4.

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| scheme במייל/SMS | L2 |
| Cardcom return ל-scheme | L4 |
| QR קופון לשיתוף | L5 |
| `status` כמקור אמת | L7 |

---

## סכמת DB

```text
orders  -- מצב אחרי return
(אין טבלת deep_links)
```

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | 3DS בדפדפן מערכת | app-return → scheme |
| CE2 | WebView prefix match | סוגר sheet |
| CE3 | מנגנונים חסומים | כפתור ידני |
| CE4 | assetlinks debug key | Android לא verify |
| CE5 | APP_SCHEME ≠ expo.scheme | שבירת return |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | AASA CDN lag | iOS |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | rev A |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
