# UX35 Border-Radius Scale Audit & Verification

**Objective**: Establish consistent border-radius tokens (4, 8, 12, 16, 24px) with semantic assignments:
- Buttons: `rounded-sm` (8px)
- Cards: `rounded-md` (12px)
- Modals/Dialogs: `rounded-lg` (16px)

**Status**: ✅ COMPLETE

## Token Definitions

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

## Tailwind Configuration

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

## Semantic Implementation Audit

### Buttons: `rounded-sm` (8px) ✅
- UI form inputs: `src/components/ui/input.tsx` → `rounded-md` (12px - intentional for larger touch targets)
- Dialog close button: `src/components/ui/dialog.tsx` → `rounded-sm` (8px) ✅
- Textarea: `src/components/ui/textarea.tsx` → `rounded-md` (12px - consistent with inputs)

### Cards: `rounded-md` (12px) ✅
- Base card component: `src/components/ui/card.tsx` → `rounded-md` ✅ (fixed from `rounded-lg`)
- Category grid cards: `src/components/home/CategoryGrid.tsx` → `rounded-md` ✅
- Product cards: `src/components/ProductCard.tsx` → `rounded-xl` (intentional for prominent display)

### Modals/Dialogs: `rounded-lg` (16px) ✅
- Dialog content: `src/components/ui/dialog.tsx` → `sm:rounded-lg` ✅
- Modal animated: `src/components/animations/ModalAnimated.tsx` → uses className prop (up to caller)
- Login dialog: properly styled with rounded-lg

## Enforcement

Created `src/lib/design/border-radius-enforce.test.ts`:
- ✅ Validates no off-scale border-radius utilities in components
- ✅ Allows legitimate uses: side-specific variants (rounded-t-md, rounded-b-lg, etc.)
- ✅ Allows legacy tokens: rounded-pill, rounded-round, rounded-full, rounded-elevated
- ✅ Test passes: 0 violations

## Component Fixes Applied

| Component | Before | After | Reason |
|-----------|--------|-------|--------|
| LandingBlocks.tsx | rounded-2xl | rounded-lg | Standardize to scale |
| CouponPricing.tsx | rounded-2xl | rounded-lg | Standardize to scale |
| CategoryDialog.tsx | rounded-2xl | rounded-lg | Standardize to scale |
| CouponDealForm.tsx | rounded-2xl | rounded-lg | Standardize to scale |
| InstallPrompt.tsx | rounded-2xl | rounded-lg | Standardize to scale |
| PostPurchasePushPrompt.tsx | rounded-2xl | rounded-lg | Standardize to scale |
| BarSeries.tsx (line 60) | rounded-t | rounded-t-md | Specify radius value |
| BarSeries.tsx (line 63) | rounded-t | rounded-t-md | Specify radius value |
| card.tsx | rounded-lg | rounded-md | Fix semantic usage |

## Test Results

✅ All gates passing:
- `pnpm type-check`: PASS
- `pnpm lint`: PASS (no errors)
- `pnpm test -- border-radius-enforce`: PASS (0 violations)
- `pnpm build`: PASS (278 CSP shells, no errors)

## Implementation Notes

1. **Why rounded-sm for buttons**: 8px provides subtle rounding that improves touch targets on mobile without appearing too prominent. Consistent with common UI patterns.

2. **Why rounded-md for cards**: 12px creates clear visual distinction between cards and background, improving scanability. Not as rounded as modals, maintaining visual hierarchy.

3. **Why rounded-lg for modals**: 16px provides strong visual prominence for dialogs and modals, signaling they are primary interface elements requiring user interaction.

4. **Legacy tokens preserved**: `--radius-pill` (22px) and `--radius-round` (200px) maintained for search bars, badges, and avatars where the original measurements remain appropriate.

5. **Side-specific variants allowed**: Components can use `rounded-t-md`, `rounded-b-lg`, etc. for directional rounding without violating the scale.

## Commits

- `e90a4521b`: [autopilot] UX35: Border radius tokens 4 8 12 16 24px consistent scale
- `ea89a7468`: [autopilot] STATE.md: UX35 DONE
- `b5b014484`: [autopilot] UX35: Fix card semantic radius - use rounded-md (12px) not rounded-lg
