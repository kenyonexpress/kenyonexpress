import { Sliders as LucideSliders } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Sliders = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideSliders ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Sliders.displayName = 'Sliders'
