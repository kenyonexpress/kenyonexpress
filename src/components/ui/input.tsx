import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const inputVariants = cva(
  'flex w-full rounded-md border transition-colors font-medium file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[--electro-text-tertiary] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-[--electro-border] bg-[--electro-white] text-[--electro-text-primary] focus-visible:ring-[--electro-info]',
        error:
          'border-[--electro-error] bg-[--electro-error-light] text-[--electro-text-primary] focus-visible:ring-[--electro-error]',
        success:
          'border-[--electro-success] bg-[--electro-success-light] text-[--electro-text-primary] focus-visible:ring-[--electro-success]',
        disabled:
          'border-[--electro-border-alt] bg-[--electro-gray-light] text-[--electro-text-tertiary] cursor-not-allowed opacity-60',
      },
      size: {
        sm: 'h-8 px-3 py-1 text-xs',
        md: 'h-10 px-3 py-2 text-sm',
        lg: 'h-12 px-4 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, size, disabled, ...props }, ref) => {
    const effectiveVariant = disabled ? 'disabled' : variant

    return (
      <input
        type={type}
        className={cn(inputVariants({ variant: effectiveVariant, size, className }))}
        ref={ref}
        disabled={disabled}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'

export { Input, inputVariants }
