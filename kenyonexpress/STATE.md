# KenyonExpress State

## Current Phase
**Phase 5 — Homepage**. **דף הבית הושלם** (תואם 1:1 ל-refs/ke_live_home.html במבנה ובתמונות). הבא: **דף מוצר** (השלמה/ליטוש לפי refs).

## Last Completed
Session 2026-06-09 (דף בית תואם 1:1 לחי + תמונות אמיתיות). commit `feat: homepage 1:1 with live site - 3-column hero, Tesla/Apple/Laptop banners, category images`, push ל-phase5/homepage:
- **שיטת compare-and-fix**: `scripts/compare.mjs` (Playwright) מרנדר את refs/ke_live_home.html ואת localhost:3000 ב-1440px ל-refs/live.png ו-refs/mine.png; השוואה ויזואלית ותיקון בלולאה.
- **שורה ראשית** → `lg:grid-cols-[1fr_2fr_1fr]` (25/50/25, departments צר ימין | hero רחב אמצע | מיני-באנרים צר שמאל). ה-class בחי הוא col-33 אבל ה-CSS של electro מרנדר 25/50/25 — סמכתי על ההשוואה הויזואלית.
- **רשת מוצרים** → 4 עמודות (`DealsSection lg:grid-cols-4`), תואם לחי. fetch הועלה ל-24.
- **תמונות אמיתיות חולצו מ-refs/ke_live_home.html וחוברו**: מיני-באנרים `public/images/promo/{tesla,apple,laptop}.webp` (Tesla/Apple/Laptop); קטגוריות `public/images/categories/{under-99.png,kids,courses,hotels,pets}.webp` (e-baby-d2 / student-849821 / maldives-2 / cute-golden-retriever / Screen-Shot). `assets.ts` PROMO+CATEGORIES עודכנו; הוסרו 3 הבאנרים הישנים.
- אומת: type-check נקי, home 200, כל 8 התמונות 200, ההשוואה הויזואלית תואמת.
- **הבדל יחיד שנשאר = נתונים**: 4 מוצרים פעילים בלבד ב-DB (content-range 0-3/4), אז הרשת מציגה שורה אחת בעוד החי מציג קטלוג מלא. לא ניתן לתקן בלי גישת כתיבה.
- overrides נשמרו: Heebo, מחיר אדום #E4002B, שם מוצר כחול #0062bd, בלי בורר אזור/חיפוש.

---

## Last Completed (יישור electro + לוגו)
Session 2026-06-09 (יישור electro + לוגו חי). commit `feat: align homepage spacing/grid to electro reference measurements + wire live-site logo`, push ל-phase5/homepage:
- `refs/` — תיקיית reference קבועה (ב-.gitignore). הועברו לשם: `ke_live_{home,product,cart}.html`, `electro_style.css` (1.1MB אמיתי), `electro_home_v7.html` (5KB — נחסם Cloudflare). מקור האמת מעכשיו.
- `KE_LIVE_SPEC.md` — נוסף סעיף "מידות electro": container 1200/1430 (פרויקט בחר 1320), דף מוצר גלריה/summary **41.67% / 58.33%** (col-5/7), שורה ראשית עמודות 25%/270px, רשת מוצרים columns-3.
- **יישור קוד למידות electro:** דף מוצר `(store)/product/[slug]/page.tsx` → `md:grid-cols-[5fr_7fr]` (נמדד 495.8/694.2px = 5:7 מדויק). `HomeHeroSection` שורה ראשית → `lg:grid-cols-[270px_1fr_270px]`.
- **לוגו חי חובר:** הורדו מ-kenyonexpress.co.il ל-`public/images/logo.webp` + `logo-footer.webp` (WebP אמיתי: "קניון EXPRESS" + עגלה צהובה). `assets.ts` → `LOGO`/`LOGO_FOOTER`. Header מציג LOGO (רקע לבן), Footer מציג LOGO_FOOTER (עם brightness-0 invert על רקע כהה). אומת ב-Playwright.
- type-check נקי לאורך כל הדרך. ההחלטות נשמרו (Heebo, מחיר אדום, בלי בורר אזור/חיפוש).

---

