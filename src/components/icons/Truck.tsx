import { Truck as LucideTruck } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Truck = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideTruck ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Truck.displayName = 'Truck'
