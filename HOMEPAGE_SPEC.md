# Homepage Spec — KenyonExpress

מסמך ייחוס לדף הבית (`/`). מבוסס על electro home-v7, ממומש ב-`(store)` route group.

**קובץ מימוש:** `src/app/(store)/page.tsx`  
**Layout:** `src/app/(store)/layout.tsx`  
**עדכון אחרון:** 2026-06-04

---

## Route ו-Layout

| פריט | ערך |
|------|-----|
| URL | `/` |
| Route group | `(store)` |
| Metadata title | `קניון EXPRESS — מסדרים לך בילוי` |
| Shell | `TopBar` → `SiteHeader` (מ-`layout/Header`) → `main` → `SiteFooter` |
| Container | `max-w-screen-xl mx-auto px-4 py-4` |

### דרישות גלובליות

- `dir="rtl"` ו-`lang="he"` על `<html>` (נבדק ב-`e2e/homepage.spec.ts`)
- כל מחרוזת UI: עברית
- Tailwind: properties לוגיים (`ps`/`pe`, `start`/`end`), לא `pl`/`pr` / `left`/`right` (חוץ מחריגים מתועדים)
- אייקונים כיווניים: `rtl:rotate-180` או `rtl:scale-x-[-1]`

---

## מבנה הדף (4 סקשנים)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. HERO ROW — grid 3 עמודות (RTL: עמודה 1 = ימין)         │
│    [CategorySidebar] | [Hero carousel] | [2 mini-banners]   │
├─────────────────────────────────────────────────────────────┤
│ 2. CategoryRing — 5 כרטיסי קטגוריה (גלילה אופקית)         │
├─────────────────────────────────────────────────────────────┤
│ 3. DealsSection — כותרת + טיימר + grid מוצרים             │
├─────────────────────────────────────────────────────────────┤
│ 4. FeatureBar — 5 יתרונות בשורה אחת                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Section 1: Hero row

### Grid

```css
grid-cols-[minmax(200px,1fr)_minmax(0,2fr)_minmax(160px,1fr)]
```

| עמודה (RTL) | רוחב | קומפוננטה | תפקיד |
|-------------|------|-----------|--------|
| ימין | ~25% | `CategorySidebar` | רשימת מחלקות |
| אמצע | ~50% | `Hero` | קרוסלה |
| שמאל | ~25% | inline ב-`page.tsx` | 2 mini-banners |

### CategorySidebar (`storefront/CategorySidebar.tsx`)

- רוחב קבוע: `w-[240px]`
- כותרת: `bg-brand-primary text-brand-dark`, טקסט "מחלקות"
- מקור נתונים: Supabase `categories` (`is_active`, `sort_order`, limit 12)
- קישור: `/category/{slug}`
- מתחת ל-divider: `LEGACY_CATEGORIES` (5 קישורים קשיחים, placeholder slugs)
- Hover: `bg-brand-accent`

### Hero (`storefront/Hero.tsx`)

- Client component, רקע `bg-brand-accent`, `min-h-[420px]`
- Props: `featuredProducts?: Product[]` (עד 3 מ-`page.tsx`)
- Slides (עד 4):
  1. Welcome (סטטי): "ברוכים הבאים לקניון Express"
  2. עד 3 slides ממוצרים (שם, מחיר, תמונה, CTA "לרכישה")
  3. Filler "דילים חמים" אם נדרש להשלים
- Auto-advance: 5 שניות
- CTA: `bg-brand-primary text-brand-dark`, `hover:bg-brand-primary-hover`
- Dots פעילים: `bg-brand-primary`
- תמונת מוצר: `next/image`, `hidden md:flex`, fallback `ImageIcon`

### Mini-banners (ב-`page.tsx`)

- מוצרים: `products.slice(0, 2)`
- כל banner: תמונה, `name_he`, כפתור "לקנייה" → `/products/{slug}`
- רקע: `bg-brand-accent`, hover `hover:bg-blue-50`
- Fallback (אין מוצרים): 2 לינקים סטטיים ("דילים חמים", "אלקטרוניקה")

---

## Section 2: CategoryRing

**קובץ:** `storefront/CategoryRing.tsx`

