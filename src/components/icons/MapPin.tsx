import { MapPin as LucideMapPin } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const MapPin = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideMapPin ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
MapPin.displayName = 'MapPin'
