import { TrendingUp as LucideTrendingUp } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const TrendingUp = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideTrendingUp ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
TrendingUp.displayName = 'TrendingUp'
