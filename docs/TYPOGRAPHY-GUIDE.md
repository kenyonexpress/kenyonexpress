# Typography Guide

## Overview

KenyonExpress uses a consistent typography scale with the **Heebo** font family across all pages and components. This guide documents all semantic typography combinations and their usage patterns.

## Font Family

- **Primary Font:** Heebo
- **Fallback Stack:** Arial, sans-serif
- **Subsets:** Latin and Hebrew
- **CSS Variable:** `--font-heebo`

## Font Weights

Heebo is available in five weights, all of which are loaded and available throughout the application:

| Weight | Token | CSS Value | Usage |
|--------|-------|-----------|-------|
| Light | `--weight-light` | 300 | Subtle text, disabled states |
| Regular | `--weight-regular` | 400 | Body text, default paragraphs |
| Medium | `--weight-medium` | 500 | Subtitles, labels, secondary headings |
| Bold | `--weight-bold` | 700 | Headings, emphasis, buttons |
| Black | `--weight-black` | 900 | Page titles (h1), maximum emphasis |

## Typography Scale

The `TYPOGRAPHY_SCALE` constant in `src/styles/tokens.ts` defines semantic typography combinations with size, line-height, and weight. Each entry is designed for a specific use case.

### Headings

| Scale | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| h1 | 39.998px | 47.9976px | Black (900) | Page titles, main headings |
| h2 | 25.004px | 40.0064px | Bold (700) | Section headings, major subsections |
| h3 | 22px | 32px | Bold (700) | Subsection titles |
| h4 | 20.006px | 28.0084px | Bold (700) | Minor headings, feature titles |
| h5 | 16px | 24px | Bold (700) | Small headings, widget titles |
| h6 | 14px | 20px | Bold (700) | Very small headings, metadata labels |

### Subtitles

| Scale | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| subtitle | 18px | 28px | Medium (500) | Secondary headings, feature subtitles |
| subtitleSmall | 14px | 21px | Medium (500) | Small subtitles, subheadings |

### Body Text

| Scale | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| body | 14px | 23.996px | Regular (400) | Default paragraph text, descriptions |
| bodyBold | 14px | 23.996px | Bold (700) | Emphasized text within body, important notes |
| bodyMedium | 14px | 23.996px | Medium (500) | Semi-bold body text, highlights |
| bodyLight | 14px | 23.996px | Light (300) | De-emphasized text, secondary content |

### Small Text & Captions

| Scale | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| small | 13px | 20px | Regular (400) | Small paragraph text |
| smallBold | 13px | 20px | Bold (700) | Small emphasized text |
| caption | 13px | 20px | Regular (400) | Image captions, annotations |
| captionSmall | 11.998px | 18px | Regular (400) | Tiny text, timestamps, footnotes |

### Buttons & Interactive

| Scale | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| button | 14px | 20px | Bold (700) | Standard button labels |
| buttonSmall | 12px | 18px | Bold (700) | Small button text, compact controls |
| buttonLarge | 16px | 24px | Bold (700) | Large button text, primary CTAs |

### Navigation

| Scale | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| nav | 14px | 20px | Regular (400) | Navigation links, menu items |
| navActive | 14px | 20px | Bold (700) | Active/current navigation link |
| navSmall | 12px | 18px | Regular (400) | Compact navigation, breadcrumbs |
| navSmallActive | 12px | 18px | Bold (700) | Active compact navigation |

### Labels & Form Elements

| Scale | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| label | 14px | 20px | Medium (500) | Form labels, field labels |
| labelSmall | 12px | 18px | Medium (500) | Small form labels, hints |

### Product-Specific

| Scale | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| productTitle | 25.004px | 32.0051px | Bold (700) | Product names, PDP titles |
| productPrice | 20.006px | 28.0084px | Bold (700) | Product price display |
| productDescription | 14px | 23.996px | Regular (400) | Product description text |

### Footer & Metadata

| Scale | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| footer | 13px | 20px | Regular (400) | Footer text, copyright, metadata |
| footerLink | 14px | 21px | Regular (400) | Footer navigation links |
| footerHeading | 16px | 24px | Bold (700) | Footer section headings |

### Special Text

| Scale | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| overline | 11.998px | 18px | Bold (700) | Overline/label above content |
| eyebrow | 11.998px | 12.5979px | Regular (400) | Small eyebrow text, badges |

## Usage in Components

### Accessing the Typography Scale

The typography scale is exported from `src/styles/tokens.ts`:

```typescript
import { TYPOGRAPHY_SCALE } from '@/styles/tokens'

// Access a specific typography style
const h1Style = TYPOGRAPHY_SCALE.h1
// Result: { size: '39.998px', lineHeight: '47.9976px', weight: '--weight-black' }
```

### Best Practices

1. **Always Use the Scale:** Reference typography styles from `TYPOGRAPHY_SCALE` rather than hardcoding sizes and weights
2. **Semantic Naming:** Use names that describe the text's purpose, not just its size (e.g., use `h2` for section headings, not `size-25`)
3. **Weight Consistency:** Use the predefined weight tokens from `SITE_CSS_METRICS` (e.g., `--weight-bold`)
4. **Line Height:** The typography scale includes optimal line heights for readability
5. **Dark Mode:** All typography works with the dark mode toggle via CSS variables

### Weight Selection Guidelines

- **Light (300):** Use sparingly for disabled states or very subtle text
- **Regular (400):** Default weight for body text and descriptions
- **Medium (500):** Use for labels, subtitles, and semi-emphasized content
- **Bold (700):** Use for headings, emphasis, buttons, and active states
- **Black (900):** Reserve for the main page title (h1) only

## CSS Custom Properties

Font weights are exposed as CSS custom properties in `src/styles/tokens.css`:

```css
--weight-light: 300;
--weight-regular: 400;
--weight-medium: 500;
--weight-bold: 700;
--weight-black: 900;
```

These can be used directly in CSS:

```css
.my-heading {
  font-size: 25.004px;
  line-height: 40.0064px;
  font-weight: var(--weight-bold);
}
```

## Testing

The typography system is validated through `src/styles/font-weights.test.ts`:

- All font-weight tokens exist and match expected values
- All typography scale entries have size, lineHeight, and weight properties
- All sizes and line heights are valid pixel values
- All weights reference valid font-weight tokens
- All five Heebo weights (300, 400, 500, 700, 900) are used somewhere in the scale

Run tests:
```bash
pnpm test src/styles/font-weights.test.ts
```

## Responsive Typography

The typography scale provides a single set of sizes that work across all breakpoints. For responsive adjustments, use Tailwind modifiers:

```tsx
// In Tailwind
<h1 className="text-[39.998px] md:text-[50px]">Large Heading</h1>
```

## Accessibility

- All typography maintains WCAG AA contrast ratios when used with appropriate text colors
- Line heights are sufficient for readability
- Font sizes accommodate users with visual impairments
- Hebrew text is properly supported with the Heebo font

## Related Files

- `src/styles/tokens.ts` - Typography scale definitions
- `src/styles/tokens.css` - CSS custom properties
- `src/styles/font-weights.test.ts` - Typography validation tests
- `src/app/layout.tsx` - Heebo font import configuration
