import { Music2 as LucideMusic2 } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Music2 = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideMusic2 ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Music2.displayName = 'Music2'
