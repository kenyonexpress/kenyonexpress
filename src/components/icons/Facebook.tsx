import { MessageSquare as LucideMessageSquare } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Facebook = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideMessageSquare ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Facebook.displayName = 'Facebook'
