# KenyonExpress State

## Current Phase
**Phase 5 — Homepage 1:1 (סגור)**. branch `phase5/homepage`. מקור יחיד: `refs/ke_live_singlefile.html`.

## Last Completed
Session 2026-06-20 — Admin refactor (commit `6f96164`):
- `DataTable` גנרי (מיון/חיפוש) + `CategoriesTable`/`CouponsTable`/`ProductsTable`/`UsersTable`/`CouponForm`
- shell עבר מ-`(admin)/admin/layout.tsx` ל-`(admin)/layout.tsx`
- `lib/admin/page-params.ts` עם סכמות zod
- rename מיגרציה `007_categories_icon_url` → `0075` (התנגשות prefix עם `007_orders`)
- `type-check` עובר נקי

Session 2026-06-19 — Homepage 1:1 מול `ke_live_singlefile.html`:
- `scripts/compare.mjs` משתמש ב-`ke_live_singlefile.html`; `refs/live.png` מול `refs/mine.png` ב-1440px
- `HeroSection`: סליידר בלבד 422px, `HERO_SINGLEFILE_SLIDES`, rs-19 פעיל; בלי סיידבר/באנרים (sf-hidden במקור)
- `HeroSlider`: active slide = rs-19 (אפליקציה בקרוב)
- `CategoryStrip`: 5 קטגוריות בלבד
- `BenefitBar`: 5 פריטים מ-`.features-list`, מסגרת `#ddd` radius 8px
- `DealsOfTheDay`: גריד 4 עמודות, 6 מוצרים סטטיים מ-`KE_LIVE_DEALS` + השלמה מ-DB, בלי כותרת "דילים של היום"
- `(store)/page.tsx`: hero → categories → benefits → grid (בלי `CategoryProductSection`)
- `ke-live-deals-data.ts`: 6 מוצרים בסדר DOM (כולל קופון טסט 8836)
- Header/TopBar: לוגו + ₪0 + עגלה; TopBar 4 פריטים (בלי חיפוש, לפי החלטת פרויקט)

commit: `feat: homepage 1:1 match with live source`

## In Progress
nothing

## Blocking Issues
- worktree יתום `.claude/worktrees/agent-a54b4f308d924b8e8` — לבדוק/לנקות.

## Next Task
דף קטגוריה (אחרי סגירת homepage)

## Active Branch
phase5/homepage

## Working Directory
/Users/ofir/kenyonexpress-web/kenyonexpress

## Supabase Project URL
https://ixvwfbuvfxxsjiywhbbb.supabase.co

---
## History

### 2026-06-19 — Homepage 1:1 match with live singlefile
- מבנה דף, hero rs-19, 5 קטגוריות, benefits, גריד מוצרים לפי faf8583
- compare loop: `node scripts/compare.mjs` (PLAYWRIGHT_BROWSERS_PATH ל-cache מקומי)

### 2026-06-12 — CategoryNav removed, BenefitBar frame, ProductCard electro values
- commits על `phase5/homepage` לפני סגירת 1:1

### 2026-06-09 — Product catalog + hero 5 slides + foundation
- 31 מוצרים ב-DB, `scripts/compare.mjs` הוקם
