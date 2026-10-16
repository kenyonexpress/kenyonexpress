import { Clock as LucideClock } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Clock = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideClock ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Clock.displayName = 'Clock'
