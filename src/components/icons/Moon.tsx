import { Moon as LucideMoon } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Moon = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideMoon ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Moon.displayName = 'Moon'