- 5 קטגוריות מ-Supabase (`is_active`, `sort_order`, limit 5)
- Fallback: `STATIC_FALLBACK` (5 קטגוריות placeholder)
- כרטיס: `w-[130px]`, אזור תמונה `h-[100px]`, שם על רקע לבן
- צבעי רקע מחזוריים: `CARD_COLORS` (yellow/blue/green/pink/purple/orange-50)
- Hover: `border-brand-primary`
- גלילה: `overflow-x-auto`, `dir="rtl"`

---

## Section 3: DealsSection

**קובץ:** `storefront/DealsSection.tsx`

- Props: `products` (עד 5 מ-`page.tsx`: `products.slice(0, 5)`)
- כותרת: "דילים של היום"
- Header bar: `dir="ltr"` (פריסת electro: כותרת | טיימר | לינק)
- טיימר: countdown מ-`23:59:59`, תצוגה `HH : MM : SS`, רקע `bg-brand-primary`
- Grid: 2 / 3 / 4 עמודות (responsive)
- כרטיס מוצר: תמונה, שם, מחיר `text-price`, כוכבים `text-brand-primary`, כפתור "הוסף לעגלה"
- Empty state: "אין מוצרים פעילים כרגע"

---

## Section 4: FeatureBar

**קובץ:** `storefront/FeatureBar.tsx`

- 5 פריטים סטטיים (Award, Tag, Headphones, ShieldCheck, MapPin)
- אייקון במעגל: `border-brand-primary`, `text-brand-primary`
- מפרידים: `border-e` בין פריטים

---

## Data layer (`page.tsx`)

### Query

```ts
supabase.from('products')
  .select('id, slug, name_he, kenyon_price, full_price, images, stock_quantity')
  .eq('status', 'active')
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .limit(8)
```

### חלוקת מוצרים

| שימוש | slice |
|--------|-------|
| Mini-banners | `0, 2` |
| Hero featured | `0, 3` |
| Deals grid | `0, 5` |

### תמונות

- `getFirstImage(images)`: האלמנט הראשון במערך `images` אם string

---

## Design tokens

ערכים ב-`src/app/globals.css` (`@theme`). **אין hex קשיח בקומפוננטות homepage.**

| שימוש | Classes |
|--------|---------|
| CTA, badges, dots פעילים | `bg-brand-primary`, `hover:bg-brand-primary-hover`, `text-brand-dark` |
| רקעים רכים (hero, banners) | `bg-brand-accent` |
| מחיר מבצע | `text-price` |
| מחיר מחוק | `text-price-strike` / `text-gray-400` |
| Feature icons | `border-brand-primary`, `text-brand-primary` |

Rebrand: ערוך רק `--color-brand-*` ב-`globals.css`.

---

## קבצים קשורים

| קובץ | תפקיד |
|------|--------|
| `src/app/(store)/page.tsx` | Homepage orchestrator |
| `src/app/(store)/layout.tsx` | Shell |
| `src/components/storefront/*` | סקשני דף |
| `src/components/layout/TopBar.tsx` | פס עליון |
| `src/components/layout/Header.tsx` | Header ראשי |
| `src/components/layout/SiteFooter.tsx` | Footer |
| `e2e/homepage.spec.ts` | RTL + title |

### Legacy (לא בשימוש ב-store homepage)

`src/components/SiteHeader.tsx`, `HeroSlider.tsx`, `RightSidebar.tsx` — גרסה ישנה; אל תוסיף אליהם.

---

## Acceptance criteria

- [ ] `GET /` מחזיר 200
- [ ] `<html dir="rtl" lang="he">`
- [ ] 3 עמודות hero נראות נכון ב-RTL (sidebar ימין, banners שמאל)
- [ ] Carousel מתחלף כל 5s; dots לחיצים
- [ ] מוצרים מ-Supabase מופיעים ב-hero / banners / deals כשיש נתונים
- [ ] Fallbacks סטטיים כשאין מוצרים או קטגוריות
- [ ] אין `#F5C518`, `#f5c518`, `#0b6e4f` בקומפוננטות (רק tokens)
- [ ] `pnpm type-check` ו-`pnpm lint` עוברים

---

## פתוח / לא ב-scope של homepage

- זהות מותג סופית (צילומי מסך + החלטת primary/secondary): ראה `STATE_NEXT.md`
- עמוד `/coupons` — layout storefront נפרד
- תשלום Cardcom על כפתורי רכישה
- `coupon_deals` בדף הבית (כרגע מוצרים בלבד; קופונים ב-`(main)/coupons`)
