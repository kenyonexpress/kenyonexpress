# ARCHITECTURE-GO-LIVE-CHECKLIST.md

צ'קליסט **Go-Live** מחייב לשיגור KenyonExpress (כסף אמיתי + קופונים אמיתיים).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31 (rev B)  
Scope: **docs בלבד** בקובץ זה. הביצוע בשערי CI/ops לפי הצ'קליסט.

Companions: `RELEASE-READINESS.md` (main), checkout-cardcom verification, notifications V2, backup-DR, security, WP migration execution, analytics KPI.

---

## 0. פסיקה

שיגור מותר רק כשכל שערי **P0** מסומנים PASS עם ראיה (פקודה, צילום מסך, או לוג עם timestamp).  
P1 יכולים להישאר עם תאריך יעד אחרי soft-launch.  
P2 לא חוסמים soft-launch מוגבל.

| דרגה | משמעות |
|---|---|
| P0 | חוסם כסף אמיתי / קופון אמיתי / אבטחה |
| P1 | חוסם שיגור ציבורי מלא, לא soft-launch סגור |
| P2 | איכות / חוב טכני |

**מודל כסף בשיגור:** קופון = מלוא `coupon_price` באתר, נשאר בפלטפורמה, אין Escrow. פיזי = פיצול לפי `platform_percent` מצולם. אין Make/Zapier בייצור. אין עמלת 5% קבועה.

Kill switches (חובה מוכנים לפני C3):

```
CHECKOUT_ENABLED=false
ESCROW_FLOW_ENABLED  # חייב להיות unset/false; אסור true
```

---

## 1. זהות סביבה

| # | בדיקה | P | סטטוס | ראיה |
|---|---|---|---|---|
| E1 | פרויקט Supabase prod נכון (לא demo) | P0 | | URL + project ref |
| E2 | `SUPABASE_SECRET_KEY` הוא service role של הפרויקט החי (לא `supabase-demo`) | P0 | | decode iss/role |
| E3 | `NEXT_PUBLIC_SUPABASE_URL` / anon key תואמים | P0 | | |
| E4 | Vercel production env מלא (Cardcom, Resend, Meili, R2, CRON_SECRET, VOUCHER_QR_SECRET) | P0 | | |
| E5 | דומיין `kenyonexpress.co.il` + DNS + TLS | P0 | | |
| E6 | Preview לא מצביע על DB prod בטעות | P0 | | |
| E7 | Google OAuth redirect URIs כוללים prod callback בלבד (לא localhost ב-prod client) | P0 | | |
| E8 | Cardcom webhook URL מצביע ל-prod host | P0 | | |

---

## 2. מיגרציות וסכימה

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| M1 | כל המיגרציות עד הטיפ המאושר הוחלו ב-prod דרך תהליך מאושר (לא `db push` פראי) | P0 |
| M2 | `platform_percent` NOT NULL על מוצרים חיים | P0 |
| M3 | `coupon_price_ils` תקין לכל קופון חי | P0 |
| M4 | RLS דולק על orders, vouchers, wallet, payment_tokens, carts, profiles | P0 |
| M5 | אין `ESCROW_FLOW_ENABLED=true` ב-prod | P0 |
| M6 | טבלאות vouchers / payment_events / cardcom_accounts קיימות אם checkout-cardcom ממוזג | P0 |
| M7 | Backup/PITR מאופשר (ראה backup-DR) | P0 |
| M8 | קוד ריצה של `escrow.ts` hold/release לא פעיל ב-prod tip (נמחק או דגל כבוי לצמיתות) | P0 |
| M9 | `payment_tokens.cardcom_token` לא ב-SELECT ל-`authenticated` | P0 |

---

## 3. תשלומים Cardcom

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| C1 | מסוף פלטפורמה חי + אישורי API | P0 |
| C2 | Webhook URL פרוד + URL secret + GetLpResult חובה | P0 |
| C3 | רכישת קופון טסט מקצה לקצה: charge → finalize → voucher+QR | P0 |
| C4 | Replay webhook = no-op (בלי כפילות שוברים) | P0 |
| C5 | כשל תשלום לא משאיר order "paid" | P0 |
| C6 | Token שמור: שמירה + חיוב חוזר | P1 |
| C7 | Refund path מתועד ונבדק על הזמנת טסט | P1 |
| C8 | קופון: `platform_settled`, אין `order_escrow_holds` חדשים | P0 |
| C9 | Multi-account: חיוב נשמר עם `cardcom_account_key`; verify/refund על אותו חשבון | P1 |
| C10 | סכום ב-Cardcom == `paid_on_site` מה-snapshot (אגורות→₪) | P0 |

---

## 4. Auth / עגלה / Checkout

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| A1 | Guest cart עובד בלי login | P0 |
| A2 | שלם → Google OAuth → merge → checkout | P0 |
| A3 | `/account` דורש session | P0 |
| A4 | RLS: משתמש לא רואה הזמנות/קופונים של אחר | P0 |
| A5 | שמירת כרטיס בלי חשיפת PAN | P0 |
| A6 | מחיר PDP קופון == מחיר עגלה == חיוב (`coupon_price_ils`) | P0 |
| A7 | עגלה ריקה / שורות unavailable חוסמות checkout | P0 |

---

