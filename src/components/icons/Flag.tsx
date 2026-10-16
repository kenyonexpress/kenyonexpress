import { Flag as LucideFlag } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Flag = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideFlag ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Flag.displayName = 'Flag'
