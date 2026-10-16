import { ArrowRight as LucideArrowRight } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ArrowRight = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideArrowRight ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ArrowRight.displayName = 'ArrowRight'
