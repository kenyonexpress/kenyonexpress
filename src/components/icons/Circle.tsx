import { Circle as LucideCircle } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Circle = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideCircle ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Circle.displayName = 'Circle'
