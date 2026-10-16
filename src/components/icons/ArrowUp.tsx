import { ArrowUp as LucideArrowUp } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ArrowUp = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideArrowUp ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ArrowUp.displayName = 'ArrowUp'
