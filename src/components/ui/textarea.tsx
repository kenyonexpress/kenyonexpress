import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const textareaVariants = cva(
  'flex w-full rounded-md border transition-colors font-medium placeholder:text-[--electro-text-tertiary] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-vertical',
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
        sm: 'min-h-16 px-3 py-2 text-xs',
        md: 'min-h-20 px-3 py-2 text-sm',
        lg: 'min-h-24 px-4 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>,
    VariantProps<typeof textareaVariants> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, size, disabled, ...props }, ref) => {
    const effectiveVariant = disabled ? 'disabled' : variant

    return (
      <textarea
        className={cn(textareaVariants({ variant: effectiveVariant, size, className }))}
        ref={ref}
        disabled={disabled}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export { Textarea, textareaVariants }
