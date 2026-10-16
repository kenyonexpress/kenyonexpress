import { Users as LucideUsers } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Users = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideUsers ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Users.displayName = 'Users'
