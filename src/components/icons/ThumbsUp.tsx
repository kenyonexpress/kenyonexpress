import { ThumbsUp as LucideThumbsUp } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const ThumbsUp = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideThumbsUp ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
ThumbsUp.displayName = 'ThumbsUp'
