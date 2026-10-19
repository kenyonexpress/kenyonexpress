# Icon System Documentation

## Overview

The KenyonExpress icon system provides a consistent, accessible way to use icons throughout the application. It's built on:

- **Lucide React** - A modern icon library with 300+ icons
- **Custom size tokens** - 5 predefined sizes (xs, sm, md, lg, xl)
- **Color variants** - 8 semantic color variants for different UI states
- **Accessibility** - Full support for ARIA labels and semantic HTML

## Size Tokens

The icon system defines 5 consistent size tokens:

| Token | Size | Use Case |
|-------|------|----------|
| `xs` | 16px | Inline badges, small UI elements, decorative icons |
| `sm` | 20px | Form inputs, navigation icons, action buttons |
| `md` | 24px | Default size for most UI components (default) |
| `lg` | 32px | Emphasis, prominent buttons, section headers |
| `xl` | 48px | Hero sections, large displays, featured content |

## Color Variants

The icon system provides 8 semantic color variants:

| Variant | Color Variable | Use Case |
|---------|----------------|----------|
| `default` | `currentColor` | Inherits text color for flexible styling |
| `primary` | `--electro-yellow-primary` | Primary actions, brand highlighting |
| `secondary` | `--electro-gray-medium` | Secondary actions, neutral elements |
| `danger` | `--electro-error` | Destructive actions, errors, alerts |
| `success` | `--electro-success` | Completed states, confirmations |
| `warning` | `--electro-warning` | Warning states, cautions |
| `info` | `--electro-info` | Informational content, help |
| `muted` | `--electro-text-tertiary` | Disabled states, de-emphasized content |

## Installation

The Icon component is already installed and ready to use:

```bash
npm list lucide-react
# or
pnpm list lucide-react
```

## Usage

### Basic Usage

```tsx
import { Icon } from '@/components/ui/icon'
import { Search } from 'lucide-react'

export function SearchIcon() {
  return <Icon as={Search} />
}
```

### With Size Token

```tsx
<Icon as={Search} size="lg" />
```

### With Color Variant

```tsx
<Icon as={Check} variant="success" />
```

### Combined Size and Variant

```tsx
<Icon as={ShoppingCart} size="md" variant="primary" />
```

## Accessibility

### ARIA Labels

Always provide `aria-label` when icons are meaningful to users:

```tsx
<Icon 
  as={Heart} 
  size="md"
  aria-label="Add to favorites"
/>
```

### Title Attribute

Use `title` for tooltip text:

```tsx
<Icon 
  as={Download} 
  title="Download invoice"
/>
```

### Combined Accessibility

```tsx
<Icon 
  as={AlertCircle}
  size="lg"
  variant="danger"
  aria-label="Error: Invalid input"
  title="Invalid email address"
  role="img"
/>
```

## Component Props

```typescript
type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type IconVariant = 
  | 'default' 
  | 'primary' 
  | 'secondary' 
  | 'danger' 
  | 'success' 
  | 'warning' 
  | 'info' 
  | 'muted'

interface IconProps {
  as?: LucideIcon                    // Icon component from lucide-react
  size?: IconSize                    // Size token (default: 'md')
  variant?: IconVariant              // Color variant (default: 'default')
  className?: string                 // Custom CSS classes
  title?: string                     // Tooltip text
  'aria-label'?: string             // Accessibility label
  role?: React.AriaRole             // ARIA role
  'data-testid'?: string            // Testing attribute
  // ... plus all standard SVG attributes
}
```

## Real-World Examples

### Button with Icon

```tsx
import { Icon } from '@/components/ui/icon'
import { ShoppingCart } from 'lucide-react'

export function AddToCartButton() {
  return (
    <button className="bg-primary text-white px-4 py-2 rounded flex items-center gap-2">
      <Icon as={ShoppingCart} size="sm" className="text-white" />
      Add to Cart
    </button>
  )
}
```

### Icon Status Indicator

```tsx
export function OrderStatus({ status }: { status: 'pending' | 'confirmed' | 'shipped' | 'error' }) {
  const variants = {
    pending: 'warning',
    confirmed: 'success',
    shipped: 'info',
    error: 'danger',
  } as const
  
  return (
    <Icon 
      as={statusIcon[status]} 
      size="lg"
      variant={variants[status]}
    />
  )
}
```

## Testing

The Icon component includes comprehensive test coverage:

```bash
pnpm test src/components/ui/icon.test.tsx
```

Tests cover:
- All size tokens (xs, sm, md, lg, xl)
- All color variants (default, primary, secondary, danger, success, warning, info, muted)
- Size and variant combinations
- Accessibility features (aria-label, title)
- Ref forwarding
- Custom className support

## Demo Page

View all icons and variants at `/test-icons` (development only, not indexed)

## Browser Support

The Icon component supports all modern browsers that support:
- ES2020+
- CSS Custom Properties (CSS Variables)
- SVG rendering
- React 19+