## 5. קופונים ומימוש

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| V1 | הנפקה אחרי תשלום + QR באזור אישי | P0 |
| V2 | סריקת ספק: חד-פעמי, יתרה בעסק מוצגת | P0 |
| V3 | Replay סריקה לא מזכה פעמיים | P0 |
| V4 | פקיעה → זיכוי ארנק (C6) | P1 |
| V5 | תזכורת 48ש (notifications V2) | P2 |
| V6 | ספק לא מקבל payout מקופון prepaid | P0 |
| V7 | HMAC QR: סריקה עם חתימה שגויה נדחית | P0 |

---

## 6. התראות

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| N1 | Resend דומיין מאומת + `RESEND_API_KEY` ב-Edge/server בלבד | P0 |
| N2 | מייל לקוח אחרי רכישת קופון (עם QR/לינק) | P0 |
| N3 | התראת ספק על הזמנה פיזית | P1 |
| N4 | אין Make/Zapier בייצור | P0 |
| N5 | Retry + DLQ ל-worker | P1 |
| N6 | Unsubscribe ל-marketing / expiry | P1 |
| N7 | Edge worker דוחה בלי `Bearer CRON_SECRET` | P0 |

---

## 7. איכות מוצר / SEO / ביצועים

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| Q1 | `tsc --noEmit` = 0 | P0 |
| Q2 | Vitest ירוק על הטיפ המשוגר | P0 |
| Q3 | Production build מצליח | P0 |
| Q4 | Playwright cart/checkout ירוק מול מפתחות אמיתיים | P0 |
| Q5 | Lighthouse a11y ≥ 90 בדפי מפתח | P1 |
| Q6 | Lighthouse perf ≥ 90 (או יעד כתוב אם חריג) | P1 |
| Q7 | `compare.mjs` מול refs תחת סף מוסכם לדפי מפתח | P1 |
| Q8 | `pnpm audit --prod` בלי highs לא מוצדקים | P1 |
| Q9 | sitemap/robots/canonical חיים | P1 |
| Q10 | מחיר קופון ב-PDP = מחיר בקופה (`coupon_price_ils`) | P0 |
| Q11 | RTL + Heebo + `#fed700` על cart/checkout/account | P1 |

---

## 8. אבטחה וציות

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| S1 | אין service role בדפדפן / ב-NEXT_PUBLIC | P0 |
| S2 | CSP / security headers בסיסיים | P1 |
| S3 | Rate limits על login, checkout, redeem | P0 |
| S4 | תנאי שימוש + פרטיות + ביטול מפורסמים | P0 |
| S5 | `payment_tokens.cardcom_token` לא נחשף ב-SELECT ללקוח | P0 |
| S6 | Admin / supplier מופרדים ב-RBAC | P0 |
| S7 | Profiles: לקוח לא יכול לשנות `role` | P0 |

---

## 9. תפעול ו-DR

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| O1 | Sentry (או מקביל) על prod | P1 |
| O2 | Ntfy/alert על DLQ תשלומים והתראות | P1 |
| O3 | Runbook: כשל Cardcom / כשל webhook | P0 |
| O4 | PITR + תרגול restore מתועד | P1 |
| O5 | Cron: expire vouchers, notifications worker, webhook retry | P0 |
| O6 | On-call / מי מקבל התראת SEV1 | P0 |
| O7 | Dashboard KPI בסיסי לבעלים (הזמנות/הכנסה יומית) | P1 |

---

## 10. תוכן ונתונים

| # | בדיקה | P | סטטוס |
|---|---|---|---|
| D1 | קטלוג חי: מוצרים מאושרים, תמונות, מחירים | P0 |
| D2 | ספקים עם אימייל/טלפון תפעולי | P0 |
| D3 | WP migration (אם רלוונטי) עברה dry-run + חתימת בעלים | P0 |
| D4 | אין מוצרי דמו עם מחיר שגוי ב-prod | P0 |
| D5 | קטגוריות + חיפוש Meilisearch מסונכרנים | P1 |
| D6 | כל קופון חי עם `coupon_expiry_days` / `offer_valid_until` הגיוניים | P1 |

---

## 11. Soft-launch מול GA

| שלב | תנאי כניסה | קהל |
|---|---|---|
| Soft | כל P0 PASS; P1 עם תאריך | ספקים מזמינים + קונים מבוקרים |
| GA | P0+P1 PASS; מדדי המרה בסיסיים ב-dashboard | ציבור |

---

## 12. יום השיגור (סדר פעולות)

```
1. Freeze מיזוגים לא קשורים
2. Backup/snapshot DB
3. Deploy production
4. Smoke: home, PDP coupon price, add to cart, Google pay path, charge test, voucher, redeem
5. Verify webhooks + Resend inbox
6. Watch Sentry/Ntfy 60 דק׳
7. הכרזת soft-launch
```

Rollback:

1. Kill switch תשלום (`CHECKOUT_ENABLED=false`)
2. Revert deploy Vercel
3. אל תריץ down-migrations הרסניות בלי תוכנית DR

---

## 13. ראיות מינימום לקובץ שיגור

לכל P0: להדביק בתחתית גיליון / PR:

- פקודה + timestamp, או
- URL לוג Vercel/Supabase, או
- צילום מסך עם שעון מערכת

בלי ראיה = לא PASS.

---

## 14. חתימות

| תפקיד | שם | תאריך | חתימה |
|---|---|---|---|
| בעלים / כסף | | | |
| הנדסה | | | |
| תוכן/קטלוג | | | |

---

## 15. Revision

| Date | Change |
|---|---|
| 2026-07-31 | צ'קליסט Go-Live מלא P0/P1/P2 |
| 2026-07-31 | rev B: escrow gates, Cardcom multi-account, QR HMAC, KPI, ראיות חובה |
