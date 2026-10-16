import { CircleCheck as LucideCircleCheck } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const CircleCheck = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideCircleCheck ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
CircleCheck.displayName = 'CircleCheck'
