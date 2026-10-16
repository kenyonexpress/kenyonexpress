import { LayoutDashboard as LucideLayoutDashboard } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const LayoutDashboard = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideLayoutDashboard ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
LayoutDashboard.displayName = 'LayoutDashboard'
