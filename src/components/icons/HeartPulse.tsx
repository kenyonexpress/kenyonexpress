import { HeartPulse as LucideHeartPulse } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const HeartPulse = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideHeartPulse ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
HeartPulse.displayName = 'HeartPulse'
