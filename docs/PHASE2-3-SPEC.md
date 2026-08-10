# PHASE2-3-SPEC.md
# Phase 2–3: וריאנטים + SEO + תגיות

> **עודכן: 2026-08-10 · מודל עסקי v2.**  
> מיושר ל: `platform_percent` דינמי פר מוצר (בלי default), כסף ב-**integer agorot**, קופון = תשלום מלא בפלטפורמה, **No Escrow** (אין held / שחרור / payout לספק על קופון).

Status: **BINDING (spec)** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
Scope: **docs only**. אין שינוי קוד ב-worktree הראשי.

מסמכים קשורים:

```
docs/PRODUCT-FIELDS-RESEARCH.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-INVENTORY.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
docs/DESIGN-CHECKLIST-FINAL.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| V1 | וריאנט = יחידת מחיר+מלאי כש-`has_variants=true`. מחיר הווריאנט באגורות. |
| V2 | `platform_percent` / `coupon_price_agorot` חיים על **המוצר האב**; לא על כל וריאנט בנפרד (אלא אם צוין במפורש בעתיד; לא ב-phase זה). |
| V3 | SEO: slug לטיני יציב; `generateMetadata` + JSON-LD מאותם מספרי קופה (agorot → ₪). |
| V4 | תגיות = טקסונומיית תוויות לקטלוג/פילטר/SEO עזר; **לא** משנות עמלה ולא יוצרות Escrow. |
| V5 | אין מספר עמלה קבוע ב-SEO boost / ranking (C1 + SEARCH-UX). |
| V6 | קופון: Offer ב-JSON-LD = מחיר האתר (`coupon_price_agorot`); יתרה בעסק בתיאור טקסט בלבד. |

---

## 1. Phase 2: וריאנטים

### 1.1 מודל נתונים (יעד)

חי היום: `product_variants` עם `price_ils` / `price` numeric. יעד:

```sql
-- target columns (additive, then cut-over)
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS price_agorot integer,
  ADD COLUMN IF NOT EXISTS compare_at_agorot integer,
  ADD COLUMN IF NOT EXISTS option_values jsonb NOT NULL DEFAULT '{}'::jsonb;
  -- attributes jsonb may remain for legacy; prefer option_values keyed by axis id

-- parent product
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_variants boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS variant_axes jsonb NOT NULL DEFAULT '[]'::jsonb;
  -- variant_axes example:
  -- [{"id":"size","label_he":"מידה","values":["S","M","L"]},
  --  {"id":"color","label_he":"צבע","values":["שחור","לבן"]}]
```

| שדה | כלל |
|---|---|
| `price_agorot` | מחיר on-site של הווריאנט (פיזי) או תוספת ל-face לפי מדיניות אדמין; integer ≥ 0 |
| `stock_quantity` | כש-`has_variants`, מלאי **רק** על הווריאנט |
| `sku` | ייחודי גלובלית כשלא null |
| `is_active` / `deleted_at` | soft-delete; הסרה ב-UI ≠ מחיקת שורה (upsert מוסיף/מעדכן) |
| `sort_order` | סדר בבורר |

### 1.2 תמחור מול מודל v2

```text
# Physical line
face_agorot     = variant.price_agorot ?? product.price_agorot
paid_on_site    = face_agorot
platform_cut    = floor(paid_on_site * product.platform_percent / 100)
supplier_share  = paid_on_site - platform_cut
# platform_percent from product snapshot; no DEFAULT

