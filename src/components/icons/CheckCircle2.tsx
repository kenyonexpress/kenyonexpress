import { CheckCircle2 as LucideCheckCircle2 } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const CheckCircle2 = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideCheckCircle2 ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
CheckCircle2.displayName = 'CheckCircle2'
