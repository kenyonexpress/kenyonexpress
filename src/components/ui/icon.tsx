import type { LucideIcon, LucideProps } from 'lucide-react'
import type React from 'react'
import { forwardRef } from 'react'

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

const sizeMap: Record<IconSize, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 48,
}

const variantColorMap: Record<IconVariant, string> = {
  default: 'currentColor',
  primary: 'var(--electro-yellow-primary)',
  secondary: 'var(--electro-gray-medium)',
  danger: 'var(--electro-error)',
  success: 'var(--electro-success)',
  warning: 'var(--electro-warning)',
  info: 'var(--electro-info)',
  muted: 'var(--electro-text-tertiary)',
}

type IconPropsBase = {
  as?: LucideIcon
  size?: IconSize
  variant?: IconVariant
  className?: string
  title?: string
  'aria-label'?: string
  role?: React.AriaRole
  'data-testid'?: string
}

type IconProps = IconPropsBase & Omit<LucideProps, 'ref' | 'title'>

export const Icon = forwardRef<SVGSVGElement, IconProps>(
  (
    {
      as: Component,
      size = 'md',
      variant = 'default',
      className = '',
      title,
      role,
      'aria-label': ariaLabel,
      'data-testid': dataTestId,
      ...rest
    },
    ref,
  ) => {
    if (!Component) return null

    const sizePixels = sizeMap[size as IconSize]
    const color = variantColorMap[variant as IconVariant]

    const style: React.CSSProperties = color !== 'currentColor' ? { color } : {}

    const componentProps: Record<string, unknown> = {
      ref,
      width: sizePixels,
      height: sizePixels,
      style,
      className,
      'aria-label': ariaLabel,
      'data-testid': dataTestId,
      ...rest,
    }

    // Lucide doesn't support title natively, so we add it if provided
    if (title) {
      componentProps.title = title
    }

    // Add role if provided
    if (role) {
      componentProps.role = role
    }

    return <Component {...(componentProps as any)} />
  },
)

Icon.displayName = 'Icon'

export type { LucideIcon }
