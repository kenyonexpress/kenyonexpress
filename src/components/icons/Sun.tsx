import { Sun as LucideSun } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Sun = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideSun ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Sun.displayName = 'Sun'
