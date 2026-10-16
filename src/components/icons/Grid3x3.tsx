import { Grid3x3 as LucideGrid3x3 } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Grid3x3 = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideGrid3x3 ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Grid3x3.displayName = 'Grid3x3'
