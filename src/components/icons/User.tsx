import { User as LucideUser } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const User = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideUser ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
User.displayName = 'User'
