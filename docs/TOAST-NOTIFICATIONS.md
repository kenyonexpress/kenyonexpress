# Toast Notifications System

## Overview

The toast notification system provides a flexible, type-safe way to display temporary notifications to users. It supports four variants (success, error, info, warning), auto-dismiss, stack management, and RTL support for Hebrew.

Built on [Sonner](https://sonner.emilkowal.ski/), a React toast library with minimal dependencies.

## Features

- **Four Variants**: `success`, `error`, `info`, `warning`
- **Auto-Dismiss**: Configurable durations with sensible defaults
  - Success/Info: 3 seconds
  - Error/Warning: 5 seconds
  - Loading: Persistent until dismissed
- **Stack Management**: Multiple toasts displayed simultaneously
- **Custom Icons**: Color-coded icons for each variant
- **Action Buttons**: Optional buttons for user interaction
- **Descriptions**: Support for detailed messages
- **Loading State**: Spinner animation for async operations
- **Manual Control**: Dismiss specific or all toasts
- **RTL Support**: Full right-to-left support for Hebrew text
- **Dark Mode**: Theme-aware styling

## Installation

Sonner is already installed in the project. Just import and use!

```bash
# Already included in package.json
npm list sonner
# sonner@2.0.8
```

## Usage

### Basic Usage

```tsx
'use client'

import { useToast } from '@/lib/useToast'

export function MyComponent() {
  const toast = useToast()

  const handleClick = () => {
    toast.success('Operation completed!')
  }

  return <button onClick={handleClick}>Show Toast</button>
}
```

### All Variants

```tsx
const toast = useToast()

// Success - 3 second auto-dismiss
toast.success('Changes saved successfully!')

// Error - 5 second auto-dismiss  
toast.error('Failed to save changes')

// Info - 3 second auto-dismiss
toast.info('New updates available')

// Warning - 5 second auto-dismiss
toast.warning('This action cannot be undone')

// Loading - persistent until dismissed
const id = toast.loading('Processing...')
// Later:
toast.dismiss(id)
```

### With Descriptions

```tsx
toast.success('Success!', {
  description: 'Your profile has been updated',
})

toast.error('Error!', {
  description: 'Failed to connect to the server. Please try again later.',
})
```

### With Action Buttons

```tsx
toast.error('Failed to save', {
  description: 'Your changes were not saved',
  action: {
    label: 'Retry',
    onClick: () => {
      // Handle retry
      toast.success('Saved successfully!')
    },
  },
})
```

### Custom Durations

```tsx
// Keep showing for 10 seconds
toast.info('Important notice', {
  duration: 10000,
})

// Keep showing indefinitely
toast.warning('Critical alert', {
  duration: Infinity,
})

// Show for 1 second
toast.success('Quick message', {
  duration: 1000,
})
```

### Manual Dismissal

```tsx
// Get toast ID and dismiss later
const id = toast.loading('Processing...')

setTimeout(() => {
  toast.dismiss(id)
}, 5000)

// Dismiss all toasts
toast.dismiss()
```

### Stack Management

Multiple toasts automatically stack and display together:

```tsx
toast.success('First message')
toast.info('Second message')
toast.warning('Third message')
// All three appear at once
```

### Common Patterns

#### Form Submission

```tsx
async function handleSubmit(formData: FormData) {
  const loadingId = toast.loading('Submitting form...')
  
  try {
    const result = await submitForm(formData)
    toast.dismiss(loadingId)
    toast.success('Form submitted successfully!')
  } catch (error) {
    toast.dismiss(loadingId)
    toast.error('Failed to submit form', {
      description: error.message,
    })
  }
}
```

#### Async Operations

```tsx
async function fetchData() {
  const id = toast.loading('Loading data...')
  
  try {
    const data = await fetch('/api/data')
    toast.dismiss(id)
    toast.success('Data loaded!')
    return data
  } catch (error) {
    toast.dismiss(id)
    toast.error('Failed to load data')
    throw error
  }
}
```

#### Copy to Clipboard

```tsx
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard!')
  } catch {
    toast.error('Failed to copy')
  }
}
```

#### Delete Confirmation

```tsx
const toast = useToast()

const handleDelete = async (id: string) => {
  const deleteId = toast.loading('Deleting...')
  
  try {
    await deleteItem(id)
    toast.dismiss(deleteId)
    toast.success('Item deleted successfully')
  } catch (error) {
    toast.dismiss(deleteId)
    toast.error('Failed to delete item', {
      description: 'Try again later',
      action: {
        label: 'Retry',
        onClick: () => handleDelete(id),
      },
    })
  }
}
```

## Styling

The toast system uses Tailwind CSS classes for styling:

- **Colors**: Uses CSS custom properties and Tailwind color utilities
- **Layout**: Flexbox-based with proper spacing
- **Icons**: Color-coded SVG icons for each variant
  - Success: Green circle with checkmark
  - Error: Red circle with X mark
  - Info: Blue circle with info icon
  - Warning: Amber circle with exclamation
  - Loading: Spinning blue spinner
- **Position**: Centered at the top of the screen
- **Gap**: 8px between stacked toasts
- **RTL**: Full right-to-left support with `rtl:space-x-reverse`

### Custom Styling

To customize the appearance, modify `src/components/ui/sonner.tsx`:

```tsx
toastOptions={{
  classNames: {
    toast: 'your-custom-classes',
    description: 'your-description-classes',
    actionButton: 'your-button-classes',
    cancelButton: 'your-cancel-classes',
  },
}}
```

## API Reference

### `useToast()`

Returns an object with the following methods:

#### `success(message: string, config?: ToastConfig): string | number`

Show a success toast with green icon.

**Default duration**: 3000ms

**Parameters**:
- `message`: Toast message (required)
- `config`: Optional configuration object
  - `duration?: number` - Duration in milliseconds
  - `description?: string` - Additional description text
  - `action?: { label: string; onClick: () => void }` - Action button
  - `cancel?: { label: string; onClick: () => void }` - Cancel button

**Returns**: Toast ID for manual dismissal

#### `error(message: string, config?: ToastConfig): string | number`

Show an error toast with red icon.

**Default duration**: 5000ms

**Parameters**: Same as `success()`

**Returns**: Toast ID for manual dismissal

#### `info(message: string, config?: ToastConfig): string | number`

Show an info toast with blue icon.

**Default duration**: 3000ms

**Parameters**: Same as `success()`

**Returns**: Toast ID for manual dismissal

#### `warning(message: string, config?: ToastConfig): string | number`

Show a warning toast with amber icon.

**Default duration**: 5000ms

**Parameters**: Same as `success()`

**Returns**: Toast ID for manual dismissal

#### `loading(message: string, config?: ToastConfig): string | number`

Show a loading toast with spinner animation.

**Default duration**: Infinite (persistent)

**Parameters**: Same as `success()`

**Returns**: Toast ID for manual dismissal

#### `dismiss(toastId?: string | number): void`

Dismiss toast(s).

**Parameters**:
- `toastId?: string | number` - Optional ID of specific toast to dismiss
  - If not provided, dismisses all toasts

## Testing

### Example Test

```tsx
import { render, fireEvent, screen } from '@testing-library/react'
import { useToast } from '@/lib/useToast'

describe('Toast notifications', () => {
  it('should show success toast', () => {
    const TestComponent = () => {
      const toast = useToast()
      return (
        <button onClick={() => toast.success('Success!')}>
          Show Success
        </button>
      )
    }

    render(<TestComponent />)
    fireEvent.click(screen.getByText('Show Success'))
    // Toast will be displayed (mocked in tests)
  })
})
```

## Best Practices

1. **Use appropriate variants**: Choose the variant that matches the message type
2. **Keep messages concise**: Toast messages should be brief and actionable
3. **Use descriptions sparingly**: Only add descriptions for important context
4. **Avoid showing too many toasts**: Don't overwhelm users with notifications
5. **Dismiss loading toasts**: Always dismiss loading toasts after operations complete
6. **Use action buttons for recovery**: Offer retry or undo options when appropriate
7. **Test your toasts**: Write tests to verify toast behavior in your components

## Accessibility

The toast system includes:
- Semantic HTML structure
- ARIA labels and descriptions
- Keyboard navigation support
- Theme detection (light/dark mode)
- RTL language support
- Color-coded icons for non-text cues

## Browser Support

Sonner supports all modern browsers:
- Chrome/Edge (latest 2)
- Firefox (latest 2)
- Safari (latest 2)

## Related Components

- `Toaster` - The root provider component (in layouts)
- `useToast()` - Hook for displaying notifications
- `ToastDemo` - Example component showing all features

## See Also

- [Sonner Documentation](https://sonner.emilkowal.ski/)
- [Design System](./DESIGN-SYSTEM.md)
- [Component Architecture](./ARCHITECTURE.md)
