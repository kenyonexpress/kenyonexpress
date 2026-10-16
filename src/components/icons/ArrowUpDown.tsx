import { ArrowUpDown as LucideArrowUpDown } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ArrowUpDown = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideArrowUpDown ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ArrowUpDown.displayName = 'ArrowUpDown'
