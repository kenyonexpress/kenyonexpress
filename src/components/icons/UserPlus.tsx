import { UserPlus as LucideUserPlus } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const UserPlus = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideUserPlus ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
UserPlus.displayName = 'UserPlus'
