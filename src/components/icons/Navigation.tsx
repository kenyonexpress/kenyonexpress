import { Navigation as LucideNavigation } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Navigation = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideNavigation ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Navigation.displayName = 'Navigation'
