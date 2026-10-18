# UX31: Framer Motion Animations

Comprehensive animation system using Framer Motion for page transitions, card hovers, and modal entries.

## Overview

This implementation adds smooth, performant animations throughout the application using Framer Motion v14.3.0.

## Components

### PageTransition

Animates page changes with fade-in and slide effects.

**File:** `src/components/motion/PageTransition.tsx`

**Features:**
- Smooth opacity transition (fade in/out)
- Subtle vertical slide (10px)
- Duration: 300ms
- Uses `usePathname()` to trigger on route changes

**Usage:**
```tsx
import PageTransition from '@/components/motion/PageTransition'

export default function Layout({ children }) {
  return <PageTransition>{children}</PageTransition>
}
```

**Variants:**
- `initial`: opacity 0, translateY 10px
- `animate`: opacity 1, translateY 0
- `exit`: opacity 0, translateY -10px

### AnimatedProductCard

Adds hover animations to product cards with scale and shadow effects.

**File:** `src/components/motion/AnimatedProductCard.tsx`

**Features:**
- Scale up to 102% on hover
- Vertical lift animation (8px)
- Enhanced shadow effect
- Non-intrusive animations
- Maintains full card functionality

**Usage:**
```tsx
import AnimatedProductCard from '@/components/motion/AnimatedProductCard'

// Use instead of ProductCard
<AnimatedProductCard product={product} className="..." />
```

**Animations:**
- Scale: 1 → 1.02
- translateY: 0 → -8px
- Shadow: 0 1px 3px → 0 10px 25px

### AnimatedCouponCard

Similar to AnimatedProductCard but optimized for coupon cards.

**File:** `src/components/motion/AnimatedCouponCard.tsx`

**Features:**
- Scale and subtle rotation on hover
- Enhanced shadow
- Works with existing CouponCard component

**Usage:**
```tsx
import AnimatedCouponCard from '@/components/motion/AnimatedCouponCard'

<AnimatedCouponCard coupon={coupon} code={code} />
```

**Animations:**
- Scale: 1 → 1.02
- Rotation: 0 → 0.5 degrees
- Shadow enhancement

### AnimatedDialog

Enhanced dialog component with Framer Motion animations.

**File:** `src/components/motion/AnimatedDialog.tsx`

**Components:**
- `AnimatedDialogOverlay`: Fade in/out overlay
- `AnimatedDialogContent`: Scale and fade modal content

**Features:**
- Overlay fade animation (200ms)
- Content scale and fade (300ms)
- Smooth exit animations

**Variants:**

**Overlay:**
- `initial`: opacity 0
- `animate`: opacity 1
- `exit`: opacity 0

**Content:**
- `initial`: opacity 0, scale 0.95, y 20px
- `animate`: opacity 1, scale 1, y 0px (300ms easeOut)
- `exit`: opacity 0, scale 0.95, y 20px (200ms easeIn)

## Hooks & Utilities

### useStaggerAnimation

Hook for staggered list animations.

**File:** `src/lib/motion/useStaggerAnimation.ts`

**Usage:**
```tsx
import { useStaggerAnimation } from '@/lib/motion/useStaggerAnimation'
import { motion } from 'framer-motion'

const { containerVariants, itemVariants } = useStaggerAnimation()

return (
  <motion.div variants={containerVariants} initial="hidden" animate="visible">
    {items.map((item) => (
      <motion.div key={item.id} variants={itemVariants}>
        {item.name}
      </motion.div>
    ))}
  </motion.div>
)
```

**Configuration:**
- Container stagger delay: 0.1s
- Container initial delay: 0.2s
- Item transition duration: 0.5s

## Animation Timings

All animations use standard timing functions:

- **Fast animations** (hover effects): 200ms, easeOut
- **Page transitions**: 300ms, easeInOut
- **Modal animations**: 300ms enter, 200ms exit
- **List stagger**: 100ms between items, 200ms initial delay

## Performance Considerations

1. **GPU Acceleration**: All animations use `transform` and `opacity` for 60fps performance
2. **Conditional Rendering**: Animations only apply when components are visible
3. **Duration Limits**: Max 300ms to keep UI responsive
4. **Mobile Optimization**: Animations remain smooth on lower-end devices

## Testing

Unit tests are provided for:
- `PageTransition.test.tsx`: Route change animations
- `AnimatedProductCard.test.tsx`: Card hover states
- `AnimatedCouponCard.test.tsx`: Coupon card animations
- `AnimatedDialog.test.tsx`: Variant definitions
- `useStaggerAnimation.test.ts`: Hook functionality

E2E tests cover:
- Page transition smoothness
- Hover animation visibility
- Dialog entry/exit animations
- Mobile responsiveness

## RTL Support

All animations work seamlessly with RTL (Hebrew) layouts:
- No horizontal sliding for RTL compatibility
- Scale and opacity used instead of translateX
- Maintains visual hierarchy in RTL context

## Browser Support

Animations work in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers with GPU acceleration

## Integration Points

### In Product Listings
Replace `ProductCard` with `AnimatedProductCard` for hover effects.

### In Dialog Modals
Use `AnimatedDialogOverlay` and `AnimatedDialogContent` for smooth transitions.

### In Coupon Grids
Replace `CouponCard` with `AnimatedCouponCard` for interactive feedback.

### In Page Layouts
Wrap `{children}` with `PageTransition` in layout components.

## Configuration

To adjust animation timings, edit variant definitions in respective component files:

```tsx
const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

const pageTransition = {
  duration: 0.3, // Adjust here
  ease: 'easeInOut',
}
```

## Accessibility

- Animations respect `prefers-reduced-motion` via Framer Motion's default behavior
- No animations interfere with keyboard navigation
- All interactive elements remain accessible
- Animations use standard easing functions for predictability

## Future Enhancements

Potential additions:
- Gesture animations for mobile (swipe)
- Scroll-triggered animations
- Skeleton loading animations
- More complex page transition variants
- Particle effects for special events
