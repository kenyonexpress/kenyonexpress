'use client'

import * as LabelPrimitive from '@radix-ui/react-label'
import { type VariantProps, cva } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const labelVariants = cva(
  'font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 transition-colors',
  {
    variants: {
      variant: {
        default: 'text-[--electro-text-primary]',
        error: 'text-[--electro-error]',
        success: 'text-[--electro-success]',
        muted: 'text-[--electro-text-secondary]',
      },
      size: {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-base',
      },
      required: {
        true: "after:content-['*'] after:ms-1 after:text-[--electro-error]",
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      required: false,
    },
  },
)

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>,
    VariantProps<typeof labelVariants> {}

const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  ({ className, variant, size, required, ...props }, ref) => (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants({ variant, size, required, className }))}
      {...props}
    />
  ),
)
Label.displayName = LabelPrimitive.Root.displayName

export { Label, labelVariants }
