import { Share2 as LucideShare2 } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Share2 = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideShare2 ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Share2.displayName = 'Share2'
