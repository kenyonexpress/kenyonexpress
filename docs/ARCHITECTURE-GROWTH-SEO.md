# ארכיטקטורת צמיחה, SEO ושיווק מחזור חיים

מסמך הדומיין לשימור SEO במעבר WP, לולאות referral/cashback, CRM, paid readiness.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; ledger דרך `fn_wallet_transfer`; אגורות integer.

מסמכים קשורים:

```
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-PERFORMANCE-SEO.md
docs/ARCHITECTURE-MARKETING.md
```

שכבת runtime SEO (proxy 301, sitemap, meta, JSON-LD): `ARCHITECTURE-PERFORMANCE-SEO.md`. מסמך זה: הכרעות צמיחה ושימור דירוגים.

---

## 1. החלטה

| # | הכרעה |
|---|---|
| G1 | מלאי URL משלושה מקורות (GSC, sitemap Yoast, crawl) → `url_inventory`; baseline GSC ב-T-7. |
| G2 | מפת 301: CSV קנוני → `seo_redirects`; 301 על 404; אין שרשור. |
| G3 | אין hreflang; `lang=he`, `dir=rtl`, `og:locale`, `inLanguage`. |
| G4 | JSON-LD עם `@id` יציב; LocalBusiness מנתוני ספק מאומתים; **אין** aggregateRating. |
| G5 | **אין** Change of Address; אותו דומיין `kenyonexpress.co.il`; Domain property ב-GSC. |
| G6 | rollback DNS רק על כשל תפעולי; ירידת SEO ≠ rollback (חריג: >10% inventory 404 שלא נפתר ב-24h). |
| G7 | ניטור 30 יום עם ספים מספריים; דוח day-30. |
| G8 | UTM קנוני; `/r/<code>` noindex; לעולם לא משתפים `qr_token`. |
| G9 | Referral: 20₪ מפנה / 10₪ מופנה; אחרי paid ראשון ≥50₪ + 14 יום; תקרות 5/חודש, 30/שנה; clawback על refund. |
| G10 | בונוס referral = הטבה (לא תו קנייה); פקיעה 24 חודשים; ארנק לא נמשך למזומן. |
| G11 | Cashback: קופון 10% / פיזי 1% מ-`charged_on_site`; snapshot בשורה; תקרה 25% מהעמלה; זיכוי ב-paid. |
| G12 | גדר תקציב: cashback+referral >12% הכנסת פלטפורמה חודשית = התראה. |
| G13 | סגמנטים: prospect/new/active/dormant + flags; view אחד למסעות. |
| G14 | 4 מסעות CRM חדשים; שיווק רק opt-in (30א); מסע שלא מחזיר ב-3 חודשים נכבה. |
| G15 | Paid: Pixel+CAPI `event_id` משותף; Google offline conversions; לכידת click IDs עכשיו. |
| G16 | ROAS = הכנסת פלטפורמה/הוצאה; החלטות מ-`v_roas_weekly`. |
| G17 | North Star: WRV (שווי מימוש שבועי); עץ KPI מחושב. |
| G18 | שינויי סכימה עתידיים: `041_growth.sql` expand-only. |

### 1.1 עקרונות על

1. רציפות SEO = הכנסה; אפס URL ישן בלי הכרעה (301 / 410 / live).
2. WhatsApp = ערוץ הפצה ראשי ב-IL; מייל/SMS משניים.
3. כל הטבה דרך ledger + `idempotency_key`; liability מ-`v_wallet_liability`.
4. שיווק opt-in בלבד; ייבוא WP opted-out.
5. KPI ניתנים לחישוב מהסכימה (033/034).

### 1.2 Referral (תמצית)

- `/r/<code>` → cookie 30d → `referrals` pending → cron אחרי 14d → `fn_wallet_transfer` ×2.
- Fraud: self-referral block, token duplicate, rate limits.

### 1.3 Cashback (תמצית)

- Snapshot ב-`beginCheckout`; credit ב-webhook paid; refund clawback.
- תזכורת פקיעה 30d = שירות, לא marketing.

### 1.4 T-0 flip (10 steps)

