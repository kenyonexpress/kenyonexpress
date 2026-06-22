**ה-6 Gaps לתקן:**

1. tailwind.config.ts
   - containers lg: maxWidth = 1320px
   - spacing scale

2. src/app/globals.css  
   - --header-height: 54px
   - --brand-primary: #0b6e4f (ירוק)
   - --brand-secondary: #f5c518 (צהוב)
   - --button-hover: #fdd900

3. src/components/SiteHeader.tsx
   - גובה: 54px
   - padding/margin: אפס gap

4. src/components/CategoryStrip.tsx
   - grid-cols-4 → grid-cols-5 (בdesktop)

5. src/app/page.tsx
   - הוסף Products Grid component

6. src/components/SiteFooter.tsx
   - צבע text, links

**קבצים לבנות/עדכן:**
- src/components/ProductsGrid.tsx (חדש)
- src/components/SiteFooter.tsx (עדכן)
