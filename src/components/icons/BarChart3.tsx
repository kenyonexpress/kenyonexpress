import { BarChart3 as LucideBarChart3 } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const BarChart3 = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideBarChart3 ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
BarChart3.displayName = 'BarChart3'
