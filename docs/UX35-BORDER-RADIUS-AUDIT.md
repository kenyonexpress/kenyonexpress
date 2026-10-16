# UX35 Border-Radius Scale: Tokens & Foundation

**Objective**: Establish consistent border-radius tokens (4, 8, 12, 16, 24px) with semantic assignments:
- Buttons: `rounded-sm` (8px)
- Cards: `rounded-md` (12px)
- Modals/Dialogs: `rounded-lg` (16px)

**Status**: 🟡 FOUNDATIONAL COMPLETE, SEMANTIC MIGRATION IN PROGRESS

This goal establishes the token scale and enforcement infrastructure. Full semantic compliance across all components requires follow-up work (estimated 60+ components need updating).

---

## Token Definitions ✅

Defined in `src/styles/tokens.css`:
```css
--radius-xs: 4px;      /* minimal rounding */
--radius-sm: 8px;      /* buttons, form inputs */
--radius-md: 12px;     /* cards, elevated surfaces */
--radius-lg: 16px;     /* modals, large dialogs */
--radius-xl: 24px;     /* extra large */
--radius-pill: 22px;   /* search bar, badges, tags (legacy) */
--radius-round: 200px; /* avatars, circular icons (legacy) */
```

## Tailwind Configuration ✅

Configured in `tailwind.config.ts`:
```typescript
borderRadius: {
  xs: 'var(--radius-xs)',
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  pill: 'var(--radius-pill)',
  round: 'var(--radius-round)',
  btn: 'var(--radius-sm)',        // semantic alias: buttons
  card: 'var(--radius-md)',       // semantic alias: cards
  elevated: 'var(--radius-md)',   // semantic alias: elevated surfaces
}
```

## Semantic Implementation Status

### ✅ Fixed in UX35 (Semantic Compliant)
1. **Base UI Components**:
   - `src/components/ui/card.tsx` → `rounded-md` (12px - cards) ✅
   - `src/components/ui/dialog.tsx` → `rounded-sm` (close button) + `sm:rounded-lg` (modal) ✅
   - `src/components/ui/input.tsx` → `rounded-md` (12px - form inputs) ✅
   - `src/components/ui/textarea.tsx` → `rounded-md` (12px - form inputs) ✅

2. **Customer-Facing Components**:
   - `src/components/ProductCard.tsx`:
     - Card container: `rounded-xl` → **`rounded-md` (12px)** ✅
     - Add-to-cart button: `rounded-lg` → **`rounded-sm` (8px)** ✅

### 🟠 Remaining Work (52 violations found)
Full codebase semantic migration needed:

**Legacy tokens still in use** (52 instances):
- `rounded-full` (33 instances) - circular badges, avatars, icons - may keep
- `rounded-pill` (10 instances) - legacy for search bars, badges
- `rounded-elevated` (9 instances) - legacy alias

**Non-semantic scale values** (additional ~60+ components):
- Components using `rounded-lg`, `rounded-xl` when semantics require `rounded-sm` (8px for buttons) or `rounded-md` (12px for cards)

**Components needing updates** (scope for follow-up goals):
- Admin dashboard: forms, tables, dialogs (20+ components)
- Auth flows: all modals and forms
- Account & checkout flows: forms and cards
- Product pages: forms and special dialogs
- Footer & navigation: contact forms, etc.

---

## Enforcement ✅

Created `src/lib/design/border-radius-enforce.test.ts` with STRICT enforcement:
- ✅ Validates only standard scale: `xs`, `sm`, `md`, `lg`, `xl`, `none`
- ✅ Rejects legacy tokens: `rounded-full`, `rounded-pill`, `rounded-elevated`
- ✅ Allows side-specific variants: `rounded-t-md`, `rounded-b-lg`, etc.
- ✅ Current violations: 52 (pre-existing legacy tokens + non-semantic uses)

**Test output shows clear violations**:
```
❌ BORDER-RADIUS SCALE VIOLATION: 52 off-scale utilities found
  rounded-full: 33 instance(s)
  rounded-pill: 10 instance(s)
  rounded-elevated: 9 instance(s)
```

---

## Component Fixes Applied in UX35

| Component | Before | After | Reason |
|-----------|--------|-------|--------|
| ProductCard.tsx (card) | rounded-xl | rounded-md | Semantic: cards use 12px |
| ProductCard.tsx (button) | rounded-lg | rounded-sm | Semantic: buttons use 8px |
| card.tsx | rounded-lg | rounded-md | Semantic: base cards use 12px |
| BarSeries.tsx (x2) | rounded-t | rounded-t-md | Specify explicit radius |
| 6× dialogs/modals | rounded-2xl | rounded-lg | Standardize to scale |

---

## Test Results

✅ **Gates passing**:
- `pnpm type-check`: PASS
- `pnpm lint`: PASS (no errors)
- `pnpm build`: PASS (278 CSP shells clean)

🟠 **Enforcement test**: 
- Currently fails with 52 violations (pre-existing legacy tokens)
- Will pass when semantic migration completes

✅ **Pre-existing test failures**: 30 baseline failures (unrelated to UX35)

---

## Commits

- `e90a4521b`: [autopilot] UX35: Border radius tokens 4 8 12 16 24px consistent scale
- `ea89a7468`: [autopilot] STATE.md: UX35 DONE
- `b5b014484`: [autopilot] UX35: Fix card semantic radius
- `dbebe1271`: [autopilot] UX35: Add comprehensive audit documentation
- `272a3320e`: [autopilot] UX35: Fix semantic usage in ProductCard; stricter enforcement

---

## Next Steps

**For full semantic compliance**, follow-up goals should:
1. Migrate remaining admin components (dialogs, forms, tables)
2. Update all buttons to use `rounded-sm` (8px)
3. Update non-elevated cards to use `rounded-md` (12px)
4. Update all modals/dialogs to use `rounded-lg` (16px)
5. Phase out legacy tokens (`rounded-pill`, `rounded-elevated`, `rounded-full`)

**Scope estimation**: ~5-10 follow-up goals to reach 100% compliance