verify 301 → DNS → smoke → sample redirects → sitemap GSC → robots → OG WA test → 404 dashboard.

### 1.5 ניטור 30d (ספים)

| מדד | סף |
|---|---|
| 404 על inventory | 0 |
| קליקים vs baseline | -20% OK שבועיים; -40% triage |
| Soft 404 GSC | 0 |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| Change of Address ב-GSC | G5; אותו דומיין; CoA למעבר דומיין בלבד. |
| rollback DNS על ירידת דירוג | G6; נזק כפול; תיקון redirects קדימה. |
| cashback על `platform_fee` לפיזי בלבד | G11; percent דינמי; 1% מ-charged + cap 25%. |
| referral bonus כתו קנייה | G10; legal; הטבה עם פקיעה. |
| שיתוף qr_token ב-WA | G8; אבטחה; product URL בלבד. |
| paid לפני baseline GSC | G1; אין מדידה. |
| GA4 כ-primary analytics | G15; offline + CAPI; GA4 לא primary. |
| hreflang en/he | G3; אתר חד-לשוני phase 1. |
| aggregateRating ב-JSON-LD | G4; אין reviews מאומתים. |
| wallet auto-apply ב-checkout | 026; ידני בלבד. |

---

## 3. סכמת DB

**עתידי (expand-only):** `migrations/pending/041_growth.sql` (מספר 041 לפי R31)

| אובייקט | תוכן |
|---|---|
| `seo_redirects` | `from_path`, `to_path`, `hits` (030; קיים/מתוכנן) |
| `wp_import.url_inventory` | baseline URLs (032) |
| `referrals` | pair, status, amounts (010+) |
| `profiles.affiliate_code` | קוד `/r/` |
| `orders.attribution` | UTM, gclid, fbclid (033) |
| `order_items.cashback_earned_*` | snapshot G11 |
| views | `v_wallet_liability`, `v_channel_revenue_weekly`, `v_roas_weekly`, segment view G13 |

**אין DDL חדש ב-batch זה.** קריאה/כתיבה רק דרך RPCs קיימים + 041 בעתיד.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | 301 chain detected בטעינה | collapse; fail verify |
| E2 | referral refund אחרי credit | clawback G9; no negative balance |
| E3 | duplicate referral idempotency | no-op second transfer |
| E4 | self-referral same device | reject pending |
| E5 | cashback >25% platform fee | zod/CHECK block at checkout |
| E6 | CAPI without consent | no send G15 |
| E7 | `/r/` bot flood | rate limit; noindex |
| E8 | GSC baseline missing | block cutover G1 |
| E9 | WP import list emailed without opt-in | opted-out M5 |
| E10 | redirect bug >10% 404 day 3 | G6 rollback exception |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | `041_growth.sql` not applied | pending approval; docs only | 2026-08-12 |
| O2 | day30-report template path | `docs/growth/baseline/day30-report.md` | 2026-08-12 |
| O3 | subscription cashback rate | 0 until subscriptions spec | 2026-08-12 |
| O4 | influencer attribution | out of scope day 1 | 2026-08-12 |

---

## 6. נספח: UTM matrix (קנוני)

| הקשר | utm_source | utm_medium | utm_campaign |
|---|---|---|---|
| WA share deal | `whatsapp` | `share` | `product_share` |
| WA share coupon | `whatsapp` | `share` | `coupon_share` |
| referral link | `whatsapp` | `referral` | `referral_program` |
| CRM | `crm` | `email`/`whatsapp` | `<journey_key>` |
| paid | `facebook`/`google` | `paid` | `<campaign>` |

---

## 7. נספח: JSON-LD (G4)

Product, Offer, BreadcrumbList, WebSite, Organization; LocalBusiness על deal pages מספק verified; `@id` stable URLs.

---

## 8. נספח: KPI tree (G17)

North Star WRV; supporting: organic clicks, referral completed, wallet apply rate, CAC, platform revenue, ROAS from `v_roas_weekly`.

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-17 | G1-G18; referral/cashback/SEO |
| 2026-07-20 | split runtime SEO to PERFORMANCE-SEO |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
