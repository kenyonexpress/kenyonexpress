import { Slot } from '@radix-ui/react-slot'
import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [border-radius:var(--radius-button)]',
  {
    variants: {
      variant: {
        primary:
          'bg-[--electro-yellow-primary] text-black hover:bg-[--electro-yellow-dark] active:bg-[--electro-yellow-dark]',
        secondary:
          'bg-[--electro-gray-medium] text-[--electro-text-primary] hover:bg-[--electro-gray-dark] active:bg-[--electro-gray-dark]',
        ghost:
          'bg-transparent text-[--electro-text-primary] hover:bg-[--electro-surface-hover] active:bg-[--electro-track]',
        danger:
          'bg-[--electro-error] text-white hover:bg-[--electro-sale] active:bg-[--electro-sale]',
        link: 'bg-transparent text-[--electro-link] underline-offset-4 hover:underline active:underline',
      },
      size: {
        sm: 'h-8 px-3 py-1 text-xs',
        md: 'h-10 px-4 py-2 text-sm',
        lg: 'h-12 px-6 py-3 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  loadingText?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'
    const isDisabled = disabled || loading

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {loadingText || children}
          </>
        ) : (
          children
        )}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
