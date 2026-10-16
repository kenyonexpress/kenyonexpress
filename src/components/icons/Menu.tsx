import { Menu as LucideMenu } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Menu = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideMenu ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Menu.displayName = 'Menu'
