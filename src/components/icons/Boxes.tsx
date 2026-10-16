import { Boxes as LucideBoxes } from 'lucide-react'
import { forwardRef } from 'react'
import type { IconProps } from './IconProps'

export const Boxes = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
  <LucideBoxes ref={ref} size={24} color="currentColor" aria-hidden="true" {...props} />
))
Boxes.displayName = 'Boxes'
