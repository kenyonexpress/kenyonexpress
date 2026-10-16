# UX39: Icon System with Lucide React

## Overview

The Icon system provides a consistent, themeable wrapper around Lucide React icons with design token integration for size and color variants.

## Components

### Icon Component (`src/components/ui/icon.tsx`)

A React forwardRef component that wraps Lucide React icons with design tokens.

**Props:**
- `as`: The Lucide icon component to render (required for icon to display)
- `size`: Icon size token - `'xs' | 'sm' | 'md' | 'lg' | 'xl'` (default: `'md'`)
- `variant`: Color variant - `'default' | 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'info' | 'muted'` (default: `'default'`)
- `className`: Additional CSS classes
- `title`: Tooltip text (accessibility)
- `aria-label`: Aria label for screen readers
- `role`: ARIA role attribute
- `data-testid`: Test ID for testing

## Size Tokens

Icons use consistent pixel sizes:
- `xs`: 16px
- `sm`: 20px
- `md`: 24px (default)
- `lg`: 32px
- `xl`: 48px

## Color Variants

All variants use CSS variables from the design system:
- `default`: currentColor (inherits text color)
- `primary`: `--electro-yellow-primary` (yellow brand color)
- `secondary`: `--electro-gray-medium` (medium gray)
- `danger`: `--electro-error` (red for errors/warnings)
- `success`: `--electro-success` (green for success)
- `warning`: `--electro-warning` (orange for warnings)
- `info`: `--electro-info` (blue for information)
- `muted`: `--electro-text-tertiary` (subtle gray text)

## Usage Examples

```tsx
import { Icon } from '@/components/ui/icon'
import { Check, AlertCircle, Search } from 'lucide-react'

// Basic usage
<Icon as={Search} />

// With size
<Icon as={Check} size="lg" />

// With color variant
<Icon as={AlertCircle} variant="danger" size="md" />

// With accessibility
<Icon as={Search} title="Search items" aria-label="Search" />

// With custom className
<Icon as={Check} variant="success" className="animate-spin" />
```

## Design System Integration

All color variants use CSS variables from `packages/design-tokens/electro.css`, ensuring consistency across the design system and automatic support for:
- Dark mode transitions
- Brand color changes
- Semantic color updates

## Testing

Comprehensive test suite in `src/components/ui/icon.test.tsx` covers:
- All size tokens (xs, sm, md, lg, xl)
- All color variants (default, primary, secondary, danger, success, warning, info, muted)
- Size + variant combinations
- Accessibility attributes (title, aria-label)
- Ref forwarding
- Custom className support
- All Lucide icon types
- HTML attributes pass-through

**Run tests:**
```bash
pnpm test src/components/ui/icon.test.tsx
```

## Browser Support

The Icon component supports all browsers that Lucide React supports:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Accessibility

The Icon component is:
- Accessible with optional `aria-label` for screen readers
- Supports `title` attribute for tooltips
- Properly handles `role` attribute
- Inherits text color by default for semantic color meaning
- Supports all Lucide icon styles

## Future Enhancements

Potential improvements:
- Icon button wrapper component with built-in size/variant handling
- Icon library presets for common use cases
- Animation variants (spin, pulse, bounce)
- Advanced customization via CSS variable overrides
