import { Heart as LucideHeart } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Heart = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideHeart ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Heart.displayName = 'Heart'
