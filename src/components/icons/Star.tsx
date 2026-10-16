import { Star as LucideStar } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Star = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideStar ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Star.displayName = 'Star'
