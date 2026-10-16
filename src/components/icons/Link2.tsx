import { Link2 as LucideLink2 } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Link2 = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideLink2 ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Link2.displayName = 'Link2'