# Coupon line (variants rare; if enabled)
paid_on_site    = product.coupon_price_agorot   # still product-level
balance_store   = face_agorot - paid_on_site
platform_keeps  = paid_on_site                  # 100%; No Escrow
supplier_payout = 0
```

אסור:

- לגזור מחיר קופון כאחוז קבוע מ-face  
- לכתוב `escrow_*` על שורת וריאנט  
- להשתמש ב-`commission_percent` DEFAULT 5  

### 1.3 PDP / עגלה

| כלל | פירוט |
|---|---|
| בחירה חובה | אם יש ≥2 וריאנטים פעילים, בלי בחירה = חסום "הוספה לסל" |
| יחיד | וריאנט יחיד פעיל נבחר אוטומטית |
| אזל | `stock_quantity <= 0` או `!is_active` → disabled + תווית עברית |
| Snapshot | `order_items.variant_id` + מחירים באגורות + `platform_percent` מהאב |
| URL | אופציונלי `?variant=<uuid>`; **canonical** תמיד לדף הבסיס בלי query |

### 1.4 אדמין

- צירים (`variant_axes`) + טבלת וריאנטים עם מחיר באגורות (UI מציג ₪).  
- בדיקת ייחודיות קומבינציית `option_values`.  
- הסרת שורה בטופס = `is_active=false` או `deleted_at`, לא DELETE קשיח אם יש היסטוריית הזמנות.

### 1.5 Acceptance (Phase 2)

- [ ] מוצר עם וריאנטים: מלאי אב לא נמכר ישירות  
- [ ] checkout מסרב בלי `variant_id` כש-`has_variants`  
- [ ] snapshot באגורות; פיצול פיזי לפי `platform_percent` דינמי  
- [ ] קופון + וריאנט (אם קיים): אין payout / Escrow  

---

## 2. Phase 3א: SEO

### 2.1 Routes

| Route | Index | הערות |
|---|---|---|
| `/` | yes | |
| `/category/[slug]` | yes | slug לטיני |
| `/product/[slug]` או `/products/[slug]` | yes | redirect אחד יציב בין היחיד/רבים |
| `?variant=` | noindex על ה-query; canonical בסיס | |
| `/cart`, `/checkout`, `/account/*` | noindex | |
| פילטר עמוק / page>1 ייחודי | noindex לפי SEO-PERFORMANCE | |

### 2.2 Metadata

מקור: שדות `*_he` + מחיר מקופה (agorot → פורמט `he-IL`).

| דף | title | description |
|---|---|---|
| מוצר | `seo_title` או `{name_he} \| KenyonExpress` | קצר + **מחיר אתר**; קופון מציין יתרה בעסק |
| קטגוריה | `{name_he} דילים ומבצעים \| KenyonExpress` | מ-`description_he` |
| וריאנט ב-query | אותו title של האב | לא כופל עמודים |

כללים:

- אין מחיר שני שסותר את הקופה  
- אין אחוז עמלה ב-title/description  
- `robots: noindex` ל-draft / `deleted_at`  

### 2.3 JSON-LD

בונה יחיד: `src/lib/seo/json-ld.ts` (או נתיב קיים בפרויקט).

```ts
Offer.price = agorotToIlsNumber(paidOnSiteAgorot) // coupon_price or variant/physical face
Offer.priceCurrency = 'ILS'
// Coupon: describe balance-at-business in Product.description only
// Never claim supplier escrow hold
```

אסור: `aggregateRating` מזויף; אסור Offer על face כאילו שולם במלואו בקופון.

### 2.4 Sitemap + redirects

- Sitemap דינמי: מוצרים/קטגוריות `active` בלבד  
- `seo_redirects` לשינוי slug + ייבוא WP  
- Cache tags: אינבלידציה ממוטציית אדמין (מוצר/תג/קטגוריה)  

### 2.5 Acceptance (SEO)

- [ ] View-source: מחיר Offer = מחיר אתר  
- [ ] קופון: תיאור עם יתרה בעסק; בלי Escrow  
- [ ] `?variant=` לא ב-sitemap  
- [ ] Heebo + `dir=rtl` בלי שבירת LCP חריגה (ראה DESIGN-CHECKLIST)  

---

## 3. Phase 3ב: תגיות (tags)

### 3.1 מודל

תגיות = תוויות חופשיות/מנוהלות על מוצר (לא קטגוריה הראשית).

```sql
-- illustrative target
CREATE TABLE IF NOT EXISTS public.product_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,          -- latin
  name_he text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_tag_links (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.product_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tag_id)
);
```

| שימוש | כן | לא |
|---|---|---|
| פילטר קטלוג / chips ב-PDP | כן | |
| SEO עזר בטקסט / breadcrumbs עזר | כן | שינוי `platform_percent` |
| דירוג חיפוש | אופציונלי חלש | boost לפי עמלה / 5% |
| כסף / ledger / Escrow | | **אסור** |

### 3.2 UI

- PDP: `single-product-tags` בסגנון electro (קישורים `#0062bd`)  
- אדמין: רב-בחירה; slug לטיני אוטומטי מתעתיק עם override  
- קטגוריה ≠ תג: קטגוריה אחת ראשית; תגיות רבות  

### 3.3 Acceptance (tags)

- [ ] תג לא משנה מחיר/עמלה  
- [ ] URL תג (אם יהיה) עם canonical ברור או noindex עד הכרעה  
- [ ] RTL + touch ≥44 על chips  

---

## 4. סדר יישום מומלץ

1. מיגרציית agorot ל-`product_variants` + `has_variants` / axes (MCP ב-prod)  
2. PDP בורר + cart/checkout snapshot  
3. `generateMetadata` + JSON-LD מיושרים לאגורות / No Escrow  
4. טבלת תגיות + UI + cache tags  
5. מדידת DESIGN-CHECKLIST על PDP עם וריאנטים  

---

## 5. Out of scope (phase זה)

- וריאנט עם `platform_percent` נפרד  
- Escrow / J5 / held  
- ביקורות מוצר  
- Meilisearch כמקור ל-Google (SEO נשאר HTML)  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | ספק Phase 2–3: וריאנטים + SEO + תגיות תחת מודל v2 (דינמי, agorot, No Escrow) |
