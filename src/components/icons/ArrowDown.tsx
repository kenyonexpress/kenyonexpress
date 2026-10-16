import { ArrowDown as LucideArrowDown } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ArrowDown = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideArrowDown ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ArrowDown.displayName = 'ArrowDown'