## Last Completed (דף בית 1:1)
Session 2026-06-09 (דף בית 1:1 + spec מהאתר החי). commit `feat: homepage 1:1 with live site structure + project decisions + foundation gaps`, push ל-phase5/homepage:
- הורדו דפי האתר החי (`ke_live_home/product/cart.html`, untracked, לא בקומיט). זוהתה פלטפורמה: WordPress + Elementor + WooCommerce, תבנית electro.
- `KE_LIVE_SPEC.md` נכתב מחדש לפי האמת של האתר החי + טבלת "סטיות שהוחלטו" (Heebo במקום Inter; בלי בורר אזור/חיפוש; מחיר אדום #E4002B במקום כחול #1da1f2; שם מוצר כחול #0062bd).
- `src/components/store/CategoryNav.tsx` — חדש: תפריט קטגוריות עליון אופקי (11 slugs קנוניים), חובר ל-`(store)/layout.tsx` אחרי ה-header.
- `CategoryStrip` → `lg:grid-cols-5` (תואם `columns-5` החי).
- סדר דף הבית מאומת 1:1 (Playwright /tmp/home-1to1.png): top bar → header → תפריט קטגוריות → שורה ראשית 3 טורים → רצועת קטגוריות (5) → רשת מוצרים (3) → feature bar → newsletter → footer. ההחלטות נשמרו.

---

## Last Completed (שלב 0 — תשתית)
Session 2026-06-09 (שלב 0 — תשתית הושלם). commit `feat: foundation complete ...`, push ל-phase5/homepage:
- **6 פערי electro תוקנו ב-`globals.css @theme`** (single source, Tailwind v4): brand-primary `#fed700`, hover `#fedd26`; טוקן `--color-link: #0062bd` (שם מוצר כחול, נבדל ממחיר אדום `#e4002b`); `--container-page: 1320px` → utility `max-w-page` (החליף את כל ה-`max-w-[1320px]` בקומפוננטות storefront); `--header-height: 54px`; `--font-sans: var(--font-heebo), Arial` (Inter הוסר לגמרי מ-`layout.tsx`).
- **grid מוצרים** → 3 עמודות ב-lg/xl: `DealsSection` ו-`products/page.tsx`.
- **ProductCard** — שם מוצר `text-link`.
- **תמונות אמיתיות חוברו**: `public/hero/slide{1-3}.jpg` → `public/images/hero/slide-{1,2,3}.jpg`; `public/banners/banner{1-3}.jpg` → `public/images/promo/{hottest,deals,laptops}.jpg` (תואם `assets.ts`). PromoBanners (3 מיני-באנרים) מציג אותם. נוסף **fallback סטטי** ב-`HomeHeroSection` (FALLBACK_SLIDES מ-HERO_SLIDES) כי טבלת `hero_slides` לא קיימת ב-DB — כך ה-hero מציג את התמונות שהועלו. CategoryStrip נשאר placeholder (לא הועלו תמונות קטגוריה).
- מדדים אומתו ב-Playwright על localhost:3000: header=54px, container=1320px, font=Heebo, hero img נטענת.
- אומת gaps: type-check + lint נקיים.

### עוד בקומיט הזה (display pages, יוצגו בשלב 1)
- דף מוצר בודד: `(store)/product/[slug]/page.tsx` (slug יחיד) + `storefront/{ProductGallery,ProductInfo,RelatedProducts}.tsx`; נמחק `(store)/products/[slug]/` הישן.
- `KE_LIVE_SPEC.md` (מקור אמת; בלי סעיף אזורים; עם סעיף Header) + `supabase/migrations/018_seed_categories.sql`.

### Blocking
- **slugs קטגוריות לא עודכנו ב-DB** (ג לא הושלם): `018_seed_categories.sql` מוכן (remap dyl-chm→hot-deals וכו'), אבל אין גישת כתיבה — MCP לא אומת, `SUPABASE_SERVICE_ROLE_KEY` ריק, אין DB url/token. צריך אישור OAuth ל-MCP או service role key.
- **migration 017 (hero_slides) ו-018 לא הורצו על ה-DB** — הטבלה חסרה בפרוד (לכן ה-fallback ל-hero).
- שני קבצי `007` ב-migrations; התנגשות 003↔005 (DROP TABLE products מוחק את audit trigger); שתי טבלאות audit (admin_audit_log/audit_log) — ראו דוח הכפילויות.

---

## Last Completed (לפני שלב 0)
Session 2026-06-09 (המשך) — Header תואם לאתר החי. commit `feat: header matches live site - logo + 3 icons only, no area selector, no search`, push ל-phase5/homepage:
- `src/components/layout/Header.tsx` — נכתב מחדש: הוסר בורר אזור (REGIONS + select + MapPin) והוסר שדה חיפוש (form/input/Search). נשאר: לוגו מימין + שלושה אייקונים משמאל (ShoppingBag עם badge "0", User→/login, Heart). brand tokens בלבד, RTL. type-check נקי, אומת ב-Playwright screenshot על localhost:3000.

### עבודה לא-מקומטת (ממתינה לאישור screenshots, לא ב-commit הזה)
- דף מוצר בודד: `src/app/(store)/product/[slug]/page.tsx` (slug יחיד) + `src/components/storefront/{ProductGallery,ProductInfo,RelatedProducts}.tsx`; `ProductCard` עודכן לקישור `/product/${slug}`; נמחק `(store)/products/[slug]/` הישן (page+ProductGallery+VariantSelector).
- `KE_LIVE_SPEC.md` (שורש ה-repo) — מקור אמת חדש לחזית; הוסר סעיף בורר אזור + 16 אזורים, נוסף סעיף Header.
- `supabase/migrations/018_seed_categories.sql` — גישה B: remap slugs קיימים לקנוניים (dyl-chm→hot-deals, ad-99→under-99, new-deals→new, restaurant-coffee→restaurants-cafes, typvch-bryavt-vyvpy→beauty-health, phones-electronics→phones-computers) + INSERT 5 חסרים (baby-kids, vacation, pets, professionals, courses). `electronics` נשאר ללא שינוי. idempotent.

### Blocking
- לא ניתן להריץ את `018_seed_categories.sql` מול ה-DB: ה-MCP של Supabase לא אומת, `SUPABASE_SERVICE_ROLE_KEY` ריק ב-`.env.local`, ואין DB url/token/password בקבצי env. נדרש אישור OAuth ל-MCP, או service role key, כדי לסיים את ה-remap (B).

---

## Last Completed (לפני Header)
Session 2026-06-09 — DealsSection + Heebo/grid + HeroSlider→Supabase code + RTL audit. 3 commits (לא בוצע push):
- `src/components/store/DealsSection.tsx` — נוצר: client component, countdown 23:59:59 (setInterval), כותרת "דילים של היום", grid מוצרים RTL; `(store)/page.tsx` שולף עד 8 מוצרים פעילים ומעביר כ-props. commit `b9fec5a`
- `globals.css` — `--font-sans` שונה ל-`var(--font-heebo), var(--font-inter)` (Heebo ראשי); `DealsSection` grid → `grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-0`. commit `9dd48f2`
- HeroSlider→Supabase (קוד + migration, **ה-migration עדיין לא הורץ על ה-DB**): `017_hero_slides.sql` (טבלה + RLS public-read-active + seed 3 שורות), `HomeHeroSection` שולף server-side ומעביר ל-`HeroSlider` (client, props + fallback null, אנימציה נשמרה). commit `b877678`
- ביקורת RTL לכל קומפוננטות ה-homepage: type-check + lint נקיים (exit 0), כל ה-dir תקין (2 חריגי `dir="ltr"` נכונים: countdown ב-DealsSection, טלפון ב-SiteFooter)
- ⚠️ החלטות HeroSlider עודכנו אחרי ה-commit: נדרש לתקן את 017 ל-`updated_at` + trigger, ולהחזיר "SIMPLY THE BEST" כטקסט סטטי (ייעשה ב-commit חדש נפרד, לא amend)

## Last Completed (קודם)
Session 2026-06-04 — assets.ts + SmartImage: ריכוז נתיבי תמונות + fallback אוטומטי. tsc + lint clean (לא בוצע commit עדיין):
- `src/lib/assets.ts` — נוצר: registry יחיד לנתיבי תמונות סטטיות: `LOGO`, `HERO_SLIDES[3]`, `PROMO[3]`, `CATEGORIES{5}`; כל הקומפוננטות קוראות מכאן בלבד
- `src/components/ui/SmartImage.tsx` — נוצר: עוטף next/image; ב-onError מציג placeholder `bg-slate-100` + `ImageIcon` במרכז (a11y: role="img" אם יש alt, אחרת aria-hidden)
- `Header.tsx` (logo), `HeroSlider`, `PromoBanners`, `CategoryStrip` — כולם משתמשים ב-SmartImage עם נתיבים מ-assets.ts; אפס קישורים חיצוניים
- `public/images/{hero,promo,categories}/` — תיקיות נוצרו, ריקות; עד שיוכנסו קבצים SmartImage מציג placeholder אפור
- `src/components/layout/SiteFooter.tsx` — נבנה מחדש בסגנון electro home-v7: newsletter bar צהוב (Send icon + input לבן + כפתור `bg-footer-bg`), גוף כהה 4 עמודות RTL (לוגו לבן ב-SmartImage + Headphones + טלפון / ניווט מהיר 7 לינקים / שירות לקוחות 5 / פרטי קשר + רשתות), שורה תחתונה `bg-black/20` עם תשלומים (ימין) ו-© (שמאל); אומת רינדור ב-localhost:3000
- `globals.css` — טוקן חדש: `--color-footer-bg: #333E48`
- הערה: lucide 1.16 בלי אייקוני מותג — רשתות עם Share2/Camera/Play/Send גנריים
- ⏳ נדרש: להפיל קבצים אמיתיים: `logo.png` (הקיים הוא לוגו כחול גנרי), `images/hero/slide-{1,2,3}.jpg`, `images/promo/{hottest,deals,laptops}.jpg`, `images/categories/{under-99,pets,hotels,courses,kids}.jpg`

Session 2026-06-04 — Logo + PromoBanners per live site + placeholders אחידים. commit `1bf4f79`, tsc + lint clean:
- `src/components/store/PromoBanners.tsx` — מבנה לפי kenyonexpress.co.il החי: טקסט אפור קטן `text-start` למעלה, placeholder תמונה באמצע, שורת "Shop now" עם עיגול צהוב (`bg-brand-secondary`) ו-`ChevronLeft` (קדימה ב-RTL); כפתור ה-pill הוסר
- שלוש הקומפוננטות (`PromoBanners`, `HeroSlider`, `CategoryStrip`) — placeholder אחיד: `bg-slate-100` + lucide `ImageIcon` במרכז; תמונות אמיתיות יחוברו בהמשך
- `src/components/layout/Header.tsx` — ממדי הלוגו תוקנו ל-133x102 (הממדים האמיתיים של `public/logo.png`), תצוגה `h-16 w-auto`
- ⚠️ `public/logo.png` הקיים הוא לוגו חצים כחול גנרי, לא "קניון EXPRESS עם עגלה צהובה" — צריך להחליף את קובץ הנכס ידנית (הקוד כבר מצביע נכון)

Session 2026-06-04 — Homepage polish: חצים RTL + הסרת picsum. commit `8592201`, tsc + lint clean:
- `src/components/store/PromoBanners.tsx` — חץ Shop now הוחלף מ-unicode `→`+`rtl:rotate-180` ל-lucide `ArrowLeft` (מצביע לכיוון הקריאה ב-RTL); תמונות picsum הוחלפו ב-placeholder אפור (`bg-gray-100`) עם אייקון lucide פר באנר (Flame/Gamepad2/Laptop)
- `src/components/store/HeroSlider.tsx` — חץ "לקניות" הוחלף ל-lucide `ArrowLeft` (היה `←`+rotate שהצביע אחורה); תמונת slide הוחלפה ב-placeholder עם אייקון פר slide (ShoppingBag/BadgePercent/MonitorSmartphone)
- `src/components/store/CategoryStrip.tsx` — תמונות picsum הוחלפו ב-placeholder אפור עם אייקון פר קטגוריה (Tag/PawPrint/Hotel/GraduationCap/Baby)
- `next.config.ts` — הוסר `picsum.photos` מ-remotePatterns (אין יותר שימוש)

Session 2026-06-04 — Homepage rebuilt 1:1 per HOMEPAGE_SPEC.md. tsc clean, lint clean, אפס hex hardcoded:
- `src/app/(store)/page.tsx` — מבנה חדש: `HomeHeroSection` + `CategoryStrip` + `InfoBar`
- `src/components/store/` — 5 קומפוננטות חדשות: `HomeHeroSection`, `HeroSlider`, `CategorySidebar`, `PromoBanners`, `CategoryStrip`
- `src/components/layout/` — `TopBar`, `Header`/`SiteHeader`, `InfoBar`, `SiteFooter` (newsletter bar + 4 עמודות)
- `src/app/(store)/layout.tsx` — `TopBar` + `SiteHeader` + `SiteFooter`, ללא container (main = full-width)
- ניקוי: נמחקו כל הקומפוננטות הלגנסי (`storefront/`, `home/`, `HeroSlider`, `InfoBar`, `SiteHeader`, `CategoryStrip`, `BottomNav` הישנים)

Session 2026-06-04 — Homepage rebuilt per electro home-v7 DOM structure. tsc clean, אומת ב-Playwright screenshot:
- `src/app/(store)/page.tsx` — 3-column RTL grid: [CategorySidebar ימין | Hero carousel אמצע | 2 mini-banners שמאל]; fetches 8 products (0-2 → banners, 0-2 → hero slides, 0-4 → deals); no dir="ltr" wrapper — RTL grid orders col-1 to right automatically
- `src/components/storefront/Hero.tsx` — carousel-only (mini-banners extracted to page.tsx); 4 slides (slide-1 welcome + up to 3 from products); interval 5s; bg-brand-accent; active dot bg-brand-primary; fallback ImageIcon when no product image
- `src/components/storefront/CategoryRing.tsx` — replaced circles with rectangular cards: 130px wide, 100px image area + white name strip; hover border brand-primary; 5 items from Supabase or static fallback
- `src/components/storefront/DealsSection.tsx` — title "דילים של היום"; accepts 5 products from page

Session 2026-06-04 — Homepage polish: Hero props + real product images + DealsSection fix. tsc clean, אומת ב-Playwright:
- `src/components/storefront/Hero.tsx` — מקבל `featuredProducts?: Product[]` מ-page.tsx; בונה 4 slides דינמיים (slide 1 welcome static, slides 2-4 מ-Supabase products); interval 5s; רקע `bg-brand-accent`; dots `bg-brand-primary`; תמונות מוצר אמיתיות עם fallback `ImageIcon` (lucide); mini-banners משתמשים גם בתמונות המוצרים
- `src/app/(store)/page.tsx` — מעביר `products.slice(0, 3)` ל-Hero כ-`featuredProducts`
- `src/components/storefront/DealsSection.tsx` — כותרת תוקנה ל-"דילים של היום"
- `src/lib/supabase/server.ts` + `.env.local` — תוקן: הוחלף `NEXT_PUBLIC_SUPABASE_ANON_KEY` ריק ב-`sb_publishable_...` פורמט; פורמט תקין עם `@supabase/ssr@0.10.3`

Session 2026-06-04 — Storefront homepage 1:1 עם electro home-v7 + זהות KenyonExpress. commit `14fef20` pushed ל-main:
- `src/components/storefront/` — 7 קומפוננטות חדשות: `Header`, `CategorySidebar`, `Hero`, `FeatureBar`, `CategoryRing`, `DealsSection`, `Footer`
- `src/app/(store)/page.tsx` — homepage חדש, סדר סקשנים זהה ל-electro: hero row → category ring → deals timer → feature bar
- `src/app/(store)/layout.tsx` — עודכן ל-StorefrontHeader + StorefrontFooter
- `src/app/(main)/page.tsx` — נמחק (הוחלף ב-(store)/page.tsx)
- `next.config.ts` — נוספו remotePatterns: images.unsplash.com, picsum.photos
- `public/hero/slide{1,2,3}.jpg` + `public/banners/banner{1,2,3}.jpg` — תמונות מקומיות (next/image)
- Layout: CategorySidebar שמאל (dir=ltr על hero row) + Hero carousel מרכז + 3 mini-banners ימין
- DealsSection: countdown timer 23:59:59 (client) + 4-col product grid
- CategoryRing: circle categories מ-Supabase (ללא deleted_at)
- Header: top bar שחור + main white header + nav bar כהה עם "מחלקות" צהוב + quick links
- אומת ויזואלית עם Playwright screenshot: 200 OK, תמונות נטענות

Session 2026-06-04 — Brand tokens + ProductCard + Header. אומת ויזואלית ב-localhost:3000/category/electronics:
- `globals.css` -- `:root`+`@theme inline` הוחלפו ב-`@theme` יחיד עם ערכי hex ישירים; טוקנים: `--color-brand-primary: #FFD200`, `--color-price: #E4002B`, `--color-brand-dark: #1A1A1A`, `--color-brand-accent: #EAF4F6`, `--color-success: #5CB85C`, semantic `primary`/`primary-foreground`, aliases לתאימות אחורה
- `ProductCard.tsx` -- מחיר `text-price` (אדום), כפתור "הוסף לעגלה" `bg-brand-primary text-brand-dark`, hover border צהוב + scale תמונה
- `Header.tsx` -- לוגו K `bg-brand-primary text-brand-dark` (צהוב/שחור), ring + nav hover → `brand-primary`
- commit `b0c0c9f` pushed ל-main

Session 2026-06-04 — עמוד קטגוריה דינמי + store layout. אומת ב-localhost:3000 עם נתונים אמיתיים מ-Supabase:
- `src/app/(store)/layout.tsx` — Header דביק + SiteFooter ל-(store) route group (ללא sidebars)
- `src/app/(store)/category/[slug]/page.tsx` — Server Component: שליפת קטגוריה לפי slug, מוצרים לפי category_id, notFound() אם slug לא קיים, breadcrumb + כותרת + grid של ProductCard
- Seed data ב-Supabase: קטגוריית `electronics` (slug) + 4 מוצרים (סמסונג S24 / AirPods Pro / MacBook Air M3 / Anker PowerBank)
- commit `49fa78e` pushed ל-main
- ממצא DB: `categories` אין עמודת `deleted_at` בלייב (קוד תוקן בהתאם); `products` יש `price_ils` NOT NULL (נדרש בinsert)

---

Session 2026-06-01 — Global layout shell (Phase 5). נבנה ה-shell הגלובלי של הסטורפרונט:
- `globals.css` — design tokens מתועדים: `--brand-primary`/`--brand-secondary` (החלפת מותג במקום אחד), shades, רדיוס, spacing, alias-ים תואמי-אחורה (`--brand` וכו') כדי לא לשבור שימושים קיימים ב-`bg-brand`
- גופן הוחלף ל-Heebo (next/font, עברית-first) ב-`app/layout.tsx`
- נוצר `components/layout/Header.tsx` — header דביק (sticky), RTL: לוגו מימין, חיפוש במרכז, עגלה/חשבון משמאל, hamburger במובייל, אייקוני lucide
- `SiteFooter.tsx` נכתב מחדש ל-4 עמודות: אודות / שירות לקוחות / משפטי / עקבו אחרינו (לינקים placeholder, אייקוני lucide גנריים כי הגרסה 1.14.0 ללא אייקוני מותג)
- `MainHeader.tsx` נמחק (הוחלף ב-`Header`), לינק שבור `/auth/login` ב-`TopBar` תוקן ל-`/login`
- tsc --noEmit ✅ + lint ✅. הערה: `next dev` חסום ב-sandbox כאן (uv_interface_addresses), אימות ויזואלי ב-localhost:3000 נותר להרצה מקומית.

### Phase 4 (Admin CRUDs) — closed
All 5 CRUDs verified live in the browser (200 OK): Categories, Vendors, Products, Coupons, coupon_deals. Migrations 013/014/016/015 ran on Supabase, DB schema fully synced with the app code.

### Coupon deals wired end to end (homepage + public pages + admin CRUD):
- עמוד הבית (`(main)/page.tsx`) הוחלף מטבלת `coupons` הישנה ל-`coupon_deals` (מודל 10% אונליין / 90% בבית העסק)
- `CouponCard.tsx` נכתב מחדש ככרטיס דיל (תמונה, % הנחה, שם עסק, מחיר פלטפורם מול מחיר מקורי, מיקום), מקשר ל-`/coupons/[id]`
- נוצר עמוד רשימה ציבורי `(main)/coupons/page.tsx`
- נוצר עמוד פרט ציבורי `(main)/coupons/[id]/page.tsx` עם פירוק תשלום 10%/90% (כפתור הרכישה מסומן "בקרוב" עד חיבור תשלום)
- אומת שה-CRUD של האדמין ל-`coupon_deals` כבר מלא: רשימה/יצירה/עריכה/מחיקה רכה + טופס עם תצוגה מקדימה (`/admin/coupons`, `coupon-deals.ts`, `CouponDealForm.tsx`)
- tsc --noEmit ✅ + lint ✅
- ⏳ נותר: חיבור תשלום אמיתי (Cardcom) לכפתור הרכישה

### Session 2026-06-01 (earlier) — Migrations 013/014/015 fixed + products schema synced to code:
- מקור השגיאה `42703: column "status" does not exist` אותר: `013_vendors_v2.sql` יצר אינדקס על `vendors.status` שלא קיים ב-DB האמיתי
- הסכמה האמיתית ב-Supabase הוצלבה דרך MCP (`list_migrations` ריק: המיגרציות הורצו ידנית, ה-DB משקף את פלט `005` בלבד)
- `013_vendors_v2.sql` תוקן: נוספה עמודת `status` (text + CHECK pending/active/suspended) + `business_id`, `contact_email`, `contact_phone`, `address`, `bank_account`
- `014_products_v2.sql` תוקן: `vendor_id` → `supplier_id` (אינדקס + RLS), נוספה `is_active` ל-`product_variants`
- `016_products_code_sync.sql` נוצר: rename `title_he`→`name_he` ב-products ו-variants, הוספת `name_en/kenyon_price/full_price/is_coupon_enabled/sku/is_featured/images/deleted_at`, backfill של `kenyon_price` מ-`price_ils`
- `008_product_pricing_coupon.sql` נמחק (התנגשות מספר עם `008_coupons_schema.sql`, תוכנו נכלל ב-016)
- תוקנו 3 באגי קוד: `base_price` → `kenyon_price` ב-`admin/products/page.tsx` + `admin/page.tsx`, הוסר join שבור ל-`vendors`, עמוד הבית (`(main)/page.tsx` + `ProductCard.tsx`) עודכן ל-`name_he/kenyon_price/images`
- tsc --noEmit ✅ clean

## Migrations Status (Supabase)
- `001`–`011` ✅ רצו (ידנית; ה-DB תואם לפלט `005` עבור products)
- `008_product_pricing_coupon` ❌ נמחק (הוחלף ב-`016`)
- `012` ⏳ סטטוס לא ודאי (לא נדרש; השינויים מכוסים ב-013/016)
- `013` ✅ רץ בהצלחה (vendors v2: status + שדות עסק/בנק + RLS)
- `014` ✅ רץ בהצלחה (products v2: supplier_id, is_active, RLS, indexes)
- `016` ✅ רץ בהצלחה (products/variants סנכרון שמות + backfill kenyon_price)
- `015` ✅ רץ בהצלחה (coupon_deals + bucket + audit trigger)
- הסכמה מסונכרנת במלואה מול הקוד

## In Progress
**HeroSlider → Supabase** — טבלת `hero_slides`, migration `017`, RLS (public read active), seed 3 שורות. הקוד מחובר (commit `b877678`). נותר: לעדכן את 017 ל-`updated_at`+trigger ו-"SIMPLY THE BEST" סטטי, ואז **להריץ את ה-migration על ה-DB** (דרך Transaction pooler `aws-1-eu-north-1.pooler.supabase.com:6543`).

## Blocking Issues
- ה-migration `017_hero_slides.sql` עדיין לא הורץ → טבלת `hero_slides` לא קיימת ב-DB, HeroSlider מציג null (אזור הירו האמצעי ריק) עד שיורץ
- חסר אמצעי הרצה: אין `psql`, אין מודול `pg` (צריך `pnpm add -D pg`), ואין סיסמת DB ב-`.env.local` (נדרשת סיסמה ל-pooler)

## Next Task
1. **דף `/products`** (listing) — `(store)/products/page.tsx` server component (status='active', deleted_at IS NULL) + pagination, ProductsGrid עם ProductCard (grid 2/3/4 gap-0), sidebar סינון לפי קטגוריה + מיון מחיר/חדש, RTL מלא. תוכנית הוצגה, ממתינה לאישור + 3 החלטות (ProductsGrid נפרד? page size 24? מיון client/links?)
2. **Footer gaps** — תיקון `SiteFooter.tsx` לפי טבלת מדידות Electro (ממתין למדידות מסוכן הדפדפן)
3. **push** — `git push origin phase5/homepage` (3 commits) רק אחרי "אשר push" מפורש

## Active Branch
phase5/homepage

## Working Directory
/Users/ofir/kenyonexpress-web/kenyonexpress

## Supabase Project URL
https://ixvwfbuvfxxsjiywhbbb.supabase.co

---
## History

### 2026-06-04 — Brand tokens + ProductCard + Header
- globals.css: single @theme block, #FFD200 primary, #E4002B price, #1A1A1A dark
- ProductCard: red price, yellow CTA button, hover border + image scale
- Header: yellow logo K with black text, brand-primary focus/hover
- אומת ב-Playwright screenshot: logo rgb(255,210,0), price rgb(228,0,43) ✅

### 2026-06-04 — Storefront homepage 1:1 electro home-v7
- 7 קומפוננטות ב-`src/components/storefront/`: Header, CategorySidebar, Hero, FeatureBar, CategoryRing, DealsSection, Footer
- סדר סקשנים: hero row (sidebar+carousel+mini-banners) → category ring → deals+timer → feature bar → footer
- `dir=ltr` על hero row: sidebar ויזואלית שמאל כמו electro
- תמונות מקומיות: `public/hero/`, `public/banners/` (next/image)
- countdown timer 23:59:59 (client component)
- `(main)/page.tsx` נמחק; `(store)/page.tsx` = דף הבית החדש
- commit `14fef20`

### 2026-06-04 — Dynamic category page + store layout
- `(store)/layout.tsx`: Header + Footer ל-store route group
- `(store)/category/[slug]/page.tsx`: Server Component, notFound(), breadcrumb, ProductCard grid
- Seed: קטגוריית `electronics` + 4 מוצרים ב-Supabase ixvwfbuvfxxsjiywhbbb
- אומת ב-localhost:3000 עם Playwright screenshot -- 4 מוצרים נטענים מ-DB
- גילוי: `categories.deleted_at` לא קיים בלייב DB (תוקן בקוד); `products.price_ils` NOT NULL

### 2026-06-02 — Lint clean
- 8 errors + 10 warnings → 0 errors + 0 warnings
- `type="button"` ל-5 כפתורים ב-ProductGallery + VariantSelector; `key={url}` במקום index
- `aria-hidden="true"` ל-10 SVGs דקורטיביים ב-SiteHeader + InfoBar



### 2026-06-01 — Global layout shell (header, footer, design tokens, RTL)
- design tokens מתועדים ב-`globals.css` (brand-primary/secondary + shades/radius/spacing, alias תואמי-אחורה)
- גופן Heebo דרך next/font; `Header` דביק חדש (לוגו/חיפוש/עגלה/חשבון + hamburger מובייל, lucide); `SiteFooter` ב-4 עמודות
- shell מחובר ל-`(main)/layout.tsx` בלבד (לא root) כדי לא לעטוף את `/admin` ו-`/login` (nested layouts עוטפים, לא מחליפים)
- `MainHeader` נמחק; לינק `/auth/login` ב-`TopBar` תוקן ל-`/login`

### 2026-06-01 — Phase 4 closed: all Admin CRUDs verified live
- Categories / Vendors / Products / Coupons / coupon_deals all return 200 in the browser
- migrations 013/014/016/015 applied to Supabase, schema fully synced with the code
- next phase: Frontend / Homepage

### 2026-06-01 — Coupon deals wired end to end
- homepage + new public `/coupons` list + `/coupons/[id]` detail now read `coupon_deals` (10% model)
- `CouponCard` rewritten as a deal card; admin CRUD (`/admin/coupons`) confirmed complete
- purchase button stubbed ("בקרוב") pending Cardcom payment integration

### 2026-06-01 — Homepage coupons section fixed
- live `coupons` table cross-checked: columns are `expires_at` + `min_purchase` (not `ends_at`/`min_order_amount_ils`), `discount_type` CHECK = `percentage`/`fixed` (not `percent`)
- `(main)/page.tsx` + `CouponCard.tsx` aligned to the real `coupons` schema (query was failing silently and always rendered empty)
- discovered `src/lib/supabase/server.ts` `createClient` is NOT typed with the `Database` generic, so select strings are not type-checked: column correctness must be verified against the live DB
- open product decision logged: homepage uses `coupons` while admin manages `coupon_deals`

### 2026-06-01 — Migrations 013/014/015 fixed + products schema synced to code
- `status` error root cause: `013` indexed `vendors.status` which the live DB never had
- live schema cross-checked via Supabase MCP (`list_migrations` empty, DB = output of `005`)
- `013` adds `status` (+ business/contact/bank columns) before indexing; `014` uses `supplier_id` not `vendor_id` and adds `is_active` to variants
- new `016_products_code_sync.sql`: renames `title_he`→`name_he`, adds code columns, backfills `kenyon_price` from `price_ils`
- deleted duplicate `008_product_pricing_coupon.sql` (number clashed with `008_coupons_schema.sql`)
- code fixes: `base_price`→`kenyon_price`, removed broken `vendors` join, homepage + `ProductCard` migrated to `name_he/kenyon_price/images`

### 2026-05-26 -- Phase 3 blockers resolved
- 002, 003, 004, 005 מיגרציות תוקנו להיות idempotent
- קונפליקט 003 vs 005 (DROP TABLE products) נפתר
- פוליסות content_uploader הועברו ל-005 שם products נוצרת מחדש

### 2026-05-26 -- Migrations 006-011 idempotency fixed
- set_updated_at() defensive definition נוסף ל-006, 007, 008, 009, 010
- TO authenticated נוסף לכל פוליסות coupon_codes ב-008 (security fix)

### 2026-05-26 -- All migrations 001-011 applied to Supabase
- DB schema מלא: auth, RBAC, storage, products, wallet, orders, coupons, addresses, referrals, audit log
- Phase 3 admin panel components + routes קיימים בקוד, ממתינים לאימות

### 2026-05-27 — Admin route blocked
- .env.local תוקן: URL + ANON_KEY + SERVICE_ROLE_KEY
- pnpm dev רץ ב-localhost:3000
- העמוד הראשי עובד
- /admin לא נטען - נופל לעמוד הראשי
- בעיה: יש 2 תיקיות admin - src/app/(admin)/ ו-src/app/admin (ריקה)
- צריך למחוק את src/app/admin (הריקה) - rm -rf src/app/admin

### 2026-05-27 — Phase 3 complete
- Admin panel אומת: עובד כולל ניווט וסטטיסטיקות
- kenyonexpress@gmail.com = super_admin
- CRUD קטגוריות (כולל העלאת אייקון) קיים ומוכן
- Phase 4 מתחיל: store frontend

### 2026-05-27 — Phase 4 Admin CRUDs complete
- 4 migrations חדשות: 012 (categories v2), 013 (vendors v2), 014 (products v2), 015 (coupon_deals)
- Categories: tree view + dialog modal + auto-slug מעברית + soft delete
- Vendors: full CRUD + filters (VendorForm)
- Products: pagination + search + bulk actions + variants + auto-slug
- Coupon Deals: /admin/coupons — עסקאות 10% עם live preview
- Orders: date range filters
- i18n: admin namespace נוסף ל-he.json + en.json
- pnpm type-check + lint — ✅ clean

### 2026-05-27 — 003_rbac.sql verified
- CREATE TYPE public.user_role AS ENUM כבר קיים בתחילת הקובץ (שורות 8-13)
- עטוף ב-DO $$ EXCEPTION WHEN duplicate_object THEN NULL — idempotent מלא
- אין שינוי נדרש

### 2026-05-27 — Admin route: לא היה באג בקוד
- ה-route תקין: src/proxy.ts (Next 16 — middleware הוחלף ב-proxy) רץ ומגן על /admin
- proxy מפנה: ללא session → /login; משתמש לא-admin → / (דף הבית)
- הסיבה ל"נפילה לדף הבית": kenyonexpress@gmail.com היה role=customer
- תוקן: profiles.role → super_admin (via service-role key, user id 62c7f2a8…)
- נמחקה תיקיית src/app/admin הריקה (.gitkeep, לא הגדירה route)
- אימות UI סופי דורש התחברות בדפדפן (אין לי את הסיסמה לסימולציה)

### 2026-05-29 — Admin functional, first categories created
- Migration 007 (categories: icon_url + name_en) applied to Supabase
- Migration 008 added: kenyon_price, full_price, is_coupon_enabled לטבלת products
- vendor_id הפך אופציונלי: הוסר מ-ProductForm, מ-Zod schema, מ-server action; database.ts עודכן
- Category slug מחולל מ-name_en (אנגלית) במקום עברית
- AdminSidebar: כפתור "+" להוספת מוצר מהיר ליד "מוצרים"
- קטגוריות ראשונות נוצרו ב-DB
- commit 9ffc7ed pushed to cursor/add-supabase-3c830
